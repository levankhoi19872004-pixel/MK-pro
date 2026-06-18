# PHASE80 — BƯỚC 4: MOBILE OFFLINE, TÍCH HỢP VÀ VẬN HÀNH

## Mobile offline

### Client

- IndexedDB lưu outbox trên thiết bị.
- Tự đồng bộ khi mạng trở lại.
- Hỗ trợ đơn bán, thu nợ, check-in tuyến, hoàn thành lượt ghé và thao tác giao hàng.
- Sửa lỗi IndexedDB transaction có thể bị inactive khi dùng `await` giữa transaction.

### Server

- Tối đa 100 thao tác/batch.
- Idempotency theo `tenantId + deviceId + operationId`.
- Canonical payload hash: thứ tự key JSON khác nhau không tạo xung đột giả.
- Retry thao tác server thất bại hoặc processing bị treo.
- Giới hạn số lần thử và phát hiện payload conflict.

## Integration queue

- HTTPS mặc định bắt buộc.
- Host phải nằm trong `INTEGRATION_ALLOWED_HOSTS`.
- Header chỉ cho phép một danh sách an toàn.
- Timeout, retry, exponential backoff, claim lock và failed state.
- Chống SSRF ở tầng endpoint validation.

## Trung tâm mở rộng

Trang `/enterprise.html` dành cho quản trị:

- Database/readiness.
- Feature flags.
- Outbox và integration queue.
- Dữ liệu nhanh của mua hàng, kho, projection, tuyến bán và tuyến giao.
- Nút rebuild projection và drain queue có RBAC phía API.

## Backup/restore

- 17 collection Phase80 được đưa vào backup/reset mapping.
- Backup cũ trước Phase80 vẫn được verifier chấp nhận.
- Restore drill tự yêu cầu collection của module đang bật.
