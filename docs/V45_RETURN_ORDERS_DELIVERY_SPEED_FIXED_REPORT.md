# V45 ReturnOrders Delivery Speed Fixed

## Mục tiêu
Giảm thời gian tải màn Đơn đi giao hôm nay do returnOrders đang bị load toàn bộ và bị gọi thêm từ frontend.

## Đã sửa

1. `public/js/app/06-master-delivery.js`
   - Bỏ gọi phụ `/api/return-orders?limit=5000` trong màn Đơn đi giao hôm nay.
   - `fetchReturnOrdersForDeliveryFilter()` được chuyển thành no-op để tránh vô tình gọi lại API nặng.
   - Dữ liệu hàng trả lấy từ API chính `/api/master-orders/delivery-today-orders`.

2. `src/services/masterOrderService.js`
   - `findReturnOrdersForDeliveryChildren()` chỉ query returnOrders theo danh sách đơn đang hiển thị bằng `$in`.
   - Thêm projection để chỉ lấy trường cần thiết.
   - `updateDeliveryTodayOrder()` không còn `returnOrderRepository.findAll()` toàn bộ, chỉ query theo đơn đang sửa.
   - `findErpDeliveryReturnOrders()` không còn scan toàn bộ returnOrders.
   - Thêm log `[DELIVERY_TODAY_RETURN_ORDERS]` để đo riêng thời gian query returnOrders.

3. `src/services/mobile/delivery.service.js`
   - App giao hàng không còn `data.returnOrders = await returnOrderRepository.findAll()`.
   - Chỉ query returnOrders liên quan đến các đơn của ngày/NVGH đang mở.

4. `src/services/returnOrderService.js`
   - `findExistingReturnOrder()` không còn scan toàn bộ returnOrders.
   - `findBySalesOrder()` chuyển sang query theo salesOrderId/salesOrderCode/orderId/orderCode.
   - `buildReturnOrderDocument()` và `upsertDeliveryReturnOrder()` không còn load toàn bộ returnOrders chỉ để sinh mã.
   - `attachMasterOrderToReturnDrafts()` và `detachMasterOrderFromReturnDrafts()` chuyển sang `updateMany()` theo danh sách đơn, không chạy từng đơn.

5. `src/services/mongoIndexService.js`
   - Bổ sung index cho `masterOrderId`, `masterReturnOrderId`, `status + deliveryDate` của returnOrders.

## Cách kiểm tra sau deploy

Mở F12 > Network > vào Đơn đi giao hôm nay.

Không được còn request:

```txt
/api/return-orders?limit=5000
```

Header speed monitor nên giảm mạnh ở mục Trả hàng.

Trước sửa ảnh đo được:

```txt
Trả hàng ~6619ms
API ~7855ms
Trình duyệt ~8499ms
```

Mục tiêu sau sửa:

```txt
Trả hàng < 200-500ms
API < 1000-1500ms
Trình duyệt < 1200-1800ms
```

Nếu `returnMs` vẫn cao, kiểm tra MongoDB đã tạo index chưa bằng log `[INDEX]` khi server khởi động.

## Test trong môi trường hiện tại

- Đã chạy `node --check` cho các file JS đã sửa: đạt.
- Chạy `npm test`: một số test bị dừng do môi trường thiếu package `mongoose`; lỗi này là thiếu dependency trong sandbox, không phải lỗi cú pháp của bản sửa.
