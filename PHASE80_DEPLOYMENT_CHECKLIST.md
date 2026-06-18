# PHASE80 — DEPLOYMENT CHECKLIST

## A. Trước triển khai

- [ ] Tạo backup và tải bản backup ra ngoài máy chủ.
- [ ] Xác minh checksum backup.
- [ ] Ghi nhận số dư tồn kho, công nợ khách hàng và quỹ.
- [ ] Giữ `TENANT_MODE=single`.
- [ ] Giữ toàn bộ module nghiệp vụ Phase80 ở `false`.
- [ ] Kiểm tra Render sử dụng Node 20.20+ hoặc Node 22.

## B. Build và quality

```bash
npm ci --registry=https://registry.npmjs.org/
npm run quality
npm run check:production
```

- [ ] 657/657 test đạt.
- [ ] OpenAPI 303 operations.
- [ ] `npm audit --omit=dev`: 0 High/Critical.
- [ ] Không có URL registry nội bộ trong lockfile.

## C. Database

```bash
npm run mongo:indexes
npm run tenant:backfill:dry
npm run supplier-ap:rebuild:dry
```

- [ ] Index mới tạo thành công.
- [ ] Không có duplicate key.
- [ ] Không chạy lệnh `--write` trước khi duyệt kết quả dry-run.

## D. Deploy an toàn

Cấu hình đầu tiên:

```env
ENABLE_ENTERPRISE_CORE=true
ENABLE_PURCHASING=false
ENABLE_WAREHOUSE_ADVANCED=false
ENABLE_ANALYTICS_PROJECTIONS=false
ENABLE_MOBILE_OFFLINE_SYNC=false
ENABLE_FIELD_OPERATIONS=false
ENABLE_DELIVERY_PLANNING=false
ENABLE_INTEGRATIONS=false
ENABLE_OUTBOX_WORKER=false
ENABLE_INTEGRATION_WORKER=false
TENANT_MODE=single
TENANT_MIGRATION_CONFIRMED=false
```

- [ ] Deploy và kiểm tra `/api/health`.
- [ ] Kiểm tra `/api/health/readiness`.
- [ ] Đăng nhập admin và mở `/enterprise.html`.
- [ ] Kiểm tra backup cũ vẫn verify được.

## E. Bật module theo đợt

### Đợt 1 — Enterprise core/outbox

- [ ] Bật `ENABLE_OUTBOX_WORKER=true`.
- [ ] Outbox pending giảm về 0 hoặc ngưỡng chấp nhận.
- [ ] Không có failed event tăng liên tục.

### Đợt 2 — Mua hàng/AP

- [ ] Bật `ENABLE_PURCHASING=true`.
- [ ] Tạo đơn mua thử.
- [ ] Duyệt và nhận một phần.
- [ ] Đối chiếu StockTransaction/Inventory.
- [ ] Đối chiếu AP ledger/account.
- [ ] Thanh toán thử và đối chiếu FundLedger.
- [ ] Trả hàng thử từ đúng phiếu nhập.

### Đợt 3 — Kho và analytics

- [ ] Bật kho nâng cao.
- [ ] Giữ/giải phóng tồn thử.
- [ ] Kiểm kê 1 SKU thử.
- [ ] Bật analytics và chạy `npm run analytics:rebuild`.
- [ ] Đối chiếu projection với báo cáo vận hành.

### Đợt 4 — Mobile/tuyến/giao

- [ ] Bật offline sync trên staging.
- [ ] Tạo thao tác khi mất mạng, khôi phục mạng và kiểm tra idempotency.
- [ ] Bật tuyến bán và check-in thử.
- [ ] Bật điều hành giao và kiểm tra xếp tuyến/tải trọng.

### Đợt 5 — Tích hợp ngoài

```env
ENABLE_INTEGRATIONS=true
INTEGRATION_ALLOWED_HOSTS=api.partner.example
ENABLE_INTEGRATION_WORKER=true
```

- [ ] Endpoint HTTPS.
- [ ] Host nằm trong allowlist.
- [ ] Timeout/retry hoạt động.
- [ ] Không log secret/token.

## F. Restore drill bắt buộc

```bash
RESTORE_DRILL_MONGODB_URI='mongodb+srv://.../mkpro_restore_test' npm run restore:drill
```

- [ ] Database restore tách biệt production.
- [ ] Không thiếu collection bắt buộc.
- [ ] Kiểm tra ngẫu nhiên chứng từ và số dư.

## G. Rollback

- [ ] Tắt flag module lỗi.
- [ ] Restart service.
- [ ] Nếu lỗi lõi: redeploy Phase79C.
- [ ] Không xóa collection mới trong lúc rollback.
