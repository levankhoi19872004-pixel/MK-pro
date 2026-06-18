# PHASE80 — BƯỚC 2: ENTERPRISE CORE

## Thành phần mới

### Command Pipeline

`src/application/CommandPipeline.js`

Luồng chuẩn:

```text
Validate → Authorize → Mongo Transaction → Domain Handler
→ Audit Log → Transactional Outbox → Idempotency → Commit
```

### Transactional Outbox

- Model: `OutboxEvent`.
- Service: `OutboxService`.
- Worker: `outboxJob`.
- Retry theo exponential backoff.
- Claim event có lock và xử lý lại event bị treo.
- Worker tắt mặc định: `ENABLE_OUTBOX_WORKER=false`.

### Tenant Context

- `tenant.middleware.js` lấy tenant từ token/session, không tin request body.
- Chế độ mặc định vẫn là `TENANT_MODE=single`.
- Header override chỉ dành cho admin và phải bật rõ ràng.
- Các model lõi được chuẩn bị `tenantId` nhưng chưa tự động chuyển production sang multi-tenant.

### Audit và readiness

- Audit service nhận actor/tenant/session thống nhất.
- `/api/enterprise/status`.
- `/api/enterprise/readiness`.
- `/api/health/readiness`.
- Theo dõi DB, outbox backlog và integration failures.

## Bảo mật

- Feature flag middleware trả 404 khi module tắt, giảm bề mặt tấn công.
- RBAC áp dụng tại route của từng module.
- Strict schema (`strict: 'throw'`) cho toàn bộ collection mới.
- Không kích hoạt integration nếu thiếu hostname allowlist.

## Tương thích

- Không thay đổi schema bắt buộc của dữ liệu cũ.
- Không ép tenantId lên dữ liệu production khi khởi động.
- Không thay đổi endpoint hiện có.
