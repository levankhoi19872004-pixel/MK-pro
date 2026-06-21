# MK-Pro Phase 12 — Web Direct Import Commit, No Mandatory Worker

## 1. Tổng quan dự án

- **Kiến trúc:** Node.js / Express monolith, MongoDB/Mongoose, frontend classic JS trong `public/js/app`, source-bundle sinh runtime JS.
- **Import stack chính:**
  - Route chính: `src/routes/importExportRoutes.js` mount tại `/api/import`.
  - Controller chính: `src/controllers/importExportController.js`.
  - Preview: `src/services/import/preview/importPreview.impl.js`.
  - Commit: `src/services/import/importCommit.impl.js` thông qua `excelImportService.commit()`.
  - Theo dõi phiên: `import_sessions`, `import_session_rows`.
  - Worker/queue còn tồn tại: `background_jobs`, `src/services/background-jobs/*`, `scripts/background-job-worker.js`.
- **Frontend import:** `public/js/app/admin/08d-import-excel.source/*` và các file generated `08d-import-excel*.js`.

## 2. Root cause

### Trước khi sửa

- Frontend khi xác nhận import gọi:

```js
fetch('/api/import/commit', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Prefer: 'respond-async' },
  body: JSON.stringify({ importSessionId: importPreviewSessionId, ... })
})
```

- Backend `/api/import/commit` gọi `AsyncJobHttpAdapter.submitImportCommit(req)`.
- `submitImportCommit()` luôn enqueue job `import_commit` vào `background_jobs`.
- Vì frontend gửi `Prefer: respond-async`, backend trả `202 queued`, UI tiếp tục poll session/job.
- Nếu không chạy Render Background Worker, job không có process xử lý nên UI dễ kẹt ở queued/progress thấp.
- Preview cũng đang mặc định async vì `IMPORT_PREVIEW_ASYNC !== 'false'`, nên nếu không set ENV thì preview cũng có thể phụ thuộc worker.

### Sau khi sửa

- Web Service tự commit import trực tiếp bằng `excelImportService.commit()`.
- Frontend gọi route session commit thật:

```js
POST /api/import/sessions/:sessionId/commit
```

- Không gửi `Prefer: respond-async` cho import commit.
- `background_jobs` không còn là điều kiện bắt buộc để import chạy.
- Preview mặc định chạy Web direct; worker preview chỉ bật khi chủ động đặt `IMPORT_PREVIEW_ASYNC=true`.

## 3. Vùng ảnh hưởng

| Vùng | Ảnh hưởng |
|---|---|
| Frontend import | Nút Import gọi session commit trực tiếp, không ép async worker |
| Backend route/controller | `/api/import/commit` và `/api/import/sessions/:sessionId/commit` đều dùng Web direct commit |
| Import session | Giữ `import_sessions`, trạng thái vẫn theo contract hiện có: `preview_ready → importing → done/failed` |
| Worker/background jobs | Giữ lại code worker cho tương lai, nhưng không bắt buộc cho import thường ngày |
| Tồn kho/công nợ/đơn hàng | Không sửa business logic ghi dữ liệu; vẫn dùng `excelImportService.commit()` và `ImportCommitOrchestrator` hiện có |

> Ghi chú: schema hiện tại dùng status `importing` thay cho `processing`. Tôi giữ nguyên để tránh đổi enum/schema không cần thiết. Frontend cũng chấp nhận thêm `processing` nếu sau này đổi tên trạng thái.

## 4. Phương án triển khai

### Phương án A — đã triển khai: Web direct import commit

- Route commit gọi service mới `ImportWebDirectCommitService.commitSession()`.
- Service này validate session, idempotency guard, rồi gọi `excelImportService.commit()` trực tiếp.
- Nếu session đã `done`, trả lại kết quả cũ, không commit lại để tránh duplicate đơn/tồn kho/công nợ.
- Nếu session chưa `preview_ready`, trả `409` rõ ràng.

**Lợi ích:** không cần worker, không mất phí Render worker, vận hành đơn giản, phù hợp import 1 lần/ngày.  
**Nhược điểm:** file rất lớn có thể làm web chậm vài giây/chục giây.  
**Effort:** Medium.  
**Rủi ro:** thấp vì không đổi business logic commit gốc.

### Phương án B — giữ worker optional cho tương lai

- Code worker/background jobs vẫn được giữ.
- Preview async vẫn có thể bật lại bằng `IMPORT_PREVIEW_ASYNC=true`.
- Export async vẫn giữ cơ chế worker hiện tại.
- Sau này nếu import lớn/nhiều lần/ngày, có thể quay lại worker mà không phải viết lại nghiệp vụ import.

## 5. File đã thêm/sửa/xóa

### Thêm

- `src/services/import/ImportWebDirectCommitService.js`
- `test/import-web-direct-commit-static.test.js`

### Sửa

