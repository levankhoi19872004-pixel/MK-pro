# V46 - Chuẩn hóa hiển thị số lượng dạng thùng/lẻ trên app và phần mềm

## Quy tắc
- Tồn kho và số lượng sản phẩm hiển thị trên giao diện app bán hàng và phần mềm dùng dạng `thùng/lẻ`, ví dụ `1/0`, `0/12`.
- Dữ liệu lưu trong DB và payload API vẫn giữ số lượng lẻ để không ảnh hưởng posting kho, công nợ, khuyến mại, import DMS.
- Xuất Excel vẫn giữ số lượng lẻ để phục vụ đối soát và import/export dữ liệu.

## Phạm vi đã chỉnh
1. App bán hàng mobile: giỏ hàng hiển thị `SL: thùng/lẻ` thay vì `SL: số lẻ Thùng`.
2. Phần mềm web: bảng tồn kho hiển thị tồn dạng `thùng/lẻ`.
3. Phần mềm web: dòng bán hàng/nhập hàng hiển thị thêm số lượng quy đổi dạng `thùng/lẻ`.
4. Preview import DMS/Excel: các cột SL đặt, tồn, SL nhập, SL cắt hiển thị `thùng/lẻ`.
5. Thông báo vượt tồn hiển thị tồn dạng `thùng/lẻ`.

## File đã sửa
- `public/mobile/js/sales.js`
- `public/js/app/04-import-orders.js`
- `public/js/app/05-sales-orders.js`
- `public/js/app/08-reports-users-promotions-import-excel.js`

## Kiểm tra kỹ thuật
- `node --check public/mobile/js/sales.js`
- `node --check public/js/app/04-import-orders.js`
- `node --check public/js/app/05-sales-orders.js`
- `node --check public/js/app/08-reports-users-promotions-import-excel.js`
