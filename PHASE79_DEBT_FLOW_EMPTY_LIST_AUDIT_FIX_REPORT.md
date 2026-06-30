# PHASE79 — Debt Flow Empty Customer List Audit & Scoped Fix Report

## A. Tổng quan dự án

### Cấu trúc chính

- `server.js`, `src/routes/index.js`: entrypoint và mount API.
- `src/controllers`: controller HTTP, trong đó `reportController.js` xử lý `/api/debts/*`.
- `src/services`: service nghiệp vụ; liên quan trực tiếp gồm `arPosting.service.js`, `arDebtReadModel.service.js`, `reports/DebtReportService.js`.
- `src/domain/ar`: contract/validator AR ledger Phase79.
- `src/models`: Mongoose/flex models; liên quan trực tiếp gồm `ArLedger`, `ArDebtCustomer`, `ArDebtOrder`, `SalesOrder`, `ReturnOrder`, `DebtCollection`.
- `public/js/app/debt`: frontend màn Công nợ web.
- `scripts`: audit/rebuild/reconcile AR/debt.
- `test`: static + unit tests; dự án có khoảng 374 test files.

### Tech stack

- Node.js + Express style routes.
- MongoDB/Mongoose/flexModel.
- Frontend JavaScript thuần, HTML fragments, CSS.
- Test bằng `node:test` và static contract tests.

### Collection/model liên quan công nợ

| Model | Collection thực tế trong code | Vai trò |
|---|---|---|
| `ArLedger` | `arLedgers` | SSoT công nợ AR. |
| `ArDebtCustomer` | `arDebtCustomers` | Read model tổng hợp theo khách. |
| `ArDebtOrder` | `arDebtOrders` | Read model tổng hợp theo đơn/source. |
| `SalesOrder` | `salesOrders` | Nguồn nghiệp vụ đơn bán, không được dùng để tính công nợ hiện tại. |
| `ReturnOrder` | `returnOrders` | Nguồn trả hàng, chỉ đi vào AR qua posting canonical. |
| `DebtCollection` | debt collection model | Phiếu thu chờ/xác nhận, sinh AR-RECEIPT khi hợp lệ. |

> Lưu ý quan trọng: prompt gọi `debtCustomers/debtOrders`, nhưng code Phase79 đang dùng collection thật là `arDebtCustomers/arDebtOrders`. Nếu kiểm tra Mongo bằng `db.debtCustomers.countDocuments({})` sẽ có thể ra 0 dù app đọc collection khác.

## B. Flow công nợ hiện tại trong code

### 1. Accounting Confirm → AR Posting

Flow chính hiện tại:

```text
Kế toán xác nhận đơn giao
→ deliveryAccountingCore.impl.js::postDeliveryArIfAccountingConfirmed()
→ cleanArPostingService.confirmSalesOrderAR()
→ src/services/arPosting.service.js
→ buildArSaleLedger()
→ assertValidArLedgerContract()
→ upsert theo idempotencyKey AR-SALE:salesOrder:<sourceId>
→ rebuildDebtForSource()
→ arDebtOrders / arDebtCustomers
```

Điểm tốt:

- `posting.engine.postSalesOrderAR()` đã là wrapper compatibility, không còn tự dựng AR-SALE thiếu contract.
- `postDeliveryArIfAccountingConfirmed()` đã gọi `cleanArPostingService.confirmSalesOrderAR()`.
- `confirmSalesOrderAR()` có idempotency theo `AR-SALE:salesOrder:<sourceId>`, audit ledger bẩn và không dùng ledger bẩn làm canonical.

Điểm còn rủi ro:

- `postDeliveryArLedgerRowsAfterReAccounting()` vẫn còn nhánh cũ dùng `makeArBaseRow()` + `paymentRepository.upsert()`. Nhánh này có thể sinh ledger re-accounting không đủ `sourceType/sourceId/sourceCode/idempotencyKey` nếu được gọi trong luồng admin re-accounting. Đây là P1/P2 cần xử lý ở phase tiếp theo, nhưng không phải nguyên nhân trực tiếp của ảnh nếu đơn đi qua luồng confirm chuẩn.

