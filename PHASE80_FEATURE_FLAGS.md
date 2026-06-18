# PHASE80 — FEATURE FLAGS

| Biến | Mặc định | Chức năng | Điều kiện bật |
|---|---:|---|---|
| `ENABLE_ENTERPRISE_CORE` | true | Command/outbox/readiness nền tảng | Giữ bật |
| `ENABLE_PURCHASING` | false | Mua hàng và AP | Index + smoke test + quyền kế toán/kho |
| `ENABLE_WAREHOUSE_ADVANCED` | false | Giữ tồn, kiểm kê | Đối chiếu tồn MAIN |
| `ENABLE_ANALYTICS_PROJECTIONS` | false | Reporting projection | Rebuild thử và đối chiếu báo cáo |
| `ENABLE_MOBILE_OFFLINE_SYNC` | false | Batch sync offline | Test thiết bị và idempotency |
| `ENABLE_FIELD_OPERATIONS` | false | Tuyến/viếng thăm | Dữ liệu khách hàng và NVBH chuẩn |
| `ENABLE_DELIVERY_PLANNING` | false | Xếp tuyến giao | Đơn tổng, NVGH, tải trọng chuẩn |
| `ENABLE_INTEGRATIONS` | false | Queue tích hợp ngoài | Có HTTPS allowlist |
| `ENABLE_OUTBOX_WORKER` | false | Worker xử lý outbox | Bật sau deploy smoke |
| `ENABLE_INTEGRATION_WORKER` | false | Worker gọi webhook/API | Chỉ bật cùng integrations |
| `ENABLE_REPORTING_PROJECTION_JOB` | false | Rebuild projection định kỳ | Bật sau lần rebuild thủ công |
| `TENANT_MODE` | single | Single/multi tenant | Không bật multi trực tiếp |
| `TENANT_MIGRATION_CONFIRMED` | false | Chốt migration tenant | Chỉ true sau toàn bộ checklist tenant |

## Canary khuyến nghị

```env
ENABLE_ENTERPRISE_CORE=true
ENABLE_OUTBOX_WORKER=true
ENABLE_PURCHASING=true
ENABLE_WAREHOUSE_ADVANCED=false
ENABLE_ANALYTICS_PROJECTIONS=false
ENABLE_MOBILE_OFFLINE_SYNC=false
ENABLE_FIELD_OPERATIONS=false
ENABLE_DELIVERY_PLANNING=false
ENABLE_INTEGRATIONS=false
TENANT_MODE=single
```
