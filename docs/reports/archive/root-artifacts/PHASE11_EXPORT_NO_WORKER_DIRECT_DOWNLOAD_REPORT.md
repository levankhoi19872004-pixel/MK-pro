# PHASE11 — Export hóa đơn không phụ thuộc Background Worker

## 1. Tổng quan dự án

- Tech stack: Node.js/Express, MongoDB/Mongoose, frontend classic JS, Render Web Service.
- Module liên quan: Report Center / xuất hóa đơn VAT, không VAT, SSE; import/export controller; background job queue.
- Phạm vi sửa: chỉ xử lý luồng export hóa đơn đang bị kẹt `0% queued` do UI ép chạy async qua `/api/background-jobs/:jobId` khi không có Worker Service.

## 2. Chẩn đoán lỗi

### Hiện tượng

UI tại màn Báo cáo hiển thị:

```txt
Đang tạo file... 0% · queued
```

DevTools Network chỉ thấy poll:

```txt
GET /api/background-jobs/JOB...
```

Không có file Excel tải xuống.

### Root cause

File frontend `public/js/app/admin/08f-vat-export.js` luôn ép export theo background job:

```js
fetch(`${url}${separator}async=1`, {
  headers: { Accept: 'application/json', Prefer: 'respond-async' }
})
```

Trong khi hệ thống hiện chỉ chạy **1 Web Service**, không chạy `npm run worker:background`. Vì vậy `background_jobs` được tạo nhưng không có process nào claim và xử lý, dẫn đến pending/queued mãi.

Biến `IMPORT_PREVIEW_ASYNC=false` chỉ ảnh hưởng import preview, không ảnh hưởng export hóa đơn.

## 3. File đã sửa

| File | Thay đổi |
|---|---|
| `src/controllers/importExportController.js` | Thêm direct export path, chỉ dùng background job khi request thật sự yêu cầu async và `EXPORT_ASYNC_ENABLED` không bị tắt |
| `public/js/app/admin/08f-vat-export.js` | Không tự thêm `async=1`; mặc định tải workbook trực tiếp, vẫn tương thích nếu server trả JSON job async |
| `public/fragments/index/07-index-body.html` | Đổi cache-buster để trình duyệt tải JS mới |
| `.env.example` | Thêm `EXPORT_ASYNC_ENABLED=false` |
| `.env.production.example` | Thêm `EXPORT_ASYNC_ENABLED=false` |
| `test/background-job-flow-static.test.js` | Cập nhật contract export direct + async compatibility |
| `test/invoice-export-restoration-static.test.js` | Cập nhật static check cho direct workbook download |
| `test/invoice-export-ui-behavior.test.js` | Cập nhật test UI direct download và bổ sung async fallback |
| `test/fixtures/index-page/phase79-assembled.sha256` | Cập nhật snapshot do đổi cache-buster |

## 4. Diff logic quan trọng

### Backend — trước

```js
const submitted = await JobSubmissionService.submitExport(...);
if (AsyncJobHttpAdapter.prefersAsync(req)) {
  return res.status(202).json(...);
}
const terminal = await BackgroundJobService.waitForTerminal(...);
```

### Backend — sau

```js
if (!exportAsyncEnabled() || !AsyncJobHttpAdapter.prefersAsync(req)) {
  return await exportExcelDirect(req, res);
}

const submitted = await JobSubmissionService.submitExport(...);
return res.status(202).json(...);
```

### Frontend — trước

```js
fetch(`${url}${separator}async=1`, {
  headers: { Accept: 'application/json', Prefer: 'respond-async' }
});
```

### Frontend — sau

```js
fetch(url, {
  headers: {
    Accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/json'
  }
});
```

Nếu server trả file Excel, frontend tải trực tiếp. Nếu server trả JSON job async, frontend vẫn poll và tải artifact như cũ.

## 5. Cấu hình Render khuyến nghị hiện tại

Với mô hình chỉ dùng 1 Render Web Service, đặt:

```env
EXPORT_ASYNC_ENABLED=false
IMPORT_PREVIEW_ASYNC=false
```

Khi nào tạo thêm Background Worker riêng thì có thể đổi:

```env
EXPORT_ASYNC_ENABLED=true
IMPORT_PREVIEW_ASYNC=true
```

và Worker Start Command:

```bash
npm run worker:background
```

## 6. Kết quả test

Đã chạy:

```bash
npm run check:source-bundles
npm run check:syntax
npm test
```

Kết quả:

```txt
source-bundles: OK 19 bundles
syntax: SYNTAX_OK 934 JavaScript files
npm test: 980 tests, 979 pass, 0 fail, 1 skipped
```

## 7. Cách test thủ công sau deploy

1. Deploy ZIP mới lên GitHub/Render.
2. Hard refresh trình duyệt: `Ctrl + Shift + R`.
3. Vào Báo cáo → Xuất hóa đơn VAT/không VAT/SSE.
4. DevTools Network phải thấy request trực tiếp:

```txt
GET /api/export/invoice-orders.xlsx?...          200
```

hoặc:

```txt
GET /api/export/sse-invoice-orders.xlsx?...      200
```

5. Không còn poll liên tục:

```txt
GET /api/background-jobs/JOB...
```

trừ khi chủ động bật async/worker về sau.
