# DEPENDENCY AND GOD SERVICE REFACTOR REPORT

## 1. Phạm vi và baseline

- Baseline: `MK-pro-phase04-legacy-strangler-pilot-patched.zip`.
- Giai đoạn: 05.
- Phạm vi duy nhất:
  1. Chuẩn hóa dependency của hệ thống print quanh `PrintFormatService`, `PrintDocumentBuilder`, `printDataBuilder`.
  2. Tách `src/services/fundSummary.service.js` theo responsibility, giữ nguyên công thức quỹ và số truy vấn.
- Không thay đổi API HTTP, schema MongoDB, dependency/package, nghiệp vụ tồn kho, AR, quỹ hoặc hàng trả.
- Không xóa file production trong giai đoạn này.

### Baseline chất lượng

| Gate | Baseline |
|---|---:|
| JavaScript syntax | PASS — 870 file |
| Source bundle | PASS — 18 bundle |
| Full test | PASS — 914, FAIL 0, SKIP 1 |
| Thời gian full test | 10,44 giây; Node test 7,70 giây |
| npm audit production | 0 vulnerability |
| Dependency graph | 264 node, 1.097 edge |
| Chu trình toàn dự án | 1 chu trình ngoài phạm vi |

Chu trình thực tế duy nhất của repository tại baseline:

```text
src/services/internalSaleAllocation.service.js
    ↕
src/services/mobile/catalog.service.js
```

Chu trình trên không thuộc hệ thống print và không được sửa trong giai đoạn này.

## 2. Root cause

### 2.1 Hệ thống print

Khảo sát static `require` cho thấy **không tồn tại strongly connected component/runtime require cycle** giữa ba file print được nêu trong yêu cầu. Cấu trúc cũ là một tam giác ownership không đúng chiều:

```text
printDataBuilder.js
 ├─> PrintFormatService.js ─> printDataBuilder.legacy.js
 └─> PrintDocumentBuilder.js ─> printDataBuilder.legacy.js
```

Trong khi đó formatter thật lại nằm bên trong `printDataBuilder.legacy.js`. Hai service có tên chuyên biệt chỉ re-export ngược từ legacy implementation. Hệ quả:

- module cấp thấp phụ thuộc vào implementation legacy cấp cao;
- format responsibility bị giữ trong God implementation;
- rất dễ tạo vòng require thực khi thêm dependency mới;
- không thể inject/test document builder bằng implementation khác;
- ownership public contract không rõ ràng.

Kết luận chính xác: giai đoạn này không “xóa một SCC print đang tồn tại”, mà **phá dependency ngược và rủi ro vòng phụ thuộc**, áp dụng dependency inversion tại composition root.

### 2.2 `fundSummary.service.js`

Baseline:

```text
55.972 byte
1.414 dòng theo dependency analyzer
fan-out: 8
hàm dài nhất: buildIdentityStages — 207 dòng
```

Một file đồng thời chịu trách nhiệm:

- validate/normalize filter và ngày;
- chuẩn hóa role/person identity;
- xác định đối tượng nộp/nhận tiền;
- phân loại giao dịch;
- tính toán pure domain;
- xây Mongo aggregation pipeline;
- gọi repository;
- orchestration paging/totals;
- render workbook Excel.

Đây là God service thực sự. Tuy nhiên công thức quỹ và Mongo pipeline đã có test tương đối tốt, nên chọn cách tách responsibility nhưng giữ facade/public exports tương thích.

## 3. Thiết kế sau refactor

### 3.1 Dependency print mới

```text
                         ┌─────────────────────────────┐
                         │ PrintFormatService          │
                         │ pure formatting             │
                         │ fan-out = 0                 │
                         └──────────────▲──────────────┘
                                        │
printDataBuilder.js                     │
(composition root)                      │
 ├─> createPrintDocumentBuilder(contract factory)
 ├─> printDataBuilder.legacy.js ────────┘
 └─> PrintFormatService
```

Nguyên tắc:

- `PrintFormatService` chứa formatter thuần và không phụ thuộc facade/legacy.
- `PrintDocumentBuilder` chỉ định nghĩa contract và factory nhận implementation qua tham số.
- `printDataBuilder.js` là composition root duy nhất ghép contract với legacy implementation.
- `printDataBuilder.legacy.js` dùng formatter qua dependency một chiều.
- Public methods của `printDataBuilder` giữ nguyên.

### 3.2 Fund summary mới

```text
Controller/call site
       ↓
fundSummary.service.js              orchestration facade
 ├─> FundSummaryFilters             validation/filter policy
 ├─> FundSummaryDomain              pure domain calculation
 ├─> FundSummaryQueryBuilder        pure aggregation construction
 ├─> FundSummaryWorkbook            Excel rendering
 └─> fundLedgerRepository           I/O/query execution
```

