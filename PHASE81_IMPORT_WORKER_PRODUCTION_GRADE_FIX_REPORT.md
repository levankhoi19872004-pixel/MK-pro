# PHASE 81 — IMPORT WORKER PRODUCTION-GRADE FIX

## 1. Phạm vi

Bản vá xử lý hai lỗi được ghi nhận tại màn hình **Import dữ liệu Excel**:

1. Phiên preview chỉ hiển thị `Import worker kết thúc bất thường (1)` và làm mất lỗi gốc.
2. Khu vực báo cáo hàng thiếu trả về `API không tồn tại`.

Bản vá giữ nguyên nghiệp vụ đọc đơn S3, tính số lượng, giá bán, tồn kho và commit đơn. Thay đổi chỉ tập trung vào vòng đời worker, truyền lỗi, trạng thái phiên import và route báo cáo hàng thiếu.

## 2. Nguyên nhân gốc rễ

### 2.1. Lỗi worker bị ghi đè

Worker con đã bắt được exception nhưng tự ghi trạng thái thất bại rồi thoát mã `1`. Queue cha nhận sự kiện `exit` và tiếp tục ghi lỗi tổng quát, khiến `errorMessage` gốc trong MongoDB bị thay bằng `Import worker kết thúc bất thường (1)`.

### 2.2. Không có kênh chẩn đoán

`stderr` của worker bị đặt thành `ignore`, nên Render không có stack trace hoặc bước xử lý đang lỗi.

### 2.3. Excel parser chưa đóng tiến trình dứt điểm

Parser worker gửi kết quả nhưng không chủ động đóng IPC/thoát tiến trình. Khi import liên tục có nguy cơ tích lũy process và bộ nhớ.

### 2.4. Route báo cáo hàng thiếu nằm ở router không được mount

Frontend gọi `/api/import/shortage-reports`, nhưng các endpoint tương ứng chỉ tồn tại trong `excelImportRoutes.js`. Ứng dụng thực tế mount `importExportRoutes.js`, nên API trả 404.

## 3. Thiết kế đã triển khai — Phương án A

### 3.1. Single owner cho trạng thái cuối

- Queue cha là thành phần duy nhất chốt `preview_ready` hoặc `failed` đối với preview chạy bất đồng bộ.
- Worker không ghi trạng thái cuối trực tiếp vào MongoDB.
- Runner hỗ trợ `deferFinalState=true`, chỉ lưu dữ liệu preview và chờ queue cha chốt phiên.

### 3.2. IPC có cấu trúc

Worker gửi ba loại message:

- `IMPORT_PROGRESS`
- `IMPORT_COMPLETED`
- `IMPORT_FAILED`

Thông tin lỗi gồm `sessionId`, `stage`, `code`, `message`, `stack`. Queue kiểm tra `sessionId` trước khi chấp nhận message để tránh cập nhật nhầm phiên.

### 3.3. Theo dõi stage và diagnostic ID

Các stage chính:

- `connecting_database`
- `reading_file`
- `parsing_excel`
- `validating`
- `saving_rows`
- `finalizing`
- `completed`

Mỗi worker có `diagnosticId`, PID, thời gian chạy, exit code và signal. Dữ liệu được lưu trong `ImportSession.worker`/`ImportSession.failure` và trả về API trạng thái phiên.

### 3.4. Không ghi đè lỗi gốc

- Khi nhận `IMPORT_FAILED`, queue lưu đúng message do worker gửi.
- Lỗi tổng quát theo exit code chỉ được dùng khi worker chết mà chưa gửi terminal message.
- Phiên đã `preview_ready` hoặc `done` không bị `markFailed()` ghi đè.

### 3.5. Quản lý tiến trình an toàn

- Queue thu thập phần cuối `stderr` theo giới hạn cấu hình.
- Có timeout, grace period và `SIGKILL` dự phòng.
- Excel parser chủ động `disconnect()` và thoát sau khi gửi kết quả.
- Parent parser chủ động dọn child process sau resolve/reject.

### 3.6. Khôi phục API báo cáo hàng thiếu

