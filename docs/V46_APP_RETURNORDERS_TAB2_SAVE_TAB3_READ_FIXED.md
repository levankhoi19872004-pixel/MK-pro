# V46 App giao hàng - Tab 2 lưu returnOrders, Tab 3 đọc returnOrders

Quy tắc đã áp dụng:

- Tab 2 Sản phẩm giao lấy danh sách từ `order.items`.
- Bấm **Lưu hàng trả** ở Tab 2 ghi thẳng vào `returnOrders` qua `DeliveryEngine.saveReturn()`.
- API trả lại ngay `returns/returnOrders/rows` đã flatten từ phiếu `returnOrders`.
- Tab 3 Hàng trả không dùng nháp frontend; chỉ hiển thị dữ liệu đã lưu trong `returnOrders`.
- Nếu backend mobile cũ dùng `/api/mobile/delivery/return`, response cũng trả đủ `returns/returnOrders/rows`.
- Thêm `GET /api/mobile/delivery/returns` để app mobile có thể đọc trực tiếp `returnOrders`.
- Tăng version script để tránh trình duyệt dùng JS cache cũ.
