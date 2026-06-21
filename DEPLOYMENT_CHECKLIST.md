# MK-PRO PHASE 25 — CHECKLIST DEPLOY PRODUCTION

## 1. Trước deploy

```bash
npm ci
npm run quality
npm run check:production
npm run mongo:indexes
```

- Tạo snapshot/PITR MongoDB.
- Dùng `.env.production.example` làm mẫu.
- Không bật legacy mobile, system reset, full data export hoặc AR auto-backfill.
- Kiểm tra persistent backup path.

## 2. Sau deploy

- `/api/system/health` và readiness phải trả Mongo connected.
- Login/refresh/logout hoạt động bằng HttpOnly cookie.
- Sales chỉ thấy khách được gán.
- Delivery chỉ thao tác đơn của chính mình.
- Tạo đơn/retry không trùng.
- Giao/trả/thu tiền/kế toán đúng trạng thái.
- Chạy reconciliation stock/AR/fund.
- Tạo backup và verify checksum.

## 3. Rollback

- Rollback image/application trước, không tự ý restore DB.
- Restore chỉ từ backup đã verify và phải thử trên staging.
- Sau rollback chạy reconciliation và đối chiếu các đơn trong cửa sổ deploy.
