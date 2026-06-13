# PHASE 19 — Bố cục đơn bán hàng gọn, ưu tiên danh sách sản phẩm

## Phạm vi

- Chỉ thay đổi giao diện popup tạo/sửa đơn bán hàng.
- Không thay đổi API, model, tồn kho, công nợ, khuyến mại hoặc logic lưu đơn.

## Thay đổi

- Popup mở rộng lên tối đa 94vw × 92vh.
- Header giảm chiều cao.
- Thông tin khách hàng, NVBH, ngày bán, phương thức và VAT nằm trên hàng compact.
- Phương thức bán và VAT dùng nhãn ngắn, không tạo khối cao.
- Lý do không xuất hóa đơn mặc định ẩn, chỉ hiện khi chọn “Không xuất”.
- Thanh thêm sản phẩm chuyển thành một hàng thấp.
- Bảng sản phẩm chiếm toàn bộ chiều cao còn lại, header cố định và dòng hàng gọn hơn.
- Footer tổng số lượng, tổng tiền, tiền đã thu và nút lưu được cố định ở cuối popup.
- Bổ sung responsive cho màn hình 1250px, 900px và 640px.

## File thay đổi

- `public/index.html`
- `public/style.css`
- `public/js/app/05-sales-orders.js`
- `test/sales-order-modal-compact-layout-static.test.js`

## Kiểm thử

- Syntax JavaScript: pass.
- Static test bố cục compact: pass.
- Regression VAT setting/UI: pass.
- Regression boundary inventory/search: pass.
