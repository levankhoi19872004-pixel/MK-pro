# BÁO CÁO GIAI ĐOẠN 5 — MOBILE PRODUCTION HARDENING

## 1. Phạm vi và nguyên tắc

Bản vá được triển khai trên nền `MK-pro-mobile-sales-phase4-frontend-modularization-patched.zip` theo định hướng **online-first**.

Không triển khai:

- PWA đầy đủ.
- Service Worker.
- Catalog/tồn kho/giá bán offline.
- Background Sync cho đơn mới.
- Thay đổi schema MongoDB.
- Thay đổi business rule tạo, sửa, xóa đơn.
- Thay đổi tồn kho, công nợ, quỹ, giao hàng hoặc trả hàng.

Mục tiêu của giai đoạn này là làm cứng ứng dụng trước production: không báo giả đã lưu khi mất mạng, đo được hiệu năng thực tế, có công cụ audit chỉ đọc, giới hạn memory của monitor, nâng bảo mật mobile shell và chuẩn hóa quy trình deploy/rollback.

---

## 2. Kiến trúc sau hardening

```text
Mobile sales UI
→ runtime config / timeout / request cancellation
→ online API command
→ server idempotency + transaction hiện hữu
→ MongoDB

Client telemetry đã làm sạch
→ POST /api/mobile/telemetry
→ mobile_logs (operational log only)
→ read-only telemetry audit

API monitor
→ bounded latency samples
→ p50 / p95 / p99 / error rate
→ system monitoring report
```

---

## 3. Online-first và xử lý mất mạng

### Trước bản vá

Khi request tạo đơn hoặc thu nợ gặp lỗi mạng, frontend có thể đưa operation mới vào IndexedDB và báo đã lưu offline.

### Sau bản vá

Mặc định:

```env
ENABLE_MOBILE_OFFLINE_SYNC=false
ENABLE_MOBILE_OFFLINE_QUEUE=false
```

Khi mất mạng:

1. Không tạo operation offline mới.
2. Không báo đơn đã được ghi lên server.
3. Giữ nguyên draft trên thiết bị.
4. Hiển thị rõ:

```text
Mất kết nối — đơn chưa được gửi. Dữ liệu đang nhập vẫn được giữ trên thiết bị.
```

5. Người dùng gửi lại sau khi mạng ổn định.
6. Backend tiếp tục sử dụng idempotency hiện hữu để chống tạo trùng.

### Dữ liệu offline cũ

Kênh `/api/mobile/sync/batch` chỉ được giữ tạm để giải phóng operation cũ:

```env
ENABLE_MOBILE_LEGACY_SYNC_DRAIN=true
MOBILE_LEGACY_SYNC_DRAIN_UNTIL=<ISO datetime>
```

Sau khi hàng đợi cũ bằng 0, phải tắt:

```env
ENABLE_MOBILE_LEGACY_SYNC_DRAIN=false
```

Operation `conflict` hoặc `needs_attention` vẫn hiển thị để đối soát nhưng không tự retry vô hạn.

---

## 4. Runtime config mobile

### API mới

```http
GET /api/mobile/runtime-config
```

Yêu cầu đăng nhập mobile.

Response:

```json
{
  "ok": true,
  "success": true,
  "config": {
    "onlineFirst": true,
    "offlineQueueEnabled": false,
    "legacySyncDrainEnabled": true,
    "legacySyncDrainUntil": "",
    "clientTelemetryEnabled": true,
    "clientTelemetrySampleRate": 1,
    "clientTelemetryBatchSize": 20,
    "clientTelemetryFlushMs": 60000,
    "apiTimeoutMs": 15000,
    "commandTimeoutMs": 30000
  }
}
```

Frontend tải config khi khởi tạo app và không hard-code quyết định queue offline.

---

## 5. Client telemetry an toàn

### API mới

```http
POST /api/mobile/telemetry
```

Yêu cầu:

- Đăng nhập.
- Tối đa 50 event mỗi batch.
- Validate độ dài các metadata.

Telemetry chỉ ghi:

- API path đã loại query string.
- ID nghiệp vụ trong URL được thay bằng `:id`.
- Thời gian client/server.
- HTTP status.
- Mã lỗi chuẩn hóa.
- Request ID kỹ thuật.
- Loại mạng và app version.

Không ghi:

- Payload đơn hàng.
- Tên/mã khách hàng.
- Danh sách sản phẩm.
- Giá, tiền hoặc công nợ.
- Token/cookie.

Batch được ghi một dòng operational log:

```text
mobile_logs.action = mobile_client_perf_batch
```

Đây là ghi log vận hành, không làm thay đổi dữ liệu nghiệp vụ.

