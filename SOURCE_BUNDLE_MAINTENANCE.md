# HƯỚNG DẪN BẢO TRÌ SOURCE BUNDLE

## Quy tắc bắt buộc

- Không sửa trực tiếp file runtime có banner `GENERATED FILE`.
- Với bundle legacy chưa migrate, chỉ sửa các file trong thư mục `*.source/`.
- Với bundle canonical pilot, chỉ sửa file được khai báo bằng `canonicalSource` trong `config/source-bundles.json`.
- Sau khi review thay đổi nghiệp vụ, chạy:

```bash
npm run source-bundles:refresh
npm run quality
```

## Canonical source pilot

Bundle pilot:

```text
public/mobile/js/delivery-mobile-view.source.js
  -> public/mobile/js/delivery-mobile-view.js
  -> public/mobile/js/delivery-mobile-view.js.map
```

Chỉ `delivery-mobile-view.source.js` được chỉnh sửa thủ công. File runtime và source map được sinh deterministic.

```bash
npm run build:canonical-source-pilot
npm run check:canonical-source-pilot
```

`check:canonical-source-pilot` thất bại nếu runtime hoặc source map lệch khỏi canonical source.

## Các lệnh toàn bộ pipeline

```bash
npm run build:source-bundles
npm run check:source-bundles
npm run source-bundles:refresh
npm run check:source-size
```

`build:source-bundles` chỉ build khi checksum canonical không đổi. Khi chủ động thay đổi nguồn, dùng `source-bundles:refresh` để cập nhật checksum và runtime trong cùng thao tác.

## Classic browser shard

- Không đổi thứ tự `runtimeFiles` trong `config/source-bundles.json`.
- Không thêm `async` hoặc `defer` riêng lẻ vào một shard.
- Tất cả shard của cùng một file phải được tải liên tiếp.

## CSS

- Chỉ sửa file trong `mobile.source/` hoặc `print.source/`.
- Không thêm rule trực tiếp vào manifest `mobile.css` và `print.css`.
