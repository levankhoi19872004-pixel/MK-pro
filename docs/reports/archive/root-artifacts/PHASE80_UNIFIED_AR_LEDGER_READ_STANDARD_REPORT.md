# PHASE80 — Unified AR Ledger Data Access Standard Report

## A. Tổng quan dự án

- Nền tảng: Node.js/Express monolith, MongoDB/Mongoose, frontend JavaScript thuần trong `public/js`, static fragments trong `public/fragments`.
- Cấu trúc chính:
  - `src/domain/ar`: contract/validator/policy AR ledger.
  - `src/services`: service nghiệp vụ và read model.
  - `src/services/reports`: báo cáo.
  - `src/controllers` + `src/routes`: API.
  - `public/js/app/debt`: frontend màn Công nợ.
  - `scripts`: audit/rebuild/reconcile.
  - `test`: static/unit contract tests.
- Collection liên quan:
  - `arLedgers`: SSoT công nợ.
  - `arDebtCustomers`: read model khách công nợ.
  - `arDebtOrders`: read model đơn công nợ.
  - `salesOrders`, `returnOrders`, `debtCollections`: nguồn nghiệp vụ/phiếu thu, không phải nguồn tính số dư công nợ cuối cùng.

## B. Flow AR/debt hiện tại

Trước Phase80, Phase79 đã có canonical posting + debt read model nhưng vẫn còn nhiều nơi có thể tự hiểu AR/debt theo cách riêng:

```text
Accounting Confirm
→ arPosting.service
→ canonical arLedgers
→ arDebtReadModel.service
→ /api/debts/customers
→ frontend Công nợ
```

Phase80 chuẩn hóa thêm lớp đọc chung:

```text
canonical arLedgers
→ arLedgerRead.service
→ arDebtReadModel.service / aggregate chuẩn
→ API chuẩn
→ frontend/report/mobile/dashboard
→ reconcile/audit
```

## C. Danh sách nơi đọc AR/debt sai chuẩn

Đã tạo `scripts/audit-ar-read-standard.js` để quét các dấu hiệu:

- `ArLedger.find/aggregate/findOne/countDocuments` ngoài read layer.
- `paymentRepository.findAll` có nguy cơ bypass read standard.
- Tính công nợ từ `totalAmount - paidAmount`.
- Regex fallback `code /^AR-SALE-/`.
- Dùng lẫn tên read model `debtCustomers/debtOrders`.
- Filter staff theo name thay vì code.

Kết quả audit hiện tại sau khi Phase80 sửa P0:

```text
P0: 0
P1: 120
P2: 273
P3 legacy compatibility: 235
Total: 628
```

P1/P2 phần lớn là vùng legacy, source bundle, tài liệu, import/export hoặc compatibility path. Không còn P0 active liên quan tính công nợ bằng `salesOrders`/regex AR-SALE trong đường Phase80.

## D. Root cause gây phân mảnh số liệu

Root cause chính không chỉ nằm ở màn Công nợ, mà ở kiến trúc đọc dữ liệu:

1. Nhiều module từng đọc trực tiếp `arLedgers` hoặc qua report legacy.
2. Có service cũ suy diễn debit/credit từ `amount/type` thay vì contract canonical.
3. Một số flow dùng `debtAmount`, `paidAmount`, `totalAmount` của đơn bán làm dữ liệu hiển thị/kiểm tra.
4. Frontend/API có nhiều alias: `salesman`, `delivery`, `salesStaffCode`, `deliveryStaffCode`.
5. Read model Phase79 đã đúng hướng nhưng chưa có read policy trung tâm để mọi module dùng chung.

## E. Thiết kế chuẩn AR Ledger Read Layer

### File mới

```text
src/domain/ar/arLedgerQueryPolicy.js
src/services/arLedgerRead.service.js
```

### Contract đọc canonical

Mọi truy vấn AR chuẩn phải đi qua:

```js
arLedgerRead.service.getCanonicalArLedgers(filters)
arLedgerRead.service.aggregateDebtByCustomer(filters)
arLedgerRead.service.aggregateDebtByOrder(filters)
arLedgerRead.service.aggregateDebtByStaff(filters)
```

Quy định:

