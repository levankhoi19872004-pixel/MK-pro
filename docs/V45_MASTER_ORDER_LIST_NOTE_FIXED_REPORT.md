# V45 Master Order List Note Fixed

Đã bổ sung hiển thị ghi chú trong danh sách đơn tổng.

## Thay đổi

- `public/js/app/06-master-delivery.js`: mỗi dòng đơn tổng hiển thị thêm `note` / `deliveryNote`.
- `public/style.css`: thêm cột ghi chú, giữ layout một dòng và tự rút gọn bằng dấu `...`.
- `src/models/MasterOrder.js`: bổ sung trường `note`, `deliveryNote`, `routeName`.
- `src/services/masterOrderService.js`: chuẩn hóa lưu ghi chú khi tạo/sửa đơn tổng.

## Kết quả

Khi tạo đơn tổng có nhập ghi chú như `TP Anh 01.06`, danh sách đơn tổng sẽ hiện trực tiếp nội dung ghi chú trên từng dòng.
