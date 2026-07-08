# Phase197 - Order Payment Upsert Conflict + Debt Trace

## Mục tiêu

Sửa lỗi batch `order-payment:repair:debt` không chạy được vì MongoDB upsert conflict và bổ sung công cụ trace để phân biệt lỗi nằm ở allocation, arLedgers hay DebtNewService.

## Nguyên nhân chính

`OrderPaymentAllocationService.upsertAllocation()` đang đưa `createdAt`/`createdBy` vào cả `$set` và `$setOnInsert`. MongoDB reject với lỗi:

```txt
Updating the path 'createdBy' would create a conflict at 'createdBy'
```

Vì vậy batch dừng trước khi reconcile debt và không tạo được `AR-DEBT-ADJUSTMENT`.

## File đã sửa/thêm

| File | Nội dung |
|---|---|
| `src/services/accounting/OrderPaymentAllocationService.js` | Tách audit field insert-only: `createdAt/createdBy` chỉ nằm trong `$setOnInsert`, `updatedAt/updatedBy` nằm trong `$set`. |
| `src/services/accounting/OrderPaymentDebtReconcileService.js` | Bổ sung skip reason, không skip mù khi idempotencyKey đã tồn tại nhưng AR balance vẫn lệch. |
| `scripts/backfill-order-payment-allocations.js` | Ghi rõ `skipReason`/manual review khi debt reconcile không tạo adjustment. |
| `scripts/trace-order-payment-debt.js` | Trace 1 order từ DB → order → closeout → allocation → arLedgers → reconcile → DebtNewService. |
| `scripts/audit-debt-new-vs-ar-ledgers.js` | So sánh DebtNew với arLedgers/allocation cho 1 order. |
| `package.json` | Thêm script `order-payment:trace`, `order-payment:trace:json`, `debt-new:audit-vs-ar`, `debt-new:audit-vs-ar:json`. |

## Cách chạy sau deploy

Trace riêng đơn:

```bash
npm run order-payment:trace:json -- --order B0038734
```

Repair riêng đơn:

```bash
npm run order-payment:repair:debt -- --order B0038734 --json
```

Kiểm tra DebtNew vs AR:

```bash
npm run debt-new:audit-vs-ar:json -- --order B0038734
```

## Kỳ vọng sau sửa

- `repair:debt` không còn lỗi `createdBy` conflict.
- Nếu thiếu allocation, batch sẽ tạo allocation rồi tiếp tục reconcile debt.
- Nếu current AR balance lệch expected debt, batch tạo `AR-DEBT-ADJUSTMENT` idempotent.
- Nếu AR đã đúng nhưng DebtNew vẫn sai, trace sẽ chỉ rõ `diffDebtNewVsArLedger` để xử tiếp đúng DebtNewService/cache/filter.

## Kiểm tra đã chạy trong sandbox

```bash
npm run check:syntax
node -c src/services/accounting/OrderPaymentAllocationService.js
node -c src/services/accounting/OrderPaymentDebtReconcileService.js
node -c scripts/backfill-order-payment-allocations.js
node -c scripts/trace-order-payment-debt.js
node -c scripts/audit-debt-new-vs-ar-ledgers.js
```

Kết quả:

```txt
SYNTAX_OK 1314 JavaScript files
OK
```

Không chạy được `check:source-bundles` và các test Node phụ thuộc Mongo/Mongoose trong sandbox vì ZIP không kèm `node_modules` (`Cannot find module 'mongoose'`, `Cannot find module 'terser'`). Trên máy dự án cần chạy `npm install` trước khi chạy full test.