- Chỉ `account: 'AR'`.
- Chỉ `accountingConfirmed: true`.
- Chỉ `accountingStatus: 'confirmed'`.
- Chỉ `active: true`.
- Loại `reversed: true`.
- Chỉ category thuộc danh sách AR debt hợp lệ.
- Phải pass `isCanonicalArDebtLedger()`.
- Không nhận diện ledger bằng regex `code`.
- Không tính từ `salesOrders`.
- Số dư duy nhất: `signedAmount = debit - credit`.
- `open = remainingDebt > DEBT_ZERO_TOLERANCE`.
- NVBH lọc bằng `salesStaffCode`.
- NVGH lọc bằng `deliveryStaffCode`.
- Không OR tên staff khi đã có mã.

## F. File đã tạo/sửa

| File | Mục đích | Thay đổi chính |
|---|---|---|
| `src/domain/ar/arLedgerQueryPolicy.js` | Policy chuẩn hóa query/filter/status | `buildCanonicalArLedgerMatch`, `normalizeArDebtFilters`, `normalizeDebtStatus`, `getSignedArAmount` |
| `src/services/arLedgerRead.service.js` | Cổng đọc AR duy nhất | canonical filter, validator, aggregate by customer/order/staff |
| `src/services/arDebtReadModel.service.js` | Read model debt | Load ledger qua `arLedgerRead.service` thay vì tự query AR |
| `src/controllers/reportController.js` | API contract | Thêm response shape chuẩn `success/data/customers/orders/summary/pagination/diagnostics` đồng thời giữ compatibility flat fields |
| `public/js/app/debt/07a-debt-core.js` | Frontend data binding | Đọc `json.data.customers/orders`, vẫn fallback legacy; gửi `status=open` mặc định |
| `src/services/reports/DebtReportService.js` | Báo cáo debt | Period/detail report lấy canonical rows qua `arLedgerRead.service`, debit/credit only |
| `src/services/DebtReadService.js` | Thu nợ/mobile debt check | Load order debt rows qua `arLedgerRead.service`, không query `ArLedger.find` trực tiếp |
| `src/services/dashboard/DebtDashboardQuery.js` | Dashboard debt | Aggregate current debt qua `arLedgerRead.service.aggregateDebtByStaff` |
| `src/engines/posting.engine.js` | Legacy posting wrapper | `reverseSalesOrderAR` redirect sang `arPosting.service.reverseSalesOrderAR`, không tính từ total/paid tại engine |
| `scripts/audit-ar-read-standard.js` | Static audit | Quét direct AR read, salesOrders debt math, regex fallback, alias drift |
| `test/ar-ledger-read-standard.test.js` | Test read layer | Khóa canonical match, filter, aggregate debit-credit |
| `test/no-legacy-ar-debt-read.test.js` | Static guard | Chặn direct AR read/regex/salesOrders debt math ở vùng nguy hiểm |
| `test/ar-debt-api-standard.test.js` | API/frontend contract | Khóa shape `data.customers/data.orders` và `status=open` |

## G. API contract chuẩn

Endpoint giữ nguyên để không phá UI:

```text
GET /api/debts/customers
GET /api/debts/customers/:customerCode/orders
```

Response chuẩn:

```js
{
  ok: true,
  success: true,
  data: {
    customers: [],
    orders: [],
    summary: {},
    pagination: { page, limit, total, hasMore },
    diagnostics: {
      source,
      readModel,
      readModelCollections,
      usesSnapshot,
      readModelEmpty
    }
  },

  // Compatibility fields còn giữ tạm:
  customers: [],
  orders: [],
  customerSummary: [],
  debts: [],
  summary: {}
}
```

Filter chuẩn:

```text
q
salesStaffCode
deliveryStaffCode
status = open | closed | all | overdue | overpaid
page
limit
```

## H. Frontend contract chuẩn

- Không gửi label tiếng Việt làm status.
- Nếu status rỗng thì gửi `open`.
- Gửi `salesStaffCode`, `deliveryStaffCode`.
- Đọc `json.data.orders/json.data.customers` trước, fallback legacy sau.
- Không tự ép khách hiện nếu API không trả.
- Không sửa HTML snapshot Phase80; chỉ sửa JS behavior.

## I. Query MongoDB kiểm chứng

### arDebtCustomers/arDebtOrders có dữ liệu