### 2. Debt Read Model

Flow đọc mới:

```text
arLedgers canonical
→ arDebtReadModel.service.groupCanonicalLedgers()
→ arDebtOrders
→ arDebtCustomers
```

Read model chỉ nhận ledger thỏa điều kiện:

```text
account = AR
accountingConfirmed = true
accountingStatus = confirmed
active = true
reversed != true
category thuộc nhóm AR debt canonical
pass isCanonicalArDebtLedger()
```

Ledger thiếu contract không được fallback để tính công nợ.

### 3. Debt API

Routes:

```text
GET /api/debts/customers
GET /api/debts/customers/:customerCode/orders
GET /api/debts/customer-detail/:customerCode?
GET /api/debts
```

Mount path:

```text
src/routes/index.js
→ app.use('/api', reportRoutes)
→ src/routes/reportRoutes.js
→ src/controllers/reportController.js
→ src/services/reports/DebtReportService.js
→ phase79ArDebtReadModel.getDebtCustomers/getDebtOrders
```

### 4. Frontend Công nợ

Frontend liên quan:

```text
public/fragments/index/03-index-body.html
public/js/app/debt/07a-debt-core.js
public/js/app/state/00b-debt-return-fund-state.js
```

Trước khi sửa:

```js
/api/debts/customers?salesman=<...>&delivery=<...>&status=<...>
```

Sau khi sửa:

```js
/api/debts/customers?salesStaffCode=<...>&deliveryStaffCode=<...>&status=open&page=1&limit=50
```

## C. Điểm lệch gây danh sách công nợ rỗng

Có 4 điểm lệch trực tiếp/khả nghi:

### P0. Read model có thể chưa được rebuild sau khi deploy Phase79

`getDebtCustomers()` chỉ đọc `arDebtCustomers`. Nếu collection này chưa được build từ `arLedgers`, màn hình sẽ trả 0 khách dù `arLedgers` có dữ liệu đúng. Đây là nguyên nhân có xác suất cao nhất với ảnh thực tế.

Cần chạy:

```bash
node scripts/rebuild-ar-debt-read-model.js --all
node scripts/reconcile-ar-debt-after-rebuild.js --all
```

Không sửa `arLedgers`, chỉ rebuild projection/read model.

### P0. API customer endpoint không trả `arDebtOrders`, trong khi frontend cần order rows để merge chi tiết

Trước khi sửa, `getDebtCustomers()` trả:

```js
customers: page.rows,
customerSummary: page.rows,
debts: page.rows,
orders: []
```

Frontend lại lấy:

```js
const ledger = Array.isArray(json.orders) ? json.orders : ...
```

Vì `json.orders` là mảng rỗng, frontend không có order rows để gắn vào khách. Danh sách khách vẫn có thể hiện nếu `customerSummary` có dữ liệu, nhưng chi tiết đơn nợ sẽ rỗng. Đây là lỗi data contract giữa API và frontend.

Đã sửa: `/api/debts/customers` giờ trả thêm `orders` đọc từ `arDebtOrders` theo cùng filter và cùng tập khách đang hiển thị.

### P1. Filter NVGH/NVBH đang so sánh phân biệt hoa/thường

Trước khi sửa:

```js
clean(row.deliveryStaffCode) === delivery
```

Nếu DB lưu `GHTH` nhưng UI gửi `ghth`, API trả 0. Đây khớp trực tiếp với yêu cầu kiểm tra `ghth` vs `GHTH`.

Đã sửa: vẫn lọc theo mã, không OR tên, nhưng so sánh mã bằng normalized lowercase.

### P1. Frontend gửi alias `salesman`/`delivery` thay vì contract API `salesStaffCode`/`deliveryStaffCode`

Backend có hỗ trợ alias, nhưng API contract nên rõ ràng. Nếu controller/service tương lai bỏ alias, màn hình lại rỗng.

Đã sửa frontend gửi đúng field canonical.

## D. Root cause chính

Kết luận kỹ thuật:

