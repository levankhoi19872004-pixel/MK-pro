# V46 Canonical Delivery Core - Full implementation

Đã gom lõi giao hàng chung để App giao hàng và Web Đơn đi giao hôm nay chỉ khác giao diện.

## API chuẩn mới

- `GET /api/delivery/orders`
- `POST /api/delivery/return`
- `POST /api/delivery/payment`
- `POST /api/delivery/confirm`

## Frontend core

- `public/js/delivery/delivery-core.js`: lõi chung loadOrders, saveReturn, savePayment, confirmDelivery.
- `public/js/delivery/delivery-web-view.js`: chỉ render giao diện web.
- `public/mobile/js/delivery-mobile-view.js`: chỉ render giao diện mobile.

## File cũ đã dọn logic

- `public/js/app/06-master-delivery.js`: chỉ còn wrapper tương thích.
- `public/mobile/js/delivery.js`: chỉ còn wrapper tương thích.

## Nguồn dữ liệu

- Đơn gốc: `orders` / model `SalesOrder`.
- Hàng trả: `returnOrders`.
- Tiền thu tạm: lưu trên `SalesOrder` các field cash/bank/reward.

## Quy tắc hàng trả

- `returnQty > 0`: upsert `returnOrders`.
- toàn bộ `returnQty = 0`: clear `returnOrders` về 0, không giữ lại số cũ.

## Test cần chạy sau deploy

1. App nhập hàng trả, Web reload thấy đúng.
2. Web nhập hàng trả, App reload thấy đúng.
3. App sửa hàng trả về 0, Web về 0.
4. Web sửa hàng trả về 0, App về 0.
5. App thu tiền, Web đúng.
6. Web thu tiền, App đúng.
7. Xác nhận giao App, Web đúng trạng thái.
8. Xác nhận giao Web, App đúng trạng thái.
