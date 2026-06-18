# PHASE79A — DEPLOYMENT CHECKLIST

## Trước deploy

- [ ] Backup MongoDB và xác minh restore/checksum.
- [ ] Đảm bảo runtime Node.js 22.x và npm >= 10.
- [ ] Chạy `npm ci`.
- [ ] Chạy `npm run check:syntax`.
- [ ] Chạy `npm run check:source-size`.
- [ ] Chạy `npm run docs:check`.
- [ ] Chạy `npm test` — yêu cầu 637/637 PASS.
- [ ] Chạy `npm audit --omit=dev --audit-level=high` — yêu cầu 0 High/Critical.
- [ ] Đặt `USE_NEW_DELIVERY_SETTLEMENT=false`.

## Sau deploy compatibility mode

- [ ] `/api/system/status` trả `ok: true`.
- [ ] `/api/system/health/db` xác nhận MongoDB connected.
- [ ] Trang `/` và `/index.html` tải đầy đủ CSS/JS.
- [ ] Kiểm tra bán hàng, đơn tổng, giao hàng và báo cáo.
- [ ] Import preview + commit một file kiểm thử nhỏ.
- [ ] Kiểm tra in đơn con và đơn tổng.
- [ ] Chạy reconciliation stock/AR/fund.

## Canary

- [ ] Bật `USE_NEW_DELIVERY_SETTLEMENT=true` ở staging/canary.
- [ ] Xác nhận kế toán tối thiểu một đơn tiền mặt, một đơn chuyển khoản, một đơn có trả hàng.
- [ ] Kiểm tra `arLedgers`, `fundLedgers`, trạng thái và idempotency.
- [ ] Theo dõi API monitor tối thiểu một chu kỳ vận hành.

## Rollback

- [ ] Đặt `USE_NEW_DELIVERY_SETTLEMENT=false` nếu accounting có lỗi.
- [ ] Redeploy artifact trước Phase79A nếu lỗi nằm ngoài accounting boundary.
- [ ] Không chạy migration ngược vì phase này không thay đổi dữ liệu.
