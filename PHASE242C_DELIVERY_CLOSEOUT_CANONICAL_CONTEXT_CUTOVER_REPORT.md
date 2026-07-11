# PHASE242C Delivery Closeout Canonical Context Cutover Report

## 1. Executive Summary

Phase242C cuts `POST /api/new/delivery-today/closeout` over to a canonical context orchestration path:

```txt
resolve command
-> loadCanonicalCloseoutContext
-> validateCloseoutContext
-> executeCanonicalCloseoutWriters
-> buildCloseoutResult
```

The endpoint, request contract, response wrapper, closeout button, and canonical writers remain unchanged. The route still calls `AccountingCloseoutService.confirmDeliveryAccounting`.

## 2. Root Cause

Phase242A/B showed that the production symptom was not one slow query. The old closeout path mixed preflight reads, transaction fresh reads, per-order allocation posting, per-row AR idempotency checks, per-path Fund idempotency checks, debt reconcile balance reads, audit writes, and post-commit read-model sync.

Static attribution identified the main multiplier:

```txt
N orders
* allocation AR rows
* Fund cash/bank paths
* debt reconcile balance/idempotency checks
* audit/read-model side effects
```

The slow AR query shape comes from canonical debt lookup by order/customer aliases:

```txt
account/accountingConfirmed/accountingStatus/active/category/ledgerType
+ order/customer alias $or
```

## 3. Query Graph Before

| Operation | Before count | Notes |
| --- | ---: | --- |
| SalesOrder preflight read | 1-2 | Batch, but compatibility fallback can split stable SO ids and legacy codes. |
| ReturnOrder preflight read | 1-2 | Batch plus controlled fallback by delivery date/NVGH. |
| SalesOrder critical reread | 1-2 | Batch inside transaction. |
| ReturnOrder critical reread | 1-2 | Batch inside transaction. |
| SalesOrder patch | N | One write per pending order. |
| OrderPaymentAllocation upsert/update refs | 2N | Canonical writer. |
| AR allocation idempotency read | Up to 5N | Per generated AR row. |
| AR allocation post | Up to 5N | Canonical upsert writer. |
| Fund idempotency/post | Up to 2N reads + 2N writes | Cash/bank paths. |
| Debt reconcile balance/idempotency | Multiple reads per order | Initial/safety/after balance and idempotency guards. |
| Audit | 2N+ | Existing audit writer behavior retained. |
| Read-model sync | Per customer group | Post-commit enqueue. |
| Total observed baseline | 157 | User-provided production average. |

## 4. Query Graph After

| Operation | Before count | After count | Action |
| --- | ---: | ---: | --- |
| SalesOrder reads | 2-4 | 2-4 | Kept batch preflight and transaction-critical reads. |
| ReturnOrder reads | 2-4 | 2-4 | Kept latest return guard and transaction-critical read. |
| ArLedger idempotency reads | Up to 5N + debt keys | 1 batch preload + cache hits | Preloaded allocation/debt-adjustment idempotency keys. |
| FundLedger idempotency reads | Up to 2N | 1 batch preload + cache hits | Preloaded cash/bank idempotency keys. |
| Allocation reads/writes | 2N writes | 2N writes | Canonical writer retained. |
| Adjustment reads | Per-order debt reconcile | Still per-order balance safety | Not removed without runtime fixture. |
| Closeout writes | N | N | Canonical order patch retained. |
| Audit | 2N+ | 2N+ | Existing behavior retained. |
| Notification | 0 direct | 0 direct | No direct notification in closeout route. |
| Total | 157 baseline | Lower, runtime verification required | Static tests prove cache cutover; production export must verify final count. |

## 5. Files Changed

- `src/services/accounting/AccountingCloseoutService.js`
- `src/services/accounting/closeout/CloseoutContextLoader.js`
- `src/services/accounting/closeout/CloseoutContextValidator.js`
- `src/services/accounting/closeout/CloseoutCanonicalExecutor.js`
- `src/services/accounting/closeout/CloseoutFinalizer.js`
- `src/services/accounting/OrderPaymentAllocationService.js`
- `src/services/accounting/OrderPaymentDebtReconcileService.js`
- `src/repositories/fundLedgerRepository.js`
- `test/phase242c-closeout-canonical-context-cutover.test.js`

## 6. Legacy Path Removed/Bypassed

`confirmDeliveryAccountingInternal` now returns through the canonical context path before the previous legacy preflight graph. The old body remains below the early return for rollback readability and should be deleted in a follow-up cleanup phase after production evidence confirms the new path.

## 7. Context Schema

The context includes:

```js
{
  command,
  closeout,
  closeoutScope,
  deliveryStaff,
  orders,
  orderIds,
  orderCodes,
  selectedOrderCodes,
  selectedSalesStaffCodes,
  alreadyConfirmedOrders,
  pendingConfirmOrders,
  returnOrders,
  paymentAllocations,
  deliveryAdjustments,
  existingArLedgers,
  existingFundLedgers,
  existingInventoryImpacts,
  existingIdempotencyKeys,
  calculatedTotals,
  metadata
}
```

