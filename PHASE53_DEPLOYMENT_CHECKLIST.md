# PHASE 53 — Deployment checklist

1. Deploy mã nguồn mới và chờ Render restart hoàn tất.
2. Hard refresh trang quản trị (`Ctrl + F5`).
3. Mở Tổng quan và bấm `Tải lại` để bỏ cache cũ.
4. Chọn đúng tháng cần kiểm tra.
5. Đối chiếu một NVBH theo cùng tập đơn:
   - Số đơn hợp lệ trong tháng trên Dashboard.
   - Tổng giá trị theo `quantity × products.salePrice` của các đơn đó.
6. Kiểm tra đơn hủy/xóa không được tính.
7. Kiểm tra đơn chưa xác nhận kế toán nhưng còn hiệu lực đã được tính.
8. Kiểm tra hàng trả nháp chưa làm giảm doanh số ròng.
9. Kiểm tra cột Hôm nay và tổng tháng không còn dùng hai phạm vi trạng thái khác nhau.
