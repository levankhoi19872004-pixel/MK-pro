# Phase 64 - Ngày tạo và ngày giao mặc định cho đơn tổng

## Thay đổi

- Bổ sung trường chỉ đọc `Ngày tạo đơn tổng`, luôn lấy ngày hiện tại theo múi giờ Việt Nam.
- `Ngày giao hàng` được gợi ý tự động:
  - Thứ 2 đến thứ 6: cộng 1 ngày.
  - Thứ 7: cộng 2 ngày để sang thứ 2.
  - Chủ nhật (fallback): cộng 1 ngày để sang thứ 2.
- Người dùng vẫn có thể thay đổi ngày giao hàng trước khi lưu.
- Backend tự áp dụng cùng quy tắc nếu client không gửi ngày giao hàng.
- Khi sửa đơn tổng, ngày tạo gốc được giữ nguyên.

## Dữ liệu

- Thêm field `masterOrderDate` vào `master_orders`.
- Không cần migration bắt buộc. Đơn cũ fallback từ `createdAt` khi mở sửa.

## Phạm vi

Không thay đổi nghiệp vụ gộp đơn, tồn kho, công nợ, giao hàng, in HC/PC hay xác nhận kế toán.