## 8. Validator Conversion

`CloseoutContextValidator` is pure. It imports no model/repository and performs no DB query. It validates:

- selected order presence,
- loaded orders,
- selected scope via existing pure helper,
- return inventory readiness via existing pure helper.

## 9. Canonical Writers Reused

Reused writers:

- SalesOrder closeout patch: `orderRepository.patchAccountingCloseoutById`
- Allocation: `OrderPaymentAllocationService.buildAndPostFromCloseout`
- AR: `arPostingService.postArLedgerEntry`
- Fund: `fundService.postFundLedger`
- Debt reconcile: `OrderPaymentDebtReconcileService.reconcileOrderDebt`
- Read-model sync: `CloseoutPostCommitHandler.enqueueReadModelSync`
- Audit: existing `auditService.log` calls inside `confirmOneOrder`

No AR/Fund/Inventory/Return writer was rewritten.

## 10. Transaction Boundary

Preload and validation run before the transaction. The existing Mongo transaction remains in `CloseoutTransactionRunner`. Post-commit read-model sync remains outside the transaction.

Debt reconcile balance safety reads remain inside the writer path. They were not removed because the workspace has no safe production-equivalent fixture proving batch balance substitution is accounting-safe.

## 11. Query Count Before/After

Before: production baseline supplied by user: 157 DB operations/request.

After: static reduction removes per-row AR/Fund/debt-adjustment idempotency reads when the key is present in context. Runtime DB operation count must be verified with Phase242B audit exports because no safe Mongo closeout fixture exists in the workspace.

## 12. Performance Before/After

Before:

- Average endpoint: about 38,130 ms.
- Average DB operations: 157/request.
- Recorded DB time: about 62,310 ms.

After:

- Unit/static test proves the canonical context cutover and idempotency cache path.
- Production p50/p95/p99 must be collected using `PHASE242C_CLOSEOUT_CANONICAL_CONTEXT_PRODUCTION_RUNBOOK.md`.

## 13. Test Results

Commands run:

```txt
node --test test/phase242a-closeout-query-graph-audit.test.js test/phase242b-closeout-exact-query-attribution.test.js test/phase242c-closeout-canonical-context-cutover.test.js
node --test test/accounting-confirm-blocks-missing-returnorders.test.js test/delivery-closeout-return-inventory-guard.test.js test/delivery-closeout-uses-returnorders.test.js test/delivery-closeout-breakdown-consistency.test.js test/delivery-today-closeout-idempotent-fast-skip.test.js test/delivery-today-closeout-contract.test.js test/delivery-today-closeout-performance-static.test.js test/delivery-today-closeout-readmodel-safety.test.js test/delivery-closeout-command-standard-v2.test.js test/order-payment-allocation-reward-contract.test.js test/order-payment-debt-reconcile-contract.test.js
npm run check:syntax
npm test
```

Result:

- Phase242A/B/C: 24/24 pass.
- Closeout/accounting regression subset: 41/41 pass.
- Syntax: `SYNTAX_OK 1440 JavaScript files`.
- Full `npm test`: pass.

## 14. Regression Invariants

- Endpoint contract unchanged.
- Closeout route unchanged.
- Button/frontend unchanged.
- AR SSoT remains `arLedgers`.
- Fund SSoT remains `fundLedgers`.
- Return SSoT remains `returnOrders`.
- Inventory writer unchanged.
- No schema/index/package change.
- Existing idempotency keys preserved.
- Retry in-flight guard preserved.
- Transaction writer ordering preserved.

## 15. Remaining Risks

- The old code body remains below an early return and should be deleted after production evidence.
- Debt reconcile balance reads remain per order to preserve accounting safety.
- Audit writes remain per order.
- Runtime query budget `<= 30` is not proven in this workspace because no safe Mongo closeout fixture or Phase242B production export is available.

## 16. Rollback Plan

Rollback by code version only. Do not delete ledgers or manually edit MongoDB.

If failure occurs before commit, transaction rollback leaves no business data change.

If failure occurs after commit in read-model sync, do not rollback accounting. Retry read-model sync idempotently.

Trace new implementation by:

```txt
implementation = canonical-context-v1
```

## 17. Production Verification Checklist

- Enable Phase242B audit export.
- Run small, medium, and large normal closeouts.
- Verify response contract and UI success path.
- Export query audit evidence.
- Confirm validator query count is 0.
- Confirm AR/Fund idempotency stages are reduced.
- Confirm no duplicate AR/Fund ledgers.
- Confirm no double stock posting.
- Confirm retry is idempotent.
- Confirm rollback behavior on induced failure in staging.
