# MK-Pro Phase25 — Delivery Map External Open WebView Fix

## 1. Baseline

Đã dùng baseline mới nhất người dùng gửi:

```text
MK-pro-phase24-delivery-compact-customer-workflow-ui-patched(1).zip
```

## 2. Mục tiêu

Sửa nút **Bản đồ** trong App Giao Hàng để không điều hướng Google Maps ngay trong WebView/APK, tránh tình trạng NVGH bị kẹt trong màn bản đồ và không quay lại được app.

Không thay đổi:

- API contract.
- Backend.
- Business rule tiền/tồn/công nợ.
- Quy trình Phase23/Phase24.

## 3. Kết quả khảo sát map/WebView

| File | Hàm/đoạn code | Hành vi hiện tại | Rủi ro trong APK/WebView | Cách sửa |
|---|---|---|---|---|
| `public/mobile/js/delivery-orders-view.js` | `renderOrderCard()` | Nút Bản đồ là thẻ `<a target="_blank" href="https://www.google.com/maps...">` | WebView có thể mở Google Maps trong chính APK hoặc không cho quay lại đúng state | Đổi thành `<button data-delivery-map ...>` và xử lý qua helper mở ngoài app |
| `public/mobile/js/delivery-ui-utils.js` | `orderQuickActions()` | Quick action Bản đồ cũng dùng anchor Google Maps | Rủi ro tương tự nếu quick action được dùng lại ở màn khác | Đổi sang button `data-delivery-map` |
| `public/mobile/js/delivery-ui-utils.js` | `mapHref()` | Tạo Google Maps URL chuẩn | Không sai, nhưng nếu dùng trực tiếp trong `href` sẽ có rủi ro WebView | Giữ để build URL, bổ sung helper external-open |
| `public/mobile/js/delivery-mobile-view.source.js` | Event delegation | Chưa có handler riêng cho map | Click Bản đồ có thể bị browser/WebView xử lý mặc định | Thêm delegate `[data-delivery-map]`, gọi `preventDefault()`, `stopPropagation()` và `openDeliveryMapExternal()` |
| Android/APK wrapper | Không tìm thấy `android/`, `MainActivity`, `WebViewClient`, `capacitor.config.*`, `cordova/` trong ZIP | Không có chỗ sửa wrapper trực tiếp | Frontend không thể đảm bảo 100% external intent nếu wrapper không intercept URL | Tạo `APK_WEBVIEW_MAP_EXTERNAL_OPEN_NOTE.md` hướng dẫn wrapper intercept `geo:`, `intent:`, `maps.google.com` |

## 4. Cách mở bản đồ mới

Đã thêm helper:

```text
openDeliveryMapExternal({ address, customerName, lat, lng })
```

Luồng xử lý:

1. Encode địa chỉ an toàn.
2. Build URL:
   - Google Maps web URL.
   - `geo:` URL.
   - `intent://maps.google.com/...` cho Android Google Maps.
3. Ưu tiên bridge ngoài app nếu có:
   - `window.Android.openExternalUrl(url)`
   - `window.Android.openUrl(url)`
   - `window.ReactNativeWebView.postMessage({ type: 'OPEN_EXTERNAL_URL', url })`
   - `window.webkit.messageHandlers.openExternalUrl.postMessage({ url })`
4. Nếu không có bridge, dùng `window.open(url, '_blank', 'noopener,noreferrer')`, không dùng `location.href`.
5. Nếu vẫn không mở được, hiện popup fallback:
   - Copy địa chỉ.
   - Mở Google Maps.
   - Đóng popup để quay lại app.

## 5. UI fallback

Popup fallback mới:

```text
Mở bản đồ cho khách

Tên khách
Địa chỉ

[Copy địa chỉ]
[Mở Google Maps]
[Đóng]
```

Popup không thay đổi tab hiện tại và không reset state giao hàng.

## 6. File đã sửa/thêm

### Modified

```text
config/source-bundles.json
public/mobile/js/delivery-mobile-view.source.js
public/mobile/js/delivery-mobile-view.js
public/mobile/js/delivery-mobile-view.js.map
public/mobile/js/delivery-orders-view.js
public/mobile/js/delivery-ui-utils.js
public/mobile/mobile.source/mobile-04.css
public/mobile/mobile.css
```

### Added

```text
APK_WEBVIEW_MAP_EXTERNAL_OPEN_NOTE.md
test/delivery-map-external-webview-fix-static.test.js
PHASE25_DELIVERY_MAP_EXTERNAL_OPEN_WEBVIEW_FIX_REPORT.md
```

### Deleted

```text
Không có
```

## 7. Test đã chạy

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm run source-bundles:refresh
npm run check:source-bundles
npm run check:source-size
npm run check:syntax
node --test test/delivery-map-external-webview-fix-static.test.js test/delivery-compact-customer-workflow-ui-p1-static.test.js test/delivery-customer-workflow-ui-p1-static.test.js test/delivery-real-workflow-ui-p1-static.test.js test/delivery-mobile-ui-p0p1-static.test.js
npm test
```

Kết quả:

```text
[source-bundles] OK 19 bundles
[source-size-budget] OK
SYNTAX_OK 954 JavaScript files
Targeted UI/map tests: 26 pass / 0 fail
Full npm test: 1049 tests / 1046 pass / 2 fail / 1 skipped
```

Hai lỗi fail là snapshot legacy cũ, không liên quan Phase25:

```text
test/phase79-production-strangler.test.js
- assembled index page matches the approved Phase80 characterization snapshot
- split CSS parts preserve exact legacy cascade order
```

## 8. Rủi ro còn lại

| Rủi ro | Mức | Ghi chú |
|---|---|---|
| APK wrapper không intercept `geo:`, `intent:`, `maps.google.com` | Medium | Frontend đã tránh `location.href` và có fallback, nhưng muốn chắc chắn Google Maps mở ngoài app thì wrapper cần xử lý external intent |
| Một số WebView khóa `window.open` | Medium | Đã có popup copy địa chỉ để NVGH không bị kẹt |
| Cần test trên Android thật | Medium | Manual checklist nằm trong `APK_WEBVIEW_MAP_EXTERNAL_OPEN_NOTE.md` |

## 9. Manual checklist APK

```text
1. Mở app giao hàng trong APK.
2. Vào tab Khách giao.
3. Bấm Bản đồ ở một khách có địa chỉ.
4. Google Maps hoặc trình duyệt ngoài mở ra, không thay thế WebView MK-Pro.
5. Bấm Back của Android.
6. Quay lại đúng màn danh sách khách giao, không mất state.
7. Nếu máy không mở được Maps, popup fallback vẫn cho copy địa chỉ.
```

## 10. Xác nhận phạm vi

- Không sửa backend.
- Không đổi API contract.
- Không đổi business rule tiền/tồn/công nợ.
- Không thay đổi luồng Phase23/Phase24.
- Chỉ sửa hành vi mở bản đồ và fallback UI.
