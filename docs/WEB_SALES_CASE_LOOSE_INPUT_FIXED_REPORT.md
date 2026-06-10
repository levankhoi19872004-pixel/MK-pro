# WEB_SALES_CASE_LOOSE_INPUT_FIXED_REPORT

## Mục tiêu
Chuẩn hóa màn Bán hàng web: cột số lượng không nhập số lẻ nội bộ nữa, mà tách thành 2 ô `Thùng` và `Lẻ`. Dữ liệu hệ thống vẫn lưu `quantity` theo số lượng lẻ để backend, tồn kho và Excel dùng đúng nguồn chuẩn.

## File đã sửa
- `public/js/app/01-utils-print-tabs.js`
- `public/js/app/05-sales-orders.js`
- `public/index.html`

## Nội dung sửa
1. Thêm hàm `splitCaseLoose(quantity, rate)` để tách số lượng lẻ thành `{ caseQty, looseQty }`.
2. Export `window.splitCaseLoose` để dùng chung trong web app.
3. Khi mở sửa đơn bán, mỗi dòng hàng được bổ sung `caseQty` và `looseQty` từ `quantity` + `conversionRate`.
4. Đổi header bảng bán hàng từ `SL` sang `Thùng | Lẻ`.
5. Sửa `renderSalesItems()` để hiển thị 2 input riêng: `qty-case` và `qty-loose`.
6. Thêm `updateSalesItemCase()` và `updateSalesItemLoose()`.
7. Thêm `rebuildSalesItemQuantity()` để tính lại `quantity = thùng × quy cách + lẻ`.
8. Tự động quy đổi khi lẻ >= quy cách, ví dụ quy cách 24, nhập 30 lẻ thành 1 thùng 6 lẻ.
9. Đổi nhãn tổng thành `Tổng SL (quy đổi)` để tránh hiểu nhầm.
10. Payload lưu đơn vẫn gửi `quantity` là số lượng lẻ, đồng thời gửi thêm `conversionRate/packingQty/unitsPerCase` để giữ quy cách khi sửa lại.

## Test
Đã chạy:

```bash
node --check public/js/app/01-utils-print-tabs.js
node --check public/js/app/05-sales-orders.js
```