Đã mount trực tiếp trên router đang hoạt động:

- `GET /api/import/shortage-reports`
- `GET /api/import/shortage-reports/:id`
- `PATCH /api/import/shortage-reports/:id`

Các route tiếp tục được bảo vệ bởi role `admin`, `accountant`, `warehouse` ở cấp router.

## 4. File chính đã thay đổi

| File | Nội dung |
|---|---|
| `src/jobs/importPreviewQueue.js` | Parent-owned final state, structured IPC, timeout, stderr tail, diagnostic ID, queue factory để integration test |
| `src/jobs/importPreview.worker.js` | Gửi progress/completed/failed qua IPC, xử lý uncaught exception và unhandled rejection |
| `src/jobs/importPreviewRunner.js` | Stage tracking và `deferFinalState` |
| `src/services/importSessionService.js` | `markWorkerStarted`, `finalizePreview`, failure metadata, bảo vệ terminal state |
| `src/models/ImportSession.js` | Thêm `tempFiles`, `worker`, `failure` |
| `utils/excelParser.js` | Đóng parser child, stderr giới hạn, timeout an toàn |
| `utils/excelParser.worker.js` | Gửi kết quả rồi đóng IPC/thoát tiến trình |
| `src/routes/importExportRoutes.js` | Mount route báo cáo hàng thiếu đúng router |
| `src/controllers/importExportController.js` | Controller list/detail/update báo cáo hàng thiếu |
| `src/services/import/importCommit.impl.js` | Trả `worker` và `failure` trong status API |
| `.env.example`, `.env.production.example` | Bổ sung cấu hình worker/parser |

## 5. Test và kiểm tra chất lượng

- JavaScript syntax: **819/819 file hợp lệ**.
- Toàn bộ test suite: **694/694 test pass**.
- Integration test fork thật xác nhận:
  - Lỗi gốc từ worker được giữ nguyên, không bị exit code `1` ghi đè.
  - Queue chỉ chốt thành công sau `IMPORT_COMPLETED`.
  - Runner async không tự ghi terminal state.
- Parser smoke test đọc được file `.xlsx` và số active handle sau xử lý không tăng (`1 → 1`).
- Route báo cáo hàng thiếu có static regression test trên router thực tế được mount.

## 6. Cấu hình đề xuất production

```env
IMPORT_PREVIEW_ASYNC=true
IMPORT_PREVIEW_MAX_CONCURRENCY=2
IMPORT_PREVIEW_MAX_QUEUE=50
IMPORT_JOB_TIMEOUT_MS=120000
IMPORT_JOB_MAX_OLD_SPACE_MB=256
IMPORT_WORKER_EXIT_GRACE_MS=5000
IMPORT_WORKER_STDERR_LIMIT=16384
IMPORT_PARSE_TIMEOUT_MS=15000
IMPORT_PARSE_MAX_OLD_SPACE_MB=128
IMPORT_PARSE_EXIT_GRACE_MS=1000
IMPORT_PARSE_STDERR_LIMIT=8192
```

## 7. Checklist triển khai

1. Backup database và giữ bản ZIP đang chạy để rollback.
2. Deploy source mới và restart toàn bộ Node process để worker dùng code mới.
3. Kiểm tra `GET /api/import/shortage-reports` không còn 404.
4. Chạy lại preview file S3.
5. Nếu file có lỗi dữ liệu thật, giao diện sẽ hiển thị lỗi gốc; tra Render log theo `diagnosticId` với log code `[IMPORT_PREVIEW_WORKER_FAILED]`.
6. Xác nhận preview thành công rồi mới commit import.

## 8. Giới hạn xác minh

Bản vá đã được kiểm tra bằng test tự động và file Excel smoke test. File thực tế `s3 19.06.xlsx` không có trong gói mã nguồn, nên chưa thể xác nhận nội dung cụ thể của file đó. Sau bản vá, nếu lỗi nằm trong dữ liệu S3, hệ thống sẽ trả đúng lỗi gốc và stage để xử lý tiếp thay vì chỉ báo exit code `1`.
