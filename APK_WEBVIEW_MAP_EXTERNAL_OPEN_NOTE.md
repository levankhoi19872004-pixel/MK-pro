# APK WebView Map External Open Note

Phase25 sửa frontend để nút **Bản đồ** không điều hướng cùng WebView bằng `location.href`.

Trong ZIP hiện tại không có mã Android/APK wrapper (`android/`, `MainActivity`, `WebViewClient`, `capacitor.config.*`, `cordova/`). Vì vậy frontend đã bổ sung helper mở ngoài app và popup fallback, nhưng APK wrapper vẫn nên được cấu hình để đảm bảo Google Maps luôn mở bằng ứng dụng ngoài.

## Wrapper APK cần xử lý

Trong Android WebView, cấu hình `shouldOverrideUrlLoading` để các URL sau không load trong WebView MK-Pro:

- `geo:`
- `intent:`
- `https://maps.google.com`
- `https://www.google.com/maps`
- `https://maps.app.goo.gl`

Pseudo behavior:

```java
if (url.startsWith("geo:")
    || url.startsWith("intent:")
    || url.contains("maps.google.com")
    || url.contains("www.google.com/maps")
    || url.contains("maps.app.goo.gl")) {
  Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
  startActivity(intent);
  return true;
}
return false;
```

## Manual test trên Android thật

1. Mở app giao hàng trong APK.
2. Vào tab Khách giao.
3. Bấm **Bản đồ** ở một khách có địa chỉ.
4. Google Maps hoặc trình duyệt ngoài mở ra, không thay thế WebView MK-Pro.
5. Bấm Back của Android.
6. Quay lại đúng màn danh sách khách giao, không mất state.
7. Nếu máy không mở được Maps, popup fallback vẫn cho copy địa chỉ.
