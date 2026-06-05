# V45 Admin Unlock + Re-accounting AR Ledger Fixed

Đã sửa luồng mở khóa điều chỉnh đơn giao đã xác nhận kế toán theo đúng 10 bước:

1. Đơn đã xác nhận kế toán được khóa bằng accountingConfirmed/accountingLocked/editLocked.
2. Thêm nút Admin mở khóa điều chỉnh tại panel sửa đơn giao.
3. Thêm API `POST /api/master-orders/delivery-today/:id/admin-unlock`.
4. Khi mở khóa chỉ mở các trường tiền thu/trả thưởng/hàng trả/ghi chú; không đổi thông tin gốc đơn.
5. Sau khi lưu điều chỉnh, đơn chuyển `accountingStatus = needs_repost`, `needReAccounting = true`.
6. Thêm nút xác nhận lại kế toán cho đơn đang điều chỉnh.
7. Khi xác nhận lại, backend tìm AR Ledger cũ của đơn, tạo bút toán đảo `ar_reversal`, đánh dấu dòng cũ `status = reversed`.
8. Sau đó ghi lại AR Ledger mới theo đúng luồng:
   - `ar_sale`: tăng công nợ gốc theo phải thu.
   - `ar_receipt`: giảm công nợ theo tiền mặt/chuyển khoản.
   - `ar_bonus`: giảm công nợ theo trả thưởng.
   - `ar_return`: giảm công nợ theo hàng trả.
9. Có chặn mở khóa nếu đơn đã chốt quỹ/khóa ngày/khóa kỳ/quyết toán.
10. Đơn được khóa lại sau xác nhận lại kế toán, công nợ tiếp tục lấy duy nhất từ `arLedgers`.

Các file đã sửa:

- `src/services/masterOrderService.js`
- `src/controllers/masterOrderController.js`
- `src/routes/masterOrderRoutes.js`
- `public/index.html`
- `public/js/app/00-dom-state.js`
- `public/js/app/06-master-delivery.js`

Đã kiểm tra cú pháp JavaScript bằng `node --check` toàn bộ thư mục `src` và `public/js`.