Ranh giới trách nhiệm:

| Module | Responsibility | I/O/model query |
|---|---|---:|
| `FundSummaryDomain.js` | Identity, role, counterparty, classification, normalization, in-memory summary | Không |
| `FundSummaryFilters.js` | Date/filter validation, limits, sort policy | Không |
| `FundSummaryQueryBuilder.js` | Tạo aggregation stages | Không gọi query |
| `FundSummaryWorkbook.js` | Render Excel | Không query DB |
| `fundSummary.service.js` | Orchestration, repository calls, response contract | Có |

## 4. File thêm/sửa/xóa

### Thêm — 6 file mã nguồn/test

```text
src/services/fund-summary/FundSummaryDomain.js
src/services/fund-summary/FundSummaryFilters.js
src/services/fund-summary/FundSummaryQueryBuilder.js
src/services/fund-summary/FundSummaryWorkbook.js
test/fund-summary-refactor-boundary.test.js
test/print-dependency-inversion.test.js
```

### Tài liệu bàn giao thêm — 1 file

```text
DEPENDENCY_AND_GOD_SERVICE_REFACTOR_REPORT.md
```

### Sửa — 8 file

```text
config/source-bundles.json
config/source-size-budget.json
services/print/PrintDocumentBuilder.js
services/print/PrintFormatService.js
services/printDataBuilder.js
services/printDataBuilder.legacy.js
services/printDataBuilder.legacy.source/part-01.jsfrag
src/services/fundSummary.service.js
```

### Xóa

```text
0 file
```

### Package

```text
package.json:      không đổi, SHA-256 giống baseline
package-lock.json: không đổi, SHA-256 giống baseline
```

## 5. Diff quan trọng

### 5.1 PrintFormatService

#### Trước

```js
module.exports = {
  formatMoney: (...args) => legacy.formatMoney(...args),
  formatDate: (...args) => legacy.formatDate(...args),
  formatDateTime: (...args) => legacy.formatDateTime(...args),
  numberToVietnameseWords: (...args) => legacy.numberToVietnameseWords(...args)
};
```

#### Sau

```js
function formatMoney(value) {
  return Math.round(toNumber(value)).toLocaleString('vi-VN');
}

function formatDate(value) { /* pure formatter */ }
function formatDateTime(value) { /* pure formatter */ }
function numberToVietnameseWords(value) { /* pure calculation */ }

module.exports = {
  toNumber,
  formatMoney,
  formatDate,
  formatDateTime,
  numberToVietnameseWords
};
```

### 5.2 PrintDocumentBuilder

#### Trước

```js
const legacy = require('../printDataBuilder.legacy');
module.exports = {
  buildPrintData: (...args) => legacy.buildPrintData(...args),
  // ...
};
```

#### Sau

```js
const REQUIRED_METHODS = Object.freeze([
  'buildPrintData',
  'buildDeliveryInvoicePayload',
  'calculateDeliveryInvoiceSummary',
  'paginateDeliveryInvoice',
  'validateAgainstDmsSample'
]);

function createPrintDocumentBuilder(implementation) {
  // fail fast nếu implementation không đạt contract
  return Object.freeze(Object.fromEntries(
    REQUIRED_METHODS.map((method) => [method, implementation[method].bind(implementation)])
  ));
}
```

### 5.3 Composition root

#### Trước

```js
module.exports = {
  ...require('./print/PrintDocumentBuilder'),
  ...require('./print/PrintFormatService')
};
```

#### Sau

```js
const legacyImplementation = require('./printDataBuilder.legacy');
const { createPrintDocumentBuilder } = require('./print/PrintDocumentBuilder');
const PrintFormatService = require('./print/PrintFormatService');

const documentBuilder = createPrintDocumentBuilder(legacyImplementation);

module.exports = {
  ...documentBuilder,
  formatMoney: PrintFormatService.formatMoney,
  formatDate: PrintFormatService.formatDate,
  formatDateTime: PrintFormatService.formatDateTime,
  numberToVietnameseWords: PrintFormatService.numberToVietnameseWords
};
```

### 5.4 Fund summary

#### Trước

```text
fundSummary.service.js
  ├─ pure calculations
  ├─ filter validation
  ├─ Mongo pipeline
  ├─ repository I/O
  └─ Excel rendering
```

#### Sau

