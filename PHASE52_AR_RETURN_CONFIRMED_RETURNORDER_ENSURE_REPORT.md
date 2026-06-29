# PHASE52 - AR-RETURN từ returnOrders đã xác nhận kế toán

## 1. Tổng quan

Scope sửa được khoanh vùng đúng luồng:

```text
returnOrders confirmed
→ ensure/create AR-RETURN ledger
→ delivery accounting confirm/re-confirm
→ debt report đọc AR-RETURN active
```

Không sửa tồn kho, quỹ, import, đơn tổng, xóa đơn bán, dashboard, CSS/layout hoặc middleware auth.

## 2. Bằng chứng nguyên nhân

Evidence production cho `B0038413` cho thấy:

- `returnOrders` đã có `RO-B0038413`.
- `amount = 126601` và `debtReduction = 126601`.
- `accountingConfirmed = true`, `accountingStatus = confirmed`.
- Có đủ `orderCode = B0038413`, `orderId = SO1782550380178383`, `customerCode = 4500436`.
- `arLedgers` đã có `AR-SALE` và `AR-RECEIPT` nhưng chưa có `AR-RETURN` active.

Nguyên nhân chính: phase51 đã sửa đọc/lọc ledger và một phần repair, nhưng chưa có safety-net đủ mạnh để:

1. Quét trực tiếp `returnOrders` đã confirmed theo `orderId/orderCode/customerCode` khi `accountingReturnOrders` hydrate bị rỗng hoặc snapshot thiếu.
2. Tạo `AR-RETURN` active thật trong `arLedgers` từ `returnOrders.accountingConfirmed=true` + `debtReduction/amount > 0`.
3. Không phụ thuộc `postedAt/receivedAt`, vì dữ liệu thực tế của `RO-B0038413` đang để `postedAt=''`, `receivedAt=''`.

## 3. File đã sửa

| File | Thay đổi |
|---|---|
| `src/services/master-order/deliveryAccountingCore.impl.js` | Thêm `ensureArReturnForConfirmedReturnOrder()` và `ensureArReturnsForAccountingOrder()` |
| `src/services/master-order/deliveryAccountingCore.impl.js` | Sau nhánh post hàng trả cũ, luôn chạy safety-net ensure AR-RETURN từ `returnOrders` confirmed |
| `src/engines/posting.engine.js` | AR-RETURN mới ghi thêm `ledgerType`, `category`, `sourceType/sourceId/sourceCode` để debt report/query đọc được |
| `src/engines/posting.engine.js` | Active lookup AR-RETURN nhận cả `type`, `ledgerType`, `category`, `code /^AR-RETURN-/` |
| `scripts/backfill-ar-return-from-return-orders.js` | Backfill nhận diện AR-RETURN robust hơn, không tạo trùng |
| `scripts/repair-delivery-accounting-ar-ledgers.js` | Repair nhận diện AR-RETURN robust hơn |
| `test/phase52-ar-return-ensure-static.test.js` | Test bảo vệ fix phase52 |

## 4. Thay đổi kỹ thuật chính

### 4.1 Helper ensure AR-RETURN

Helper mới:

```js
async function ensureArReturnForConfirmedReturnOrder(returnOrder, options) {}
```

Quy tắc:

- Chỉ xử lý returnOrder confirmed hoặc `assumeConfirmed=true` khi đang ở flow confirm accounting.
- Lấy amount theo thứ tự: `debtReduction`, `amount`, `totalReturnAmount`, `totalAmount`, `returnAmount`, `items`.
- Không yêu cầu `postedAt` hoặc `receivedAt`.
- Không sinh nếu return bị cancelled/void/deleted.
- Check AR-RETURN active trước khi tạo.
- Không tạo trùng nếu đã có active AR-RETURN đúng amount.
- Nếu active amount khác expected amount thì báo mismatch, không ghi đè mù.

### 4.2 Safety-net trong xác nhận kế toán

Trong `postDeliveryCollectionsAfterAccountingConfirmed()`, sau nhánh post AR-RETURN hiện tại, hệ thống chạy thêm:

