# MOBILE PRODUCTION DEPLOYMENT CHECKLIST

## 1. ENV bắt buộc

```env
ENABLE_MOBILE_OFFLINE_SYNC=false
ENABLE_MOBILE_OFFLINE_QUEUE=false
ENABLE_MOBILE_LEGACY_SYNC_DRAIN=true
MOBILE_LEGACY_SYNC_DRAIN_UNTIL=2026-07-31T23:59:59+07:00
MOBILE_CLIENT_TELEMETRY_ENABLED=true
MOBILE_CLIENT_TELEMETRY_SAMPLE_RATE=1
MOBILE_CLIENT_TELEMETRY_BATCH_SIZE=20
MOBILE_CLIENT_TELEMETRY_FLUSH_MS=60000
MOBILE_API_TIMEOUT_MS=15000
MOBILE_COMMAND_TIMEOUT_MS=30000
API_MONITOR_SAMPLE_SIZE=200
```

Không bật lại `ENABLE_MOBILE_OFFLINE_QUEUE` ở production. Render Web Service phải giữ `ENABLE_MOBILE_OFFLINE_SYNC=false` và `ENABLE_MOBILE_OFFLINE_QUEUE=false`; chỉ xem xét bật queue sau khi có đối soát/idempotency offline production-grade cho tiền, tồn kho và công nợ.

## 2. Trước deploy

```bash
npm ci
npm test
npm run check:lock-registry
npm run check:path-portability
npm run check:syntax
npm run check:source-bundles
npm run check:source-size
npm run check:enterprise
npm run docs:check
npm audit --omit=dev --audit-level=high
npm run check:production
```

## 3. Test staging

- Đăng nhập NVBH.
- Tải khách hàng/sản phẩm/đơn/công nợ.
- Tạo, sửa, xóa một đơn test.
- Bấm tạo đơn nhiều lần trên mạng chậm.
- Ngắt mạng trước khi gửi đơn bán: app phải giữ draft và báo chưa gửi.
- Ngắt mạng ở app giao hàng khi lưu trả hàng/thu tiền: phải báo “Mất kết nối. Vui lòng thử lại khi có mạng. Giao dịch chưa được ghi nhận.”
- Kết nối lại và gửi: chỉ có một đơn.
- Kiểm tra operation legacy cũ vẫn drain khi flag còn bật, nhưng operation tiền/trả hàng/xác nhận giao hàng phải bị từ chối.
- Kiểm tra console không có lỗi mới.
- Kiểm tra Android 320/360/390/412 px.

## 4. Audit read-only

```bash
MOBILE_QUERY_PLAN_AUDIT_DB=1 \
MOBILE_QUERY_PLAN_ENFORCE=1 \
MONGO_URI="<read-only-uri>" \
npm run audit:mobile-query-plans
```

```bash
MOBILE_TELEMETRY_AUDIT_DB=1 \
MOBILE_TELEMETRY_AUDIT_ENFORCE=1 \
MONGO_URI="<read-only-uri>" \
npm run audit:mobile-telemetry
```

```bash
PERF_BASE_URL="https://<staging-or-production>" \
PERF_TOKEN="<jwt-test-account>" \
PERF_ALLOW_REMOTE=true \
MOBILE_BENCHMARK_ENFORCE=1 \
npm run benchmark:mobile
```

## 5. Theo dõi 24–48 giờ

- Mobile API p50/p95/p99.
- Error rate và timeout.
- Response size.
- DB query count.
- Số đơn trùng.
- Số draft chưa gửi.
- Số operation legacy còn tồn.
- MongoDB CPU/reads.
- Render memory/CPU.

## 6. Đóng legacy drain

Khi xác nhận hàng đợi cũ bằng 0:

```env
ENABLE_MOBILE_LEGACY_SYNC_DRAIN=false
```

Sau một chu kỳ phát hành ổn định mới xem xét loại code sync legacy.

## 7. Rollback

- Deploy ZIP Giai đoạn 4.
- Giữ offline queue tắt (`ENABLE_MOBILE_OFFLINE_SYNC=false`, `ENABLE_MOBILE_OFFLINE_QUEUE=false`).
- Có thể tắt telemetry bằng ENV.
- Không sửa dữ liệu production bằng tay.
- Đối chiếu idempotency key trước khi xử lý đơn nghi trùng.
