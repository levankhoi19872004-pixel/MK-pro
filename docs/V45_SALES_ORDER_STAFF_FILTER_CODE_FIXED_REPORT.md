# V45 - Sửa lọc lịch sử đơn bán theo mã NVBH

## Vấn đề
Ô lọc NVBH hiển thị dạng `35128 - Nguyễn Thị Thủy - Bán hàng - 0984974102` nhưng API lịch sử đơn bán có lúc nhận cả chuỗi label hoặc lọc theo tên, nên không match được đơn DMS/import đang lưu mã ở `staffCode` / `salesStaffCode`.

## Đã sửa
- Frontend `public/js/app/05-sales-orders.js` tách mã NVBH từ label hiển thị trước khi gọi API.
- API gửi `salesStaffCode=35128`, không gửi cả chuỗi tên.
- Backend `src/services/orderService.js` nhận `salesStaffCode/staffCode/salesmanCode/nvbhCode/maNVBH`, tách mã nếu vẫn bị gửi label.
- Backend lọc theo nhiều field mã NVBH: `staffCode`, `salesStaffCode`, `salesPersonCode`, `salesmanCode`, `nvbhCode`, `maNVBH`, `salesStaff.code`, `staff.code`.

## Quy tắc chuẩn
NVBH trong bộ lọc lấy mã làm khóa chính. Tên chỉ dùng để hiển thị.
