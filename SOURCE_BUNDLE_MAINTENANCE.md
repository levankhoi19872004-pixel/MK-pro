# HƯỚNG DẪN BẢO TRÌ SOURCE BUNDLE

## Quy tắc bắt buộc

- Không sửa trực tiếp file runtime có banner `GENERATED FILE`.
- Sửa các file trong thư mục `*.source/`.
- Sau khi review thay đổi nghiệp vụ, chạy:

```bash
npm run source-bundles:refresh
npm run quality
```

## Các lệnh

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
