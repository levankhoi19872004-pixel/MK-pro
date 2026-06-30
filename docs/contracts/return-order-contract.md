# Return Order Contract

## Mục tiêu

Chuẩn hóa trả hàng: `returnOrders` là nghiệp vụ nguồn, AR-RETURN và stock return chỉ sinh sau xác nhận kế toán.

## SSoT

- Business source: `returnOrders`.
- AR effect: `arLedgers` canonical category `AR-RETURN` hoặc reversal tương ứng.
- Stock effect: stock posting IN theo return items hợp lệ.

## Luồng chuẩn

Return order created/submitted → accounting confirmation → return AR posting → stock return posting → read model rebuild/reconcile → report/mobile/API.

## Được phép

- Return service đọc `returnOrders`.
- AR/stock posting dùng return order đã xác nhận kế toán.
- Script audit kiểm tra return order thiếu AR/stock posting.

## Bị cấm

- Sinh AR-RETURN trước xác nhận kế toán.
- Suy luận trả hàng từ salesOrders hoặc AR ledger code.
- `returnAmount = 0` khi có `returnQty` và sale price hợp lệ.
- Reverse AR-RETURN sai chiều làm giảm nợ thay vì tăng lại nợ.

## Static guard

- `test/return-order-contract-static.test.js`.
