# Báo cáo vá P0 — Ẩn GPS/Tuyến giao khỏi App Giao Hàng

## 1. Tổng quan dự án
- Dự án: MK-Pro mobile delivery app.
- Tech stack quan sát được: Node/Express backend, frontend static HTML/CSS/JS, mobile app chạy qua `/mobile/delivery.html`.
- Phạm vi bản vá: chỉ frontend mobile delivery; không sửa backend/API/schema.

## 2. File đã kiểm tra
| File | Vai trò | Kết quả |
|---|---|---|
| `public/mobile/delivery.html` | Entry HTML của app giao hàng | Có load `delivery-route-tracking.js` gây bật module GPS |
| `public/mobile/js/delivery-mobile-view.source.js` | Source canonical render shell + workflow mobile delivery | Có DOM `mRouteTracking`, init route tracking, ping event |
| `public/mobile/js/delivery-mobile-view.js` | Bundle chạy thực tế trên browser | Có DOM `mRouteTracking`, init route tracking, ping event |
| `public/mobile/js/delivery-mobile-view.js.map` | Source map của bundle | Đã đồng bộ `sourcesContent` theo source mới để DevTools không hiển thị source cũ |
| `public/mobile/js/delivery-route-tracking.js` | Module GPS/tuyến giao | Có gọi `navigator.geolocation.getCurrentPosition()` và render lỗi GPS |

## 3. Nguyên nhân gốc
Module `delivery-route-tracking.js` được load trực tiếp từ `/mobile/delivery.html`. Khi được init từ `delivery-mobile-view.js`, module này render khối:
- `Tuyến giao: Chưa bắt đầu`
- `Bắt đầu giao`
- `Thử GPS`

Khi người dùng bấm hoặc khi session active, module có thể gọi `navigator.geolocation.getCurrentPosition()`. Trình duyệt đang chặn geolocation bằng Permissions Policy nên xuất hiện lỗi đỏ trên UI.

## 4. File đã sửa
| File | Thay đổi |
|---|---|
| `public/mobile/delivery.html` | Gỡ script load `delivery-route-tracking.js` khỏi app giao hàng hiện tại |
| `public/mobile/js/delivery-mobile-view.source.js` | Gỡ DOM `mRouteTracking`; đổi init/ping GPS thành no-op |
| `public/mobile/js/delivery-mobile-view.js` | Đồng bộ bundle chạy thực tế: gỡ DOM route tracking, no-op ping/init |
| `public/mobile/js/delivery-mobile-view.js.map` | Đồng bộ `sourcesContent` theo source mới |
| `public/mobile/js/delivery-route-tracking.js` | Đổi thành no-op API để nếu lỡ được load cũng không gọi GPS |

## 5. Diff Old/New chính

### `public/mobile/delivery.html`
```diff
- <script src="/mobile/js/delivery-route-tracking.js?v=phase29-route-tracking-p1"></script>
```

### `public/mobile/js/delivery-mobile-view.source.js`
```diff
- '<section id="mRouteTracking" class="m-route-tracking" aria-live="polite"></section>' +
```

```diff
- function initRouteTrackingPanel() {
-   if (window.DeliveryRouteTracking && typeof window.DeliveryRouteTracking.init === 'function') {
-     window.DeliveryRouteTracking.init({ ... });
-   }
- }
-
- function pingRouteTrackingEvent(eventType) {
-   if (window.DeliveryRouteTracking && typeof window.DeliveryRouteTracking.pingEvent === 'function') {
-     window.DeliveryRouteTracking.pingEvent(eventType);
-   }
- }
+ // GPS/route tracking is intentionally disabled for the current delivery app.
+ // Keep these no-op hooks so existing workflow calls do not break.
+ function initRouteTrackingPanel() {}
+
+ function pingRouteTrackingEvent(eventType) {
+   void eventType;
+ }
```

### `public/mobile/js/delivery-route-tracking.js`
```diff
- navigator.geolocation.getCurrentPosition(...)
- render Tuyến giao / Bắt đầu giao / Thử GPS
+ window.DeliveryRouteTracking = {
+   init: noop,
+   pingEvent: noop,
+   stopTimer: noop,
+   current: noop
+ };
```

## 6. Test đã chạy
| Test | Kết quả |
|---|---|
| `node --check public/mobile/js/delivery-mobile-view.source.js` | Pass |
| `node --check public/mobile/js/delivery-mobile-view.js` | Pass |
| `node --check public/mobile/js/delivery-route-tracking.js` | Pass |
| `npm run check:syntax` | Pass — `SYNTAX_OK 962 JavaScript files` |
| Grep active delivery files với `navigator.geolocation/getCurrentPosition/Tuyến giao/Thử GPS/Bắt đầu giao/mRouteTracking` | Không còn kết quả |

## 7. Test không chạy được đầy đủ
`npm run build:canonical-source-pilot` không chạy được trong sandbox vì thiếu dependency local `terser` (`Cannot find module 'terser'`). Vì vậy bundle đã được sửa trực tiếp và kiểm tra syntax. Khi deploy thật, nếu môi trường GitHub/Render có đủ `node_modules`, nên chạy lại build/check bundle theo pipeline hiện có.

## 8. Rủi ro còn lại
- Backend route tracking vẫn còn trong `src/controllers/mobile/delivery.controller.js`, `src/routes/mobile/delivery.routes.js`, `src/services/mobile/delivery.service.js`, `src/services/deliveryRouteTracking.service.js`. Không sửa vì yêu cầu chỉ ẩn GPS khỏi app giao hàng hiện tại và không đổi API/backend.
- CSS `.m-route-tracking*` vẫn còn trong source CSS, không ảnh hưởng vì DOM đã bị gỡ và JS không render nữa.
- Nếu sau này muốn bật lại GPS, nên khôi phục module từ Git và triển khai bằng feature flag riêng thay vì nhúng trực tiếp vào `/mobile/delivery.html`.

## 9. Tiêu chí hoàn thành
Đạt:
- Không còn script GPS trong `/mobile/delivery.html`.
- Không còn DOM `mRouteTracking` trong shell app giao hàng.
- Không còn call GPS từ bundle mobile delivery.
- Không còn text `Tuyến giao`, `Bắt đầu giao`, `Thử GPS` trong các file active của app giao hàng.
- App giao hàng giữ nguyên các phần: load đơn, lọc ngày/trạng thái, tìm kiếm, card đơn, vào giao hàng, thu tiền, hàng trả, công nợ, đối soát, tải, thoát.
