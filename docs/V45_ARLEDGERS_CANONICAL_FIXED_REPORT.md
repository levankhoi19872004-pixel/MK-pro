# V45 AR Ledgers Canonical Fixed

Đã chuyển nguồn ghi/đọc công nợ chuẩn sang Mongo collection `arLedgers`.

## Thay đổi chính
- Thêm model `src/models/ArLedger.js` map collection `arLedgers`.
- Đăng ký `arLedgers` trong `src/models/index.js`.
- `paymentRepository` dùng `arLedgers` làm nguồn ghi bút toán AR.
- `posting.engine.js` không cần đổi logic nghiệp vụ, nhưng mọi `paymentRepository.upsert()` giờ ghi vào `arLedgers`.
- `financialService.syncOrderDebtCacheFromAR()` đọc từ `arLedgers`.
- `reportService.debtReport()` đọc ledger từ `arLedgers`, không đọc từ `journals`.
- Thêm index Mongo cho `arLedgers`.
- `scripts/rebuild-ar-ledger.js` rebuild vào `arLedgers`.
- Thêm auto backfill một lần từ `journals` sang `arLedgers` khi server khởi động nếu `arLedgers` đang rỗng.

## Luồng chuẩn sau sửa
- Kế toán xác nhận đơn giao → post AR-SALE vào `arLedgers`.
- Phiếu thu → post AR-RECEIPT vào `arLedgers`.
- Hàng trả đã đủ điều kiện AR → post AR-RETURN vào `arLedgers`.
- Trả thưởng/cấn trừ → post AR-BONUS/AR-DISCOUNT/AR-ALLOWANCE vào `arLedgers`.

## Lưu ý
Collection `journals` cũ không bị xóa để giữ lịch sử/audit. Muốn dựng lại công nợ chuẩn, chạy:

```bash
node scripts/rebuild-ar-ledger.js
```
