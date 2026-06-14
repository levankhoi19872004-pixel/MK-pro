# PHASE 35 - Bước 1: Tách frontend Công nợ / Trả hàng / Quỹ

## Đã thực hiện
- Tách `public/js/app/07-debt-cashbook.js` thành 6 module theo nghiệp vụ.
- `public/index.html` tải module theo thứ tự phụ thuộc rõ ràng.
- Chuyển quyền sở hữu event của Trả hàng và Đơn tổng trả khỏi `public/app.js` về module tương ứng.
- Loại bỏ bind trùng gây gọi API lặp/race condition.
- Giữ `07-debt-cashbook.js` làm manifest tương thích, không còn chứa logic runtime.

## Module mới
- `public/js/app/debt/07a-debt-core.js`
- `public/js/app/debt/07b-return-orders.js`
- `public/js/app/debt/07c-ar-cashbook.js`
- `public/js/app/debt/07d-master-return-orders.js`
- `public/js/app/debt/07e-debt-collections.js`
- `public/js/app/debt/07f-fund-ledger.js`

## Bước tiếp theo
Tách `08-reports-users-promotions-import-excel.js` thành Reports / Users / Import / Promotions / VAT export.