```text
Không có bằng chứng lỗi nằm ở việc render ép frontend.
Lỗi nằm ở tầng read model/API/filter contract:
1. Production có khả năng chưa rebuild arDebtCustomers/arDebtOrders sau khi chuyển sang Phase79.
2. API /api/debts/customers thiếu order rows nên frontend không có dữ liệu chi tiết đơn.
3. Filter deliveryStaffCode so sánh exact case-sensitive, có thể làm mất dữ liệu ghth/GHTH.
4. Frontend còn gửi alias delivery/salesman thay vì field canonical.
```

## E. File đã kiểm tra

Backend:

- `src/services/arPosting.service.js`
- `src/services/arDebtReadModel.service.js`
- `src/domain/ar/arLedgerContract.js`
- `src/domain/ar/arLedgerValidator.js`
- `src/engines/posting.engine.js`
- `src/services/master-order/deliveryAccountingCore.impl.js`
- `src/services/reports/DebtReportService.js`
- `src/controllers/reportController.js`
- `src/routes/reportRoutes.js`
- `src/routes/index.js`
- `src/models/ArLedger.js`
- `src/models/ArDebtCustomer.js`
- `src/models/ArDebtOrder.js`

Frontend:

- `public/fragments/index/03-index-body.html`
- `public/js/app/debt/07a-debt-core.js`
- `public/js/app/state/00b-debt-return-fund-state.js`

Scripts/tests:

- `scripts/rebuild-ar-debt-read-model.js`
- `scripts/reconcile-ar-debt-after-rebuild.js`
- `scripts/audit-ar-ledger-contract.js`
- `test/debt-api-canonical-read-model.test.js`
- `test/debt-ui-status-filter-static.test.js`

## F. File đã sửa

| File | Mục đích | Thay đổi chính |
|---|---|---|
| `src/services/arDebtReadModel.service.js` | Sửa API contract và filter read model | `getDebtCustomers()` trả thêm `orders` từ `arDebtOrders`; summary có `orderDebtCount/orderCount/readModelEmpty`; so sánh staff code không phân biệt hoa/thường nhưng vẫn code-only. |
| `public/js/app/debt/07a-debt-core.js` | Chuẩn hóa request frontend | Gửi `salesStaffCode`, `deliveryStaffCode`; luôn gửi `status=open` nếu chọn mặc định Khách còn nợ; vẫn không bắt buộc nhập q nếu có NVBH/NVGH. |
| `public/fragments/index/03-index-body.html` | Chuẩn hóa status UI | Option “Khách còn nợ” dùng `value="open"` thay vì rỗng. |
| `test/debt-api-canonical-read-model.test.js` | Khóa lỗi API/filter | Thêm test `GHTH` trong read model + filter `ghth` vẫn trả khách và đơn. |
| `test/debt-ui-status-filter-static.test.js` | Khóa lỗi frontend params | Thêm static test frontend gửi canonical params và không bắt buộc q khi có NVGH. |

## G. Query MongoDB kiểm chứng production/staging

### 1. Kiểm tra đúng collection read model Phase79

```js
db.arDebtCustomers.countDocuments({})
db.arDebtOrders.countDocuments({})

db.arDebtCustomers.find({}).limit(5)
db.arDebtOrders.find({}).limit(5)
```

Nếu bạn đang kiểm tra theo tên cũ thì thêm query này để tránh nhầm collection:

```js
db.debtCustomers.countDocuments({})
db.debtOrders.countDocuments({})
```

### 2. Kiểm tra theo NVGH `ghth/GHTH`

```js
db.arDebtCustomers.find({ deliveryStaffCode: { $in: ['ghth', 'GHTH'] } }).limit(20)
db.arDebtOrders.find({ deliveryStaffCode: { $in: ['ghth', 'GHTH'] } }).limit(20)
```

### 3. Kiểm tra khách còn nợ

```js
db.arDebtCustomers.find({ remainingDebt: { $gt: 1000 } }).sort({ remainingDebt: -1 }).limit(20)
db.arDebtOrders.find({ remainingDebt: { $gt: 1000 } }).sort({ remainingDebt: -1 }).limit(20)
```

### 4. Kiểm tra canonical arLedgers có dữ liệu không

