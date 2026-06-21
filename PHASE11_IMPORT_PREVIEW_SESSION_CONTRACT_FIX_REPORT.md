# Phase 11 — Import Preview Session Contract Fix (Phương án A)

## 1. Tổng quan dự án

- Tech stack: Node.js/Express, MongoDB/Mongoose, frontend JavaScript thuần trong `public/js`.
- Import Excel hiện dùng contract bất đồng bộ: web nhận file, tạo `ImportSession`, enqueue `background_jobs`, frontend poll `/api/import/sessions/:sessionId` để nhận preview.
- Worker xử lý queue chạy bằng lệnh riêng: `npm run worker:background`.

## 2. Vấn đề phát hiện

Hiện tượng live: UI đứng ở `Đang xử lý file Excel... 0% (queued)` và Network chủ yếu thấy `GET /api/import/sessions/IMP...`.

Nguyên nhân kỹ thuật cần khóa chặt:

1. Frontend phải tuyệt đối không poll session ảo; chỉ được poll sau khi `POST /api/import/preview` thành công và backend trả `sessionId` thật.
2. Backend phải fail-closed nếu session không tồn tại, không được trả `queued` giả.
3. Khi session đã tạo nhưng queue không chạy, UI cần hiển thị rõ trạng thái worker/background job để tránh kẹt im lặng.
4. Staging/production muốn chạy async đúng Phương án A phải có Render Worker Service chạy `npm run worker:background`.

## 3. File đã sửa

| File | Nội dung sửa |
|---|---|
| `public/js/app/admin/08d-import-excel.source/part-02.jsfrag` | Tăng cường polling: no-store, cache-bust query, xử lý 404 session, hiển thị queue/worker/job, timeout có hướng dẫn Worker Service. |
| `public/js/app/admin/08d-import-excel.part02.js` | Bundle sinh lại từ source fragment. |
| `src/services/import/importCommit.impl.js` | Bổ sung lookup `BackgroundJob` theo `idempotencyKey=import-preview:<sessionId>`, trả `backgroundJob/queue`, map failed/dead_letter về session failed khi session còn pending. |
| `src/controllers/importExportController.js` | Thêm `Cache-Control: no-store` cho session status/rows. |
| `src/controllers/excelImportController.js` | Thêm `Cache-Control: no-store` cho session status/rows. |
| `src/controllers/importRuntimeController.js` | Thêm `Cache-Control: no-store` cho session status/rows. |
| `public/fragments/index/07-index-body.html` | Đổi cache-buster JS import sang `phase11-import-session-contract-v2`. |
| `config/source-bundles.json` | Cập nhật hash bundle sau khi rebuild. |
| `test/import-preview-session-contract-static.test.js` | Thêm regression test cho contract POST-before-poll, 404 missing session, queue visibility. |
| `test/import-sales-bulk-commit-performance-static.test.js` | Cập nhật expected cache-buster. |
| `test/fixtures/index-page/phase79-assembled.sha256` | Cập nhật snapshot hash sau khi đổi script version. |

## 4. Kiểm thử đã chạy

```bash
npm run check:source-bundles
npm run check:syntax
npm test
```

Kết quả:

- `source-bundles`: OK — 19 bundles.
- `syntax`: OK — 934 JavaScript files.
- `npm test`: OK — 979 tests, 978 pass, 0 fail, 1 skip.

## 5. Yêu cầu triển khai Render

Web service vẫn chạy:

```bash
npm start
```

Cần tạo thêm Worker Service dùng cùng repo/env:

```bash
npm run worker:background
```

ENV quan trọng cần giống web service:

- `NODE_ENV=production`
- `MONGO_URI`
- `JWT_SECRET`
- `JWT_REFRESH_SECRET`
- `APP_URL`
- `PUBLIC_APP_ORIGIN`
- `CORS_ORIGIN`

Khuyến nghị ban đầu:

```env
BACKGROUND_JOB_CONCURRENCY=1
IMPORT_PREVIEW_ASYNC=true
```

Nếu chưa tạo Worker Service mà giữ `IMPORT_PREVIEW_ASYNC=true`, import preview sẽ có thể đứng ở `queued` vì job đã enqueue nhưng không có process nhận xử lý.

## 6. Checklist xác nhận sau deploy

1. Hard refresh trình duyệt hoặc mở tab ẩn danh.
2. Chọn file Excel và bấm `Xem trước đơn import`.
3. DevTools Network phải thấy:
   - `POST /api/import/preview` trước.
   - Sau đó mới có `GET /api/import/sessions/IMP...`.
4. Mongo phải có document trong:
   - `import_sessions`
   - `background_jobs`
5. Worker logs phải có dấu hiệu claim/complete job.
6. UI không còn đứng im `queued 0%` không lý do; nếu worker thiếu, UI sẽ báo kiểm tra Worker Service.
