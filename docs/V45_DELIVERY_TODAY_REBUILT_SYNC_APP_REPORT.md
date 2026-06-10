# V45 - Rebuild Đơn đi giao hôm nay đồng bộ app giao hàng

## Mục tiêu
Xóa luồng cũ của màn `Đơn đi giao hôm nay` và viết lại theo nguyên tắc: app giao hàng và phần mềm web dùng chung dữ liệu hàng trả từ `returnOrders`.

## File đã sửa
- `public/js/app/06-master-delivery.js`
- `src/services/masterOrderService.js`
- `src/routes/mobileRoutes.js`

## Nguyên tắc mới
- Danh sách đơn web lấy từ `/api/master-orders/delivery-today-orders`.
- Backend trả kèm `items`, `returnOrderItems`, `deliveryReturnItems` đã ghép từ `order.items + returnOrders`.
- Số lượng trả chỉ lấy từ `returnOrders.items.returnQty/qtyReturn`.
- Nếu phiếu trả `status = cleared` thì không còn được tính là hàng trả.
- Web lưu hàng trả vào `/api/return-orders/by-sales-order/:key/items`, cùng nguồn với app.
- Web lưu tiền thu vào `/api/master-orders/delivery-today/:id`.

## Kết quả mong đợi
- App nhập hàng trả → web mở cùng đơn sẽ thấy đúng SL trả.
- Web sửa hàng trả → app tải lại sẽ thấy đúng SL trả.
- Không còn tình trạng web tự dựng hàng trả khác app.
- Phiếu trả cleared/0 không còn bị kéo lại thành số cũ.