- `src/controllers/importExportController.js`
- `src/controllers/excelImportController.js`
- `src/controllers/importRuntimeController.js`
- `src/routes/importExportRoutes.js`
- `src/routes/excelImportRoutes.js`
- `src/routes/importRuntimeRoutes.js`
- `src/services/import/preview/importPreview.impl.js`
- `public/js/app/admin/08d-import-excel.source/part-02.jsfrag`
- `public/js/app/admin/08d-import-excel.source/part-03.jsfrag`
- `public/js/app/admin/08d-import-excel.part02.js`
- `public/js/app/admin/08d-import-excel.part03.js`
- `config/source-bundles.json`
- `test/background-job-flow-static.test.js`
- `test/excel-import-two-phase-static.test.js`
- `test/import-commit-session-failure-static.test.js`
- `test/import-preview-async-job-static.test.js`
- `test/import-preview-session-contract-static.test.js`

### Xóa

- Không xóa file source nào.

## 6. Old/New diff quan trọng

### Backend commit trước đây

```js
const submitted = await AsyncJobHttpAdapter.submitImportCommit(req);
if (AsyncJobHttpAdapter.prefersAsync(req)) {
  return res.status(202).json(AsyncJobHttpAdapter.acceptedPayload(submitted, ...));
}
const waited = await AsyncJobHttpAdapter.waitImportCompatibility(submitted, sessionId);
```

### Backend commit sau khi sửa

```js
const result = await ImportWebDirectCommitService.commitSession({
  ...(req.body || {}),
  sessionId: req.params?.sessionId || req.body?.sessionId || req.body?.importSessionId
}, req.user || {});

if (result.error) {
  return res.status(result.status || 400).json({
    ok: false,
    message: result.error,
    ...result
  });
}

return res.json({
  ok: true,
  source: 'import-export-route',
  ...result
});
```

### Frontend commit trước đây

```js
const res = await fetch('/api/import/commit', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Prefer: 'respond-async' },
  body: JSON.stringify({ importSessionId: importPreviewSessionId, ... })
});
```

### Frontend commit sau khi sửa

```js
const commitUrl = `/api/import/sessions/${encodeURIComponent(importPreviewSessionId)}/commit`;
const res = await fetch(commitUrl, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ importSessionId: importPreviewSessionId, ... })
});
```

### Preview trước đây

```js
const asyncPreview = process.env.IMPORT_PREVIEW_ASYNC !== 'false';
```

### Preview sau khi sửa

```js
// Quy mô hiện tại ưu tiên Web direct để không bắt buộc chạy Render Worker.
// Worker preview vẫn giữ lại như đường mở rộng, chỉ bật khi IMPORT_PREVIEW_ASYNC=true.
const asyncPreview = process.env.IMPORT_PREVIEW_ASYNC === 'true';
```

## 7. Flow mới

```text
Frontend chọn file
→ POST /api/import/preview
→ Web đọc Excel trực tiếp, validate, tạo import_sessions + import_session_rows
→ UI render preview
→ Frontend bấm Import
→ POST /api/import/sessions/:sessionId/commit
→ Web validate session preview_ready
→ Web gọi excelImportService.commit()
→ Commit ghi dữ liệu thật bằng logic import hiện có
→ import_sessions: importing → done
→ UI báo Import thành công
```

## 8. Kết quả test thực tế

Đã chạy trong sandbox sau khi `npm ci --ignore-scripts` để có dev dependency `terser` cho source-bundle check.

```text
npm run check:syntax
SYNTAX_OK 936 JavaScript files
```

```text
npm run check:source-bundles
[source-bundles] OK 19 bundles
```

```text
npm test
1..981
# tests 981
# suites 0
# pass 980
# fail 0
# cancelled 0
# skipped 1
# todo 0
```

Ngoài ra đã chạy targeted tests cho import direct commit, preview session contract và background job flow sau khi sửa.

## 9. Rủi ro còn lại

- Chưa chạy manual regression trên Render thật/MongoDB thật trong sandbox này vì không có kết nối dữ liệu staging/live.
- Nếu import file cực lớn, Web Service có thể bị bận trong thời gian commit. Với tần suất import khoảng 1 lần/ngày, rủi ro vận hành chấp nhận được.
- Export async và các job nền khác vẫn còn phụ thuộc worker nếu anh chủ động dùng async/export job; thay đổi này chỉ bỏ bắt buộc worker cho luồng import thường ngày.

## 10. Hướng mở rộng worker sau này

Khi quy mô tăng, có thể bật lại dần:

- `IMPORT_PREVIEW_ASYNC=true` để preview chạy qua worker.
- Thêm ENV riêng kiểu `IMPORT_COMMIT_ASYNC=true` nếu muốn quay lại commit bằng job nền.
- Giữ `ImportWebDirectCommitService` làm fallback khi worker lỗi hoặc chưa chạy.
- Khi có nhiều import/ngày/file rất lớn, tách worker sẽ giảm nguy cơ Web bị chậm.
