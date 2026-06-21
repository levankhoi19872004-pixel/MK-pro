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
- Render Web Service phải đặt `ENABLE_MOBILE_OFFLINE_SYNC=false` và `ENABLE_MOBILE_OFFLINE_QUEUE=false`.
- Không bật offline queue cho trả hàng/thu tiền/xác nhận giao hàng khi chưa có đối soát/idempotency production-grade.
- Kiểm tra persistent backup path.

## 2. Sau deploy

- `/api/system/health` và readiness phải trả Mongo connected.
- Login/refresh/logout hoạt động bằng HttpOnly cookie.
- Sales chỉ thấy khách được gán.
- Delivery chỉ thao tác đơn của chính mình.
- Tạo đơn/retry không trùng.
- Giao/trả/thu tiền/kế toán đúng trạng thái.
- Test ngắt mạng ở app giao hàng: trả hàng/thu tiền phải báo “Giao dịch chưa được ghi nhận”, không tạo queue.
- Chạy reconciliation stock/AR/fund.
- Tạo backup và verify checksum.

## 3. Rollback

- Rollback image/application trước, không tự ý restore DB.
- Restore chỉ từ backup đã verify và phải thử trên staging.
- Sau rollback chạy reconciliation và đối chiếu các đơn trong cửa sổ deploy.
