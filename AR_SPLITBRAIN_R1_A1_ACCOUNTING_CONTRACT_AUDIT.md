# AR Split-brain R1 — Canonical Accounting Contract Audit

Generated: 2026-08-09T05:26:36.066861+00:00

## Verdict

**PASS cho contract audit / BLOCKED cho release toàn phần do dependency environment.** Bản A dùng final-state reconcile trong post-closeout correction là sai ownership khi canonical AR đã có receipt/event sau snapshot.

## Root cause của bản A

Bản A chạy `OrderPaymentDebtReconcileService.reconcileOrderDebt()` sau khi tạo closeout version và current `OrderPaymentAllocation`. Service này tính `delta = expected snapshot debt - current canonical AR`. Với receipt đã confirmed sau/bên ngoài snapshot, phép tính đó xem receipt hợp lệ như một “deviation” và có thể debit lại số đã thu.

RED fixture chứng minh: opening 10.000.000, confirmed receipt 4.000.000 => canonical AR trước correction 6.000.000. Correction thêm cash 2.000.000 phải cho AR sau = 4.000.000. Final-state reconcile của bản A target snapshot debt 8.000.000 và thực tế tạo 8.000.000.

## Canonical invariant R1

`expectedArAfter = canonicalArBeforeCorrection + correctionOwnedDebtDelta`

Trong R1:

`correctionOwnedDebtDelta = receivableDelta - cashDelta - bankDelta - rewardDelta`

`returnDelta` **không** thuộc writer correction. Ownership return là `returnOrders -> returnArPostingService -> AR-RETURN` khi return được accounting-confirmed.

## Category / direction contract từ source

| Business event | Canonical category hiện hành | Direction | Ownership |
|---|---|---|---|
| Initial receivable | AR-SALE / AR-DEBT-OPEN theo flow | debit | accounting closeout/opening writer |
| Cash payment | AR-RECEIPT-CASH / AR-DEBT-PAYMENT theo flow | credit | allocation/debt receipt writer |
| Bank payment | AR-RECEIPT-BANK | credit | allocation writer |
| Reward allowance | AR-REWARD-ALLOWANCE | credit | allocation writer |
| Confirmed return | AR-RETURN | credit | returnOrders / returnArPostingService |
| Post-closeout correction delta | **AR-ADJUSTMENT** + `sourceType=DELIVERY_CLOSEOUT_CORRECTION` | debit **hoặc** credit | R1 correction event writer |
| Legacy debt reconcile | AR-DEBT-ADJUSTMENT | either | legacy/final-state reconcile; **không được dùng cho correction runtime** |

Lý do dùng `AR-ADJUSTMENT` cho correction delta: correction có thể tăng hoặc giảm payment/reward/receivable. Các category business-event chuẩn có direction cố định và không có đầy đủ cặp reversal đối xứng cho mọi component. `AR-ADJUSTMENT` đã tồn tại với effect `either`; R1 thêm provenance gate để **chỉ** correction canonical được chiếu vào Debt New, không mở cửa cho admin/legacy rows.

## Transaction ownership

Transaction owner: `deliveryCloseoutCorrection.service.js:createCorrection()` gọi `withOptionalMongoTransaction()` và truyền cùng `session` qua:

1. canonical current/base state read;
2. returnOrders mutation nếu có và chưa locked;
3. immutable `DeliveryCloseoutCorrection`;
4. `DeliveryCloseoutVersion`;
5. current `OrderPaymentAllocation` mirror;
6. canonical AR event-delta posting;
7. canonical AR read-after-write verification.

Bất kỳ lỗi posting hoặc invariant nào đều throw ra ngoài transaction callback => correction/version/allocation/return mutation không được commit một nửa.

## Current AR snapshot dùng để tính delta

Writer R1 gọi `arLedgerReadService.inspectActiveDebtReadModelLedgersByOrderKeys()` **ngay trước posting và trong cùng session**, rồi tính raw canonical balance bằng đúng canonical read-model rows. Không dùng client balance và không dùng closeout debt làm AR-before.

## Return ownership

`applyReturnOrderAdjustment()` chỉ tạo/cập nhật returnOrders ở trạng thái chờ, `accountingConfirmed=false`, `stockPosted=false`. AR-RETURN được writer riêng `returnArPostingService` tạo khi nghiệp vụ return được xác nhận. Vì vậy correction writer R1 loại returnDelta khỏi AR event để tránh double-count.

## B0041181

- Canonical AR before fixture: 23.800.085
- correction-owned delta: `-22.140.000 - 1.660.000 = -23.800.000`
- raw canonical AR after: **85**
- Debt Zero Tolerance ±1.000 => Debt New remaining debt: **0**

R1 cố ý **không** ép raw ledger balance 85 thành 0; làm như vậy sẽ quay lại final-state reconciliation.