---

## 6. API client hardening

`public/mobile/js/api.js` được bổ sung:

- Timeout mặc định cấu hình được.
- Timeout riêng cho command.
- `AbortController`.
- Hủy request cũ khi bị request mới thay thế.
- `X-Client-Request-Id`.
- Telemetry buffer tối đa 100 bản ghi.
- Batch/flush theo thời gian.
- Không ghi telemetry lặp cho cùng lỗi HTTP.
- Không serialise option nội bộ thành query parameter.
- Flush có `keepalive` khi trang chuyển nền/đóng.

Mặc định:

```env
MOBILE_API_TIMEOUT_MS=15000
MOBILE_COMMAND_TIMEOUT_MS=30000
```

---

## 7. API Monitor production metrics

`src/middlewares/apiMonitor.middleware.js` hiện lưu mẫu latency có giới hạn:

```env
API_MONITOR_SAMPLE_SIZE=200
```

Báo cáo theo route/module có thêm:

- p50.
- p95.
- p99.
- Error rate.
- Slow rate.
- Status counts.

Mẫu được giới hạn để không tăng memory vô hạn.

---

## 8. Công cụ kiểm tra production chỉ đọc

### 8.1 Query plan audit

```bash
npm run audit:mobile-query-plans
```

Chế độ mặc định chỉ rà soát cấu hình index tĩnh.

Để chạy MongoDB `explain('executionStats')` bằng tài khoản chỉ đọc:

```bash
MOBILE_QUERY_PLAN_AUDIT_DB=1 \
MOBILE_QUERY_PLAN_ENFORCE=1 \
MONGO_URI="..." \
npm run audit:mobile-query-plans
```

Phát hiện:

- `COLLSCAN`.
- Tỷ lệ `docsExamined / nReturned` quá cao.
- Execution time vượt ngưỡng.

Script không tạo, sửa hoặc xóa index.

### 8.2 Client telemetry audit

```bash
MOBILE_TELEMETRY_AUDIT_DB=1 \
MONGO_URI="..." \
npm run audit:mobile-telemetry
```

Báo cáo p50/p95/p99 và error rate theo API mobile.

### 8.3 Read-only production benchmark

```bash
PERF_BASE_URL="https://..." \
PERF_TOKEN="<JWT test account>" \
PERF_ALLOW_REMOTE=true \
MOBILE_BENCHMARK_ENFORCE=1 \
npm run benchmark:mobile
```

Benchmark:

- Chỉ gửi GET.
- Giới hạn concurrency tối đa 50 từ runner nền.
- Không gọi command tạo/sửa/xóa.
- Kiểm p95, payload trung bình và failure rate.

---

## 9. Bảo mật mobile shell

Route `/mobile` được bổ sung:

