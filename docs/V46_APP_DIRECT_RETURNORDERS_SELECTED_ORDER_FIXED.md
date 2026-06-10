# V46 App giao hàng - gọi thẳng returnOrders theo đơn đang chọn

## Vấn đề
App giao hàng tab Hàng trả đang phụ thuộc danh sách returnOrders tải theo bộ lọc ngày/NVGH. Khi một đơn có phiếu trả trong returnOrders nhưng không nằm trong cache hiện tại, tab Hàng trả vẫn báo chưa có hàng trả.

## Sửa đổi
- Thêm `DeliveryCore.loadReturnsForOrder(order)` gọi trực tiếp `/api/delivery/returns` với đủ key:
  - `orderId`
  - `orderCode`
  - `salesOrderId`
  - `salesOrderCode`
  - `orderKey`
- Khi chọn đơn trên app, app tự gọi trực tiếp returnOrders cho đơn đó.
- Khi bấm tab Hàng trả, app cũng reload trực tiếp returnOrders theo đơn đang chọn.
- Sau khi lưu hàng trả ở tab Sản phẩm giao, app reload lại đúng phiếu trả chính thức từ returnOrders thay vì chỉ dựa vào cache.

## File đã chỉnh
- `public/js/delivery/delivery-core.js`
- `public/mobile/js/delivery-mobile-view.js`
