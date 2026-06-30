# PHASE79 — Clean AR-SALE Canonical Posting & Debt Read Model Report

## A. Tổng quan dự án

### Cấu trúc thư mục

- `src/models`: Mongoose/flex models cho `salesOrders`, `arLedgers`, `fundLedgers`, `returnOrders`, read model Phase79.
- `src/engines`: posting engine legacy, vẫn giữ compatibility export.
- `src/domain/posting`: boundary posting cũ `ArPostingService.postBatch`.
- `src/domain/ar`: contract + validator Phase79 mới.
- `src/services`: service nghiệp vụ; Phase79 thêm `arPosting.service.js`, `arDebtReadModel.service.js`.
- `src/services/master-order`: flow xác nhận kế toán đơn giao hiện tại.
- `src/services/reports`: API công nợ qua `DebtReportService`.
- `scripts`: audit/plan/rebuild/reconcile vận hành.
- `test`: test contract/idempotency/read model/API/audit.

### Tech stack

- Node.js / CommonJS.
- Express route/controller/service.
- MongoDB + Mongoose flex model.
- `node:test` + `assert`.
- MongoDB read/write scripts qua `MONGO_URI`.

### Module AR/debt liên quan

- `src/engines/posting.engine.js::postSalesOrderAR` — legacy compatibility wrapper.
- `src/services/master-order/deliveryAccountingCore.impl.js::postDeliveryArIfAccountingConfirmed` — điểm gọi khi kế toán xác nhận đơn giao.
- `src/domain/posting/ArPostingService.js::postBatch` — batch writer cũ, vẫn tồn tại cho compatibility.
- `src/services/accounting/arCustomerDebtReadModel.service.js` — read model tính động cũ từ `arLedgers`.
- `src/services/arPosting.service.js` — canonical posting service Phase79 mới.
- `src/services/arDebtReadModel.service.js` — debt read model Phase79 mới.

### Flow hiện tại trước Phase79

```text
salesOrder delivered
→ accounting confirm
→ deliveryAccountingCore.impl / posting.engine.postSalesOrderAR / ArPostingService.postBatch
→ arLedgers
→ arCustomerDebtReadModel / reportService / /api/debts
→ frontend Công nợ
```

Điểm lệch chính: posting layer cũ có nhiều đường tự dựng AR-SALE/reversal khác nhau; một số đường không bắt buộc đủ `category/ledgerType/entryType/active/idempotencyKey/sourceId/customerCode`, dẫn đến ledger confirmed nhưng không đạt contract và read model không thể tin cậy tuyệt đối.

## B. Đánh giá chất lượng hiện tại

| Mức | Nhóm lỗi | Nhận định |
|---|---|---|
| P0 | Sai số liệu công nợ | AR-SALE thiếu contract, reversed nhưng vẫn active, ACC id nhưng REV batch có thể làm read model tính sai hoặc bỏ sót. |
| P1 | Idempotency/reversal duplicate | `accountingBatchId`/timestamp được dùng trong id/code khiến retry/re-accounting dễ sinh thêm dòng nếu không khóa bằng `idempotencyKey`. |
| P2 | Schema drift/code smell | `posting.engine`, `deliveryAccountingCore`, `ArPostingService.postBatch` cùng có khả năng dựng ledger, làm contract phân tán. |

## C. Root cause

Root cause là phối hợp nhiều nguyên nhân:

- **Posting layer**: nhiều writer legacy cùng sinh AR ledger.
- **Ledger contract**: trước Phase79 không có validator canonical bắt buộc cho AR-SALE.
- **Idempotency**: id/code có timestamp hoặc batch suffix, không phải khóa idempotency ổn định.
- **Reversal flow**: reversal có nguy cơ duplicate và original ledger có thể không được đánh dấu inactive/reversed thống nhất.
- **Debt read model**: read model cũ đọc trực tiếp `arLedgers`; Phase79 tách ra read model rebuildable `arDebtOrders/arDebtCustomers` và chỉ nhận canonical ledger.
- **Dirty data**: dữ liệu bẩn phải audit/plan/rebuild/reconcile, không silently fallback theo `code /^AR-SALE-/`.

## D. Thiết kế luồng Phase79

```text
Accounting Confirm
→ src/services/arPosting.service.js::confirmSalesOrderAR()
→ buildArSaleLedger()
→ assertValidArLedgerContract()
→ upsert by idempotencyKey AR-SALE:salesOrder:<sourceId>
→ rebuildDebtForSource()
→ Debt API đọc arDebtCustomers/arDebtOrders
→ audit/reconcile gate
```

