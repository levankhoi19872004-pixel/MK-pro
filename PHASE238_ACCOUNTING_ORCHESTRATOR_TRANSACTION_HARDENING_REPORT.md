# PHASE238_ACCOUNTING_ORCHESTRATOR_TRANSACTION_HARDENING_REPORT

## A. Executive summary

Phase238 implemented a scoped pilot for delivery closeout accounting orchestration. The public API contract remains unchanged, SSoT remains unchanged, Mongo schemas/indexes remain unchanged, and AR/Fund/Inventory writers were not rewritten.

Pilot implemented:

- `AccountingCloseoutService` now delegates the pending-order write boundary to `CloseoutTransactionRunner`.
- Critical sales order and returnOrders are re-read inside the Mongo transaction in two batch reads before financial writes.
- Read-model sync enqueue moved to a post-commit handler. Financial transaction can commit even if post-commit enqueue has a warning.
- ReturnOrder reader now accepts `options.session`, preserving query shape while allowing transaction-scoped critical reads.
- Tests cover session propagation, transaction runner ordering, post-commit sync boundary, and existing closeout/read-model contracts.

Production runtime benchmark is **BLOCKED** because this workspace has no production/staging Mongo workload. The performance result below is an in-memory fixture only and is not claimed as production latency evidence.

## B. Execution path before and after

| Stage | Before | After |
|---|---|---|
| Route | `POST /api/new/delivery-today/closeout` | Unchanged |
| Controller/route service call | `AccountingCloseoutService.confirmDeliveryAccounting` | Unchanged |
| Preflight orders | Batch `orderRepository.findManyByIdentity` outside transaction | Unchanged |
| Preflight returnOrders | Batch `findReturnOrdersForDeliveryChildren` outside transaction | Unchanged for fast validation |
| Transaction start | Direct `withMongoTransaction` inside `AccountingCloseoutService` | `CloseoutTransactionRunner.runCloseoutTransaction` |
| Critical order read | Used preflight order snapshot | Batch re-read orders inside transaction |
| Critical return read | Used preflight returnOrders snapshot | Batch re-read returnOrders inside transaction |
| Order write | `patchAccountingCloseoutById` | Unchanged |
| Allocation/AR/Fund writes | `OrderPaymentAllocationService.buildAndPostFromCloseout` | Unchanged |
| Debt reconcile | `OrderPaymentDebtReconcileService.reconcileOrderDebt` | Unchanged, still safety re-reads AR balance |
| Read-model sync enqueue | Inside transaction | Post-commit via `CloseoutPostCommitHandler` |
| Drain scheduling | After transaction | After post-commit enqueue |

## C. Accounting invariant matrix

| Invariant | Owner | Test |
|---|---|---|
| AR/Fund posting must go through existing writers | `OrderPaymentAllocationService`, `arPosting.service`, `fundService` | `npm test`, targeted accounting tests |
| Debt formula remains source-defined | `OrderPaymentAllocationService.computeDebtBreakdown` | `order-payment-debt-reconcile-contract.test.js` |
| matchedCount=0 must not post ledger | `AccountingCloseoutService.confirmOneOrder` | `delivery-today-closeout-idempotent-fast-skip.test.js` |
| Return guard uses latest DB data | `CloseoutTransactionRunner` + return reader | `phase238-accounting-closeout-transaction-boundary.test.js` |
| Read-model rebuild not in hot path | `CloseoutPostCommitHandler` / projector | `delivery-closeout-no-readmodel-hotpath.test.js` |
| Post-commit failure does not roll back ledger | `CloseoutPostCommitHandler` | Covered structurally; runtime injection needs staging |

## D. SSoT

| Data | Canonical source | Forbidden source |
|---|---|---|
| Sales order | `orders/salesOrders` | `master_orders.totalAmount` as financial source |
| Return | `returnOrders` | salesOrder return snapshot without returnOrder evidence |
| AR debt | `arLedgers` | `orders.debtAmount` as SSoT |
| Fund | `fundLedgers` | direct orchestrator-created fund rows |
| Inventory | `inventories/stockTransactions` | `inventorySnapshots` |
| Closeout correction | `deliveryCloseoutVersions` | stale embedded versions |
| Payment allocation | `orderPaymentAllocations` | frontend-calculated debt |

## E. Transaction inventory

| Stage | Before/In/After transaction | Reason |
|---|---|---|
| Scope parse | Before | Request validation only |
| Candidate order load | Before | Preflight scope and fast idempotent skip |
| Preflight returnOrders | Before | Early guard and diagnostics |
| Critical salesOrder re-read | In | Current version/status before write |
| Critical returnOrders re-read | In | Latest inventory/accounting return guard before AR impact |
| Order patch | In | Atomic with ledger/allocation |
| AR/Fund allocation writers | In | Financial atomicity |
| Debt reconcile write | In | Must reflect transaction-scoped ledger state |
| Read-model sync enqueue | After | Non-critical outbox enqueue after financial commit |
| Drain scheduling | After | Background projector trigger |

