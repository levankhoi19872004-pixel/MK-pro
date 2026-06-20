# MK-Pro — Rollback Runbook — Prompt 11

## 1. Nguyên tắc

Rollback code, config, worker và database là bốn quyết định khác nhau. Không mặc định chạy script ngược database. Không chạy lại job tài chính khi chưa chứng minh idempotency và trạng thái side effect.

Prompt 11 không có migration nghiệp vụ, không đổi API contract nghiệp vụ và không đổi collection nghiệp vụ. Collection `operational_heartbeats` là telemetry có TTL; field `requestId` trong `background_jobs` là additive. Chúng có thể tồn tại khi rollback code Prompt 10.

## 2. Rollback code

1. Ghi thời điểm và release lỗi.
2. Dừng worker mới bằng `SIGTERM`; chờ active executor hoặc lease-safe failure.
3. Xác định job:
   - `completed`: không chạy lại;
   - `pending`: giữ nguyên;
   - `running`: ghi job ID/lease owner/attempt count;
   - `failed/dead_letter`: điều tra trước khi retry;
   - `import_commit`/reconciliation: không auto retry vì `maxAttempts=1`.
4. Redeploy ZIP Prompt 10 đã kiểm chứng:

```text
MK-pro-phase10-production-configuration-hardening-patched.zip
SHA-256: bfc49bc30ec709b48af21ccc52d9f62b8244f98fd391c14839d0e974b035e5dd
```

5. Dùng package-lock và source bundle của Prompt 10, không trộn file.
6. Khởi động web, kiểm tra health cũ và API nghiệp vụ.
7. Chỉ khởi động worker sau khi web/DB ổn định.
8. Chạy smoke-read và đối soát chứng từ trong cửa sổ deploy.

## 3. Rollback config

Mỗi thay đổi phải có record:

```text
variable:
oldValueFingerprint/non-secret value:
newValueFingerprint/non-secret value:
changedBy:
changedAt:
reason:
rollbackAt:
verifiedBy:
```

Không ghi giá trị secret. Khi rollback secret, dùng phiên bản trong secret manager/Render và rotate nếu nghi lộ.

Các biến Prompt 11 đều có default tương thích. Prompt 10 sẽ bỏ qua `OPERATIONS_HEARTBEAT_*`, `READINESS_DEPENDENCY_TIMEOUT_MS`, `WORKER_SHUTDOWN_TIMEOUT_MS`, `RELEASE_*`; có thể giữ chúng mà không ảnh hưởng nghiệp vụ.

## 4. Rollback worker/job

- Dừng claim trước rồi mới dừng process.
- Cho active job hoàn tất trong `WORKER_SHUTDOWN_TIMEOUT_MS`.
- Khi timeout, executor bị dừng và job đi qua `fail()`/lease; không được đánh dấu completed mù.
- Export/import preview có thể retry theo max attempts.
- Import commit/reconciliation có side effect chỉ một attempt; cần đối chiếu session/report trước thao tác thủ công.
- Không xóa `background_jobs` để “làm sạch”.

## 5. Rollback database

Phân loại trước:

| Loại | Xử lý |
|---|---|
| Additive, backward-compatible | Có thể giữ; Prompt 11 thuộc nhóm này. |
| Destructive | Dừng deploy; thường cần restore hoặc forward-fix. |
| Không tương thích ngược | Không rollback code độc lập; cần kế hoạch phiên bản. |
| Dữ liệu nghi sai | Chụp evidence, khóa ghi liên quan, chạy reconciliation read-only, xin phê duyệt. |

Không restore production nếu chỉ có lỗi code/config. Restore chỉ theo `BACKUP_RESTORE_RUNBOOK.md` và quyết định sự cố chính thức.

## 6. Kiểm tra sau rollback

- Version/release endpoint phản ánh release cũ hoặc không còn endpoint Prompt 11 như dự kiến.
- Login, đơn, tồn, AR, fund, return, VAT/SSE, import/export đọc đúng.
- Không có job running bị chạy lại ngoài ý muốn.
- Mongo connection ổn định.
- Error rate/restart trở về baseline.
- Đối chiếu tất cả chứng từ tạo trong cửa sổ deploy/rollback.

## 7. Mô phỏng đã thực hiện

Baseline Prompt 10 được giữ nguyên tại thư mục cô lập và đã chạy full test: 962 tests, 961 pass, 0 fail, 1 skip. SHA-256 artifact được xác minh. Không có production deployment nên thời gian rollback Render thực tế chưa được đo; phải đo trong một staging deploy trước khi phê duyệt production.

## 8. Rollback riêng bản vá Prompt 11

- Redeploy Prompt 10 ZIP nêu trên.
- Không drop `operational_heartbeats`; TTL sẽ dọn dần, hoặc xóa sau khi có phê duyệt vì đây là telemetry, không phải dữ liệu nghiệp vụ.
- Không xóa `requestId` đã lưu trong background jobs.
- Bỏ route operational mới thông qua code rollback; không cần migration.
- Khôi phục config snapshot trước deploy và kiểm tra lại CORS/JWT/Mongo.
