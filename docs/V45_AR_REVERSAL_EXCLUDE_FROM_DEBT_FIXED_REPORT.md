# V45 - Sửa bút toán đảo không được tính vào công nợ

## Lỗi
Một số bút toán đảo kiểu cũ đang tồn tại trong `arLedgers` dạng:

- `type: ar_sale_reversal`
- `refType: SALES_ORDER_REVERSAL`
- `status: posted`
- `credit > 0`

Màn Công nợ đọc các dòng này như bút toán công nợ thật, gây âm/dư có sai cho khách hàng.

## Đã sửa

### 1. `src/services/reportService.js`
Bộ lọc công nợ loại bỏ thêm:

- `type: ar_sale_reversal`
- `refType: SALES_ORDER_REVERSAL`

### 2. `src/services/masterOrderService.js`
Khi kiểm tra bút toán AR hiện có để đẩy công nợ, bỏ qua các dòng đảo:

- `AR_LEDGER_REVERSAL`
- `SALES_ORDER_REVERSAL`

### 3. `src/engines/posting.engine.js`
Các bút toán đảo từ `reverseSalesOrderAR()` không còn là active ledger:

- `status: reversed`
- `reversed: true`
- có `reversedAt`, `reversedBy`

Đồng thời hàm kiểm tra AR-SALE hiện có cũng bỏ qua ledger reversed/reversal.

## Kết quả
Các dòng như:

- `AR-SALE-REV-HU90202314`
- `AR-SALE-REV-HU90202291`

không còn được tính vào màn Công nợ.