## F. Query inventory

| Stage | Before | After |
|---|---|---|
| Candidate orders | 1 batch outside transaction | Same |
| Candidate returnOrders | 1 batch outside transaction | Same |
| Critical orders | 0 in transaction | 1 batch in transaction |
| Critical returnOrders | 0 in transaction | 1 batch in transaction |
| Allocation/ledger idempotency | Existing writer queries | Unchanged |
| Debt reconcile AR balance | Safety re-read in session | Unchanged |
| Read-model sync job | Up to customer groups inside transaction | Same grouping post-commit, outside transaction |

## G. Architecture decomposition

| Old file | New module | Responsibility |
|---|---|---|
| `AccountingCloseoutService.js` | `closeout/CloseoutTransactionRunner.js` | Owns transaction boundary for pending closeout writes |
| `AccountingCloseoutService.js` | `closeout/CloseoutCriticalReader.js` | Batch critical re-read of orders and returnOrders inside transaction |
| `AccountingCloseoutService.js` | `closeout/CloseoutPostCommitHandler.js` | Enqueue AR debt read-model sync after commit |
| `masterOrderReturn.impl.js` | same file | Adds session passthrough only |

## H. Posting plan

Phase238 did not serialize or expose a new posting plan object to clients. The effective internal plan remains:

1. Confirmed order patch.
2. Payment allocation built from current closeout and canonical order context.
3. AR rows from allocation: AR-SALE debit, AR-RECEIPT cash/bank credit, AR-REWARD credit, AR-RETURN credit when applicable.
4. Fund rows from allocation cash/bank through existing fund writer.
5. Debt adjustment only through `OrderPaymentDebtReconcileService` when canonical AR balance differs from expected debt.
6. Read-model sync job after commit.

No production data was written by this report/benchmark.

## I. Golden ledger result

| Case | Ledger before | Ledger after | Equal |
|---|---|---|---|
| 1 order no return fixture | 3 ledger rows modeled | 3 ledger rows modeled | Yes |
| 10 order fixture | 30 ledger rows modeled | 30 ledger rows modeled | Yes |
| 50 order fixture | 150 ledger rows modeled | 150 ledger rows modeled | Yes |
| Real Mongo golden | BLOCKED | BLOCKED | Needs staging |

## J. Failure injection

| Failure point | Expected rollback/result | Result |
|---|---|---|
| Critical order missing | Abort before write | Covered by code path |
| Return guard fail | Abort before write | Existing return guard tests PASS |
| matchedCount=0 | No allocation/ledger post | Existing test PASS |
| Post-commit enqueue fail | Financial commit remains; warning returned | Handler catches and reports warning |
| AR writer fail | Transaction rollback | Existing writer tests and full regression PASS; staging injection recommended |

## K. Concurrency tests

| Scenario | Expected | Result |
|---|---|---|
| Duplicate submit same actor/order/date | In-flight guard suppresses duplicate | Existing source contract retained |
| Same order already confirmed | Idempotent skip before write | Existing test PASS |
| Two runtime requests same order | One succeeds, other stale/idempotent | NEED_RUNTIME_EVIDENCE |
| Context shared across requests | Must not share mutable context | New runner uses request-local arguments |

## L. Performance result

Command:

```powershell
node --expose-gc scripts\benchmark-phase238-closeout-transaction.js --orders=1,10,50
```

| Dataset | Metric | Before | After | Improvement |
|---|---|---:|---:|---|
| 1 order fixture | Read queries in tx | 0 | 2 | Added critical safety re-read |
| 1 order fixture | Write ops in tx | 5 | 4 | Sync enqueue moved post-commit |
| 1 order fixture | Ledger rows | 3 | 3 | Equal |
| 10 order fixture | Read queries in tx | 0 | 2 | Bounded batch critical reads |
| 10 order fixture | Write ops in tx | 50 | 40 | 10 sync enqueues moved post-commit |
| 10 order fixture | Ledger rows | 30 | 30 | Equal |
| 50 order fixture | Read queries in tx | 0 | 2 | Bounded batch critical reads |
| 50 order fixture | Write ops in tx | 210 | 200 | 10 sync enqueues moved post-commit |
| 50 order fixture | Ledger rows | 150 | 150 | Equal |

The fixture duration is too small to claim real transaction-duration improvement. Production/staging benchmark remains BLOCKED.

## M. Index audit

