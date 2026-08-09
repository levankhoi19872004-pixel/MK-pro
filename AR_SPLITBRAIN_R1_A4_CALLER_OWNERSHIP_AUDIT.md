# AR Split-brain R1 — Reconcile / Writer Caller Ownership Audit

Generated: 2026-08-09T05:26:36.066861+00:00

## Runtime caller matrix sau R1

| Caller | Loại | `reconcileOrderDebt()` | AR-DEBT-ADJUSTMENT risk | R1 action |
|---|---|---:|---|---|
| `deliveryCloseoutCorrection.service.js` | post-closeout correction runtime | **NO** | **NO from correction path** | replaced by event-delta writer |
| `DeliveryAdjustmentCommitService.js` | bulk/manual correction runtime | **NO** | **NO from correction path** | event-delta preflight/verify |
| `ArDebtAdjustmentPostingService.postAdjustment()` | retired facade | dead code caller behind unconditional return | unreachable | kept retired; correction does not call it |
| `AccountingCloseoutService.js` (2 call sites) | initial/normal accounting closeout | YES | can still use legacy reconcile category | outside R1 post-closeout correction scope; unchanged |
| `backfill-order-payment-allocations.js` | offline repair/backfill | YES | can create legacy reconcile only with apply/fix flags | offline; unchanged |

## Important residual contract

R1 guarantees **không tạo AR-DEBT-ADJUSTMENT từ post-closeout correction hoặc bulk correction runtime**. `OrderPaymentDebtReconcileService` vẫn còn legacy category cho các caller khác đã tồn tại trước R1. Thay toàn bộ accounting closeout/backfill sang event-specific semantics là một migration rộng hơn và chưa được thực hiện trong R1 để tránh phá initial closeout contract.

Nếu yêu cầu “không tạo AR-DEBT-ADJUSTMENT mới” được hiểu là **toàn hệ thống, mọi caller**, release phải mở gate migration riêng cho `AccountingCloseoutService` + backfill. Đây là residual risk được công khai, không che bằng test.

## Retired facade

`ArDebtAdjustmentPostingService.postAdjustment()` return `AR_DEBT_ADJUSTMENT_POSTING_RETIRED` trước code reconcile/direct write phía sau. R1 không revive service này.

## Return writer

Correction cập nhật returnOrders chưa confirmed. `returnArPostingService.postReturnOrderToAR()` là writer AR-RETURN khi return được accounting-confirmed. Correction event writer không post return delta.
