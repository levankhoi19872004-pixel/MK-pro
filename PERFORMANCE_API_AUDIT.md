# MK-Pro API Performance Audit

Ngày audit: 2026-06-19  
Commit khảo sát: `e5d300c`  
Phạm vi: backend Node.js/Express/Mongoose, REST API, middleware, controller, service, repository, model và các luồng báo cáo/import/mobile.  
Nguyên tắc: không kết nối MongoDB production, không sửa code nghiệp vụ, API contract, schema, index hoặc dependency.

## 1. TỔNG QUAN DỰ ÁN

### 1.1 Tech stack

- Node.js + CommonJS; `package.json` yêu cầu Node `>=20.20 <23`.
- Express 4, Mongoose 8, JWT, Helmet, CORS, express-rate-limit, Pino/Pino HTTP.
- MongoDB là data source chính; repository dùng `.lean()` cho đa số luồng đọc.
- Test dùng `node:test`; không có Jest/Supertest trong dependency hiện tại.
- npm + `package-lock.json`.
- Runtime audit đang là Node `v24.16.0`, nằm ngoài engine của dự án; kết quả benchmark cần xác nhận lại trên Node 20/22 trước khi dùng làm SLA.

### 1.2 Quy mô tĩnh

| Hạng mục | Số lượng |
| --- | ---: |
| File được `rg --files` ghi nhận | 1.253 |
| Route declarations | 306 |
| OpenAPI paths | 292 |
| OpenAPI operations, gồm alias/legacy | 350 |
| Route files | 49 |
| Controller files | 43 |
| Service files | 141 |
| Repository files | 31 |
| Model/helper files trong `src/models` | 71 |
| Middleware files | 14 |
| Test files | 241 |

### 1.3 Request flow

```text
HTTP
  -> helmet / cors / body parser / rate limiter
  -> maintenanceWriteGuard / securityInputGuard / inputSanitizer
  -> responseFormatter / apiMonitor
  -> JWT authentication / CSRF / tenantContext
  -> route role guard + validation
  -> controller
  -> service/domain service
  -> repository/model
  -> MongoDB
  -> mapping + JSON serialization
```

Vị trí chính: `src/app.js:135-208`, `src/routes/index.js`, `src/middlewares/apiMonitor.middleware.js`.

### 1.4 Logging và performance instrumentation hiện có

- `apiMonitor` dùng `AsyncLocalStorage`, patch `mongoose.Query.exec` và `mongoose.Aggregate.exec`.
- Response headers: `X-Response-Time-Ms`, `X-Mongo-Time-Ms`, `X-JS-Time-Ms`, `X-DB-Queries`.
- In-memory report: `GET /api/system/api-monitor`.
- Pino redact authorization, password và refresh token.
- Mobile command có step timer qua `src/utils/mobilePerformance.util.js`.
- Hạn chế: chưa có percentile benchmark tái lập; query trace và API logging đang bật mặc định thay vì feature flag opt-in.

### 1.5 Inventory API ưu tiên

Inventory đầy đủ được sinh trong `docs/openapi.json` với 350 operations. Bảng dưới đây bao phủ các API nghiệp vụ được ưu tiên trong yêu cầu và các alias có cùng implementation.

