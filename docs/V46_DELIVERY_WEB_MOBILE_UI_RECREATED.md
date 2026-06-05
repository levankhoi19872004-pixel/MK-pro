# V46 - Tạo lại Đơn giao hôm nay và UI App giao hàng

## Mục tiêu
- Tạo lại màn Web `Đơn giao hôm nay`.
- Tạo lại UI `App giao hàng`.
- Web và App chỉ khác giao diện, cùng dùng `DeliveryCore` và API chuẩn `/api/delivery/*`.

## File chính đã sửa
- `public/index.html`: bật lại menu và section `deliveryTodayTab`.
- `public/js/delivery/delivery-web-view.js`: dựng lại giao diện web.
- `public/mobile/js/delivery-mobile-view.js`: dựng lại giao diện mobile 4 tab.
- `public/js/delivery/delivery-core.js`: bổ sung chuẩn hóa item đầy đủ hơn.
- `public/style.css`: thêm CSS cho web delivery V46.
- `public/mobile/mobile.css`: thêm CSS cho app giao hàng V46.

## Luồng chuẩn
- Đọc đơn: `DeliveryCore.loadOrders()` → `GET /api/delivery/orders`.
- Lưu hàng trả: `DeliveryCore.saveReturn()` → `POST /api/delivery/return`.
- Lưu thu tiền: `DeliveryCore.savePayment()` → `POST /api/delivery/payment`.
- Xác nhận giao: `DeliveryCore.confirmDelivery()` → `POST /api/delivery/confirm`.

## Kiểm tra cú pháp
Đã chạy `node --check` cho các file JS chính: OK.