```js
await ensureArReturnsForAccountingOrder(order, hydratedReturnRows, { assumeConfirmed: true })
```

Điểm này xử lý đúng case production:

```text
returnOrders.accountingConfirmed = true
accountingStatus = confirmed
amount/debtReduction = 126601
postedAt = ''
receivedAt = ''
```

### 4.3 AR-RETURN tương thích debt report

AR-RETURN mới có thêm:

```js
type: 'ar_return'
ledgerType: 'AR-RETURN'
category: 'AR-RETURN'
sourceType/sourceId/sourceCode
credit = amount
debit = 0
```

Debt report hiện tại vẫn đọc bằng `type` regex `return`, nhưng các field mới giúp query kiểm chứng và script repair không bị lệch convention.

## 5. Kiểm chứng với B0038413

Sau deploy phase52, với dữ liệu:

```text
RO-B0038413
orderCode = B0038413
orderId = SO1782550380178383
customerCode = 4500436
amount = 126601
debtReduction = 126601
accountingConfirmed = true
accountingStatus = confirmed
```

Kỳ vọng có AR ledger active:

```text
AR-RETURN-B0038413 hoặc AR-RETURN-RO-B0038413
orderCode = B0038413
customerCode = 4500436
amount = 126601
credit = 126601
debit = 0
status không reversed/void/cancelled/deleted
```

Công nợ đúng:

```text
AR-SALE = 3.970.298
Đã thu = 3.243.000
Trả hàng = 126.601
Trả thưởng = 600.000
Còn nợ = 697 hoặc 0 theo Debt Zero Tolerance
```

## 6. Query kiểm chứng sau deploy

```js
db.arledgers.find({
  orderCode: 'B0038413',
  customerCode: '4500436',
  $or: [
    { type: 'ar_return' },
    { type: 'AR-RETURN' },
    { ledgerType: 'AR-RETURN' },
    { category: 'AR-RETURN' },
    { code: /^AR-RETURN-/ }
  ],
  status: { $nin: ['void', 'reversed', 'cancelled', 'canceled', 'deleted'] },
  reversed: { $ne: true },
  isDeleted: { $ne: true }
}).pretty()
```

## 7. Backfill/repair dữ liệu cũ

Nếu dữ liệu production đã thiếu AR-RETURN trước khi deploy phase52, cần chạy dry-run trước:

```bash
node scripts/backfill-ar-return-from-return-orders.js --order=B0038413
```

Nếu report cho thấy `would_create_ar_return`, chạy apply:

```bash
node scripts/backfill-ar-return-from-return-orders.js --order=B0038413 --apply
```

Theo ngày/NVGH:

```bash
node scripts/backfill-ar-return-from-return-orders.js --from=2026-06-29 --to=2026-06-29 --deliveryStaff=ghkx
node scripts/backfill-ar-return-from-return-orders.js --from=2026-06-29 --to=2026-06-29 --deliveryStaff=ghkx --apply
```

Luôn backup DB trước khi `--apply`.

## 8. Test đã chạy

```bash
npm run check:syntax
```

Kết quả:

```text
SYNTAX_OK 1005 JavaScript files
```

Test khoanh vùng:

```bash
node --test \
  test/phase52-ar-return-ensure-static.test.js \
  test/ar-return-debt-scoped-static.test.js \
  test/ar-return-reaccounting-idempotency-static.test.js \
  test/delivery-accounting-reconfirm-debt-scoped-static.test.js \
  test/sales-order-delete-ui-scoped-static.test.js \
  test/inventory-ledger-invariants-static.test.js
```

Kết quả: `23/23 pass`.

Không chạy full `npm test` trong sandbox vì các lần trước môi trường thiếu dependency local như `terser/read-excel-file`; khi deploy/máy dev cần chạy `npm install` rồi chạy full test.

## 9. Deploy

1. Deploy ZIP phase52.
2. Restart Render Web Service.
3. Chạy dry-run backfill cho `B0038413`.
4. Nếu dry-run đúng, chạy `--apply`.
5. Hard refresh browser nếu frontend cache.
6. Kiểm tra lại công nợ khách `4500436`.