```http
Cache-Control: no-store, no-cache, must-revalidate, proxy-revalidate
Content-Security-Policy: ...
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

CSP giới hạn:

- Script/style/image/font/connect từ same-origin.
- Chặn object embedding.
- Chặn frame embedding.
- Khóa `base-uri` và `form-action`.

`unsafe-inline` tạm thời vẫn tồn tại vì mobile HTML hiện còn runtime bootstrap inline. Đây là technical debt đã được ghi nhận; không mở rộng thêm inline script mới trong production code.

---

## 10. Cache-bust và lỗi test nền

Đã nâng cache version:

```text
phase86-production-hardening-v1
```

cho:

- Mobile sales entry.
- Bốn sales-order web shards.
- DMS inventory web script.

Import worker được chuẩn hóa dùng biến local `payload` bất biến trong một lần chạy, sau đó mới gán `activePayload` cho cleanup/error handling. Không thay đổi import mode hoặc business rule import.

Bốn lỗi baseline đã được xử lý an toàn:

1. Cache-version DMS Inventory cũ.
2. Hai assertion import worker không khớp implementation hiện hành.
3. Cache-version sales-order web cũ.

---

## 11. Danh sách file thay đổi chính

### Backend

```text
src/app.js
src/config/featureFlags.js
src/controllers/mobile/runtime.controller.js
src/jobs/importPreview.worker.js
src/middlewares/apiMonitor.middleware.js
src/routes/mobile/index.js
src/routes/mobile/sync.routes.js
src/services/mobile/runtimeConfig.service.js
src/services/mobile/telemetry.service.js
```

### Frontend

```text
public/mobile/js/config.js
public/mobile/js/api.js
public/mobile/js/offline-sync.js
public/mobile/js/sales/sync.js
public/mobile/js/sales.source/part-01.jsfrag
public/mobile/js/sales.source/part-01b.jsfrag
public/mobile/js/sales.source/part-03.jsfrag
public/mobile/js/sales.js
public/mobile/sales.html
```

### Công cụ vận hành

```text
scripts/audit-mobile-query-plans.js
scripts/audit-mobile-client-telemetry.js
scripts/performance/mobile-production-benchmark.js
scripts/mobile-browser-smoke.js
scripts/production-readiness-check.js
```

### Cấu hình/tài liệu/test

```text
.env.example
.env.production.example
package.json
config/source-bundles.json
docs/openapi.json
test/mobile-sales-phase5-production-hardening.test.js
các test cache-version/import contract liên quan
```

---

## 12. Kết quả kiểm thử

### Baseline Giai đoạn 4

```text
860 pass
4 fail
1 skip
865 total
```

### Sau Giai đoạn 5

```text
874 pass
0 fail
1 skip
875 total
```

Test skip duy nhất là golden fixture SSE thật chưa được cung cấp, giống các giai đoạn trước.

### Quality gate

| Hạng mục | Kết quả |
|---|---:|
| Full test | 874/875 đạt, 0 lỗi, 1 skip |
| JavaScript syntax | 865 file đạt |
| Source bundles | 18/18 đạt |
| Source-size budget | Đạt |
| Path portability | 1.047 đường dẫn đạt |
| OpenAPI | 310 operations, đồng bộ |
| Enterprise smoke | 10 modules, 11 flags đạt |
| Package lock registry | Đạt |
| `npm audit --omit=dev --audit-level=high` | 0 lỗ hổng |
| Static mobile query/index audit | Đạt |
| Production readiness với cấu hình mẫu an toàn | Đạt; cảnh báo legacy drain tạm thời |

### Browser/thiết bị

Script Chromium viewport đã được bổ sung cho 320/360/390/412 px. Trong container hiện tại Chromium không hoàn tất headless session do hạn chế DBus/runtime, vì vậy test được **skip có ghi lý do**, không được khai là đã chạy thành công.

Chưa thực hiện:

- Test trên điện thoại Android vật lý.
- MongoDB `explain()` trên production.
- Benchmark endpoint production.
- Audit telemetry production.

Các phần này yêu cầu môi trường/credential thực và được đưa vào checklist sau deploy.

---

## 13. Side effect

| Module | Kết quả |
|---|---|
| Đơn bán | Không đổi business rule |
| Giá/khuyến mại | Không đổi |
| Tồn kho | Không đổi posting/service |
| Công nợ | Không đổi `arLedgers` |
| Quỹ | Không ảnh hưởng |
| Giao hàng | Không ảnh hưởng |
| Trả hàng | Không đổi lifecycle |
| Schema MongoDB | Không đổi |
| Index MongoDB | Không tự tạo |
| Import Excel | Không đổi mode/nghiệp vụ |
| Mobile logs | Thêm log hiệu năng đã làm sạch |

---

## 14. Rollout khuyến nghị

### Bước 1 — Staging

- Đặt các ENV online-first.
- Đặt hạn cuối legacy drain.
- Chạy full test và readiness check.
- Chạy mobile browser smoke ở môi trường có Chromium hoạt động.
- Test Android thật trên 4G và mạng chập chờn.

### Bước 2 — Canary

- Triển khai cho một nhóm NVBH nhỏ.
- Theo dõi 24–48 giờ:
  - p50/p95.
  - timeout/error rate.
  - đơn trùng.
  - draft chưa gửi.
  - operation legacy còn tồn.

### Bước 3 — Toàn bộ

- Mở rộng khi chỉ số đạt ngưỡng.
- Khi operation legacy bằng 0, tắt legacy drain.
- Không bật lại offline queue.

---

## 15. Rollback

Không có migration hoặc thay đổi dữ liệu nghiệp vụ.

Rollback nhanh:

1. Deploy ZIP Giai đoạn 4.
2. Giữ `ENABLE_MOBILE_OFFLINE_QUEUE=false`.
3. Không bật lại queue offline để che lỗi.
4. Nếu telemetry gây áp lực ngoài dự kiến, đặt:

```env
MOBILE_CLIENT_TELEMETRY_ENABLED=false
```

5. Nếu cần giải phóng operation cũ trong thời gian rollback, chỉ mở legacy drain có hạn cuối.

---

## 16. Kết luận

Giai đoạn 5 đã chuyển app sang vận hành online-first rõ ràng, bổ sung khả năng đo hiệu năng và audit production mà không mở rộng offline hoặc thay đổi dữ liệu nguồn. Code đã vượt toàn bộ test thực thi trong repository. Nghiệm thu cuối cùng còn cần staging/Android thật và các audit chỉ đọc trên MongoDB production.
