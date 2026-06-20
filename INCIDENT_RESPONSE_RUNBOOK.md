# MK-Pro — Incident Response Runbook — Prompt 11
## Nguyên tắc chung

- Ưu tiên bảo toàn bằng chứng và chặn ghi sai; không tự sửa ledger.
- Mọi incident ghi release ID, request ID/job ID, thời gian, người xử lý và quyết định.
- Không đưa secret, token, cookie, Mongo URI hay body tài chính vào ticket công khai.
- Nếu chưa xác định side effect, dừng retry và xin phê duyệt.

## 1. Web không khởi động

- **Dấu hiệu:** Render restart/build fail; `/health/live` không mở.
- **Cách xác nhận:** Kiểm tra release manifest, config validation, port/startup log, Node/package-lock.
- **Được phép làm:** Rollback code/config; lấy startup log và release ID.
- **Không được làm:** Không bật fallback secret hoặc bỏ validation.
- **Log/evidence cần lấy:** startup log, release ID, config version, Render event.
- **Thông báo:** Release owner + người vận hành.
- **Điều kiện rollback/escalate:** Readiness không lên trong cửa sổ deploy.
- **Xác minh sau xử lý:** Live/ready 200, login và smoke-read.

## 2. MongoDB mất kết nối

- **Dấu hiệu:** Readiness 503, DATABASE_ERROR, Mongo event.
- **Cách xác nhận:** Atlas status/network/IP allowlist/pool/timeout; không ping nặng từ health.
- **Được phép làm:** Giảm write, giữ web not-ready, kiểm tra Atlas và credential version.
- **Không được làm:** Không đổi URI ngẫu nhiên hoặc restore.
- **Log/evidence cần lấy:** Mongo connection log, request IDs, Atlas event, pool metrics.
- **Thông báo:** DB/Release owner.
- **Điều kiện rollback/escalate:** Mất kết nối kéo dài hoặc release mới gây lỗi.
- **Xác minh sau xử lý:** Ready 200, error rate bình thường, reconciliation read-only.

## 3. API chậm

- **Dấu hiệu:** p95/p99 tăng, slow route list.
- **Cách xác nhận:** Xem `/api/system/operations`, API monitor, DB query traces, memory/CPU.
- **Được phép làm:** Khoanh route, giảm traffic, rollback release nếu tương quan.
- **Không được làm:** Không cache che query chậm khi invalidation chưa đúng.
- **Log/evidence cần lấy:** route, requestId, duration, dbQueries/mongoMs, release.
- **Thông báo:** App owner.
- **Điều kiện rollback/escalate:** SLO/baseline vượt ngưỡng và không hồi phục.
- **Xác minh sau xử lý:** p95 về baseline, dữ liệu mẫu khớp.

## 4. Memory tăng cao

- **Dấu hiệu:** RSS tăng, OOM/restart.
- **Cách xác nhận:** So heap/RSS, job/export gần nhất, release, request rate.
- **Được phép làm:** Dừng job nặng, restart có kiểm soát, rollback.
- **Không được làm:** Không tăng memory vô hạn để che leak.
- **Log/evidence cần lấy:** process metrics, heap evidence nếu an toàn, job IDs.
- **Thông báo:** App/Worker owner.
- **Điều kiện rollback/escalate:** Restart lặp lại hoặc OOM.
- **Xác minh sau xử lý:** RSS ổn định qua chu kỳ tải.

## 5. Worker chết

- **Dấu hiệu:** Heartbeat stale/failed, queue tăng.
- **Cách xác nhận:** Xem heartbeat, process log, lease owner, last failure.
- **Được phép làm:** Dừng claim, restart cùng release, theo dõi lease.
- **Không được làm:** Không xóa queue hoặc force completed.
- **Log/evidence cần lấy:** worker release, job statuses, lease times, error code.
- **Thông báo:** Worker owner.
- **Điều kiện rollback/escalate:** Version mismatch hoặc crash lặp.
- **Xác minh sau xử lý:** Heartbeat healthy, queue giảm, không duplicate.

## 6. Job bị stuck