| Method | Endpoint | Controller | Service | Model/collection chính | Authentication | Quan trọng |
| --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/sales-orders/search` | `orderController.search` | `orderService.searchOrders` | `salesOrders` | admin/manager/accountant/warehouse | Critical |
| GET | `/api/sales-orders`, `/api/orders` | `orderController.list` | `orderService.listOrders` | `salesOrders` | admin/manager/accountant/warehouse | Critical |
| GET | `/api/sales-orders/:id` | `orderController.get` | `orderService.getOrder` | `salesOrders` | role guard | Critical |
| POST | `/api/sales-orders` | `orderController.create` | `SalesOrderCommandService`/legacy facade | salesOrders, customers | admin/manager/accountant/sales | Critical |
| PUT/PATCH | `/api/sales-orders/:id` | `orderController.update` | sales order command | salesOrders | write role | Critical |
| DELETE | `/api/sales-orders/:id` | `orderController.remove` | `SalesOrderDeletionService` | salesOrders, stockTransactions, AR | write role | Critical |
| GET | `/api/master-orders` | `masterOrderController.list` | `listMasterOrders` | masterOrders, salesOrders | operational role | Critical |
| GET | `/api/master-orders/unmerged-child-orders` | `listUnmergedChildOrders` | `listUnmergedChildOrders` | salesOrders | operational role | Major |
| POST/PUT | `/api/master-orders` | master order controller | master order command | masterOrders, salesOrders, returnOrders | manage role | Critical |
| GET | `/api/delivery-today` | `listDeliveryToday` | compact delivery query | masterOrders, salesOrders, returnOrders, AR | admin/manager/accountant/warehouse | Critical |
| GET | `/api/mobile/catalog/products` | mobile catalog controller | `catalog.service.products` | products, inventories, allocations | mobile login + role | Critical |
| GET | `/api/mobile/catalog/customers` | mobile catalog controller | `catalog.service.customers` | customers, salesOrders | mobile login + role | Critical |
| GET | `/api/mobile/sales/orders` | mobile sales controller | `listSalesOrders` | salesOrders | mobile sales | Critical |
| POST | `/api/mobile/sales/orders` | mobile sales controller | `createSalesOrder` | salesOrders, products, inventory, logs | mobile sales | Critical |
| DELETE | `/api/mobile/sales/orders/:id` | mobile sales controller | delete service | salesOrders, inventory/AR when posted | mobile sales | Critical |
| GET | `/api/mobile/delivery/orders` | mobile delivery controller | `listDeliveryOrders` | masterOrders, salesOrders, returnOrders, AR | mobile delivery | Critical |
| POST | `/api/mobile/delivery/confirm` | mobile delivery controller | `confirmDelivery` | salesOrders, AR, fund, audit | mobile delivery | Critical |
| POST | `/api/mobile/delivery/return` | mobile delivery controller | `createReturnFromDelivery` | returnOrders | mobile delivery | Critical |
| POST | `/api/mobile/delivery/payment` | mobile delivery controller | `submitDeliveryPayment` | receipts/AR/fund | mobile delivery | Critical |
| GET | `/api/inventory/current` | `inventoryController.current` | `getInventorySummary` | inventories, products | admin/manager/accountant/warehouse | Critical |
| POST | `/api/inventory/check` | `inventoryController.check` | `checkAvailableForItems` | products, inventories | operational roles | Critical |
| GET | `/api/return-orders`, `/api/returns` | return controller | return query service | returnOrders | operational role | Critical |
| POST/PUT | `/api/return-orders/...` | return controller | return command/accounting/receiving | returnOrders, inventory, AR | manage role | Critical |
| GET | `/api/debts/customers` | `reportController.debtsCustomers` | optimized legacy debt query | arLedgers | financial roles | Critical |
| GET | `/api/debts/customer-detail/:customerCode` | report controller | debt detail | arLedgers | financial roles | Critical |
| GET | `/api/debts/ar-ledger` | report controller | debt AR page | arLedgers | financial roles | Critical |
| POST | `/api/debt-collections` | debt collection controller | `DebtCollectionService` | debtCollections, locks | collector roles | Critical |
| GET/POST | `/api/funds/...` | fund controller | fund service | fundLedgers, submissions, shortages | financial roles | Critical |
| POST | `/api/import/preview` | import controller | preview/session service | importSessions, rows | import roles | Major |
| POST | `/api/import/commit` | import controller | import orchestrator | domain collections | import roles | Critical |
| POST | `/api/excel/export` | Excel controller | `ExcelInteractionService` | tùy export type | export roles | Major |
| GET | `/api/reports/sales` | report controller | `SalesReportService` | salesOrders, products, arLedgers | report roles | Major |
| GET | `/api/reports/inventory-movement`, `/api/inventory-movement` | report controller | `InventoryReportService` | stockTransactions, inventories, products | stock-report roles | Critical |
| GET | `/api/reports/run/:code` | report controller | `ReportCenterService` | tùy report | report-center roles | Major |
| GET | `/api/dashboard/home` | dashboard controller | `HomeDashboardService` | 7+ collections | dashboard roles | Major |
| GET | `/api/search/products` | search controller | search service/repository | products, inventories | authenticated | Critical |
| GET | `/api/search/customers` | search controller | search service/repository | customers, salesOrders | operational roles | Critical |
| GET | `/api/search/sales-staff`, `/delivery-staff` | search controller | search repository | users | operational roles | Major |

## 2. KẾT QUẢ BASELINE

Chi tiết tại `PERFORMANCE_BASELINE.md`.

- Suite hiện tại: 665 test; 664 pass; 1 fail; 0 skip; 5.711 ms theo TAP, 5.916 ms wall clock.
- Lỗi duy nhất là test case-sensitive path trên Windows; không phải timeout/nghiệp vụ.
- Baseline in-process, không Mongo: 750 request GET qua health/status/monitor, concurrency 1–50, 0 lỗi.
- p95 thấp nhất đo được: 1,66 ms, `GET /api/system/status`, c=1.
- p95 cao nhất trong phạm vi đo: 42,28 ms, `GET /api/system/api-monitor`, c=50.
- Không có baseline Mongo production/test dataset; do đó không tuyên bố API nghiệp vụ nhanh/chậm nhất bằng số liệu giả.
- Tài liệu lịch sử ghi nhận `/api/debts` cũ từng mất khoảng 22.964 ms và import post cũ khoảng 165.903 ms; cả hai là số liệu trước các patch hiện tại, chỉ dùng làm cảnh báo regression.

## 3. DANH SÁCH VẤN ĐỀ

| ID | Severity | API | File/function | Nguyên nhân | Tác động |
| --- | --- | --- | --- | --- | --- |
| PERF-01 | Critical, static risk | `POST /api/excel/export`, type master orders | `ExcelInteractionService.js:374-389`, `loadMasterOrders` | `Promise.all` tối đa 2.000 ID; mỗi `getMasterOrder` đọc master + children | Có thể tạo khoảng 4.000 query đồng thời, bão hòa pool/DB |
| PERF-02 | Critical, static risk | inventory movement/stock card | `InventoryReportService.js:73-245` | Đọc ledger từ `0000-01-01`, thêm full products/current inventory/future ledger, rồi mới group/page | Latency và memory tăng tuyến tính theo toàn bộ lịch sử |
| PERF-03 | Major | report-center debt period/detail | `DebtReportService.js:19-205` | Đọc toàn bộ AR đến dateTo, filter customer/search và paginate ở Node | Query và heap lớn dù chỉ xem một khách hoặc một trang |
| PERF-04 | Major | sales/finance/delivery reports | `SalesReportService.js:33-342` | Full product catalog + full orders/items + AR, valuation và sort trước pagination | CPU, memory, response preparation tăng theo dataset tháng |
| PERF-05 | Major | `GET /api/dashboard/home` | `HomeDashboardService.js:449-493` | 11 query/aggregate chạy đồng thời; cache mặc định tắt; ba pipeline sales riêng | Burst pool trên mỗi request và nhân tải khi nhiều user refresh |
| PERF-06 | Major | `GET /api/inventory/current`, current stock | `inventoryStock.service.js:145-237` | Full scan inventories + products; q filter và summary ở Node; endpoint không paginate | Đọc thừa tài liệu, trả payload lớn; cache 5 giây chỉ giảm tạm thời |
| PERF-07 | Major | unmerged child orders | `masterOrderQuery.impl.js:113-148` | Tải tối đa 5.000 order rồi chạy chuỗi 5 filter; trả toàn bộ | JS/JSON/network tăng; UI selection làm API khó scale |
| PERF-08 | Major | search product/customer/order | `searchRepository.js:205-355,498-544` | Regex contains không anchored trên 10–26 fields + sort/overscan | Index B-tree hiện có khó hỗ trợ, nguy cơ COLLSCAN |
| PERF-09 | Major | mobile customer catalog | `catalog.service.js:175-202`, `customerMonthlySales.service.js:139-150` | Tối đa 1.000 khách rồi tải mọi order tháng và group ở Node | Mobile list chậm khi lịch sử tháng lớn |
| PERF-10 | Medium | import opening debt/debt collection | `financeImport.impl.js:24-64,83-120` | Khi preload miss, `findCustomerByAny` nằm trong loop; invalid/ObjectId rows tạo N+1 | Import lỗi có thể chậm hơn import hợp lệ |
| PERF-11 | Medium | mọi API JSON | `apiMonitor.middleware.js`, `mobilePerformance.util.js` | Query trace + API/mobile perf log bật mặc định; compact JSON/sort/log trên request | Overhead CPU/I/O và log volume, nhất là endpoint nhiều query |
| PERF-12 | Medium | sales/mobile/report responses | nhiều controller/service | Cùng array được trả dưới hai alias như `salesOrders` + `orders`, `products` + `items` | Gần gấp đôi serialization và payload; bị ràng buộc API contract |
| PERF-13 | Medium, correctness-protected | debt collection | `DebtCollectionService.js:61-75,139-145` | 2 vòng update lock tuần tự theo số đơn phân bổ | Query tăng 2N; không được Promise.all vì lock ordering |
| PERF-14 | Minor | product autocomplete | `searchRepository.js:271-288` | `canonicalCodes.includes` trong loop | O(n²), nhưng hiện bị chặn bởi limit 50 |

## 4. VÒNG LẶP DƯ THỪA / ĐỘ PHỨC TẠP

| File | Function | Loại | Complexity | Query trong loop | Phân loại / hướng xử lý |
| --- | --- | --- | --- | --- | --- |
| `ExcelInteractionService.js:374` | `loadMasterOrders` | `Promise.all(ids.map)` | O(n) query fan-out | Có, khoảng 2n | N+1; batch `$in`, concurrency phải bounded |
| `InventoryReportService.js:114` | `inventoryMovementReport` | nhiều full passes | O(T + P + I) | Không trong loop | Có thể chuyển group/filter/page xuống Mongo |
| `DebtReportService.js:48` | `periodDebtReport` | filter + group + sort + reduce | O(L log L) | Không | Push customer/date/group xuống aggregate |
| `SalesReportService.js:233` | `salesReport` | order × items, sort, reduce | O(I + O log O) | Không | Cần projection/pipeline phân trang; valuation phải regression kỹ |
| `masterOrderQuery.impl.js:136` | `listUnmergedChildOrders` | 5 lần `.filter` | O(5n) | Không | Có thể single pass; lợi ích nhỏ hơn việc giảm n từ DB |
| `searchRepository.js:271` | `findInventoriesForProducts` | `includes` trong loop | O(n²) | Không | Dùng Set; Minor do n≤50 |
| `financeImport.impl.js:30,90` | import debt | sequential loop | O(n) + query misses | Có | Batch thêm `_id` vào preload; giữ posting tài chính tuần tự |
| `DebtCollectionService.js:61,139` | lock allocations | sequential loop | O(n) | Có, 2n | Bảo vệ correctness/deadlock; không parallel máy móc |
| `MobileSyncService.js:257` | process batch | sequential loop | O(n) | Tùy operation | Bắt buộc giữ thứ tự/idempotency; không tối ưu song song |
| `importTransaction.service.js:21` | chunks | sequential chunk | O(n/chunk) | Có | Bounded và bảo vệ transaction; nên giữ |
| `masterReturnOrderService.js:424` | receive children | sequential | O(n) | Có | Posting inventory/AR; bắt buộc tuần tự hoặc bulk domain-aware |

## 5. TRUY VẤN DATABASE RỦI RO CAO

Không có `explain("executionStats")` vì audit không được kết nối production và chưa có test MongoDB. Các giá trị docs/keys examined vì vậy được ghi `N/A`; không có index mới nào được đề nghị phê duyệt ở giai đoạn này.

| API | Query/pipeline | Docs examined | Docs returned | Index hiện có liên quan | Nhận định |
| --- | --- | ---: | ---: | --- | --- |
| inventory movement | computed `_reportBusinessDate` từ đầu thời gian rồi sort | N/A | toàn ledger đến dateTo | `date+productCode+warehouse`, `productCode+date` | `$set` trước `$match` làm date index khó phát huy |
| debt period | computed business date trên toàn AR đến dateTo | N/A | toàn ledger đến dateTo | `customerCode+date`, `date` | customer/search filter chạy sau ở Node |
| sales report | active + accounting match, computed date, full docs/items | N/A | toàn order kỳ | `accountingStatus+orderDate+salesStaffCode` | date computed sau match, chưa có indexable prefilter |
| dashboard | 11 aggregate/find song song | N/A | nhiều facet summary | nhiều index domain | cần đo từng `queryDurationMs` và explain trước thay đổi |
| mobile products/search | `$or` regex contains trên nhiều field | N/A | overscan tối đa 250/2.000 | code/barcode/active-code | contains regex không tận dụng B-tree thông thường |
| inventory current | `Inventory.find({})` + `Product.find({})` | toàn collection | toàn collection | inventory product+warehouse; product code | query có q vẫn đọc toàn bộ rồi filter Node |

## 6. PHƯƠNG ÁN A — PRODUCTION-GRADE

| ID | Cách sửa A | Effort | Lợi ích dự kiến | Rủi ro / test bắt buộc |
| --- | --- | --- | --- | --- |
| PERF-01 | Thêm batch `findManyByIdentity` cho master + batch children map, chunk 200–500 | Medium | 4.000 query -> khoảng 8–20 query ở 2.000 ID | Thứ tự selected IDs, missing IDs, duplicate IDs, output workbook |
| PERF-02 | Aggregate ledger theo product/category ở Mongo; indexable raw-date prefilter trước normalize legacy; facet summary/page | Hard | Giảm docs trả về và heap theo toàn lịch sử | Opening/ending/backcast/reversal phải bit-for-bit |
| PERF-03 | `$match` customer/date sớm; aggregate opening/period/closing; `$facet` summary + rows page | Hard | Giảm full AR transfer/Node sort | Số dư đầu kỳ, running balance, credit classification |
| PERF-04 | Tách summary pipeline và page pipeline, projection đúng field; chỉ load product codes dùng trong page/summary cần thiết | Hard | Giảm product/order payload và JS heap | Snapshot giá, promotion, duplicate, AR allocation |
| PERF-05 | Một request-scoped dashboard query plan: giới hạn concurrency 3–4, gộp ba sales scopes bằng facet khi parity đạt | Hard | Giảm pool burst và scan lặp | Summary confirmed/pending/today, data quality |
| PERF-06 | Aggregate inventories có `$match` q sớm; `$lookup`/batch product cần thiết; facet page + summary | Medium | Không còn full collection cho mỗi q/page | Alias product code và onHand/available semantics |
| PERF-07 | Server-side filter + cursor/page; endpoint selection riêng nhận filter và selected IDs | Hard/API approval | Giảm 5.000 rows/payload | Có thể ảnh hưởng contract/UI selection, cần phê duyệt riêng |
| PERF-08 | Hai pha exact/prefix trước, contains fallback sau; đo explain từng query; không thêm index khi chưa có stats | Medium | Giảm COLLSCAN cho truy vấn phổ biến | Thứ tự score và tìm Unicode/giá/barcode |
| PERF-09 | Aggregate monthly sales `$group` theo customer trong Mongo, chỉ trả metrics | Medium | Giảm truyền toàn order tháng | Active status, nhiều field ngày, doanh số canonical |
| PERF-10 | Preload cả ObjectId bằng một `$in`; miss map là miss cuối, không query lại từng row | Easy | Loại N+1 cho row lỗi/ObjectId | code/string/ObjectId/null/duplicate |
| PERF-11 | Feature flag query trace/log chi tiết; sampling/slow-only; giữ headers và response contract | Easy | Giảm CPU/log I/O | API monitor report và trace slow request |
| PERF-12 | Versioned compact response hoặc opt-in `compact=1`; deprecate alias có telemetry | Hard/API approval | Có thể giảm gần 50% payload các list | Client cũ, response schema; chưa được tự ý áp dụng |

## 7. PHƯƠNG ÁN B — CÂN BẰNG EFFORT

| ID | Cách sửa B | Effort | Hạn chế |
| --- | --- | --- | --- |
| PERF-01 | Chunk 25 ID và chạy tuần tự từng chunk, vẫn dùng `getMasterOrder` | Easy | Vẫn 2n query nhưng không bão hòa pool |
| PERF-02 | Thêm indexable prefilter raw `date` và projection trước pipeline hiện tại | Medium | Legacy date fallback vẫn cần scan phần dữ liệu cũ |
| PERF-03 | Push exact customerCode vào `$match`, projection và max-range nhỏ hơn | Easy | Summary toàn khách vẫn quét rộng |
| PERF-04 | Cache product map TTL ngắn + projection orders | Easy | Không xử lý full order/AR computation |
| PERF-05 | Bật TTL cache có invalidation hiện có và chặn `refresh=1` theo rate limit/role | Easy | Cache không sửa query plan; cần chấp nhận độ trễ dữ liệu |
| PERF-06 | Dùng cache key chung cho full summary rồi filter q ở bản cache | Easy | Vẫn full scan mỗi lần cache cold |
| PERF-07 | Single-pass filter và hạ hard cap có cảnh báo | Easy | Có nguy cơ thiếu lựa chọn; cần product approval |
| PERF-08 | Exact code/barcode fast path trước query regex hiện tại | Easy | Search tên contains vẫn scan |
| PERF-09 | Giảm default customer limit và chỉ tính monthly sales cho page hiện tại | Easy | Contract/default behavior cần kiểm tra mobile |
| PERF-10 | Thêm `_id: {$in: objectIds}` vào preload | Easy | Không thay đổi posting tuần tự |
| PERF-11 | Đặt `API_PERF_LOG=0`, `MOBILE_PERF_LOG=0` trong production và chỉ log slow | Ops/Easy | Query trace vẫn được thu trong memory |

## 8. LỘ TRÌNH P0–P3

- P0: PERF-01; prototype/benchmark PERF-02 và PERF-03 trên test DB; chặn fan-out trước.
- P1: PERF-02/03/04/06 query pushdown; chỉ xem xét index sau executionStats.
- P2: PERF-07/08/09/10/14 và payload compact có phê duyệt contract.
- P3: PERF-11, benchmark CI, slow-query sampling và dashboard percentile.

## 9. FILE DỰ KIẾN THAY ĐỔI

Chưa file nghiệp vụ nào được sửa. Nếu được duyệt theo từng patch độc lập:

```text
src/services/excel/ExcelInteractionService.js
  loadMasterOrders() - loại N+1/unbounded Promise.all
