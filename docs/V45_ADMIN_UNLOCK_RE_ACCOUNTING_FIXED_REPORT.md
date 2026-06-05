# V45 Admin Unlock & Re-accounting Fixed Report

## Mục tiêu
Sửa luồng mở khóa đơn giao đã xác nhận kế toán theo đúng nguyên tắc AR Ledger là nguồn công nợ duy nhất.

## Luồng mới
1. Đơn đã xác nhận kế toán mặc định bị khóa sửa.
2. Admin bấm **Mở khóa** và bắt buộc nhập lý do.
3. Hệ thống chỉ mở khóa dữ liệu đơn, chưa đụng vào AR Ledger.
4. Đơn chuyển sang trạng thái `needReAccounting = true`, `arStatus = needs_repost`.
5. Admin chỉ sửa tiền mặt, chuyển khoản, trả thưởng, hàng trả, ghi chú.
6. Sau khi lưu, đơn vẫn ở trạng thái chờ xác nhận lại kế toán.
7. Kế toán bấm **Xác nhận lại KT**.
8. Backend đảo toàn bộ AR Ledger cũ của đơn bằng `ar_reversal`.
9. Backend post lại AR mới: `ar_sale`, `ar_receipt`, `ar_bonus`, `ar_return`.
10. Đơn được khóa lại, `needReAccounting = false`.

## File đã sửa
- `src/services/masterOrderService.js`
- `src/controllers/masterOrderController.js`
- `src/routes/masterOrderRoutes.js`
- `src/models/ArLedger.js`
- `src/services/reportService.js`
- `public/js/app/06-master-delivery.js`
- `public/style.css`
- `docs/openapi.json`

## API mới
- `POST /api/master-orders/delivery-today/:id/admin-unlock`
- `POST /api/master-orders/delivery-today/:id/re-accounting`

## Quy tắc bảo vệ công nợ
- Không sửa trực tiếp AR Ledger cũ.
- Không xóa bút toán cũ.
- Bút toán cũ được đánh dấu `reversed = true`, `status = reversed`.
- Bút toán đảo được tạo riêng bằng `type = ar_reversal`.
- Báo cáo công nợ bỏ qua dòng đã `reversed` để tránh cộng trùng.
- AR mới có `reAccountingRunId` để truy vết.

## Kiểm tra
- Đã kiểm tra cú pháp các file JS đã sửa bằng `node -c`.
- Đã chạy `npm run docs:generate` để cập nhật OpenAPI.
- `npm test` còn lỗi môi trường do thiếu dependency `mongoose` trong node_modules của sandbox; đây không phải lỗi cú pháp phần đã sửa.