```js
const FundSummaryDomain = require('./fund-summary/FundSummaryDomain');
const FundSummaryFilters = require('./fund-summary/FundSummaryFilters');
const FundSummaryQueryBuilder = require('./fund-summary/FundSummaryQueryBuilder');
const { buildFundSummaryWorkbook } = require('./fund-summary/FundSummaryWorkbook');

async function getFundSummary(...) {
  const filters = FundSummaryFilters.normalizeFilters(...);
  const pipeline = FundSummaryQueryBuilder.buildNormalizedVoucherPipeline(filters);
  const result = await fundLedgerRepository.aggregate([...pipeline, ...]);
  return /* giữ response contract cũ */;
}
```

## 6. Contract và business behavior

Public export của `fundSummary.service.js` được giữ nguyên:

```text
getFundSummary
getFundSummaryTransactions
exportFundSummary
resolveFundCounterparty
classifyTransaction
normalizeLedgerForSummary
summarizeNormalizedTransactions
normalizeFilters
buildNormalizedVoucherPipeline
personKeyOf
normalizeRole
constants
```

Public export của `printDataBuilder.js` được giữ nguyên:

```text
buildPrintData
buildDeliveryInvoicePayload
calculateDeliveryInvoiceSummary
paginateDeliveryInvoice
validateAgainstDmsSample
formatMoney
formatDate
formatDateTime
numberToVietnameseWords
```

Snapshot deterministic trước/sau:

```text
SHA-256 trước: 2a9122acd60e7f1c8c5f1503d251e1e8f4acef9385955d57d3600bb7a0c199bc
SHA-256 sau:   2a9122acd60e7f1c8c5f1503d251e1e8f4acef9385955d57d3600bb7a0c199bc
Kết quả: byte-identical
```

Snapshot bao gồm:

- counterparty/role/person key;
- classify và normalize giao dịch quỹ;
- summary totals;
- normalized filter;
- Mongo pipeline;
- print formatter;
- print public contract.

Không thay đổi công thức `totalDeposited`, `totalExpense`, `netAmount`, transfer amount/count hoặc quy tắc xác định counterparty.

## 7. Đo lường trước/sau

### 7.1 Dependency graph

| Chỉ số | Trước | Sau | Nhận xét |
|---|---:|---:|---|
| Node | 264 | 268 | Thêm 4 module responsibility rõ ràng |
| Edge | 1.097 | 1.105 | Tách module có chủ đích |
| Runtime cycle trong print subgraph | 0 | 0 | Baseline không có SCC print thực |
| Dependency ngược service print → legacy | 2 | 0 | Đã loại bỏ |
| Cycle toàn repository | 1 | 1 | Cycle ngoài phạm vi không bị chạm |

### 7.2 File size, function length và coupling

| Thành phần | Trước | Sau |
|---|---:|---:|
| `fundSummary.service.js` | 55.972 B / 1.414 dòng | 7.455 B / 201 dòng |
| Fund facade fan-out | 8 | 5 |
| Hàm fund dài nhất trong phạm vi | 207 dòng | 108 dòng |
| `PrintFormatService` fan-out | 1 | 0 |
| `PrintDocumentBuilder` fan-out | 1 | 0 |
| Legacy print fan-in | 2 | 1 |

Giảm kích thước facade fund:

```text
byte:  -86,68%
dòng:  -85,79%
max function: 207 → 108 dòng (-47,83%)
```

### 7.3 Số query

Contract test dùng repository spy xác nhận:

| Operation | Trước | Sau |
|---|---:|---:|
| `getFundSummary` | 1 aggregate | 1 aggregate |
| `getFundSummaryTransactions` | 1 aggregate | 1 aggregate |
| `exportFundSummary` | 2 aggregate | 2 aggregate |

Không thêm query model, không tạo N+1 và không dùng cache.

### 7.4 Coverage

| Thành phần | Trước line/branch/function | Sau line/branch/function |
|---|---:|---:|
| Fund service nguyên khối/facade | 83,51 / 65,56 / 86,67 | 93,50 / 69,23 / 75,00 |
| Fund domain | — | 99,15 / 65,45 / 100 |
| Fund query builder | — | 98,74 / 67,50 / 100 |
| PrintDocumentBuilder | 100 / 100 / 100 (trivial pass-through) | 93,10 / 85,71 / 100 (contract validation thật) |
| PrintFormatService | 100 / 100 / 100 (trivial pass-through) | 96,70 / 76,47 / 100 (implementation thật) |
| Toàn bộ tập coverage mục tiêu | 69,73 / 57,58 / 48,32 | 73,46 / 59,39 / 53,63 |

`FundSummaryWorkbook` có line coverage thấp do Node coverage không ghi nhận đầy đủ callback/render branch, nhưng đường export workbook được chạy trong regression và output contract được giữ nguyên.

### 7.5 Benchmark CPU thuần