src/services/master-order/masterOrderQuery.impl.js
  batch master/children read helper hoặc repository helper
src/services/reports/InventoryReportService.js
  loadTransactionsUntil(), inventoryMovementReport()
src/services/reports/DebtReportService.js
  loadLedgersUntil(), periodDebtReport(), arLedgerDetailReport()
src/services/reports/SalesReportService.js
  loadConfirmedOrders(), salesReport()
src/services/dashboard/HomeDashboardService.js
  getHomeDashboard()
src/services/inventoryStock.service.js
  getInventorySummary()
src/repositories/searchRepository.js
  findProducts(), findCustomers(), findInventoriesForProducts()
src/services/mobile/catalog.service.js
  customers(), products()
src/services/customerMonthlySales.service.js
  loadMonthlySalesByCustomer()
src/services/import/core/importPersistence.util.js
  preloadCustomersByCode()
src/services/import/operations/financeImport.impl.js
  importOpeningDebt(), importDebtCollections()
src/middlewares/apiMonitor.middleware.js
  tracing/log feature flags
```

## 10. DIFF DỰ KIẾN

Đây là diff thiết kế, chưa áp dụng:

```diff
- const results = await Promise.all(ids.map(id => masterOrderService.getMasterOrder(id)));
+ const masters = await masterOrderRepository.findManyByIdentity(ids);
+ const childrenByMaster = await buildMasterChildrenMapFast(masters);
+ const results = ids.map(id => assembleMaster(id, masters, childrenByMaster));
```

```diff
- businessDateStages('0000-01-01', dateTo, ['date'])
- // return every transaction and group in Node
+ rawDatePrefilter(dateTo) // uses existing date index where safe
+ normalizeLegacyBusinessDate()
+ $group by product/category
+ $facet: { rows: [sort, skip, limit], summary: [group] }
```

```diff
- const rows = await ArLedger.aggregate(allRowsUntilDateTo)
- const filtered = rows.filter(matchesQuery)
+ $match: active + exact customer/date candidates
+ $set: normalized business date
+ $facet: opening, periodRows, summary
```

```diff
- const customer = customerMap.get(key) || await findCustomerByAny(key)
+ const customer = customerMap.get(key)
// preloadCustomersByCode includes ObjectId candidates in its one batch query
```

```diff
- const canonicalCodes = [];
- if (code && !canonicalCodes.includes(code)) canonicalCodes.push(code);
+ const canonicalCodes = [...new Set(products.map(canonicalCode).filter(Boolean))];
```

```diff
- else if (process.env.API_PERF_LOG !== '0') req.log.info(...)
+ else if (PERF_LOG_ENABLED && sampled(req)) req.log.info(...)
// slow/error logs remain enabled; response headers/schema remain unchanged
```

## 11. RỦI RO VÀ ROLLBACK

- Business risk cao nhất nằm ở report valuation, opening balance và inventory backcast; bắt buộc golden dataset trước/sau.
- Không song song hóa posting stock/AR/fund, debt locks, transaction chunk hoặc mobile sync.
- Query pushdown có thể bỏ sót legacy date/alias; rollout cần shadow comparison.
- Mongo aggregate có thể tăng server CPU nếu chỉ chuyển tải từ Node sang DB mà không giảm docs.
- Index mới có write/storage cost và rủi ro trùng; chưa đề xuất index production trong audit này.
- Mỗi patch phải có feature flag hoặc commit độc lập; rollback bằng revert đúng patch, không migration schema.

## 12. KẾT LUẬN

- Bottleneck ưu tiên số 1: master-order Excel export N+1 với unbounded concurrency.
- Bottleneck dữ liệu lớn nhất: inventory movement và period debt đọc toàn lịch sử rồi mới phân trang.
- Dashboard có nguy cơ connection-pool burst do 11 query song song và cache mặc định tắt.
- Vòng lặp cần loại bỏ đầu tiên: `Promise.all(ids.map(getMasterOrder))`; vòng lặp tài chính/inventory tuần tự phải giữ.
- Query cần thay đầu tiên: ledger/report computed-date full scans; dùng prefilter + facet sau khi có explain test DB.
- Kỳ vọng: PERF-01 giảm query count từ khoảng `2n` xuống khoảng `2 × ceil(n/chunkSize)`; các report có thể chuyển memory từ O(toàn lịch sử) về O(page + group state). Con số latency chỉ được chốt sau benchmark test DB.
- Khuyến nghị: duyệt P0 PERF-01 riêng; sau đó dựng test DB có dataset đại diện để chốt PERF-02/03 bằng executionStats trước khi sửa production.
