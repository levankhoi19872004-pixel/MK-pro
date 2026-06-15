# PHASE 51 — DEPLOYMENT CHECKLIST

## Trước deploy

- [ ] Backup MongoDB.
- [ ] Xác nhận `ENABLE_DMS_APP_SALE_QUOTA` đúng theo môi trường.
- [ ] Chạy `npm ci`.
- [ ] Chạy `npm test` — yêu cầu 516/516 pass.
- [ ] Chạy `npm audit --omit=dev --audit-level=high`.

## Deploy

- [ ] Deploy mã nguồn Phase 51.
- [ ] Restart Render/service.
- [ ] Kiểm tra `/mobile/sales.html` đã tải `sales.js?v=phase51-mobile-edit-posted-v1`.
- [ ] Hard refresh hoặc xóa cache App bán hàng.

## Smoke test

- [ ] Tạo đơn thử số lượng nhỏ.
- [ ] Mở tab Báo cáo và bấm Chỉnh sửa.
- [ ] Tăng số lượng: tồn + quota giảm đúng delta.
- [ ] Giảm số lượng: tồn + quota hoàn đúng delta.
- [ ] Thử vượt quota: API trả 409.
- [ ] Thử vượt tồn: API trả 409.
- [ ] Kiểm tra `stockTransactions` có `SALE_EDIT_IN/SALE_EDIT_OUT` đúng một lần.
- [ ] Kiểm tra `internalSaleAllocationLedgers` có `ORDER_EDIT_CONSUME/ORDER_EDIT_RELEASE` đúng một lần.
- [ ] Kiểm tra đơn đã gộp/kế toán xác nhận vẫn bị khóa sửa.

## Theo dõi sau deploy

- [ ] Theo dõi log `mobile_edit_sales_order` trong 24 giờ đầu.
- [ ] Kiểm tra không có quota âm.
- [ ] Kiểm tra không có tồn âm.
- [ ] Kiểm tra request lặp không tạo movement trùng.
