# Posting Engine Rules

## Mục tiêu

Khóa biên ghi sổ để tránh ghi trùng, lệch công nợ, lệch tồn kho và khó audit. Controller/service nghiệp vụ chỉ được gọi qua boundary đã định nghĩa, không ghi trực tiếp vào ledger model.

## AR Ledger

- Chỉ `src/engines/posting.engine.js` được ghi AR ledger nghiệp vụ.
- Service/controller không được gọi trực tiếp `ArLedger.create()`, `ArLedger.insertMany()` hoặc `ArLedger.findOneAndUpdate()` cho nghiệp vụ phát sinh.
- Mọi dòng AR phải có tối thiểu: `type`, `sourceType`, `sourceId/sourceCode`, `customerId/customerCode`, `amount`, `debit`, `credit`, `accountingStatus`, `accountingConfirmed`.
- Posting phải idempotent: cùng source không được sinh ledger trùng.
- Migration/backfill lịch sử được whitelist riêng tại `src/services/arLedgerMigrationService.js`.

## Fund Ledger

- Tạm thời chỉ `postFundLedger()` trong `src/services/fundService.js` là boundary ghi quỹ hợp lệ.
- Các nghiệp vụ thu tiền, chi tiền, chuyển quỹ phải đi qua `postFundLedger()`.
- Không gọi trực tiếp `FundLedger.create()`, `FundLedger.insertMany()`, `FundLedger.findOneAndUpdate()` hoặc `new FundLedger()` ngoài boundary đã định nghĩa.
- Mọi dòng fund ledger phải có `idempotencyKey`.
- Khóa idempotency chuẩn: `sourceType | sourceId/sourceCode | fundType | direction | account`.
- Tiền mặt và chuyển khoản cùng source được phép tạo 2 dòng riêng vì khác `fundType/account`.
- Phiếu chi luôn ghi `amount > 0`, `direction = out`; không dùng số âm để biểu diễn chi.
- Chuyển quỹ phải tạo đúng 2 dòng: quỹ nguồn `out`, quỹ đích `in`; gọi lại cùng source không được nhân đôi dòng.
- Database phải có unique sparse index `uniq_fund_ledger_idempotency_key` trên `idempotencyKey`.
- Giai đoạn sau sẽ chuyển dần các hàm quỹ vào `src/engines/posting.engine.js` để đồng nhất AR/Fund/Inventory.

## Inventory Ledger / Stock Transaction

- Tạm thời chỉ `postStockMovement()` trong `src/services/inventoryService.js` là boundary ghi kho hợp lệ.
- Service nghiệp vụ không ghi trực tiếp `StockTransaction.create()` hoặc `InventoryLegacy.create()`.
- Hiển thị tồn, kiểm tra vượt tồn, app bán hàng và import preview phải đọc từ `inventorySnapshots`.
- Giao dịch nhập/xuất/trả/điều chỉnh phải đi qua posting stock boundary, không ghi rải rác.

## Static Guard

`test/no-direct-ledger-write.test.js` sẽ fail nếu phát hiện ghi trực tiếp ledger ngoài whitelist:

- `src/engines/posting.engine.js`
- `src/services/arLedgerMigrationService.js`
- `src/services/inventoryService.js`
- `src/services/fundService.js`

Nếu cần thêm ngoại lệ, phải có lý do kiến trúc rõ ràng và test hồi quy đi kèm.