- **Dấu hiệu:** running quá lease/timeout.
- **Cách xác nhận:** Kiểm tra job type, attempt, lease, executor/process.
- **Được phép làm:** Đối với export/preview cho lease recovery; side-effect job điều tra.
- **Không được làm:** Không retry import_commit/reconciliation mù.
- **Log/evidence cần lấy:** job document, requestId, audit, executor log.
- **Thông báo:** Worker + business verifier.
- **Điều kiện rollback/escalate:** Không xác định side effect hoặc nhiều job kẹt.
- **Xác minh sau xử lý:** Trạng thái terminal đúng và dữ liệu đối soát.

## 7. Export thất bại

- **Dấu hiệu:** EXPORT_ERROR/dead-letter/không có artifact.
- **Cách xác nhận:** Kiểm tra input filter, temp/GridFS, timeout, memory.
- **Được phép làm:** Retry khi job idempotent và còn attempts; rollback nếu release gây lỗi.
- **Không được làm:** Không sửa format VAT/SSE trong incident.
- **Log/evidence cần lấy:** job ID, requestId, sanitized error, release.
- **Thông báo:** Worker + kế toán.
- **Điều kiện rollback/escalate:** Tỷ lệ lỗi tăng sau release.
- **Xác minh sau xử lý:** File mở được, rows/totals khớp baseline.

## 8. Import thất bại

- **Dấu hiệu:** IMPORT_ERROR/session failed.
- **Cách xác nhận:** Kiểm tra preview/session/row report, file metadata, worker.
- **Được phép làm:** Giữ file, không commit lại nếu chưa biết trạng thái.
- **Không được làm:** Không sửa trực tiếp tồn/AR để bù.
- **Log/evidence cần lấy:** session ID, job ID, requestId, row counts.
- **Thông báo:** Kho/kế toán + app owner.
- **Điều kiện rollback/escalate:** Commit có trạng thái không xác định.
- **Xác minh sau xử lý:** Session terminal, đối soát inventory/order.

## 9. Tồn kho nghi sai

- **Dấu hiệu:** Reconciliation mismatch hoặc số lượng bất thường.
- **Cách xác nhận:** Khóa nghiệp vụ liên quan nếu cần; so ledger/sourceId/idempotency.
- **Được phép làm:** Chụp evidence, chạy reconciliation read-only, lập patch riêng.
- **Không được làm:** Không update inventories trực tiếp.
- **Log/evidence cần lấy:** order/return IDs, stock transactions, request IDs.
- **Thông báo:** Kho + kế toán + app owner.
- **Điều kiện rollback/escalate:** Có posting trùng/sai sau release.
- **Xác minh sau xử lý:** Ledger và báo cáo khớp sau xử lý được duyệt.

## 10. Công nợ nghi sai

- **Dấu hiệu:** AR mismatch/customer debt sai.
- **Cách xác nhận:** So arLedgers với chứng từ xác nhận kế toán.
- **Được phép làm:** Dừng xác nhận liên quan, đối soát read-only.
- **Không được làm:** Không chèn AR thủ công không audit.
- **Log/evidence cần lấy:** customer/order/return/receipt IDs, AR rows.
- **Thông báo:** Kế toán + app owner.
- **Điều kiện rollback/escalate:** Release làm thay đổi result.
- **Xác minh sau xử lý:** AR reconciliation sạch và mẫu khớp.

## 11. Quỹ nghi sai

- **Dấu hiệu:** Fund mismatch/số dư lệch.
- **Cách xác nhận:** So fundLedgers, receipts/transfers/vouchers.
- **Được phép làm:** Khóa ghi liên quan, đối soát.
- **Không được làm:** Không chỉnh số dư tổng trực tiếp.
- **Log/evidence cần lấy:** fund ledger IDs, actor, audit.
- **Thông báo:** Thủ quỹ + kế toán.
- **Điều kiện rollback/escalate:** Side effect chưa xác định.
- **Xác minh sau xử lý:** Sổ quỹ và ledger khớp.

## 12. Hàng trả không phản ánh

