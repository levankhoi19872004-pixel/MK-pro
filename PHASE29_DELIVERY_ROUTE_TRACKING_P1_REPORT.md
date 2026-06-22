# PHASE29_DELIVERY_ROUTE_TRACKING_P1_REPORT

## Baseline

- Baseline ZIP: `MK-pro-phase28-delivery-return-tab-only-returned-items-patched(2).zip`
- Phạm vi: thêm theo dõi tuyến giao hàng P0 qua App Giao Hàng khi app đang mở.
- Không sửa AR/Fund/Inventory và không đổi business rule tiền/tồn/công nợ.

## Khảo sát GPS/APK wrapper

| Khu vực | Kết quả | Ghi chú |
|---|---|---|
| `public/mobile/js/delivery-ui-utils.js` | Có logic mở bản đồ ngoài app từ Phase25 | Không phải tracking tuyến |
| `public/mobile/js/delivery-mobile-view.source.js` | Chưa có route tracking trước Phase29 | Đã thêm panel trạng thái tuyến |
| `src/routes/mobile/delivery.routes.js` | Chưa có API GPS | Đã thêm API session/ping/stop/current |
| `src/routes/deliveryRoutes.js` | Chưa có API quản trị xem tuyến | Đã thêm `/api/delivery/routes*` |
| Android/APK wrapper | Không tìm thấy `android/`, `MainActivity.*`, `WebViewClient.*`, `capacitor.config.*`, `cordova/` | Không bịa code native; tạo tài liệu hướng dẫn wrapper |

## Model/collection mới

### `deliveryRouteSessions`

Lưu phiên/ca tuyến giao hàng của NVGH:

- `sessionId`
- `deliveryStaffCode`, `deliveryStaffName`, `userId`
- `date`, `status`
- `startedAt`, `endedAt`
- `startLat/startLng`, `endLat/endLng`, `lastLat/lastLng`
- `pointCount`, `distanceKm`, `lastSeenAt`

### `deliveryLocationPoints`

Lưu điểm GPS:

- `sessionId`
- `deliveryStaffCode`, `deliveryStaffName`, `userId`
- `lat`, `lng`, `accuracy`, `speed`, `heading`, `altitude`
- `capturedAt`, `clientTs`
- `eventType`: `periodic`, `start`, `stop`, `customer_selected`, `delivery_confirmed`
- `orderCode`, `customerCode`, `customerName`

## API mới

### Mobile NVGH

```http
POST /api/mobile/delivery/location/session/start
POST /api/mobile/delivery/location/ping
POST /api/mobile/delivery/location/session/stop
GET  /api/mobile/delivery/location/session/current
```

Quy tắc:

- Role `delivery` chỉ ghi tuyến cho chính mình.
- Backend lấy mã NVGH từ token, không tin client gửi mã người khác.
- Ping thiếu lat/lng bị chặn 400.
- Chưa start session mà ping sẽ trả 409.
- GPS sai số quá lớn hoặc chưa di chuyển đủ xa được bỏ qua an toàn.

### Web/Admin

```http
GET /api/delivery/routes?date=YYYY-MM-DD&deliveryStaffCode=...
GET /api/delivery/routes/:sessionId
GET /api/delivery/routes/live?date=YYYY-MM-DD
```

Admin/manager/accountant xem được theo ngày/NVGH. Role delivery nếu dùng route này chỉ bị scope chính mình.

## UI mobile mới

Thêm module:

```text
public/mobile/js/delivery-route-tracking.js
```

App Giao Hàng hiển thị trạng thái nhỏ:

```text
Tuyến giao: Chưa bắt đầu [Bắt đầu giao]
Đang ghi nhận tuyến giao hàng · N điểm [Kết thúc]
```

Đặc điểm:

- Chỉ tracking khi NVGH bấm **Bắt đầu giao**.
- Dùng `navigator.geolocation.getCurrentPosition`.
- Gửi định kỳ 60 giây khi app/WebView còn mở.
- Khi chọn khách gửi event `customer_selected` nếu đang tracking.
- Khi xác nhận giao/thu tiền gửi event `delivery_confirmed` nếu đang tracking.
- GPS lỗi không làm fail thao tác giao hàng.

## UI web/admin mới

Trong màn Đơn giao hôm nay, thêm khung:

```text
Theo dõi tuyến giao hàng
[Tải tuyến]
```

P0 hiển thị:

