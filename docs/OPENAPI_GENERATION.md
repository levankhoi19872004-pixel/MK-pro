# OpenAPI generation

## Mục tiêu

`npm run docs:generate` giúp tự động đồng bộ `docs/openapi.json` với route Express hiện có trong `src/routes`.

Ở giai đoạn hiện tại, generator hoạt động theo kiểu an toàn:

- Scan các route `router.get/post/put/patch/delete(...)` trong `src/routes`.
- Ghép mount path từ `src/routes/index.js`.
- Scan thêm nhóm mobile trong `src/routes/mobile`.
- Giữ nguyên schema, security, response và example chi tiết đã có trong `docs/openapi.json`.
- Nếu phát hiện route mới chưa có trong OpenAPI, script sẽ sinh skeleton operation để tránh thiếu tài liệu.

## Lệnh sử dụng

```bash
npm run docs:generate
```

Kiểm tra tài liệu có bị lệch so với route code không:

```bash
npm run docs:check
```

## Quy tắc sau này

Khi thêm route mới:

1. Code route/controller/service như bình thường.
2. Chạy `npm run docs:generate`.
3. Mở `docs/openapi.json` và bổ sung schema/example chi tiết cho route mới nếu generator mới tạo skeleton.
4. Chạy `npm test`.

## Lưu ý

Generator hiện chưa thay thế hoàn toàn phần schema thủ công. Nó là bước nền để sau này chuyển dần sang mô hình sinh OpenAPI từ code/schema tập trung.
