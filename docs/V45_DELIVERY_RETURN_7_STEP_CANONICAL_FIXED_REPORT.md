# V45 Delivery Return 7-Step Canonical Fix

Đã sửa luồng hàng trả app giao hàng theo 7 bước chuẩn:

1. Chốt nguồn thật duy nhất cho hàng trả là `returnOrders`.
2. Thêm `returnOrderService.upsertDeliveryReturnOrder()` để upsert theo `salesOrderId/salesOrderCode`.
3. Cho phép sửa toàn bộ SL trả về 0 bằng trạng thái `cleared`, không xóa nhầm phiếu khác.
4. Route `/api/mobile/delivery/return` ghi trực tiếp vào `returnOrders`, không dùng snapshot làm nguồn chính.
5. Khi lưu tiền giao hàng, `saveDeliveryPaymentCanonical()` không còn đẩy `returnItems: []`/`returnAmount: 0` từ snapshot cũ nếu request không phải luồng hàng trả.
6. Đồng bộ nền `syncDeliveryPaymentToMasterSnapshot()` chỉ ghi các trường hàng trả khi `syncReturn=true` hoặc có returnOrder hiệu lực.
7. App/mobile delivery service refresh `returnOrders` từ Mongo trước khi dựng danh sách, tránh nhìn snapshot cũ rồi mất hàng trả sau reload.

Các file chính đã chỉnh:

- `src/services/returnOrderService.js`
- `src/routes/mobileRoutes.js`
- `src/services/mobile/delivery.service.js`

Đã kiểm tra cú pháp bằng:

```bash
node -c src/services/returnOrderService.js
node -c src/routes/mobileRoutes.js
node -c src/services/mobile/delivery.service.js
```
