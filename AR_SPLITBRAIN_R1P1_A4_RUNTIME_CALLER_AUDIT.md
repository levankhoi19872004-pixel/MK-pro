# R1.1 Runtime Caller and Legacy Isolation Audit

## Correction runtime
| Path | `reconcileOrderDebt()` | active `AR-DEBT-ADJUSTMENT` writer | retired facade call |
|---|---:|---:|---:|
| deliveryCloseoutCorrection.service.js | 0 | 0 | 0 |
| DeliveryAdjustmentCommitService.js | 0 | 0 | 0 |
| DeliveryAdjustmentBatchContextService.js | 0 | 0 | 0 |

`deliveryCloseoutCorrection.service.js` contains one textual `AR-DEBT-ADJUSTMENT` mention in a comment documenting the prohibition; it is not a writer.

## Remaining final-state reconcile callers outside correction scope
- `src/services/accounting/AccountingCloseoutService.js`: 2 calls.
- `scripts/backfill-order-payment-allocations.js`: 1 offline/backfill call.
- `src/services/accounting/ArDebtAdjustmentPostingService.js`: 1 caller behind retired facade/dead path.

## Decision
No expansion in R1.1. These require independent accounting RED tests before migration. DELIVERY_CLOSEOUT_CORRECTION is isolated from all of them.
