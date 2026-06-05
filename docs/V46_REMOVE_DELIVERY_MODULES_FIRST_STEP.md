# V46 - Remove old delivery modules first step

Đã tạm xoá khỏi giao diện:
- App giao hàng mobile V45
- Mục phần mềm web: Đơn đi giao hôm nay

Mục tiêu:
- Ngừng dùng 2 luồng giao hàng cũ đang lệch nhau.
- Chuẩn bị làm lại theo 1 lõi giao hàng duy nhất, 2 giao diện khác nhau.

Thay đổi chính:
- `public/index.html`: bỏ nút menu `Đơn đi giao hôm nay` và section `deliveryTodayTab`.
- `public/mobile/delivery.html`: thay bằng trang thông báo module đã tạm xoá.
- `public/mobile/js/delivery.js`: xoá logic cũ, chỉ để marker no-op.

Chưa xoá backend/API để tránh vỡ dữ liệu cũ. Backend sẽ được gom lại ở bước sau khi thiết kế canonical delivery core.
