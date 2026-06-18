# PHASE79A — BƯỚC 6: TRIỂN KHAI VÀ GIÁM SÁT

## Chiến lược rollout

### Giai đoạn 1 — Deploy compatibility mode

```env
USE_NEW_DELIVERY_SETTLEMENT=false
```

- Deploy code mới nhưng accounting vẫn đi vào implementation tương thích đã trích xuất.
- Chạy smoke test: đăng nhập, danh sách đơn, import preview, import commit thử nghiệm, giao hàng, in, báo cáo.
- Kiểm tra `/api/system/health/db` và `/api/system/status`.

### Giai đoạn 2 — Canary accounting boundary

```env
USE_NEW_DELIVERY_SETTLEMENT=true
```

- Bật trước trên staging hoặc một service canary.
- Xác nhận kế toán một nhóm đơn kiểm soát.
- Đối chiếu `arLedgers`, `fundLedgers`, trạng thái đơn và báo cáo reconciliation.

### Giai đoạn 3 — Mở rộng production

- Chỉ bật toàn bộ khi error rate và reconciliation không phát sinh lệch.
- Duy trì bản ZIP trước Phase79A để rollback artifact.

## Rollback

### Rollback nhanh

```env
USE_NEW_DELIVERY_SETTLEMENT=false
```

Restart service để quay về compatibility implementation.

### Rollback toàn bộ artifact

- Redeploy ZIP trước Phase79A.
- Không cần rollback database vì Phase79A không có schema migration hoặc data migration.

## Điểm giám sát

| Nhóm | Chỉ số/ngưỡng cảnh báo |
|---|---|
| API | 5xx > 1%; P95 > 1.500 ms trong 5 phút |
| Accounting | Bất kỳ lỗi xác nhận/mở khóa; ledger duplicate; transaction abort |
| Import | Session `failed`; commit > 60 giây; hàng invalid tăng bất thường |
| Inventory | Reconciliation mismatch > 0,0001 đơn vị |
| AR/Fund | Chênh lệch tiền > 1.000 đồng |
| Frontend index | Lỗi render fragment; response `/` 5xx; thời gian render đầu tiên > 500 ms |
| Runtime | Event-loop lag, heap tăng liên tục, process restart |

## Endpoint vận hành hiện hữu

- `GET /api/system/status`
- `GET /api/system/health/db`
- `GET /api/system/api-monitor` — admin/manager
- `POST /api/system/api-monitor/reset` — admin
- `GET /api/system/reconciliation-reports`
- `POST /api/system/reconciliation/run`

## Logging cần theo dõi

- Request ID, route, status code, duration.
- Import session ID, import type, row count, valid/invalid count, elapsed time.
- Master order ID/code, actor, feature-flag branch, transaction outcome.
- Ledger source/sourceId và duplicate-key/idempotency outcome.
- Index assembly error phải giữ stack ở server log nhưng không trả stack cho client production.

## Trạng thái

**HOÀN THÀNH** — Cấu hình canary mặc định an toàn, rollback và monitoring checklist đã sẵn sàng.