```js
db.arDebtCustomers.countDocuments({})
db.arDebtOrders.countDocuments({})
db.arDebtCustomers.find({}).limit(5)
db.arDebtOrders.find({}).limit(5)
```

### Aggregate canonical arLedgers theo customer

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
          'AR-SALE', 'AR-SALE-REVERSAL', 'AR-RETURN', 'AR-RETURN-REVERSAL',
          'AR-RECEIPT', 'AR-BONUS', 'AR-ALLOWANCE', 'AR-ADJUSTMENT'
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

### So sánh ledger với read model

```js
db.arDebtCustomers.find({ remainingDebt: { $gt: 1000 } }).sort({ remainingDebt: -1 }).limit(20)
db.arDebtOrders.find({ remainingDebt: { $gt: 1000 } }).sort({ remainingDebt: -1 }).limit(20)
```

### Filter NVGH/NVBH

```js
db.arDebtCustomers.find({ deliveryStaffCode: { $in: ['ghth', 'GHTH'] }, remainingDebt: { $gt: 1000 } }).limit(20)
db.arDebtOrders.find({ deliveryStaffCode: { $in: ['ghth', 'GHTH'] }, remainingDebt: { $gt: 1000 } }).limit(20)
db.arDebtCustomers.find({ salesStaffCode: '35095', remainingDebt: { $gt: 1000 } }).limit(20)
db.arDebtOrders.find({ salesStaffCode: '35095', remainingDebt: { $gt: 1000 } }).limit(20)
```

### Case B0038423/4501221

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

### Dirty ledger bị loại

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

## J. Test results

Đã chạy được trong sandbox:

```text
node --test test/ar-ledger-read-standard.test.js \
  test/no-legacy-ar-debt-read.test.js \
  test/ar-debt-api-standard.test.js \
  test/ar-debt-read-model-canonical.test.js \
  test/debt-api-canonical-read-model.test.js \
  test/debt-ui-status-filter-static.test.js \
  test/docs-generate.test.js \
  test/phase78-release-candidate-static-contract.test.js

Result: 24/24 pass
```

Syntax check:

```text
node scripts/check-js-syntax.js
SYNTAX_OK 1092 JavaScript files
```

Snapshot hash check:

```text
node --test test/phase79-production-strangler.test.js
- assembled index page snapshot: pass
- CSS cascade/source-size: pass
- 2 facade tests không chạy được do thiếu module mongoose trong sandbox
```

`npm test` toàn dự án chưa chạy được trong sandbox vì ZIP không kèm `node_modules`:

```text
Error: Cannot find module 'terser'
Require stack: scripts/build-source-bundles.js
```

Các script DB chưa chạy được trong sandbox vì thiếu `mongoose` và không có runtime DB thật.

## K. Rủi ro còn lại

- Audit vẫn còn P1/P2/P3 legacy compatibility; cần migrate dần, không nên xóa hàng loạt trong một phase.
- `DebtReadService.loadOrderDebtRows()` hiện đã đi qua read service nhưng có thể cần tối ưu thêm query theo nhiều order keys nếu khối lượng lớn.
- Read model production vẫn cần chạy rebuild/reconcile sau deploy.
- Nếu production có nhiều ledger bẩn, số liệu chuẩn có thể khác số liệu legacy từng hiển thị.

## L. Kế hoạch migrate legacy

1. Chạy audit Phase80 trên codebase thật.
2. Chạy audit ledger contract.
3. Rebuild dry-run read model.
4. Reconcile dry-run.
5. Chạy rebuild thật trên staging/production sau backup.
6. Chuyển tiếp các báo cáo legacy còn P1/P2 sang `arLedgerRead.service` theo từng nhóm.
7. Khi P0/P1 audit sạch, mới cân nhắc unique index cho idempotency/reversal.

## Kết luận bắt buộc

- AR ledger là SSoT công nợ duy nhất.
- Tất cả module phải lấy số liệu AR qua `arLedgerRead.service` / `arDebtReadModel.service`.
- Không tính công nợ từ `salesOrders`.
- Không fallback ledger bẩn bằng `code /^AR-SALE-/`.
- Không filter NVBH/NVGH bằng tên khi có mã.
- Read model có thể rebuild/reconcile từ canonical `arLedgers`.
