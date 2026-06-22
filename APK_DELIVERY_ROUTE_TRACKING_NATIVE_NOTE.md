# APK Delivery Route Tracking Native Note

Phase29 triển khai GPS tracking ở mức Web/Mobile foreground qua `navigator.geolocation` khi NVGH bấm **Bắt đầu giao** trong App Giao Hàng.

ZIP hiện tại không có mã Android native wrapper (`android/`, `MainActivity.*`, `WebViewClient.*`, `capacitor.config.*`, `cordova/`). Vì vậy không bịa foreground service trong mã nguồn này.

## Nếu muốn tracking nền ổn định trong APK Android

Wrapper APK cần bổ sung:

- Quyền Android:
  - `ACCESS_FINE_LOCATION`
  - `ACCESS_COARSE_LOCATION`
  - `FOREGROUND_SERVICE_LOCATION`
  - `ACCESS_BACKGROUND_LOCATION` nếu thật sự cần tracking khi app không mở
- Foreground service có notification rõ ràng:
  - “MK-Pro đang ghi nhận tuyến giao hàng”
- Bridge WebView tùy chọn:
  - `window.Android.openExternalUrl(url)` nếu muốn mở map ngoài app
  - `window.Android.startDeliveryRouteTracking()` nếu muốn native tracking nền
  - `window.Android.stopDeliveryRouteTracking()` khi NVGH kết thúc ca

## Giới hạn hiện tại

- Tracking chỉ đảm bảo khi app đang mở hoặc WebView còn sống.
- Khi Android kill WebView/background quá lâu, browser geolocation interval có thể dừng.
- Không tracking ẩn; NVGH phải bấm bắt đầu và có trạng thái “Đang ghi nhận tuyến giao hàng”.
