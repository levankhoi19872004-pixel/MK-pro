# AR_SPLITBRAIN_A4_RETIRED_CALLER_AUDIT

## Production caller matrix

| Caller | BEFORE | AFTER | Phân loại |
|---|---|---|---|
| `deliveryCloseoutCorrection.service.js` | gọi `ArDebtAdjustmentPostingService.postAdjustment()` | gọi trực tiếp `OrderPaymentDebtReconcileService.reconcileOrderDebt()` | **BUG đã sửa** |
| `ArDebtAdjustmentPostingService.postAdjustmentByDebtReconcile()` | helper nằm trong chính retired module | không có production caller | dead/unreachable helper |
| production source khác | không phát hiện caller | không phát hiện caller | safe |

Search sau fix không còn production reference đến `ArDebtAdjustmentPostingService` ngoài file định nghĩa chính nó.

## Dead code
Trong `ArDebtAdjustmentPostingService.postAdjustment()`:
- dựng retired result;
- `return result;`
- nhánh `if (options.reconcileDebt ... ) return postAdjustmentByDebtReconcile(...)` nằm sau return và unreachable;
- legacy AR adjustment posting path phía sau cũng unreachable.

Không xóa toàn bộ dead module trong patch này vì các test/legacy governance hiện vẫn reference retired behavior; xóa module sẽ mở scope rộng hơn và không cần để giải quyết split-brain.

## False-green audit
Các static tests từng kiểm tra thứ tự call/chuỗi retired service không còn được coi là evidence correctness chính.
Đã cập nhật:
- `test/delivery-adjustment-reward-allocation-integration-static.test.js`
- `test/delivery-closeout-correction-contract-static.test.js`

Evidence chính là executable B0041181 service-flow harness kiểm tra actual AR state + rollback/idempotency.

## Pre-existing semantic debt
`OrderPaymentDebtReconcileService` hiện vẫn có canonical posting implementation sử dụng category `AR-DEBT-ADJUSTMENT`, trong khi retired facade cũng mang tên Adjustment và Debt New đánh dấu category này là legacy. Patch không tự thay đổi accounting category vì chưa có alternate canonical event contract được chứng minh trong source. Đây là finding cần một phase riêng nếu policy mới yêu cầu loại bỏ hoàn toàn category này.
