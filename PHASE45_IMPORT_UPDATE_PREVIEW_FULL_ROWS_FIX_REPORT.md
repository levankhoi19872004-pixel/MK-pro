# PHASE 45 — IMPORT UPDATE MODE & FULL PREVIEW ROWS FIX

## Phạm vi

Sửa hai lỗi trong import cập nhật an toàn cho Sản phẩm, Khách hàng và Users:

1. Async worker làm mất `importMode=update`, khiến preview chạy nhánh thêm mới và báo mã đã tồn tại.
2. Import session lưu đầy đủ dữ liệu nhưng API/UI chỉ dùng 100 dòng sample, dẫn đến tổng số và tập dòng commit bị giới hạn sai.

## Nguyên nhân gốc

### 1. Mất import mode trong worker

`src/jobs/importPreview.worker.js` không truyền `payload.importMode` vào `runImportPreviewJob()`.
`runImportPreviewPipeline()` vì vậy nhận giá trị mặc định `create`.

### 2. UI dùng preview sample làm toàn bộ dữ liệu

`src/services/importSessionService.js` lưu toàn bộ rows tại `import_session_rows`, nhưng `import_sessions.previewRows` chỉ lưu sample theo `IMPORT_PREVIEW_LIMIT=100`.
Frontend lấy `previewRows` để đếm, chọn và commit nên chỉ thấy 100 dòng.

## Giải pháp

- Worker truyền đầy đủ `importMode`.
- Runner ưu tiên `importMode` đã lưu trong import session MongoDB để chống lỗi serialization/queue.
- Bổ sung API phân trang:
  - `GET /api/import/sessions/:sessionId/rows?offset=0&limit=500`
- Frontend tải toàn bộ rows theo trang 500 dòng sau khi session chuyển sang `preview_ready`.
- UI vẫn chỉ render tối đa số dòng cấu hình để giữ hiệu năng, nhưng tổng, validation, selection và commit dùng toàn bộ file.
- Nếu số rows tải được khác `totalRows`, hệ thống dừng và không cho commit thiếu dữ liệu.
- Giới hạn an toàn phía client: 20.000 dòng/phiên preview; file lớn hơn phải tách để kiểm tra.

## Tệp thay đổi

- `src/jobs/importPreview.worker.js`
- `src/jobs/importPreviewRunner.js`
- `src/services/importSessionService.js`
- `src/services/excelImportService.js`
- `src/controllers/importExportController.js`
- `src/controllers/excelImportController.js`
- `src/controllers/importRuntimeController.js`
- `src/routes/importExportRoutes.js`
- `src/routes/excelImportRoutes.js`
- `src/routes/importRuntimeRoutes.js`
- `public/js/app/admin/08d-import-excel.js`
- `public/index.html`
- `test/import-selective-update-static.test.js`
- `test/import-preview-full-row-pagination-static.test.js`

## Kiểm thử

- Parser Excel giả lập: 705/705 dòng được đọc.
- Runner test: session lưu `update` vẫn ép đúng update dù payload truyền `create`.
- Targeted tests: 12/12 đạt.
- JavaScript syntax: 616 files đạt.
- Full regression: 487/487 đạt.
- OpenAPI check: 252 operations, đạt.
- `npm audit --omit=dev`: 0 lỗ hổng.

## Tác động

Không thay đổi schema nghiệp vụ của products, customers, users hoặc các chứng từ. Không cần migration. Luồng import create cũ giữ nguyên. Chỉ bổ sung đọc full rows từ collection session và sửa propagation của mode.
