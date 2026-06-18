# PHASE 76 — Deployment Checklist

## Trước triển khai

- Sao lưu bản Phase 75 đang chạy.
- Không cần migration MongoDB.
- Không thay đổi biến môi trường.
- Xác nhận route `/api/reports/catalog` và `/api/reports/run/:code` đang hoạt động.

## Kiểm tra giao diện

1. Mở tab **Báo cáo**.
2. Xác nhận danh sách báo cáo hiển thị ngay trên cửa sổ chính.
3. Xác nhận tab Báo cáo không tự mở popup.
4. Tìm một báo cáo bằng ô tìm kiếm danh mục.
5. Bấm **Xem báo cáo**.
6. Xác nhận popup mở đúng báo cáo đã chọn.
7. Kiểm tra lọc ngày, tìm kiếm, số dòng, phân trang và Xuất Excel.
8. Đóng popup bằng nút Đóng, phím Esc và click nền tối.
9. Kiểm tra báo cáo **Khách hàng đã trả thưởng** vẫn hiển thị đúng quyền.

## Rollback

Khôi phục ZIP Phase 75. Không có dữ liệu cần rollback.