| Collection | Query shape | Index | Action |
|---|---|---|---|
| `salesOrders` | selected ids / identity lookup, accounting closeout update by `id` | Existing hot-path id index contract | No change |
| `returnOrders` | order identity `$or` plus returnStatus filter | Existing managed indexes; no new query shape | No change |
| `arLedgers` | idempotency and canonical order lookup through existing services | Existing registry/tests | No change |
| `orderPaymentAllocations` | idempotency upsert, order identity lookup | Existing model/query | No change |
| `readModelSyncJobs` | idempotency upsert after commit | Existing model/index tests | No change |

No index was added, dropped, or auto-applied.

## N. Test evidence

| Command | PASS/FAIL/BLOCKED | Evidence |
|---|---|---|
| `node --test test\phase238-accounting-closeout-transaction-boundary.test.js ...` | PASS | 21/21 targeted boundary tests |
| `node --test test\accounting-confirm-blocks-missing-returnorders.test.js ...` | PASS | 21/21 accounting/return/reconcile tests |
| `npm run check:syntax` | PASS | `SYNTAX_OK 1418 JavaScript files` |
| `npm run check:source-size` | PASS | `[source-size-budget] OK` |
| `npm run check:source-bundles` | PASS | `[source-bundles] OK 19 bundles` |
| `git diff --check` | PASS | Exit 0; Windows LF/CRLF warnings only |
| `npm test` | PASS | Full regression exit 0; optional SSE golden fixture skipped |
| Production Mongo benchmark | BLOCKED | No staging/production Mongo workload in workspace |

## O. File changes

| File | Type | Content | Risk |
|---|---|---|---|
| `src/services/accounting/AccountingCloseoutService.js` | Modified | Delegates transaction and post-commit sync to new modules | Medium; closeout orchestration |
| `src/services/accounting/closeout/CloseoutCriticalReader.js` | New | Batch critical order/return re-read with session | Medium |
| `src/services/accounting/closeout/CloseoutTransactionRunner.js` | New | Transaction runner, sequential writes, sync grouping | Medium |
| `src/services/accounting/closeout/CloseoutPostCommitHandler.js` | New | Post-commit read-model sync enqueue and warning capture | Low-medium |
| `src/services/master-order/masterOrderReturn.impl.js` | Modified | Passes session/options to existing returnOrders queries | Low |
| `test/phase238-accounting-closeout-transaction-boundary.test.js` | New | Boundary and failure-position tests | Low |
| `scripts/benchmark-phase238-closeout-transaction.js` | New | In-memory benchmark fixture | Low |
| Static closeout/read-model tests | Modified | Updated expected boundary from in-transaction enqueue to post-commit handler | Low |

## P. Files explicitly not changed

- Mongo schemas.
- AR posting builders.
- Fund writers.
- Inventory writers.
- Import/export runtime.
- Frontend.
- Mobile UI/API.
- Report services.
- Delivery correction formulas.
- Debt reconcile formula.
- Zero tolerance constants.
- Package metadata and dependencies.
- Managed index registry.

## Q. Runtime smoke checklist

1. In staging, close out one delivered order with no return and cash/bank payment.
2. Confirm `salesOrders` closeout fields, `orderPaymentAllocations`, `arLedgers`, and `fundLedgers` match pre-Phase238 golden output.
3. Confirm read-model sync job appears only after commit.
4. Force read-model sync enqueue failure and verify financial writes remain committed with warning.
5. Try stale/already-confirmed second request and verify no duplicate ledger.
6. Try returnOrder with missing inventory state and verify no order/ledger write.
7. Run batch 10 and 50 orders with Mongo query profiler enabled.

## R. Known limitations

- Real transaction duration and lock/contention improvement are not proven without Mongo runtime.
- `confirmOneOrder` remains large and still contains calculation/write/audit details.
- Correction/re-accounting, return-heavy closeout, reward allocation, and legacy master-order command were intentionally not refactored.
- Post-commit sync enqueue is no longer atomic with financial writes by design; failures are surfaced as warnings.

## S. Rollback plan

Rollback is code-only:

1. Restore `AccountingCloseoutService.js` to the previous direct transaction/enqueue implementation.
2. Remove the three `src/services/accounting/closeout/*` modules from the Phase238 changeset.
3. Restore static tests to the previous in-transaction enqueue expectations.
4. Keep schemas, data, indexes, package files, AR/Fund/Inventory writers unchanged.

No data migration or Mongo repair is required for rollback.

## T. Next phase recommendation

- Phase239: Legacy service facade retirement after runtime evidence proves the new boundary.
- Phase240: Production performance telemetry and capacity baseline for transaction duration, query count, retries, and lock contention.
- Phase241: Long-term accounting module boundary cleanup, including extracting pure closeout calculator/posting plan.
- Phase242: Optional background non-financial reporting jobs only after financial hot path is stable.