```text
Reverse AR-SALE
→ src/services/arPosting.service.js::reverseSalesOrderAR()
→ resolve active canonical AR-SALE
→ check existing AR-SALE-REVERSAL by source/original
→ buildArSaleReversalLedger()
→ assertValidArLedgerContract()
→ upsert by idempotencyKey AR-SALE-REVERSAL:salesOrder:<sourceId>:<originalLedgerId>
→ mark original active=false/reversed=true/accountingStatus=reversed
→ rebuildDebtForSource()
```

## E. File đã tạo/sửa

| File | Mục đích | Thay đổi chính |
|---|---|---|
| `src/domain/ar/arLedgerContract.js` | Builder canonical AR-SALE/reversal | `buildArSaleLedger`, `buildArSaleReversalLedger`, export validator helpers. |
| `src/domain/ar/arLedgerValidator.js` | Contract gate | Chặn thiếu field, debit/credit sai, ACC/REV mismatch, reversed-but-active, invalid idempotency. |
| `src/services/arPosting.service.js` | Posting service mới | `confirmSalesOrderAR`, `reverseSalesOrderAR`, lock theo sourceId, audit dirty ledger, upsert idempotency. |
| `src/services/arDebtReadModel.service.js` | Debt read model mới | Rebuild từ canonical `arLedgers`, `getDebtCustomers`, `getDebtOrders`, exact filter NVBH/NVGH. |
| `src/models/ArDebtOrder.js` | Read model order | Collection `arDebtOrders`. |
| `src/models/ArDebtCustomer.js` | Read model customer | Collection `arDebtCustomers`. |
| `scripts/audit-ar-ledger-contract.js` | Audit read-only | Phát hiện missing contract, duplicate, reversal issue, ACC/REV mismatch. |
| `scripts/plan-ar-clean-rebuild.js` | Plan read-only | Xuất `reports/ar-clean-rebuild-plan.json/md`, không apply. |
| `scripts/rebuild-ar-debt-read-model.js` | Rebuild read model | Rebuild `arDebtOrders/arDebtCustomers`, không sửa ledger gốc. |
| `scripts/reconcile-ar-debt-after-rebuild.js` | Reconcile gate | So canonical aggregate vs read model; fail nếu lệch. |
| `src/engines/posting.engine.js` | Compatibility wrapper | `postSalesOrderAR` chuyển sang `arPosting.service.confirmSalesOrderAR`. |
| `src/services/master-order/deliveryAccountingCore.impl.js` | Accounting confirm path | `postDeliveryArIfAccountingConfirmed` gọi service Phase79 mới. |
| `src/services/reports/DebtReportService.js` | API read model | `debtCustomers/debtCustomerDetail` đọc Phase79 read model. |
| `src/controllers/reportController.js` | API controller | Thêm handler orders endpoint. |
| `src/routes/reportRoutes.js` | API routes | Thêm `/api/debts/customers/:customerCode/orders`. |
| `package.json` | Script vận hành | Thêm script `phase79:*`. |
| `test/ar-sale-canonical-contract.test.js` | Test contract | AR-SALE/reversal contract + dirty ACC/REV. |
| `test/ar-sale-idempotency.test.js` | Test idempotency confirm | Retry không duplicate; dirty ledger không canonical. |
| `test/ar-sale-reversal-idempotency.test.js` | Test idempotency reversal | Reverse retry không duplicate; original inactive. |
| `test/ar-debt-read-model-canonical.test.js` | Test read model | Ledger bẩn không tính; aggregate khớp. |
| `test/ar-ledger-contract-audit.test.js` | Test audit | Missing contract, duplicate, reversal issue. |
| `test/debt-api-canonical-read-model.test.js` | Test API service | Filter exact `salesStaffCode=35095`, `deliveryStaffCode=ghth`. |

## F. Query MongoDB kiểm chứng

### Case B0038423

```js
db.arLedgers.find({
  $or: [
    { sourceId: "SO1782550380164673" },
    { salesOrderId: "SO1782550380164673" },
    { sourceCode: "B0038423" },
    { orderCode: "B0038423" },
    { code: /B0038423/ }
  ]
}).sort({ createdAt: 1 })
```

### AR-SALE confirmed nhưng thiếu contract

```js
db.arLedgers.find({
  account: "AR",
  accountingConfirmed: true,
  accountingStatus: "confirmed",
  code: /^AR-SALE-/,
  $or: [
    { category: { $in: [null, ""] } },
    { ledgerType: { $in: [null, ""] } },
    { entryType: { $in: [null, ""] } },
    { sourceId: { $in: [null, ""] } },
    { customerCode: { $in: [null, ""] } }
  ]
})
```

