# V46 ReturnOrders Tab Visible Source Fixed

Quy tắc áp dụng:

- Tab Sản phẩm giao lấy danh sách sản phẩm từ `order.items`.
- Bấm `Lưu hàng trả` ghi ngay vào `returnOrders`.
- Tab Hàng trả không dùng nháp frontend; tab này đọc/xem/sửa dữ liệu chính thức từ `returnOrders`.
- API POST `/api/delivery/return` trả luôn các dòng hàng trả đã lưu để UI hiển thị ngay, không phụ thuộc reload phụ.
- API GET `/api/delivery/returns` tra cứu bằng mọi key có thể có: `salesOrderId`, `orderId`, `salesOrderCode`, `orderCode`, `id`, `code`, `RO-code`.
- Nếu đơn gốc không resolve được do lệch key cũ, API vẫn đọc trực tiếp từ `returnOrders` để tránh tab Hàng trả bị trắng sau khi lưu.
- Frontend không được xóa state hàng trả vừa lưu nếu lần reload trả rỗng do lệch key.

Mục tiêu: sau khi lưu ở Tab 2, Tab 3 phải luôn thấy dữ liệu từ nguồn chuẩn `returnOrders`.