Benchmark được chạy xen kẽ trên baseline và bản refactor, cùng fixture và process riêng. Có 8 mẫu baseline và 7 mẫu refactor hoàn tất trước timeout tổng.

| Benchmark median | Trước | Sau | Delta |
|---|---:|---:|---:|
| Fund pure workload | 84,23 ms | 87,63 ms | +4,04% |
| Pipeline construction | 65,15 ms | 67,24 ms | +3,20% |
| Print workload | 79,82 ms | 79,30 ms | −0,66% |

Biến động fund/pipeline dưới 5%, không làm tăng query và nằm trong mức overhead chấp nhận được của việc tách hàm/module. Không tuyên bố tăng tốc. Mục tiêu đạt được là giảm coupling và maintainability cost mà không có regression hành vi.

### 7.6 Thời gian test

| Chỉ số | Trước | Sau |
|---|---:|---:|
| Số test | 915 | 921 |
| Pass | 914 | 920 |
| Fail | 0 | 0 |
| Skip | 1 | 1 |
| Node test duration | 7,70 s | 7,98 s |
| Lệnh `npm test` | 10,44 s | 10,86 s |

Mức tăng chủ yếu do thêm 6 test/refactor gate; không có test cũ thất bại.

## 8. Kết quả quality gate

| Gate | Kết quả |
|---|---:|
| Test mới và targeted print/fund | PASS — 40/40 |
| Full test suite | PASS — 920, FAIL 0, SKIP 1 |
| JavaScript syntax | PASS — 876 file |
| Source bundle checksum | PASS — 18 bundle |
| Source-size budget | PASS |
| Enterprise smoke | PASS — 10 module / 11 flag |
| OpenAPI | PASS — 310 operation |
| Path portability | PASS |
| npm audit production | PASS — 0 vulnerability |
| `npm run quality` | PASS — 17,70 s |
| Contract snapshot | PASS — byte-identical |
| Query-count regression | PASS — 1/1/2 không đổi |
| HTTP listen/startup gate | PASS đến bước HTTP listen |
| MongoDB startup/integration | NOT RUN — thiếu `MONGO_URI` |
| Browser/deploy canary | NOT RUN |

Startup thực tế:

```text
HTTP server listening: PASS — 6 ms
mongodb-connect: NOT RUN/blocked — môi trường không có MONGO_URI
```

Do đó bản vá không được tuyên bố đã production end-to-end verified với MongoDB thật.

## 9. Rủi ro còn lại

1. Chu trình thật `internalSaleAllocation.service.js` ↔ `mobile/catalog.service.js` vẫn tồn tại vì nằm ngoài phạm vi.
2. `printDataBuilder.legacy.js` vẫn là generated bundle từ fragments; canonical-source migration của bundle này chưa thuộc giai đoạn 05.
3. Document builder hiện vẫn dùng legacy implementation qua composition root; bước strangler tiếp theo có thể thay từng method bằng implementation mới mà không đổi facade.
4. `normalizeFilters` còn 108 dòng và `voucherAggregationStages` còn 107 dòng. Chúng đã nằm đúng responsibility nhưng có thể tách tiếp trong giai đoạn riêng nếu có lợi ích đo được.
5. Chưa chạy integration với MongoDB production-like và chưa chạy browser/deploy canary.
6. Formatter ngày/tiền tiếp tục phụ thuộc locale/timezone của Node như baseline; không thay behavior trong giai đoạn này.

## 10. Rollback

Rollback toàn bộ bằng cách triển khai lại:

```text
MK-pro-phase04-legacy-strangler-pilot-patched.zip
```

Hoặc rollback theo file:

- phục hồi 8 file đã sửa từ baseline;
- xóa 4 module `src/services/fund-summary/*` mới;
- xóa 2 test mới;
- chạy `npm run build:source-bundles` để phục hồi generated output;
- chạy `npm run quality`.

Không cần rollback database vì:

- không migration;
- không thay schema;
- không thực hiện data rewrite;
- không thay công thức hoặc side effect nghiệp vụ.

## 11. Kết luận

Giai đoạn 05 đã:

- loại bỏ toàn bộ dependency ngược từ `PrintFormatService` và `PrintDocumentBuilder` sang legacy implementation;
- thiết lập dependency inversion và composition root rõ ràng cho print;
- giảm `fundSummary.service.js` từ 1.414 xuống 201 dòng;
- tách pure domain, filter, Mongo query construction, workbook rendering và orchestration;
- giữ API/behavior byte-identical theo deterministic contract snapshot;
- giữ nguyên số query;
- đạt toàn bộ quality gate có thể chạy trong môi trường hiện tại.

Giới hạn công bố: chưa có MongoDB production-like integration và browser/deploy canary.