- **Dấu hiệu:** returnOrders có nhưng stock/AR/export sai.
- **Cách xác nhận:** Kiểm tra return state, accounting confirmation, source IDs.
- **Được phép làm:** Giữ returnOrders SSoT, lập incident evidence.
- **Không được làm:** Không tạo return bù hoặc xóa return.
- **Log/evidence cần lấy:** return/order/master IDs, ledger/posting logs.
- **Thông báo:** Kho + kế toán.
- **Điều kiện rollback/escalate:** VAT/SSE/tồn/AR bị ảnh hưởng.
- **Xác minh sau xử lý:** Partial/full return đúng trên mọi view.

## 13. VAT/SSE sai

- **Dấu hiệu:** Rows/totals hoặc full-return exclusion sai.
- **Cách xác nhận:** So file với returnOrders và baseline mẫu.
- **Được phép làm:** Dừng phát hành file, rollback code nếu release liên quan.
- **Không được làm:** Không sửa Excel tay rồi coi là fix hệ thống.
- **Log/evidence cần lấy:** export job, filters, source order IDs, SHA file.
- **Thông báo:** Kế toán + app owner.
- **Điều kiện rollback/escalate:** Sai dữ liệu pháp lý.
- **Xác minh sau xử lý:** File mới khớp đối soát, không còn đơn trả hết.

## 14. Deployment lỗi

- **Dấu hiệu:** Readiness fail/restart/version mismatch.
- **Cách xác nhận:** So manifest, source/bundle/config hash, web-worker version.
- **Được phép làm:** Rollback artifact/config.
- **Không được làm:** Không chạy migration chữa cháy.
- **Log/evidence cần lấy:** release record, build/startup logs, health.
- **Thông báo:** Release owner.
- **Điều kiện rollback/escalate:** Health/smoke không đạt.
- **Xác minh sau xử lý:** Release cũ healthy và nghiệp vụ khớp.

## 15. Secret bị lộ

- **Dấu hiệu:** Token/URI xuất hiện log/chat/source.
- **Cách xác nhận:** Thu hồi quyền, rotate, tìm phạm vi, xóa log theo policy.
- **Được phép làm:** Rotate theo thứ tự, invalidate sessions nếu cần.
- **Không được làm:** Không chỉ xóa dòng log mà giữ secret cũ.
- **Log/evidence cần lấy:** thời điểm, loại secret, nơi lộ, access audit.
- **Thông báo:** Security/owner.
- **Điều kiện rollback/escalate:** Luôn rotate; rollback nếu release gây leak.
- **Xác minh sau xử lý:** Secret cũ vô hiệu, scan sạch, services healthy.

## 16. Backup thất bại

- **Dấu hiệu:** Không có file/checksum/verify fail.
- **Cách xác nhận:** Kiểm tra volume/quota/permission/format.
- **Được phép làm:** Tạo lại, sao chép off-host, cảnh báo owner.
- **Không được làm:** Không xóa backup cũ tốt.
- **Log/evidence cần lấy:** backup name, checksum, size, error.
- **Thông báo:** Backup/DB owner.
- **Điều kiện rollback/escalate:** Không còn backup trong RPO.
- **Xác minh sau xử lý:** Verify PASS và off-host copy.

## 17. Cần restore

- **Dấu hiệu:** Data loss/corruption đã xác nhận.
- **Cách xác nhận:** Declare incident, xác định RPO, chọn verified backup.
- **Được phép làm:** Restore vào DB mới, verify/index/reconcile/smoke rồi cutover.
- **Không được làm:** Không restore đè production hoặc chạy script sửa ledger.
- **Log/evidence cần lấy:** backup checksum, release, RTO/RPO, reconciliation.
- **Thông báo:** Incident + DB + business owners.
- **Điều kiện rollback/escalate:** Khi forward-fix không an toàn.
- **Xác minh sau xử lý:** Counts/index/ledger totals/users/reads khớp.

## Mẫu incident record

```text
incidentId:
startedAt:
detectedBy:
releaseId/sourceSha256:
impact:
requestIds/jobIds/documentIds:
actionsTaken:
prohibitedActionsConfirmed:
rollbackDecision:
recoveryAt:
verifiedBy:
followUpOwner:
```
