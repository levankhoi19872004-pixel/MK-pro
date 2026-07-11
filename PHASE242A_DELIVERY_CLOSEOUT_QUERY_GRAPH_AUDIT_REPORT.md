# PHASE242A Delivery Closeout Query Graph Audit Report

## Scope

Phase242A audits `POST /api/new/delivery-today/closeout` only. This phase is audit-only and intentionally does not optimize queries, change writers, change SSoT, add indexes, alter schema, change frontend behavior, or parallelize accounting flow.

## Root Cause Summary

The production symptom provided by the user is an average of `157` Mongo queries/request on the delivery closeout route. The Phase242B baseline normalization clarified that the UI display `38.130 ms` / `62.310 ms` uses Vietnamese thousands separators, so the machine-readable values are `38130` ms and `62310` ms. Static tracing shows that the route is a write-heavy accounting command, not a read-only dashboard path. Query volume comes from a mix of:

- preflight order and return validation,
- transaction-scoped fresh reads,
- per-order closeout writer,
- per-ledger AR idempotency checks and posts,
- per cash/bank fund idempotency checks and posts,
- debt reconcile balance reads and safety re-reads,
- audit/read-model post-commit work.

The exact split of the `157` observed queries is not fully attributable in Phase242A because no safe production-equivalent fixture was available to replay a real closeout write path.

## Call Graph

`src/routes/index.js` mounts `src/routes/newOperationsRoutes.js` at `/api/new`.

The closeout route is:

`POST /api/new/delivery-today/closeout`

Middleware stack includes request context, performance telemetry, security guards, API monitor, auth, CSRF, tenant context, runtime flow telemetry, then route-level `requireAuth` and `closeoutRoles = requireRole(['admin', 'accountant'])`.

Route handler:

1. Normalize selected order ids/codes.
2. Require closeout reason.
3. Resolve actor/accountant.
4. Call `AccountingCloseoutService.confirmDeliveryAccounting`.
5. Return closeout result with diagnostics/performance/canonical route.

Service path:

1. `confirmDeliveryAccounting` applies duplicate submit in-flight guard.
2. `confirmDeliveryAccountingInternal` loads selected orders through `orderRepository.findManyByIdentity`.
3. It validates selected scope and idempotent already-confirmed orders.
4. It loads pending returnOrders through `findReturnOrdersForDeliveryChildren`.
5. It validates return inventory lifecycle guard.
6. `CloseoutTransactionRunner.runCloseoutTransaction` opens one Mongo transaction.
7. `CloseoutCriticalReader.loadCriticalOrdersAndReturns` re-reads selected orders and returns inside the transaction.
8. `confirmOneOrder` patches `salesOrders`, posts `orderPaymentAllocations`, AR ledgers, fund ledgers, debt reconcile adjustment if needed, and audit logs.
9. `CloseoutPostCommitHandler.enqueueReadModelSync` queues read-model sync after commit.

## Query Graph Status

Status: **PARTIAL_QUERY_GRAPH**

Production evidence from user: `157` avg queries/request.

Phase242A static audit identified the major query groups but did not safely decompose every observed production query into exact stage/model counters. A controlled trace should be added in Phase242B using a safe fixture before any optimization.

## Top Query Risks

Top exact model by measured query count: **not proven in Phase242A**.

Static hotspots:

- `arLedgers`: AR row idempotency checks/posts plus debt reconcile balance reads.
- `fundLedgers`: fund idempotency checks and possible code lookup/post for cash/bank.
- `salesOrders` and `returnOrders`: preflight reads plus transaction fresh reads.
- `orderPaymentAllocations`: one upsert per order.

Top exact stage by measured query count/time: **not proven in Phase242A**. Static risk is highest in `allocationPosting` and `debtReconcile`.

## N+1 and Duplicate Read Assessment

N+1 candidates:

- `OrderPaymentAllocationService.postArLedgersFromAllocation` loops AR ledger rows and performs idempotency read/post per row.
- `OrderPaymentAllocationService.postFundLedgersFromAllocation` posts cash/bank fund ledger paths separately.
- `OrderPaymentDebtReconcileService.reconcileOneOrder` performs multiple AR balance/idempotency reads per order.

Duplicate read assessment:

- Preflight order/return reads followed by transaction order/return re-reads are intentional fresh reads before accounting writers.
- Debt reconcile re-read before posting is a safety guard and must not be removed in this phase.

## Writer Safety Map

Writer count identified: `6`

- `salesOrders`: `orderRepository.patchAccountingCloseoutById`
- `orderPaymentAllocations`: `OrderPaymentAllocationService.upsertAllocation`
- `arLedgers`: `arPostingService.postArLedgerEntry`
- `fundLedgers`: `fundService.postFundLedger`
- `auditLogs`: `auditService.log`
- `readModelSyncJobs`: `CloseoutPostCommitHandler.enqueueReadModelSync`

Fresh-read count identified: `5`

- transaction `salesOrders` reload,
- transaction `returnOrders` reload,
- AR balance reads in debt reconcile,
- debt adjustment idempotency guard,
- fund ledger idempotency guard.

Transaction boundary count: `1`

Post-commit queue count: `1`

## Phase242B Safest Candidate

Safest next step is not optimization yet. Add controlled, disabled-by-default query tracing around the existing stages, then run a fixture that includes:

- selected multi-order closeout,
- returnOrders with inventory posted lifecycle,
- cash and bank collection,
- reward/allowance offset,
- remaining debt,
- already-confirmed idempotent skip case.

Only after exact counters are available should Phase242B consider projection narrowing or batching with accounting proofs.

## Explicitly Not Allowed in Phase242A

- No query optimization.
- No batch writer.
- No `Promise.all` on accounting write flow.
- No removal of transaction fresh reads.
- No removal of debt reconcile safety re-read.
- No Mongo schema or index change.
- No SSoT change.
- No frontend/button/timeout/worker/Redis/queue behavior change.

## Artifacts

- `reports/performance/phase242a-closeout-query-graph.json`
- `reports/performance/phase242a-closeout-query-graph.md`
- `test/phase242a-closeout-query-graph-audit.test.js`
- `src/observability/closeoutQueryAudit.js`

## Final Safety Confirmation

Phase242A changed no business behavior, no writer order, no transaction boundary, no SSoT, no Mongo schema/index, and no frontend behavior.
