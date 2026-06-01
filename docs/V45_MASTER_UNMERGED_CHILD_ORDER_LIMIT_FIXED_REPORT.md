# V45 - Sửa giới hạn danh sách đơn con chưa gộp

## Vấn đề
Màn Đơn tổng / Đơn con chưa gộp chỉ gửi `limit=50`, trong khi `orderService.listOrders()` cũng bị chặn limit mặc định. Vì vậy khi số đơn con nhiều, người dùng không tìm/tick được các đơn nằm ngoài 50 dòng đầu.

Ngoài ra bộ lọc NVBH ở `masterOrderService` lọc sau khi đã lấy dữ liệu, dẫn tới trường hợp lấy 50/100 đơn đầu rồi mới lọc nhân viên, làm mất đơn cần tìm.

## Đã sửa
- `public/js/app/06-master-delivery.js`
  - Tăng limit tải đơn con chưa gộp từ `50` lên `2000`.
- `src/services/masterOrderService.js`
  - Tăng limit nội bộ cho luồng đơn con chưa gộp tối đa 5000.
  - Đẩy `salesStaffCode` xuống `orderService.listOrders()` để Mongo lọc trước khi limit.
  - Vẫn không truyền `source/orderSource` xuống orderService để tránh lọc nguồn 2 lần.
- `src/services/orderService.js`
  - Thêm hỗ trợ `__internalMaxLimit` cho các luồng nội bộ cần lấy nhiều đơn hơn mặc định.

## Kết quả
Danh sách Đơn con chưa gộp có thể tìm và hiển thị được nhiều đơn hơn, không còn bị hụt vì giới hạn 50 đơn đầu.