### ACC id nhưng REV batch

```js
db.arLedgers.find({
  account: "AR",
  id: /ACC-/,
  accountingBatchId: /^REV-/
})
```

### Duplicate AR-SALE active theo source

```js
db.arLedgers.aggregate([
  {
    $match: {
      account: "AR",
      category: "AR-SALE",
      accountingConfirmed: true,
      accountingStatus: "confirmed",
      active: true
    }
  },
  {
    $group: {
      _id: "$sourceId",
      count: { $sum: 1 },
      ids: { $push: "$id" },
      totalDebit: { $sum: "$debit" }
    }
  },
  { $match: { count: { $gt: 1 } } }
])
```

### Duplicate reversal

```js
db.arLedgers.aggregate([
  {
    $match: {
      account: "AR",
      category: "AR-SALE-REVERSAL",
      accountingConfirmed: true,
      accountingStatus: "confirmed"
    }
  },
  {
    $group: {
      _id: {
        sourceId: "$sourceId",
        reversedLedgerId: "$reversedLedgerId"
      },
      count: { $sum: 1 },
      ids: { $push: "$id" },
      totalCredit: { $sum: "$credit" }
    }
  },
  { $match: { count: { $gt: 1 } } }
])
```

### Ledger reversed nhưng vẫn active

```js
db.arLedgers.find({
  account: "AR",
  accountingStatus: "reversed",
  $or: [
    { active: true },
    { reversed: { $ne: true } },
    { reversalLedgerId: { $in: [null, ""] } }
  ]
})
```

### Debt read model lệch ledger

```js
db.arDebtOrders.aggregate([
  { $group: { _id: null, debit: { $sum: "$debit" }, credit: { $sum: "$credit" }, remainingDebt: { $sum: "$remainingDebt" } } }
])

db.arDebtCustomers.aggregate([
  { $group: { _id: null, debit: { $sum: "$debit" }, credit: { $sum: "$credit" }, remainingDebt: { $sum: "$remainingDebt" } } }
])
```

## G. Test results

### Test mới Phase79

```text
node --test test/ar-sale-canonical-contract.test.js \
  test/ar-sale-idempotency.test.js \
  test/ar-sale-reversal-idempotency.test.js \
  test/ar-debt-read-model-canonical.test.js \
  test/ar-ledger-contract-audit.test.js \
  test/debt-api-canonical-read-model.test.js

Result: 11/11 pass
```

### npm test

```text
npm test
Result: chưa pass gate toàn dự án trong sandbox hiện tại.
Lý do: ZIP không kèm node_modules; pretest dừng tại scripts/build-source-bundles.js vì thiếu package terser.
```

### Audit/reconcile CLI

```text
node scripts/audit-ar-ledger-contract.js --dry-run
Result: chưa chạy được trong sandbox hiện tại vì thiếu node_modules/mongoose và chưa có MONGO_URI runtime.

node scripts/reconcile-ar-debt-after-rebuild.js --dry-run
Result: chưa chạy được trong sandbox hiện tại vì thiếu node_modules/mongoose và chưa có MONGO_URI runtime.
```

## H. Tiêu chí hoàn thành

| Tiêu chí | Trạng thái |
|---|---|
| File Phase79 bắt buộc tồn tại | Đạt |
| Test mới Phase79 pass | Đạt: 11/11 |
| `npm test` toàn dự án pass | Chưa xác nhận do thiếu `node_modules/terser` trong sandbox |
| Audit DB case B0038423 | Chưa xác nhận do thiếu runtime DB/dependencies |
| Confirm retry không duplicate | Đạt trong test fake model |
| Reverse retry không duplicate | Đạt trong test fake model |
| Ledger bẩn không tính công nợ | Đạt trong test fake model |
| Debt API lọc NVBH/NVGH đúng | Đạt trong test fake model |
| Reconcile ledger vs read model | Chưa xác nhận trên DB thật |

## Kết luận

Phase79 không vá màn Công nợ.

Phase79 không fallback dữ liệu bẩn.

Phase79 chuẩn hóa AR-SALE bằng contract + idempotency + debt read model rebuildable.

Dữ liệu cũ chỉ xử lý qua audit/plan/rebuild/reconcile, không sửa tay.

Lưu ý quan trọng: bản này chưa được khẳng định hoàn thành production gate vì `npm test`, `audit --dry-run`, `reconcile --dry-run` chưa chạy được trong sandbox thiếu dependency/runtime DB. Cần chạy lại trên môi trường có `npm install` và `MONGO_URI` trước khi merge/deploy.
