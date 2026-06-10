# Posting Engine Rules

## Mục tiêu

Khóa biên ghi sổ để tránh ghi trùng, lệch công nợ, lệch tồn kho và khó audit. Controller/service nghiệp vụ chỉ được gọi qua `src/core/posting/posting.engine.js`, không ghi trực tiếp vào ledger model.

Luồng chuẩn:

```text
Controller / Application Service
        ↓
Business command / event
        ↓
src/core/posting/posting.engine.js
        ↓
AR Ledger / Stock Transactions / Fund Ledger / Audit Log
```

## Boundary hợp lệ

| Ledger | Boundary được phép ghi | Trạng thái |
|---|---|---|
| AR Ledger | `src/core/posting/posting.engine.js` gọi qua legacy `src/engines/posting.engine.js` | Facade chuẩn |
| Inventory Ledger | `src/core/posting/posting.engine.js` gọi `src/services/inventoryService.js` | Boundary tạm |
| Fund Ledger | `src/core/posting/posting.engine.js` gọi `src/services/fundService.js` | Boundary tạm |
| Migration lịch sử | `src/services/arLedgerMigrationService.js` | Có kiểm soát |
| Repository nội bộ | `src/repositories/*` | Chỉ phục vụ boundary |

Các service nghiệp vụ như delivery, sales, return, master-order-accounting, mobile không được gọi legacy posting engine trực tiếp. Phải gọi facade mới:

```js
const postingEngine = require('../core/posting/posting.engine');

await postingEngine.postSale(order, context);
await postingEngine.postReturn(returnOrder, context);
await postingEngine.postReceipt(receipt, context);
await postingEngine.postCancelOrder(order, context);
```

## API chuẩn của Posting Engine

- `postSale(order, context)`
- `postReturn(returnOrder, context)`
- `postReceipt(receipt, context)`
- `postCancelOrder(order, context)`
- `postInventoryMovement(movement, context)`
- `postInventorySale(order, context)`
- `postInventoryReturn(returnOrder, context)`
- `postInventoryImport(importDoc, context)`
- `postInventoryAdjustment(adjustment, context)`
- `postBulkInventoryMovements(movements, context)`
- `postBulkSalesAR(orders, context)`
- `postFundReceipt(receipt, context)`
- `postExpense(expense, context)`
- `postFundTransfer(transfer, context)`

## Idempotency key chuẩn

Mọi posting phải có khóa chống ghi trùng:

- `SALE:{orderId}:AR-SALE`
- `RETURN:{returnOrderId}:AR-RETURN`
- `RECEIPT:{receiptId}:AR-RECEIPT`
- `INVENTORY:{sourceId}:{productCode}:SALE`
- `FUND:{sourceId}:{fundType}:{direction}:{account}`

Bấm xác nhận kế toán hoặc xác nhận giao hàng nhiều lần không được sinh ledger trùng.

## AR Ledger

- Service/controller không được gọi trực tiếp `ArLedger.create()`, `ArLedger.insertMany()` hoặc `ArLedger.findOneAndUpdate()` cho nghiệp vụ phát sinh.
- Mọi dòng AR phải có tối thiểu: `type`, `sourceType`, `sourceId/sourceCode`, `customerId/customerCode`, `amount`, `debit`, `credit`, `accountingStatus`, `accountingConfirmed`.
- AR-SALE chỉ post đúng đơn con thuộc master hiện tại.
- AR-RETURN lấy từ `returnOrders`, không lấy từ field tạm trên sales order.
- AR-RECEIPT phải có receipt/allocations rõ ràng, không ghi tổng tiền rồi suy luận sau.

## Fund Ledger

- Module nghiệp vụ gọi `postingEngine.postFundReceipt()`, `postingEngine.postExpense()`, `postingEngine.postFundTransfer()`.
- `src/services/fundService.js` còn là boundary thấp tầng tạm thời, không gọi trực tiếp từ service nghiệp vụ mới.
- Không gọi trực tiếp `FundLedger.create()`, `FundLedger.insertMany()`, `FundLedger.findOneAndUpdate()` hoặc `new FundLedger()` ngoài boundary.
- Tiền mặt và chuyển khoản cùng source được phép tạo 2 dòng riêng vì khác `fundType/account`.
- Phiếu chi luôn ghi `amount > 0`, `direction = out`.
- Chuyển quỹ phải tạo đúng 2 dòng: quỹ nguồn `out`, quỹ đích `in`.

## Inventory Ledger / Stock Transaction

- Module nghiệp vụ gọi `postingEngine.postInventorySale()`, `postInventoryReturn()`, `postInventoryImport()`, `postInventoryAdjustment()` hoặc `postInventoryMovement()`.
- `src/services/inventoryService.js` còn là boundary thấp tầng tạm thời.
- Service nghiệp vụ không ghi trực tiếp `StockTransaction.create()` hoặc `InventoryLegacy.create()`.
- Nguồn thật của tồn kho là `stockTransactions`.
- `inventorySnapshots` chỉ là cache/read model, có thể rebuild lại từ ledger.

## Audit

Posting Engine tự ghi event audit mềm qua `eventLogService.recordEvent()` với các event:

- `POST_AR_SALE`
- `POST_AR_RETURN`
- `POST_AR_RECEIPT`
- `POST_AR_SALE_REVERSAL`
- `POST_INVENTORY_MOVEMENT`
- `POST_FUND_LEDGER`

Audit cần lưu source, ledgerId, amount, user và idempotencyKey để debug/rebuild/rollback mềm.

## Static Guard

`test/no-direct-ledger-write.test.js` và `test/test-ledger-write-boundary.test.js` sẽ fail nếu phát hiện ghi trực tiếp ledger ngoài whitelist.

Nếu cần thêm ngoại lệ, phải có lý do kiến trúc rõ ràng và test hồi quy đi kèm.
