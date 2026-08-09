# AR Split-brain R1 — Implementation Report

Generated: 2026-08-09T05:26:36.066861+00:00

## Thiết kế sau fix

`post-closeout correction -> immutable correction/version -> current OPA mirror -> read canonical AR before -> post AR-ADJUSTMENT event delta -> re-read canonical AR -> invariant -> commit`

### Writer mới

`src/services/accounting/CloseoutCorrectionArEventDeltaPostingService.js`

- category: `AR-ADJUSTMENT`
- sourceType: `DELIVERY_CLOSEOUT_CORRECTION`
- source/order identity giữ sales order identity để Debt New group đúng order;
- correction identity ở `refId/refCode/correctionId/correctionCode`;
- stable idempotency key gồm order + correction + version;
- uses actual `arPostingService.postArLedgerEntry()`;
- reads actual canonical AR before/after trong cùng session;
- exact invariant `after == before + eventDelta`;
- returnDelta excluded; return writer ownership được ghi trong metadata;
- không direct update AR balance.

### Correction service

`src/services/deliveryCloseoutCorrection.service.js`

- xóa runtime import/use `OrderPaymentDebtReconcileService`;
- OPA vẫn là final-state mirror, không tự post detailed AR rows trong correction flow;
- verify OPA snapshot debt bằng `OrderPaymentAllocationService.computeDebtBreakdown()`;
- gọi event writer trong cùng transaction;
- preserve old response/storage aliases `arDebtAdjustment*` để API compatibility, nhưng underlying ledger là `AR-ADJUSTMENT`;
- metadata phân biệt rõ `finalStateDebtDelta` với `correctionOwnedArDebtDelta`.

### Bulk/manual commit

`src/services/delivery/DeliveryAdjustmentCommitService.js`

- xóa final-state reconcile preflight/after verify;
- preflight = current canonical AR + delta của thao tác hiện tại;
- return delta không tham gia correction AR delta;
- post result verify từ event writer readback;
- không gọi reconcile service.

### Defense-in-depth

`OrderPaymentDebtReconcileService` throw `FINAL_STATE_AR_RECONCILE_FORBIDDEN_FOR_CORRECTION` khi `apply=true` với source type correction/bulk correction. Điều này chặn việc caller tương lai vô tình đưa final-state reconcile trở lại correction runtime.

### Debt New projection

`AR-ADJUSTMENT` chỉ project khi `sourceType=DELIVERY_CLOSEOUT_CORRECTION`. Admin/legacy `AR-ADJUSTMENT` không tự động được đưa vào Debt New.

### Audit historical

A-script snapshot-vs-current-AR của bản A đã được thay bằng event-level audit. Audit mới chỉ kiểm tra event do correction sở hữu, flag legacy/missing/mismatch và **không có apply/fix/repair mode**.