- NVGH
- trạng thái phiên
- thời gian bắt đầu/kết thúc
- số điểm GPS
- km ước tính
- link Google Maps vị trí mới nhất

Không thêm thư viện bản đồ lớn ở P0.

## ENV mới

```env
DELIVERY_ROUTE_TRACKING_ENABLED=true
DELIVERY_ROUTE_TRACKING_INTERVAL_MS=60000
DELIVERY_ROUTE_TRACKING_MIN_DISTANCE_M=50
DELIVERY_ROUTE_TRACKING_MAX_ACCURACY_M=200
DELIVERY_ROUTE_TRACKING_RETENTION_DAYS=180
```

## Tài liệu mới

- `DELIVERY_ROUTE_TRACKING_RUNBOOK.md`
- `APK_DELIVERY_ROUTE_TRACKING_NATIVE_NOTE.md`

Do ZIP không có mã Android native wrapper, tracking hiện tại là web/mobile foreground. Tracking nền ổn định cần foreground service trong APK wrapper.

## File đã sửa/thêm

### Added

- `src/models/DeliveryRouteSession.js`
- `src/models/DeliveryLocationPoint.js`
- `src/services/deliveryRouteTracking.service.js`
- `public/mobile/js/delivery-route-tracking.js`
- `DELIVERY_ROUTE_TRACKING_RUNBOOK.md`
- `APK_DELIVERY_ROUTE_TRACKING_NATIVE_NOTE.md`
- `test/delivery-route-tracking-p1-static.test.js`
- `PHASE29_DELIVERY_ROUTE_TRACKING_P1_REPORT.md`

### Modified

- `.env.example`
- `.env.production.example`
- `ENVIRONMENT_VARIABLES.md`
- `config/source-bundles.json`
- `docs/openapi.json`
- `public/mobile/delivery.html`
- `public/mobile/js/delivery-mobile-view.source.js`
- `public/mobile/js/delivery-mobile-view.js`
- `public/mobile/js/delivery-mobile-view.js.map`
- `public/mobile/mobile.source/mobile-04.css`
- `public/mobile/mobile.css`
- `public/js/delivery/delivery-web-view.source/part-01.jsfrag`
- `public/js/delivery/delivery-web-view.source/part-03.jsfrag`
- `public/js/delivery/delivery-web-view.js`
- `src/constants/collectionKeys.js`
- `src/controllers/mobile/delivery.controller.js`
- `src/models/index.js`
- `src/routes/deliveryRoutes.js`
- `src/routes/mobile/delivery.routes.js`
- `src/services/mobile/delivery.service.js`

## Test đã chạy

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm run source-bundles:refresh
npm run check:source-bundles
npm run check:source-size
npm run check:syntax
npm run docs:generate
npm run docs:check
node --test test/delivery-route-tracking-p1-static.test.js test/delivery-return-tab-only-returned-items-static.test.js test/delivery-split-list-customer-workflow-ui-static.test.js test/delivery-map-external-webview-fix-static.test.js test/delivery-deduplicate-actions-ui-static.test.js
npm test
```

Kết quả:

- `check:source-bundles`: OK 19 bundles
- `check:source-size`: OK
- `check:syntax`: `SYNTAX_OK 962 JavaScript files`
- `docs:check`: OpenAPI up to date, scanned operations 323
- Targeted tests: 30 pass / 0 fail
- Full test: 1074 tests / 1071 pass / 2 fail / 1 skipped

Hai lỗi fail là snapshot legacy cũ:

- `test/phase79-production-strangler.test.js` — assembled index page snapshot
- `test/phase79-production-strangler.test.js` — split CSS parts preserve exact legacy cascade order

Không cập nhật snapshot này để tránh thay đổi ngoài phạm vi Phase29.

## Rủi ro còn lại

1. Tracking nền trong APK chưa đảm bảo nếu WebView bị Android kill/background lâu.
2. Cần native Android wrapper/foreground service nếu muốn ghi GPS khi tắt màn hình.
3. P0 web admin mới hiển thị bảng/link Google Maps, chưa có bản đồ tuyến polyline chuyên sâu.
4. Cần test thiết bị thật để kiểm tra permission GPS và hành vi WebView.

## Xác nhận an toàn

- Không sửa AR/Fund/Inventory.
- Không đổi API contract giao hàng hiện tại.
- Không đổi luồng Phase23–28.
- GPS fail không làm fail xác nhận giao hàng.
