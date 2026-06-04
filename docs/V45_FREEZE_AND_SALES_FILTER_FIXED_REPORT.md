# V45 Freeze + Sales Filter Fixed

## Nội dung đã sửa

1. Sửa lỗi JavaScript toàn hệ thống:
   - `debounce is not defined` tại `public/js/app/07-debt-cashbook.js`.
   - Thêm `window.debounce` dùng chung trong `public/js/app/01-utils-print-tabs.js`.

2. Chống đơ khi mở phần mềm:
   - Sửa `public/app.js` không còn gọi đồng loạt tất cả module khi load trang.
   - Chỉ tải màn đang mở, các màn khác tải lazy khi bấm tab.
   - Tránh bắn cùng lúc các request nặng: sản phẩm, khách hàng, tồn kho, đơn bán, đơn tổng, giao hàng, công nợ, báo cáo, users, khuyến mại.

3. Sửa trùng request danh sách đơn bán:
   - Bỏ đăng ký event load đơn bị lặp trong `public/app.js`.
   - Giữ một nguồn xử lý chính tại `public/js/app/05-sales-orders.js`.

4. Sửa bộ lọc NVBH trong lịch sử đơn bán:
   - Tách mã từ label kiểu `42176 - Vũ Thành Tâm - Bán hàng - ...`.
   - Đồng bộ `dataset.selectedId` để bấm `Tải lại` vẫn gửi đúng mã.
   - Gửi thêm `includeStaffAliases=1` để backend lọc được dữ liệu cũ có nhiều field NVBH.

## File đã sửa

- `public/js/app/01-utils-print-tabs.js`
- `public/js/app/07-debt-cashbook.js`
- `public/js/app/05-sales-orders.js`
- `public/app.js`

## Kiểm tra

Đã chạy `node --check` toàn bộ file `.js`, không phát hiện lỗi cú pháp.
