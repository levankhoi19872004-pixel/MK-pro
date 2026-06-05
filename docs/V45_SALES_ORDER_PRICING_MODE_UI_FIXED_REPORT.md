# V45 Sales Order Pricing Mode UI Fixed

## Nội dung đã chỉnh

1. Màn Tạo đơn bán hàng
- Đưa ô Khách hàng lên cùng hàng với ô Nhân viên bán hàng.
- Thêm lựa chọn Phương thức bán:
  - Bán thẳng giá mặc định
  - Bán theo khuyến mại

2. Quy tắc giá/số lượng
- Bán thẳng giá mặc định: được sửa số lượng và giá bán từng dòng sản phẩm.
- Bán theo khuyến mại: được sửa số lượng, khóa giá bán theo chương trình/giá mặc định đang áp dụng.

3. Dữ liệu gửi backend
- Thêm saleMode/pricingMode/orderPricingMode vào đơn.
- Từng dòng sản phẩm có saleMode và priceLocked.

4. Đơn DMS import
- Mặc định saleMode = direct.
- Không chuyển đơn import DMS sang luồng khuyến mại.

## File đã sửa
- public/index.html
- public/js/app/05-sales-orders.js
- public/style.css
- src/services/orderService.js
- src/services/excelImportService.js

## Kiểm tra
- node --check toàn bộ file .js: OK.
