# Delivery Route Tracking Runbook

## Mục tiêu

Theo dõi tuyến đường xe giao hàng của NVGH ở mức P0: app giao hàng đang mở, NVGH bấm **Bắt đầu giao**, hệ thống ghi nhận GPS định kỳ 60 giây và/hoặc khi di chuyển đủ xa.

## API mobile

- `POST /api/mobile/delivery/location/session/start`
- `POST /api/mobile/delivery/location/ping`
- `POST /api/mobile/delivery/location/session/stop`
- `GET /api/mobile/delivery/location/session/current`

## API quản trị

- `GET /api/delivery/routes?date=YYYY-MM-DD&deliveryStaffCode=...`
- `GET /api/delivery/routes/:sessionId`
- `GET /api/delivery/routes/live?date=YYYY-MM-DD`

## Kiểm tra thủ công

1. Login NVGH.
2. Mở app giao hàng.
3. Bấm **Bắt đầu giao**.
4. Cấp quyền vị trí.
5. Kiểm tra trạng thái “Đang ghi nhận tuyến giao hàng”.
6. Chờ 1–2 phút có điểm GPS.
7. Admin mở Đơn giao hôm nay → Theo dõi tuyến giao hàng.
8. Bấm **Kết thúc** khi xong ca.

## Lưu ý vận hành

- Không sửa AR/Fund/Inventory.
- GPS fail không được làm fail xác nhận giao hàng.
- Nếu muốn tracking nền trong APK cần native foreground service.
