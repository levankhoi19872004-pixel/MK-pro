# V45 Delivery Today NVGH → NVBH Accordion Report

## Mục tiêu
- Màn Đơn đi giao hôm nay không render toàn bộ đơn ngay khi mở.
- Mặc định hiển thị tổng quan theo nhân viên giao hàng.
- Click NVGH mới tải chi tiết nhân viên bán hàng.
- Click NVBH mới tải danh sách đơn thuộc đúng cặp NVGH + NVBH.
- Không thay đổi luồng AR Ledger, không thay đổi xác nhận kế toán.

## Backend đã thêm
- `GET /api/master-orders/delivery-today-summary`
  - Tổng hợp tầng 1 theo NVGH.
- `GET /api/master-orders/delivery-today-summary/:deliveryStaffCode`
  - Tổng hợp tầng 2 theo NVBH trong NVGH được chọn.
- `GET /api/master-orders/delivery-today-orders`
  - Lấy danh sách đơn compact theo `deliveryStaffCode` + `salesStaffCode`.

## Service đã thêm
File `src/services/masterOrderService.js`:
- `listDeliveryTodaySummary(query)`
- `listDeliveryTodaySalesSummary(deliveryStaffCode, query)`
- `listDeliveryTodayOrdersCompact(query)`

Công thức giữ thống nhất:
- `Đã thu = Tiền mặt + Chuyển khoản + Trả thưởng + Hàng trả`
- `Còn nợ = Phải thu - Đã thu`

## Frontend đã sửa
File `public/js/app/06-master-delivery.js`:
- `loadDeliveryToday()` giờ chỉ tải summary NVGH.
- `toggleDeliveryStaffSummary()` tải NVBH theo NVGH.
- `toggleDeliverySalesOrders()` tải đơn theo NVGH + NVBH.
- `renderDeliveryTodaySummary()` hiển thị accordion.
- `renderCompactDeliveryOrders()` hiển thị đơn gọn một hàng.

## CSS đã thêm
File `public/style.css`:
- Compact accordion row.
- Dòng NVGH/NVBH cỡ nhỏ.
- Dòng đơn một hàng, tiền dạng compact.

## Kiểm tra
- `node --check` các file chính: OK.
- `npm run docs:generate`: OK.
- `npm test`: 7 phần đầu OK/skip hợp lệ; 2 test còn lại không chạy vì môi trường thiếu package `mongoose` trong `node_modules`.
