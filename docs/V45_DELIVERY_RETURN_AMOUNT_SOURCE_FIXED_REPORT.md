# V45 - Delivery return amount source & edit fix

## Lỗi phát hiện

Tiền hàng trả trên tab Thu tiền là ô readonly, không phải nơi lưu dữ liệu gốc. Giá trị này được lấy từ:

1. `returnOrders.items[].qtyReturn/quantity` và `returnOrders.items[].amount`
2. Tổng lại thành `returnOrders.totalAmount`, `returnOrders.amount`, `returnOrders.debtReduction`
3. Đồng bộ sang `salesOrders.returnAmount`, `salesOrders.returnedAmount`, `salesOrders.returnItems`, `salesOrders.deliveryReturnItems` để app/web hiển thị nhanh.

Nếu nhân viên giao hàng sửa số lượng trả về 0 hoặc sửa lại số lượng mới, frontend/backend phải cập nhật `returnOrders` trước, sau đó mới đồng bộ lại `salesOrders`.

## File đã sửa

- `public/mobile/js/delivery.js`
- `src/routes/mobileRoutes.js`
- `src/services/mobile/delivery.service.js`

## Nội dung sửa

- Khi bấm Xác nhận giao ở tab Hàng giao, app gửi toàn bộ dòng hàng trả, kể cả dòng có `qtyReturn = 0`.
- Sau khi API `/api/mobile/delivery/return` trả về, app merge ngay `returnResult.order` vào state để tab Thu tiền không còn dùng giá trị cũ.
- API hàng trả nhận `replaceReturnItems: true`, `allowEmptyReturn: true`.
- Backend cho phép danh sách hàng trả rỗng để xóa/cancel phiếu trả tạm cũ khi NVGH sửa hết SL trả về 0.
- Service mobile modular cũng được sửa cùng logic để tránh lệch nếu hệ thống chuyển sang route mới.

## Quy tắc chuẩn

`returnOrders` là nguồn sự thật của hàng trả.  
`salesOrders.returnAmount` chỉ là bản đồng bộ để hiển thị nhanh.