```js
db.arLedgers.find({
  account: 'AR',
  accountingConfirmed: true,
  accountingStatus: 'confirmed',
  active: true,
  reversed: { $ne: true },
  category: {
    $in: [
      'AR-SALE',
      'AR-SALE-REVERSAL',
      'AR-RETURN',
      'AR-RETURN-REVERSAL',
      'AR-RECEIPT',
      'AR-BONUS',
      'AR-ALLOWANCE',
      'AR-ADJUSTMENT'
    ]
  }
}).limit(20)
```

### 5. Kiểm tra AR-SALE theo NVGH `ghth/GHTH`

```js
db.arLedgers.find({
  account: 'AR',
  category: 'AR-SALE',
  accountingConfirmed: true,
  accountingStatus: 'confirmed',
  active: true,
  reversed: { $ne: true },
  deliveryStaffCode: { $in: ['ghth', 'GHTH'] }
}).limit(20)
```

### 6. Kiểm tra ledger bị loại vì thiếu contract

```js
db.arLedgers.find({
  account: 'AR',
  accountingConfirmed: true,
  accountingStatus: 'confirmed',
  $or: [
    { category: { $in: [null, ''] } },
    { ledgerType: { $in: [null, ''] } },
    { entryType: { $in: [null, ''] } },
    { sourceId: { $in: [null, ''] } },
    { customerCode: { $in: [null, ''] } },
    { idempotencyKey: { $in: [null, ''] } }
  ]
}).limit(50)
```

### 7. Case B0038423 / Chị Hương

```js
db.arLedgers.find({
  $or: [
    { sourceId: 'SO1782550380164673' },
    { salesOrderId: 'SO1782550380164673' },
    { sourceCode: 'B0038423' },
    { orderCode: 'B0038423' },
    { code: /B0038423/ },
    { customerCode: '4501221' }
  ]
}).sort({ createdAt: 1 })

db.arDebtOrders.find({
  $or: [
    { sourceId: 'SO1782550380164673' },
    { sourceCode: 'B0038423' },
    { customerCode: '4501221' }
  ]
})

db.arDebtCustomers.find({ customerCode: '4501221' })
```

### 8. Aggregate canonical ledger so với read model

```js
db.arLedgers.aggregate([
  {
    $match: {
      account: 'AR',
      accountingConfirmed: true,
      accountingStatus: 'confirmed',
      active: true,
      reversed: { $ne: true },
      customerCode: { $type: 'string', $gt: '' },
      category: {
        $in: [
          'AR-SALE',
          'AR-SALE-REVERSAL',
          'AR-RETURN',
          'AR-RETURN-REVERSAL',
          'AR-RECEIPT',
          'AR-BONUS',
          'AR-ALLOWANCE',
          'AR-ADJUSTMENT'
        ]
      }
    }
  },
  {
    $group: {
      _id: '$customerCode',
      customerName: { $first: '$customerName' },
      debit: { $sum: '$debit' },
      credit: { $sum: '$credit' },
      remainingDebt: { $sum: { $subtract: ['$debit', '$credit'] } },
      count: { $sum: 1 }
    }
  },
  { $match: { remainingDebt: { $gt: 1000 } } },
  { $sort: { remainingDebt: -1 } },
  { $limit: 20 }
])
```

## H. API/curl kiểm chứng

Sau khi deploy và rebuild read model:

```bash
curl "http://localhost:PORT/api/debts/customers?deliveryStaffCode=ghth&status=open&page=1&limit=20"
curl "http://localhost:PORT/api/debts/customers?deliveryStaffCode=GHTH&status=open&page=1&limit=20"
curl "http://localhost:PORT/api/debts/customers?salesStaffCode=35095&status=open&page=1&limit=20"
curl "http://localhost:PORT/api/debts/customers?page=1&limit=20&status=open"
```

Kỳ vọng response:

```js
{
  ok: true,
  customers: [...],
  customerSummary: [...],
  orders: [...],
  summary: {
    customerDebtCount: <n>,
    orderDebtCount: <n>,
    readModelEmpty: false,
    usesSnapshot: false
  },
  debugSource: {
    readModel: 'arDebtReadModel.service',
    usesSnapshot: false
  }
}
```

Nếu `readModelEmpty: true`, cần chạy rebuild read model, không sửa frontend.

## I. Test results

### Đã chạy pass

```bash
node --test \
  test/debt-api-canonical-read-model.test.js \
  test/ar-debt-read-model-canonical.test.js \
  test/debt-ui-status-filter-static.test.js \
  test/ar-sale-canonical-contract.test.js \
  test/ar-sale-idempotency.test.js \
  test/ar-sale-reversal-idempotency.test.js \
  test/ar-ledger-contract-audit.test.js \
  test/docs-generate.test.js \
  test/phase78-release-candidate-static-contract.test.js
```

Kết quả:

```text
22/22 pass
```

Syntax check:

```bash
node scripts/check-js-syntax.js
```

Kết quả:

```text
SYNTAX_OK 1086 JavaScript files
```

### Chưa chạy được toàn bộ `npm test` trong sandbox

`npm test` dừng ở pretest vì ZIP không kèm `node_modules`:

```text
Error: Cannot find module 'terser'
Require stack:
- scripts/build-source-bundles.js
```

### Chưa chạy được DB scripts trong sandbox

```bash
node scripts/audit-ar-ledger-contract.js --dry-run --markdown
node scripts/reconcile-ar-debt-after-rebuild.js --dry-run --all
```

Lỗi môi trường:

```text
Cannot find module 'mongoose'
```

Cần chạy trên máy local/server sau `npm install` và có `MONGO_URI`.

## J. Hướng dẫn chạy rebuild/reconcile

Trên local/staging có `.env` đúng:

```bash
npm install
node scripts/audit-ar-ledger-contract.js --dry-run --markdown
node scripts/rebuild-ar-debt-read-model.js --dry-run --all
node scripts/reconcile-ar-debt-after-rebuild.js --dry-run --all
```

Nếu dry-run ổn:

```bash
node scripts/rebuild-ar-debt-read-model.js --all
node scripts/reconcile-ar-debt-after-rebuild.js --all
```

Sau đó reload màn Công nợ với filter:

```text
deliveryStaffCode = ghth
status = open / Khách còn nợ
```

## K. Rủi ro còn lại

| Mức | Rủi ro | Hướng xử lý |
|---|---|---|
| P0 | Production chưa rebuild `arDebtCustomers/arDebtOrders` nên màn vẫn 0 | Chạy rebuild/reconcile như mục J. |
| P0 | `arLedgers` production phần lớn là ledger bẩn thiếu contract nên bị validator loại | Chạy audit, tạo repair plan; không fallback regex. |
| P1 | Nhánh `postDeliveryArLedgerRowsAfterReAccounting()` vẫn còn sinh ledger bằng hàm cũ | Phase tiếp theo nên strangler nhánh re-accounting sang `arPosting.service`. |
| P1 | Reversal/receipt/return cũ có thể thiếu source identity, làm aggregate theo đơn lệch | Dùng audit/reconcile để khoanh vùng trước khi sửa. |
| P2 | Tên collection prompt/DB operator dễ nhầm `debtCustomers` với `arDebtCustomers` | Tài liệu vận hành cần ghi rõ collection read model Phase79. |

## L. Kết luận

Luồng Công nợ hiện tại rỗng nhiều khả năng không phải do render UI, mà do read model/API/filter contract:

- Cần kiểm tra và rebuild đúng collection `arDebtCustomers/arDebtOrders`.
- API `/api/debts/customers` trước đó chưa trả order rows cho frontend, đã sửa.
- Filter `deliveryStaffCode=ghth` trước đó có rủi ro lệch hoa/thường với `GHTH`, đã sửa theo hướng code-only normalized compare.
- Frontend trước đó gửi alias `delivery/salesman`, đã đổi sang `deliveryStaffCode/salesStaffCode`.

Phase này không tính công nợ từ `salesOrders`, không fallback ledger bẩn, không sửa tay production data, không vá ép frontend. Dữ liệu cũ phải đi qua audit → plan → rebuild read model → reconcile.
