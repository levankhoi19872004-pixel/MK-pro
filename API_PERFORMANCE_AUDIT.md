# API_PERFORMANCE_AUDIT.md

**Ngày khảo sát:** 2026-06-19  
**Bản mã nguồn:** `MK-pro-render-early-port-readiness-fix-patched.zip`  
**Commit nền trong ZIP:** `e5bcb5a` kèm các thay đổi chưa commit của chuỗi vá UI/startup  
**Chế độ:** read-only, isolation/zero-side-effect

> Không sửa mã nguồn, không cài package, không tạo index, không kết nối MongoDB production và không chạy request ghi/xóa. File báo cáo được tạo ngoài cây mã nguồn.

## Tóm tắt điều hành

- Rủi ro hiệu năng lớn nhất hiện tại nằm ở **Report Center, báo cáo tồn kho/công nợ/doanh số và dashboard**, không nằm ở CRUD sản phẩm/khách hàng đơn giản.
- Nhiều báo cáo đọc ledger từ ngày `0000-01-01`, tải toàn bộ document/embedded items, xử lý `filter/group/sort` bằng JavaScript rồi mới phân trang. Khi dữ liệu tăng, thời gian và heap tăng theo toàn lịch sử thay vì theo số dòng trả về.
- `stock-card` còn gọi lại `inventoryMovementReport()`, tạo **đọc trùng transaction ledger và product catalog trong cùng request**.
- `ReportCenterService` buộc các domain report chạy với `full=1&export=1`; riêng `data-quality` chạy bốn báo cáo full đồng thời. Đây là ứng viên timeout/pool burst rõ nhất.
- Dashboard nghiệp vụ chạy 11 tác vụ song song trong một request, trong khi pool Mongo mặc định 50 và Render đang dùng `WEB_CONCURRENCY=1`; nhiều người mở dashboard cùng lúc có thể cạnh tranh pool và event loop.
- Dự án không thiếu index một cách đơn giản: source quản lý khoảng **270 index trên 62 collection**. Rủi ro là query shape (`$set` ngày chuẩn hóa trước match, regex contains, `$or` alias rộng) không tận dụng tốt index. Chưa được thêm index nếu chưa có `explain("executionStats")`.
- Frontend của các module vừa chuẩn hóa đã có request lock, nhưng Delivery, Promotion, Users, AR/Cashbook và một số màn legacy vẫn gọi API theo từng input/change, tạo tải lặp phía client.

## 1. Tổng quan hệ thống

### 1.1 Tech stack và quy mô

| Hạng mục | Kết quả |
|---|---:|
| Node engine | `>=20.20 <23` |
| Start command | `node server.js` |
| Express | `^4.18.3` |
| Mongoose manifest / lockfile | `^8.9.5` / `8.24.0` |
| MongoDB driver lockfile | `6.20.0` |
| Route files | 49 |
| Route declarations tĩnh | 313 |
| OpenAPI paths / operations | 292 / 350 |
| Controllers | 43 |
| Services | 142 |
| Repositories | 31 |
| Models | 71 |
| Middleware | 14 |
| JavaScript trong `src` | 443 |
| Index definitions | 270 tên index / 62 collection |

### 1.2 Số API theo nhóm nghiệp vụ

| Nhóm OpenAPI | Số operation |
|---|---:|
| Mobile | 35 |
| Promotions | 26 |
| Mobile Legacy | 23 |
| Reports | 20 |
| Funds | 19 |
| System | 17 |
| Master Orders | 16 |
| Print | 15 |
| Purchase | 10 |
| Search | 10 |
| Orders | 9 |
| Sales Orders | 9 |
| Customers | 8 |
| Master Return Orders | 8 |
| Debts | 7 |
| Products | 7 |
| Return Orders | 7 |
| Returns | 7 |
| Dashboard | 6 |
| Delivery | 6 |
| Import Orders | 6 |
| Users | 6 |
| Auth | 5 |
| Mobile Sales | 5 |
| Warehouse Advanced | 5 |
| Debt Collections | 4 |
| Dms Inventory | 4 |
| Enterprise | 4 |
| Export | 4 |
| Field Operations | 4 |
| Import | 4 |
| Inventory | 4 |
| Delivery Planning | 3 |
| Excel | 3 |
| Integrations | 3 |
| Platform | 3 |
| Receipts | 3 |
| Analytics | 2 |
| Bankbook | 2 |
| Cashbook | 2 |
| Catalog | 2 |
| External Debt Orders | 2 |
| Data | 1 |
| Health | 1 |
| Inventory Movement | 1 |
| Stock | 1 |
| Stock Card | 1 |

Theo HTTP method: `GET` 177, `POST` 122, `DELETE` 16, `PUT` 24, `PATCH` 11.

### 1.3 Luồng request điển hình

```text
HTTP request
→ helmet / CORS / pino-http
→ express.json(5 MB) / urlencoded(1 MB)
→ rate limit / maintenance guard / security input guard
→ recursive input sanitizer / response formatter
→ startup readiness guard
→ apiMonitor (AsyncLocalStorage + Mongoose query instrumentation)
→ JWT authentication / CSRF / tenant context
→ route role guard
→ controller
→ service / repository
→ Mongoose query hoặc aggregate
→ transform / group / sort / serialize
→ HTTP response
```

Nguồn: `src/app.js`, `src/routes/index.js`, `src/middlewares/apiMonitor.middleware.js`.

### 1.4 MongoDB và Render

- Pool: `maxPoolSize=50`, `minPoolSize=5`, `serverSelectionTimeoutMS=5000`, `socketTimeoutMS=45000`, `autoIndex=false` (`src/config/db.js:21-29`).
- Render log cho thấy `WEB_CONCURRENCY=1`: một Node process xử lý toàn bộ HTTP, JSON serialization và JavaScript report transforms.
- Không có `render.yaml`, Dockerfile hoặc cấu hình plan CPU/RAM trong ZIP; không được suy đoán giới hạn gói Render.
- Không thấy cấu hình riêng `server.keepAliveTimeout`, `headersTimeout`, `requestTimeout`; ứng dụng dùng mặc định của runtime Node.
- Startup jobs cùng web process: index ensure và stale-import recovery; reconciliation có thể chạy sau start nếu ENV bật. Reporting projection/outbox/integration jobs mặc định tắt trong `.env.production.example`.
- Home dashboard cache mặc định tắt: `HOME_DASHBOARD_CACHE_TTL_MS=0`.

## 2. Phương pháp và giới hạn đo đạc

- ZIP không chứa `node_modules`; yêu cầu cấm cài package nên không khởi chạy lại app/benchmark trong lượt này.
- Không có MongoDB test dataset được xác nhận an toàn; không chạy `explain()` và không tạo index.
- Số Avg/P95 dưới đây chỉ lấy từ baseline read-only có sẵn trong artifact hiện tại. Các API nghiệp vụ chỉ có số liệu tĩnh, không gán latency/docs examined giả.
- Query count “static lower bound” được tính theo số lời gọi Mongoose rõ ràng trên cold-cache path; runtime có thể khác do cache, nhánh ngày, feature flag hoặc alias.
- `apiMonitor` hiện thu query count/Mongo time nhưng chỉ lưu average/max, không có histogram P95 chính xác. `Content-Length` cũng có thể thiếu khi response chunked.

## 3. Baseline hiệu năng

### 3.1 Baseline động lịch sử, endpoint không phụ thuộc MongoDB

| Endpoint | Concurrent | Số query | Docs examined | Docs returned | Payload | Avg | P95 | Nhận xét |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| GET /api/health | 1 | 0 | N/A | N/A | 97 B | 1,26 ms | 2,59 ms | Historical no-DB in-process baseline |
| GET /api/health | 50 | 0 | N/A | N/A | 97 B | 18,82 ms | 26,19 ms | Historical no-DB in-process baseline |
| GET /api/system/status | 1 | 0 | N/A | N/A | 569 B | 0,98 ms | 1,66 ms | Historical no-DB in-process baseline |
| GET /api/system/status | 50 | 0 | N/A | N/A | 569 B | 27,86 ms | 31,26 ms | Historical no-DB in-process baseline |
| GET /api/system/api-monitor?limit=10 | 1 | 0 | N/A | N/A | 334 B | 1,78 ms | 3,88 ms | Historical in-memory monitor baseline |
| GET /api/system/api-monitor?limit=10 | 50 | 0 | N/A | N/A | 334 B | 31,99 ms | 42,28 ms | Historical in-memory monitor baseline |

Số liệu trên được đo ngày 2026-06-19 trong cùng process, không kết nối DB. Chỉ dùng để kiểm tra overhead Express/middleware tương đối, không đại diện API nghiệp vụ.

### 3.2 Baseline tĩnh API nghiệp vụ

| Endpoint | Số query | Docs examined | Docs returned | Payload | Avg | P95 | Nhận xét |
|---|---:|---:|---:|---:|---:|---:|---|
| GET /api/reports/stock-card hoặc /api/reports/run/stock-card | 6–7 cold-cache Mongo ops (static lower bound) | N/A | Toàn ledger đến dateTo rồi mới page | N/A | N/A | N/A | Đọc transaction/product trùng qua stockCard + inventoryMovement |
| GET /api/reports/inventory-movement | 4–5 cold-cache Mongo ops | N/A | Toàn ledger + product catalog + inventory | N/A | N/A | N/A | Phân trang sau group/filter/sort JS |
| GET /api/reports/run/data-quality | Nhiều domain calls; tối thiểu >10 Mongo ops tùy cache/date | N/A | Kết quả full của 4 domain reports | N/A | N/A | N/A | Promise.all sales + inventory + delivery + returns |
| GET /api/dashboard/home | 11 logical reads chạy đồng thời | N/A | Summary/rows nhiều domain | N/A | N/A | N/A | Cache mặc định tắt |
| GET /api/reports/sales | 3 broad Mongo reads | N/A | Orders/items + product catalog + AR | N/A | N/A | N/A | Search/page ở JS |
| GET /api/reports/debts hoặc debt-period | 1 broad AR aggregate (+ lookup phụ tùy mode) | N/A | AR từ đầu lịch sử đến dateTo | N/A | N/A | N/A | Customer/search/page ở JS |
| GET /api/reports/finance | 1 broad fund aggregate | N/A | Fund ledger từ đầu lịch sử đến dateTo | N/A | N/A | N/A | Group/running balance/page ở JS |
| GET /api/inventory/current | 0 warm cache / 2 cold cache | N/A | Toàn inventories + products khi cache miss | N/A | N/A | N/A | q filter trong memory; cache key đơn |
| GET /api/mobile/catalog/products | 2–4 reads tùy allocation/cache | N/A | Tối đa 2.000 products trước filter inStock/group | N/A | N/A | N/A | Response aliases products/items |
| GET /api/master-orders/delivery-today | ≥3 broad reads | N/A | Tối đa 5.000 orders + embedded item aliases | N/A | N/A | N/A | Return lookup quét lặp trong memory |

### 3.3 Baseline còn thiếu bắt buộc trước patch

Cần test DB có dữ liệu 1k/10k/100k order, 1/3/5 năm ledger và 1k/10k SKU. Mỗi endpoint ưu tiên phải đo warm/cold cache ở concurrency 1/5/10/20, kèm `X-DB-Queries`, `X-Mongo-Time-Ms`, heap/RSS và `explain("executionStats")`.

## 4. Danh sách bottleneck

| Mức | Endpoint | File/hàm/dòng | Nguyên nhân | Bằng chứng | Ảnh hưởng |
|---|---|---|---|---|---|
| **P0 — Đã xử lý Phase 81** | `GET /api/stock-card`, `GET /api/reports/stock-card`, `GET /api/reports/run/stock-card` | `InventoryReportService.loadInventoryReportContext`, `buildInventoryMovementReport`, `stockCardReport` (`src/services/reports/InventoryReportService.js:114-305, 314-394`) | Đã loại lượt đọc trùng `stockTransactions` và `products` trong cùng request bằng request-scoped context; không dùng global cache. | Golden response trước/sau khớp bit-for-bit; aggregate 3→2, Product.find 2→1; lower-bound Mongo ops 7→5. | Giảm tải Mongo/heap trên Stock Card; việc đọc toàn ledger và pagination sau JS vẫn thuộc Phase Inventory Movement tiếp theo. |
| P0 | `GET /api/reports/inventory-movement`, Report Center `inventory-movement` | `InventoryReportService.inventoryMovementReport` (`:53-122, 125-287`) | Đọc transaction từ `0000-01-01` đến dateTo, toàn product catalog, current stock và có thể future transactions; group/filter/sort ở JS rồi paginate. | `allowDiskUse(true)`; `currentStockReport({full:1})`; page chỉ tạo sau full rows. | Đọc toàn ledger, serialization/GC lớn; ảnh hưởng SSoT inventory. |
| P0 | `GET /api/reports/run/data-quality` | `ReportCenterService.run` (`src/services/reports/ReportCenterService.js:604-619`) | Chạy đồng thời bốn domain report với `full=1, export=1`. | Sales + inventory movement + delivery + returns cùng fan-out; mỗi report lại đọc rộng. | Pool burst, timeout và event-loop/heap spike trên một worker. |
| P0 | `GET /api/reports/debts`, `/api/reports/run/debt-period`, debt ledger detail | `DebtReportService` (`src/services/reports/DebtReportService.js:20-57, 147-217`) | Aggregate toàn `arLedgers` từ đầu lịch sử đến dateTo; lọc customer/search, running balance, sort và page trong JS. | Ngay cả exact customerCode chưa được push vào pipeline sớm. | Công nợ là màn dùng thường xuyên; có thể đọc toàn AR ledger. |
| P1 | `GET /api/reports/sales`, Report Center sales variants | `SalesReportService.salesReport` (`src/services/reports/SalesReportService.js:42-54, 163-197, 232-349`) | Đọc full product catalog, full confirmed orders + embedded items và AR aliases; search/page sau valuation JS. | Response còn chứa `sales` và `items` cùng trỏ một array; mỗi row giữ `items`. | Payload/heap lớn, CPU valuation và JSON serialization cao. |
| P1 | `GET /api/reports/overview`, `/api/reports/dashboard` | `DashboardReportService.dashboardReport` (`src/services/reports/DashboardReportService.js:18-52`) | Chạy 5 full domain reports + 2 aggregates đồng thời. | `Promise.all` sales/stock/finance/delivery/returns/AR/import. | Cạnh tranh pool và lặp query giữa các domain reports. |
| P1 | `GET /api/dashboard/home` | `HomeDashboardService.getHomeDashboard` (`src/services/dashboard/HomeDashboardService.js:449-493`) | 11 tác vụ đọc độc lập chạy đồng thời; cache mặc định tắt. | Pool max 50; 5 request đồng thời có thể khởi phát khoảng 55 logical reads trước fan-out nội bộ. | Dashboard phổ biến; pool saturation và latency tail. |
| P1 | `GET /api/reports/finance`, Report Center finance | `FinanceReportService.financeReport` (`src/services/reports/FinanceReportService.js:39-46, 87-170`) | Đọc `fundLedgers` từ đầu lịch sử, group/running balance/search/page trong JS. | Index date/fund/direction tồn tại nhưng computed-date pipeline cần explain. | Quỹ SSoT; full-history scan tăng dần theo thời gian. |
| P1 | `GET /api/inventory/current`, `/api/reports/stock` | `inventoryStock.service.getInventorySummary` (`src/services/inventoryStock.service.js:145-165, 203-231`) | Cache miss đọc toàn `inventories` và `products`; q filter trong memory. | Cache TTL 5s và chỉ một entry; các q khác nhau liên tục làm cold scan. | API inventory dùng rộng ở web/mobile; docs read không phụ thuộc page. |
| P1 | `GET /api/mobile/catalog/products` | `mobile/catalog.service.products` (`src/services/mobile/catalog.service.js:205-240`) | Default 1.000, max 2.000; regex nhiều field; group/inStock filter sau limit; enrich inventory; duplicate `products/items`. | Payload và docs read lớn; filter sau limit có thể vừa chậm vừa thiếu kết quả. | Mobile mạng yếu, phản hồi lớn và tải DB cao. |
| P1 | `GET /api/mobile/catalog/customers` | `mobile/catalog.service.customers`; `customerMonthlySales.service` | Đọc tối đa 1.000 customer rồi query order tháng; monthly sales group bằng JS; response duplicate `customers/items`. | Ngày order dùng `$or` nhiều field/regex fallback. | Màn khách hàng mobile dùng thường xuyên. |
| P1 | `GET /api/master-orders/delivery-today` và alias `/api/delivery-today` | `deliveryTodayList.impl` (`src/services/master-order/deliveryTodayList.impl.js:34-138`), `masterOrderReturn.impl.js:300-319` | Hard cap 5.000; tải masters/children/returns; mỗi child gọi ba helper cùng filter lại return array. | Độ phức tạp gần O(children × returns); item arrays có nhiều alias. | Giao hàng hàng ngày, payload và CPU JS lớn. |
| P1 | `GET /api/search/*`, autocomplete products/customers/orders | `searchRepository` (`src/repositories/searchRepository.js:235-350`) | Unanchored contains regex qua nhiều field, overscan rồi scoring/filter JS. | B-tree indexes code/barcode không hỗ trợ tốt regex chứa ở đầu wildcard. | Search thường xuyên; nguy cơ COLLSCAN khi catalog tăng. |
| P1 | Toàn bộ `/api/*` | `apiMonitor.middleware` | Patch mọi Mongoose query, stringify filter/pipeline, giữ trace và thêm `perf` vào mọi JSON response; log normal request mặc định. | Overhead diễn ra trên mọi API, response lớn hơn và contract bị bổ sung field. | CPU/log IO/serialization, nhất là API nhiều query. |
| P1 | Delivery/Users/Promotions/AR-Cashbook frontend | `public/js/bootstrap/02-delivery-system.js`, `08e-promotion-programs.js`, `07c-ar-cashbook.js`, `07d-master-return-orders.js` | Một số input/change gọi load trực tiếp hoặc debounce ngắn; chưa có request lock/abort thống nhất. | Delivery search/staff/route gọi ngay mỗi input; promotion-program gọi ngay. | Tải lặp không xuất phát backend; response cũ có thể cạnh tranh. |
| P2 | GET có query/body nhỏ trên toàn API | `src/app.js` global middleware | Body parser và recursive sanitizer chạy trước route cho mọi method. | GET body thường rỗng nên overhead nhỏ; nhưng query/body lớn tăng traversal. | Overhead nền, chưa phải ưu tiên trước report queries. |
| P2 | Web process trên Render | `src/app.js`, jobs config | Một worker Node chạy HTTP, report transforms và jobs; chưa có server timeout tuning riêng. | `WEB_CONCURRENCY=1`; reconciliation có thể chạy cùng process nếu bật. | CPU-bound report block event loop; background jobs tăng tail latency. |

## 5. Phân tích MongoDB query và index

### 5.1 Pattern tĩnh trong source

| Pattern | Số lần tĩnh | Ghi chú |
|---|---:|---|
| `.find({})` | 22 | Không phải tất cả đều sai; report/catalog full-load là nhóm cần đo |
| `.aggregate()` | 53 | 22 file; report/reconciliation chiếm nhiều |
| `allowDiskUse()` | 19 | Dấu hiệu pipeline có thể xử lý tập lớn |
| Regex/`RegExp` | 125 | 28 file; nhiều query search contains |
| `.countDocuments()` | 19 | Cần đối chiếu list endpoint để tránh count lặp |
| `Promise.all()` | 49 | 34 file; cần giới hạn fan-out, không cấm song song |
| `.lean()` | 264 | Điểm tốt: read-only query phần lớn đã tránh hydrate document |
| `.populate()` | 0 | Không có deep populate là điểm tích cực |

### 5.2 Index hiện có liên quan

| Collection | Index đáng chú ý | Đánh giá |
|---|---|---|
| `salesOrders` | customer+orderDate; salesStaff+orderDate+status; orderDate+createdAt; deliveryDate+staff+status; accountingStatus+orderDate+staff | Khá đầy đủ cho filter chuẩn; computed date và alias `$or` có thể làm lệch index |
| `arLedgers` | date; customer+date; customer+type+date; nhiều staff/date aliases | Nhiều index; report cần push exact customer/date trước normalize thay vì thêm index ngay |
| `stockTransactions` | date+product+warehouse; product+date; source+sourceId+product | Phù hợp raw date/product; current pipeline normalize từ đầu lịch sử cần explain |
| `fundLedgers` | date+fundType+direction; delivery staff/date; source/fund/direction | Có index report chính; computed business date vẫn cần xác nhận IXSCAN |
| `products` | unique code, barcode, active+code | Exact/prefix code tốt; contains name/group không được bao phủ |
| `customers` | unique code, customerCode, phone, staff+route+active, active+code | Exact lookup tốt; regex nhiều field không hiệu quả |
| `master_orders` | deliveryDate+staff+status; deliveryStatus+AR+date; child IDs/codes | Full delivery endpoint vẫn có vấn đề transform/payload dù index có sẵn |

### 5.3 Query bắt buộc chạy `explain("executionStats")` trước khi sửa

| Ưu tiên | Pipeline/query | Kỳ vọng kiểm tra |
|---:|---|---|
| 1 | StockTransaction `businessDateStages(0000-01-01,dateTo)` | `COLLSCAN/IXSCAN`, docs/keys examined, sort spill |
| 2 | ArLedger period/detail theo customer/date | exact customer có dùng `customerCode+date` không; computed-date stage |
| 3 | SalesOrder confirmed date range | index `accountingStatus+orderDate+salesStaffCode`; embedded item payload |
| 4 | FundLedger date/fund/direction | index hiện có có tránh sort memory không |
| 5 | Product/Customer contains regex | xác nhận COLLSCAN; so exact/prefix fast path |
| 6 | Dashboard 11 query | executionStats từng query bằng `queryDurationMs`, không chỉ tổng request |

Không đề xuất tạo index production ở bước này. Index mới chỉ được duyệt nếu `totalDocsExamined / nReturned` cao, query phổ biến và write-cost chấp nhận được.

## 6. Kiểm tra tầng API và middleware

### Điểm tốt

- JWT verify không truy vấn DB trên mỗi request; role guard chủ yếu kiểm tra claim.
- Hầu hết read query dùng `.lean()`; không có `.populate()` sâu.
- Import preview đã tách worker/queue và có giới hạn concurrency/timeout trong ENV.
- Startup mới mở port sớm và chặn API bằng readiness 503, tránh port-scan timeout Render.
- Nhiều module frontend mới chuẩn hóa đã có request lock và stale-response protection.

### Rủi ro

- `apiMonitor` là instrumentation hữu ích nhưng quá rộng cho production: query trace/filter stringify trên mọi query và log mọi normal request nếu `API_PERF_LOG` không bằng 0.
- Report transforms và JSON serialization chạy trong main event loop; `WEB_CONCURRENCY=1` làm CPU spike ảnh hưởng toàn dịch vụ.
- Response aliases (`items` + `sales/products/customers`) làm payload tăng mà client có thể chỉ dùng một key.
- Không có timeout theo route cho báo cáo nặng; Mongo socket timeout 45s không giới hạn JavaScript transform sau DB.
- Global body parser/sanitizer hợp lý về bảo mật nhưng cần đo overhead cho import payload lớn; không phải P0 của GET list.

## 7. Kiểm tra frontend gọi API

| Màn hình | Hiện trạng | Mức |
|---|---|---|
| Products/Customers/Inventory/Debt/Fund/Reports | Đã chuyển sang nút áp dụng, request lock, stale-response guard | Tốt |
| Delivery system | Search, salesman, delivery staff, route gọi `loadDeliveryToday` trực tiếp theo từng input | P1 |
| Promotion programs | Search gọi load trực tiếp theo input | P1 |
| Users/legacy promotions | Debounce 250ms nhưng chưa có abort/request-key thống nhất | P2 |
| Receipts/Cashbook/Master returns | Debounce 250ms; request cũ có thể vẫn chạy | P2 |
| Sales orders | Search có debounce, nhưng date/source filter đổi là reload ngay | P2 |

## 8. Top API cần tối ưu trước

Xếp hạng dựa trên fan-out/query shape hiện tại, mức độ dùng nghiệp vụ và khả năng đọc toàn collection. Không dùng latency giả.

| Hạng | API/nhóm API | Lý do ưu tiên |
|---:|---|---|
| 1 | `/api/reports/stock-card`, Report Center `stock-card` | Đọc trùng full ledger + product catalog; tăng theo toàn lịch sử. |
| 2 | `/api/reports/inventory-movement`, Report Center `inventory-movement` | 4–5 reads cold cache, group/page sau full history; nghiệp vụ tồn kho quan trọng. |
| 3 | `/api/reports/run/data-quality` | Bốn full domain reports chạy đồng thời; fan-out lớn nhất. |
| 4 | Debt period/ledger APIs | Đọc toàn AR lịch sử, filter/page trong JS; công nợ dùng thường xuyên. |
| 5 | `/api/dashboard/home` | 11 logical reads song song, cache mặc định tắt, mở dashboard thường xuyên. |
| 6 | `/api/reports/overview` và `/api/reports/dashboard` | Năm full domain reports + hai aggregates. |
| 7 | Sales report APIs | Full orders/items + products + AR, valuation/search/page bằng JS. |
| 8 | `/api/inventory/current` | Mỗi cold q đọc toàn inventories + products; được nhiều module dùng. |
| 9 | `/api/master-orders/delivery-today` | Tối đa 5.000 đơn, repeated return scans, payload embedded lớn. |
| 10 | Mobile catalog products/customers | Default limit lớn, regex/enrichment/monthly-sales, mạng mobile nhạy payload. |

## 9. Phương án xử lý

### PERF-01 — Stock card / movement

**Phương án A — Production-grade**

- Cách xử lý: Tách query plan: raw-date prefilter có thể dùng index; aggregate opening/in/out/ending tại Mongo; page rows bằng `$facet`; stock card không gọi lại movement full mà dùng shared request-scoped dataset/aggregate tương đương.
- File/hàm dự kiến: `InventoryReportService.js`; có thể thêm repository read-only. Chỉ xem xét compound index sau explain.
- Lợi ích: Giảm docs transfer, query trùng và heap từ O(toàn lịch sử) về O(group/page).
- Nhược điểm: Khó chứng minh parity opening/backcast/reversal; Mongo CPU có thể tăng.
- Effort: **Hard**
- Rủi ro side effect: Sai tồn kho nếu legacy date/reversal không tương đương; bắt buộc golden dataset và shadow compare.

**Phương án B — Cân bằng effort**

- Cách xử lý: Giữ code hiện tại nhưng loại đọc trùng stock-card: truyền dataset đã tải vào movement helper; thêm projection và giới hạn range được UI gửi.
- Lợi ích: Giảm 2 reads trùng và một phần payload.
- Nhược điểm: Vẫn full-history scan/group JS.
- Effort: **Medium**
- Rủi ro: Thấp hơn nhưng vẫn phải test tồn đầu/cuối.

### PERF-02 — Debt reports

**Phương án A — Production-grade**

- Cách xử lý: Push exact customer/date/status vào `$match`; dùng aggregate `$facet` cho opening, period rows, summary và page; projection field cần thiết.
- File/hàm dự kiến: `DebtReportService.js`; index candidate chỉ sau explain trên `customerCode+date`.
- Lợi ích: Giảm totalDocsExamined/transfer và heap; exact customer detail cải thiện mạnh.
- Nhược điểm: Pipeline phức tạp; running balance theo page cần thiết kế đúng.
- Effort: **Hard**
- Rủi ro side effect: Rủi ro sai số dư đầu kỳ/credit/debit; cần bit-for-bit fixtures.

**Phương án B — Cân bằng effort**

- Cách xử lý: Chỉ fast-path exact `customerCode`, projection và range guard; summary all-customer giữ nguyên.
- Lợi ích: Effort nhỏ, cải thiện màn chi tiết khách.
- Nhược điểm: Màn tổng hợp vẫn quét rộng.
- Effort: **Easy/Medium**
- Rủi ro: Thấp nếu giữ fallback.

### PERF-03 — Report Center fan-out

**Phương án A — Production-grade**

- Cách xử lý: Tạo query plan theo report code; không ép `full/export` cho viewer; data-quality chạy bounded concurrency và dùng summary/projection endpoints; request-scoped memoization cho domain datasets tương đương.
- File/hàm dự kiến: `ReportCenterService.js`, `DashboardReportService.js`, domain report services.
- Lợi ích: Giảm pool burst, lặp query và payload trung gian.
- Nhược điểm: Cần chứng minh summary/page giống contract hiện tại.
- Effort: **Hard**
- Rủi ro side effect: Rủi ro lệch KPI/cột; rollout feature flag + shadow output.

**Phương án B — Cân bằng effort**

- Cách xử lý: Giới hạn concurrency 2, tránh chạy 4 reports cùng lúc; dùng existing page size cho viewer.
- Lợi ích: Giảm peak pool/heap, patch cô lập.
- Nhược điểm: Tổng thời gian có thể dài hơn nhưng ổn định hơn.
- Effort: **Easy/Medium**
- Rủi ro: Thấp; không đổi công thức.

### PERF-04 — Sales report

**Phương án A — Production-grade**

- Cách xử lý: Projection order/item cần thiết; push date/status/staff/customer filter trước; chỉ load products thực sự xuất hiện; tránh duplicate response aliases nội bộ khi serialize phiên bản hiện hữu.
- File/hàm dự kiến: `SalesReportService.js`; sales order indexes hiện có cần explain.
- Lợi ích: Giảm full catalog, embedded payload và CPU/heap.
- Nhược điểm: Price/promotion valuation phụ thuộc nhiều alias legacy.
- Effort: **Hard**
- Rủi ro side effect: Rủi ro số tiền trước/sau KM; golden workbook/report bắt buộc.

**Phương án B — Cân bằng effort**

- Cách xử lý: Cache product map TTL ngắn với invalidation hiện có; projection order; exact code filter sớm.
- Lợi ích: Dễ triển khai, giảm một phần DB/heap.
- Nhược điểm: Vẫn valuation toàn period và page muộn.
- Effort: **Medium**
- Rủi ro: Cache stale phải được invalidate khi sửa sản phẩm.

### PERF-05 — Home dashboard

**Phương án A — Production-grade**

- Cách xử lý: Request-scoped query planner, giới hạn concurrency 3–4; gộp confirmed/pending/today sales bằng một `$facet` nếu parity; bật cache TTL ngắn có freshness/invalidation được kiểm thử.
- File/hàm dự kiến: `HomeDashboardService.js`, dashboard query modules, `DashboardCacheService.js`.
- Lợi ích: Giảm 11-way pool burst và tail latency.
- Nhược điểm: Cache/facet phức tạp, dashboard cần dữ liệu mới.
- Effort: **Hard**
- Rủi ro side effect: Stale KPI và sai scope confirmed/pending nếu gộp sai.

**Phương án B — Cân bằng effort**

- Cách xử lý: Chỉ giới hạn concurrency và bật TTL 10–30s qua ENV sau smoke test; giữ refresh role/rate-limit.
- Lợi ích: Ổn định pool nhanh.
- Nhược điểm: Không giảm tổng query nhiều; có stale window nhỏ.
- Effort: **Easy**
- Rủi ro: Cần chấp nhận freshness rõ ràng.

### PERF-06 — Current inventory

**Phương án A — Production-grade**

- Cách xử lý: Aggregate/filter q tại DB; batch product projection theo codes; `$facet` page+summary hoặc giữ canonical summary riêng; cache theo bounded key map.
- File/hàm dự kiến: `inventoryStock.service.js`, `InventoryReportService.currentStockReport`.
- Lợi ích: Không đọc toàn two collections cho mỗi q; payload theo page.
- Nhược điểm: Alias product code và summary toàn kho phức tạp.
- Effort: **Medium/Hard**
- Rủi ro side effect: Không được làm sai MAIN/onHand/reserved/available.

**Phương án B — Cân bằng effort**

- Cách xử lý: Giữ full snapshot cache một key, filter q từ snapshot; TTL/invalidation rõ; không query lại products cho từng q.
- Lợi ích: Giảm DB reads trên các q liên tiếp.
- Nhược điểm: Heap snapshot vẫn theo toàn catalog.
- Effort: **Easy/Medium**
- Rủi ro: Stale 5s phải chấp nhận hoặc invalidate.

### PERF-07 — Search/mobile catalog

**Phương án A — Production-grade**

- Cách xử lý: Exact code/barcode/phone fast path; prefix query có index; contains fallback có limit; aggregate monthly sales tại Mongo; response projection tối thiểu.
- File/hàm dự kiến: `searchRepository.js`, `mobile/catalog.service.js`, `customerMonthlySales.service.js`.
- Lợi ích: Giảm COLLSCAN và payload mobile.
- Nhược điểm: Search ranking/Unicode và backward aliases.
- Effort: **Medium**
- Rủi ro side effect: Có thể đổi thứ tự kết quả; cần search corpus regression.

**Phương án B — Cân bằng effort**

- Cách xử lý: Thêm exact fast path trước regex, hạ default limits có product approval, chỉ monthly-sales cho page hiện tại.
- Lợi ích: Nhanh cho case phổ biến.
- Nhược điểm: Contains search vẫn chậm.
- Effort: **Easy/Medium**
- Rủi ro: Default limit là behavior, cần duyệt client.

### PERF-08 — Delivery today

**Phương án A — Production-grade**

- Cách xử lý: Dùng compact endpoints làm nguồn chính; build maps một lần; mỗi child tra return map O(1); bỏ repeated filters và duplicate item aliases ở internal DTO.
- File/hàm dự kiến: `deliveryTodayList.impl.js`, `masterOrderReturn.impl.js`, frontend delivery calls.
- Lợi ích: Giảm CPU JS/payload trên màn hàng ngày.
- Nhược điểm: Legacy clients có thể dùng full endpoint.
- Effort: **Medium**
- Rủi ro side effect: Không đổi amount/return lock; contract alias cần giữ ngoài boundary.

**Phương án B — Cân bằng effort**

- Cách xử lý: Memoize return lookup map trong request và hạ cap chỉ khi UI đã dùng pagination.
- Lợi ích: Patch nhỏ, không đổi API.
- Nhược điểm: Payload full vẫn lớn.
- Effort: **Easy**
- Rủi ro: Thấp.

### PERF-09 — Instrumentation/ops

**Phương án A — Production-grade**

- Cách xử lý: Sampling/slow-only query traces; không stringify filter khi không sample; histogram latency; response size đo tại write layer; giữ monitor behind role.
- File/hàm dự kiến: `apiMonitor.middleware.js`, ENV/ops.
- Lợi ích: Giảm overhead nền và có P95 thật.
- Nhược điểm: Mất chi tiết request bình thường nếu sampling thấp.
- Effort: **Medium**
- Rủi ro side effect: Không được log token/PII; giữ slow/error traces.

**Phương án B — Cân bằng effort**

- Cách xử lý: Đặt `API_PERF_LOG=0` production, chỉ bật tạm khi điều tra; giảm trace cap.
- Lợi ích: Ops nhanh, zero business side effect.
- Nhược điểm: Monitor hiện tại vẫn patch query và thêm `perf`.
- Effort: **Easy**
- Rủi ro: Rất thấp.

### PERF-10 — Frontend duplicate calls

**Phương án A — Production-grade**

- Cách xử lý: Áp dụng request-key/AbortController cho Delivery, Promotions, Users, AR/Cashbook; search nút hoặc debounce hợp lý.
- File/hàm dự kiến: Các file frontend được nêu ở mục 7.
- Lợi ích: Giảm API load mà không đổi DB query.
- Nhược điểm: Cần kiểm tra UX/filter.
- Effort: **Medium**
- Rủi ro side effect: Stale response nếu abort/sequence sai.

**Phương án B — Cân bằng effort**

- Cách xử lý: Debounce 300–500ms và disable while loading cho các màn còn lại.
- Lợi ích: Effort thấp.
- Nhược điểm: Không loại được mọi duplicate multi-component.
- Effort: **Easy**
- Rủi ro: Thấp.

## 10. Kế hoạch patch cô lập

| Phase | Phạm vi duy nhất | File trọng tâm | Điều kiện trước khi sửa |
|---:|---|---|---|
| 0 | Dựng benchmark DB read-only và golden datasets; không sửa query | scripts test riêng ngoài production, API monitor | Dataset 1k/10k/100k; executionStats; baseline P50/P95/P99 |
| **1 — Hoàn thành Phase 81** | Loại đọc trùng Stock Card trong request | `InventoryReportService.js` | Golden response bit-for-bit; 6 test mới pass; query lower bound 7→5 |
| 2 | Pushdown/facet Inventory Movement | InventoryReportService.js + read repository | Explain chứng minh index/raw-date strategy |
| 3 | Exact-customer fast path Debt | DebtReportService.js | AR fixtures bit-for-bit |
| 4 | Report Center bounded fan-out | ReportCenterService.js | Phase 1–3 ổn định; compare viewer/export |
| 5 | Home Dashboard concurrency/cache | HomeDashboardService.js, DashboardCacheService.js | Metrics queryDurationMs, freshness SLA được duyệt |
| 6 | Sales report projection/query plan | SalesReportService.js | Golden promotion/price/return/receipt |
| 7 | Inventory current snapshot/query | inventoryStock.service.js | MAIN/onHand/reserved/available parity |
| 8 | Delivery today O(1) maps | deliveryTodayList.impl.js, masterOrderReturn.impl.js | Legacy/full endpoint contract tests |
| 9 | Search/mobile exact-prefix fast path | searchRepository.js, mobile catalog services | Search corpus + mobile payload tests |
| 10 | Instrumentation và frontend duplicate calls | apiMonitor + từng frontend module riêng | Không gộp với domain query patches |

Mỗi phase phải là commit/ZIP độc lập, không refactor lan rộng, không đổi schema/contract nếu chưa phê duyệt.

## 11. Tiêu chí nghiệm thu

### Mục tiêu chung

- Không thay đổi response contract, field nghiệp vụ hoặc kết quả tính tiền/tồn/nợ/quỹ.
- Không đọc nguồn snapshot/legacy thay cho SSoT: inventory=`inventories/stockTransactions`, AR=`arLedgers`, fund=`fundLedgers`, return=`returnOrders`, warehouse=`MAIN`.
- `totalDocsExamined / nReturned` giảm rõ rệt trên endpoint đã patch; không chấp nhận chỉ chuyển CPU từ Node sang Mongo mà docs examined không giảm.
- Query/request giảm hoặc fan-out được giới hạn; không làm tăng write latency đáng kể do index mới.
- Không stale data đối với tồn kho/công nợ/quỹ; nếu cache được duyệt phải có TTL, invalidation và header/meta freshness rõ.
- Event-loop p95, heap peak và payload phải được đo trước/sau trên cùng dataset.

### Target đề xuất sau khi có baseline DB

| Nhóm | Target nghiệm thu |
|---|---|
| CRUD/list thường xuyên | P95 ≤ 300 ms ở concurrency 10 trên dataset đại diện |
| Dashboard | P95 giảm ít nhất 40%, query fan-out ≤ 4 đồng thời |
| Report page 50 rows | P95 ≤ 2.000 ms cho kỳ tháng; không tăng tuyến tính theo toàn lịch sử khi page không đổi |
| Stock card/movement | Không đọc trùng ledger; docs returned từ Mongo gần group/page thay vì toàn ledger |
| Debt exact customer | Dùng indexable customer/date path; docs examined gần số ledger của khách |
| Mobile catalog | Payload giảm ít nhất 30% nếu contract compact được duyệt; P95 ≤ 500 ms |
| Search exact code/barcode | IXSCAN, P95 ≤ 150 ms |
| Regression | Golden totals 100% khớp; test hiện hữu không giảm pass |

Các con số là mục tiêu đề xuất, phải điều chỉnh sau Phase 0; không phải số liệu đã đạt.

## 12. Kết luận và danh sách chờ phê duyệt

Ưu tiên nên phê duyệt theo thứ tự:

1. Phase 0 — test DB/read-only benchmark và `explain()`.
2. Phase 1 — loại đọc trùng Stock Card, phạm vi nhỏ và bằng chứng rõ.
3. Phase 3 — exact-customer Debt fast path.
4. Phase 4 — giới hạn Report Center data-quality fan-out.
5. Sau khi có số đo, mới quyết định aggregate/index production-grade cho Inventory/Sales/Dashboard.

Không có mã nguồn hoặc index nào được thay đổi trong audit này.


## 13. Cập nhật triển khai — Phase 81 Stock Card request-scoped query reuse

### Phạm vi

Chỉ tối ưu ba endpoint dùng chung `InventoryReportService.stockCardReport()`:

- `GET /api/stock-card`
- `GET /api/reports/stock-card`
- `GET /api/reports/run/stock-card`

Không thay đổi endpoint `inventory-movement`, API contract, công thức tồn kho, kho `MAIN`, nguồn `stockTransactions`/`inventories`, phân quyền hoặc export.

### Root cause đã xử lý

Trước Phase 81, `stockCardReport()` tự đọc ledger/catalog rồi gọi `inventoryMovementReport()`, khiến cùng request đọc lại ledger và catalog. Phase 81 tạo `loadInventoryReportContext(dateTo)` theo phạm vi request và tách `buildInventoryMovementReport(query, context)` thành hàm tính toán thuần để hai báo cáo dùng chung đúng một bộ dữ liệu đã đọc.

### Baseline và kết quả

Số liệu dưới đây được đo bằng controlled fixture/model stubs trên cùng dataset và cùng response; không phải benchmark production MongoDB.

| Chỉ số | Trước | Sau | Cải thiện |
|---|---:|---:|---:|
| `StockTransaction.aggregate()` | 3 | 2 | -1 (-33,3%) |
| `Product.find()` | 2 | 1 | -1 (-50%) |
| Inventory summary | 1 | 1 | Không đổi |
| Mongo operations lower bound | 7 | 5 | -2 (-28,6%) |
| Payload | 2.614 byte | 2.614 byte | Không đổi |
| Response SHA-256 | `2f7a5b827a2f6927e5957514eb85a46f51caf63c0c1a5630d09991379495e382` | giống trước | Bit-for-bit |
| Docs examined | N/A | N/A | Chưa có DB an toàn để chạy `explain()` |
| Avg/P95 | N/A | N/A | Không tự tạo số liệu khi chưa có Mongo dataset đại diện |

### Test

- Golden opening/in/out/ending và reversal/backcast.
- Response contract và date guard.
- Quyền `admin/manager/accountant/warehouse/sales` giữ nguyên.
- Dataset rỗng.
- Dataset 10.000 giao dịch, search và pagination.
- Bốn request đồng thời; không global cache và không N+1.
- Full regression: 704/709 pass; 5 lỗi nền giữ nguyên như baseline, không có regression mới.

### Index và query plan

Phase này không thay đổi query shape và không thêm/xóa index. Không chạy `explain("executionStats")` vì không có MongoDB dataset an toàn trong môi trường thực thi. Phase 2 Inventory Movement vẫn phải có executionStats trước khi pushdown/index.

### Trạng thái còn lại

Stock Card không còn đọc trùng ledger/catalog trong cùng request. Tuy nhiên việc đọc ledger từ đầu lịch sử và pagination sau xử lý JavaScript vẫn còn trong service dùng chung Inventory Movement; đây là phase riêng, chưa được tự động triển khai.

---

## Phụ lục A — Danh mục toàn bộ API từ OpenAPI

Ghi chú: cột **Controller/action** dùng `operationId` trong OpenAPI; cột service/collection là family mapping tĩnh. Các endpoint trong Top 10 đã được truy vết chính xác tới file/hàm ở phần bottleneck. Role cụ thể phải đối chiếu route guard; OpenAPI chỉ phản ánh Bearer/public.

| Method | Endpoint | Controller/action | Service | Collections | Phân trang | Authentication |
|---|---|---|---|---|---|---|
| GET | /api/analytics/projections | AnalyticsController.getAnalyticsProjections | AnalyticsService/ProjectionService | reportingProjections, salesOrders, returnOrders, inventories | Không/không khai báo | Bearer JWT; role guard tùy route |
| POST | /api/analytics/projections/rebuild | AnalyticsController.postAnalyticsProjectionsRebuild | AnalyticsService/ProjectionService | reportingProjections, salesOrders, returnOrders, inventories | Không/không khai báo | Bearer JWT; role guard tùy route |
| POST | /api/auth/login | AuthController.postAuthLogin | authService | users, refresh tokens/session state | Không/không khai báo | Bearer JWT; role guard tùy route |
| POST | /api/auth/logout | AuthController.postAuthLogout | authService | users, refresh tokens/session state | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/auth/me | AuthController.getAuthMe | authService | users, refresh tokens/session state | Không/không khai báo | Bearer JWT; role guard tùy route |
| POST | /api/auth/refresh | AuthController.postAuthRefresh | authService | users, refresh tokens/session state | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/auth/roles | AuthController.getAuthRoles | authService | users, refresh tokens/session state | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/bankbook | BankbookController.handler | financialService | bankbooks, fundLedgers | Không/không khai báo | Bearer JWT; role guard tùy route |
| POST | /api/bankbook | BankbookController.handler | financialService | bankbooks, fundLedgers | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/cashbook | CashbookController.handler | financialService | cashbooks, fundLedgers | Không/không khai báo | Bearer JWT; role guard tùy route |
| POST | /api/cashbook | CashbookController.handler | financialService | cashbooks, fundLedgers | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/catalog/customers/search | CatalogController.getCatalogCustomersSearch | catalog/search services | products, customers, users, inventories | Không rõ trong OpenAPI; kiểm tra handler | Bearer JWT; role guard tùy route |
| GET | /api/catalog/products/search | CatalogController.getCatalogProductsSearch | catalog/search services | products, customers, users, inventories | Không rõ trong OpenAPI; kiểm tra handler | Bearer JWT; role guard tùy route |
| GET | /api/customers | customerController.handler | customerService/customerRepository | customers, salesOrders | Không rõ trong OpenAPI; kiểm tra handler | Bearer JWT; role guard tùy route |
| POST | /api/customers | customerController.handler | customerService/customerRepository | customers, salesOrders | Không/không khai báo | Bearer JWT; role guard tùy route |
| POST | /api/customers/bulk-delete | customerController.postCustomersBulkDelete | customerService/customerRepository | customers, salesOrders | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/customers/search | customerController.getCustomersSearch | customerService/customerRepository | customers, salesOrders | Không rõ trong OpenAPI; kiểm tra handler | Bearer JWT; role guard tùy route |
| DELETE | /api/customers/{id} | customerController.handler | customerService/customerRepository | customers, salesOrders | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/customers/{id} | customerController.handler | customerService/customerRepository | customers, salesOrders | Không rõ trong OpenAPI; kiểm tra handler | Bearer JWT; role guard tùy route |
| PUT | /api/customers/{id} | customerController.handler | customerService/customerRepository | customers, salesOrders | Không/không khai báo | Bearer JWT; role guard tùy route |
| PATCH | /api/customers/{id}/status | customerController.patchCustomersIdStatus | customerService/customerRepository | customers, salesOrders | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/dashboard | dashboardController.getDashboard | HomeDashboardService/SalesTargetService | salesOrders, returnOrders, arLedgers, master_orders, users, salesTargets, products, importOrders | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/dashboard/home | dashboardController.getDashboardHome | HomeDashboardService/SalesTargetService | salesOrders, returnOrders, arLedgers, master_orders, users, salesTargets, products, importOrders | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/dashboard/targets | dashboardController.getDashboardTargets | HomeDashboardService/SalesTargetService | salesOrders, returnOrders, arLedgers, master_orders, users, salesTargets, products, importOrders | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/dashboard/targets/template | dashboardController.getDashboardTargetsTemplate | HomeDashboardService/SalesTargetService | salesOrders, returnOrders, arLedgers, master_orders, users, salesTargets, products, importOrders | Không/không khai báo | Bearer JWT; role guard tùy route |
| PUT | /api/dashboard/targets/{period} | dashboardController.putDashboardTargetsPeriod | HomeDashboardService/SalesTargetService | salesOrders, returnOrders, arLedgers, master_orders, users, salesTargets, products, importOrders | Không/không khai báo | Bearer JWT; role guard tùy route |
| POST | /api/dashboard/targets/{period}/import | dashboardController.postDashboardTargetsPeriodImport | HomeDashboardService/SalesTargetService | salesOrders, returnOrders, arLedgers, master_orders, users, salesTargets, products, importOrders | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/data | DataController.getData | dataSourceService | system metadata/collections | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/debt-collections | DebtCollectionsController.getDebtCollections | debtCollectionService | debtCollections, arLedgers, fundLedgers | Không/không khai báo | Bearer JWT; role guard tùy route |
| POST | /api/debt-collections | DebtCollectionsController.postDebtCollections | debtCollectionService | debtCollections, arLedgers, fundLedgers | Không/không khai báo | Bearer JWT; role guard tùy route |
| POST | /api/debt-collections/{id}/confirm | DebtCollectionsController.postDebtCollectionsIdConfirm | debtCollectionService | debtCollections, arLedgers, fundLedgers | Không/không khai báo | Bearer JWT; role guard tùy route |
| POST | /api/debt-collections/{id}/reject | DebtCollectionsController.postDebtCollectionsIdReject | debtCollectionService | debtCollections, arLedgers, fundLedgers | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/debts | report/debt controllers.getDebts | DebtReadService/DebtReportService | arLedgers, customers, salesOrders | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/debts/ar-ledger | report/debt controllers.getDebtsArLedger | DebtReadService/DebtReportService | arLedgers, customers, salesOrders | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/debts/by-delivery | report/debt controllers.getDebtsByDelivery | DebtReadService/DebtReportService | arLedgers, customers, salesOrders | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/debts/by-salesman | report/debt controllers.getDebtsBySalesman | DebtReadService/DebtReportService | arLedgers, customers, salesOrders | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/debts/customer-detail/{customerCode}? | report/debt controllers.getDebtsCustomerDetailCustomerCode? | DebtReadService/DebtReportService | arLedgers, customers, salesOrders | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/debts/customers | report/debt controllers.getDebtsCustomers | DebtReadService/DebtReportService | arLedgers, customers, salesOrders | Không rõ trong OpenAPI; kiểm tra handler | Bearer JWT; role guard tùy route |
| GET | /api/debts/init | report/debt controllers.getDebtsInit | DebtReadService/DebtReportService | arLedgers, customers, salesOrders | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/delivery-planning/plans | DeliveryPlanningController.getDeliveryPlanningPlans | deliveryPlanning services | delivery plans, master_orders, salesOrders | Không/không khai báo | Bearer JWT; role guard tùy route |
| POST | /api/delivery-planning/plans | DeliveryPlanningController.postDeliveryPlanningPlans | deliveryPlanning services | delivery plans, master_orders, salesOrders | Không/không khai báo | Bearer JWT; role guard tùy route |
| PATCH | /api/delivery-planning/plans/{planId}/stops/{stopId} | DeliveryPlanningController.patchDeliveryPlanningPlansPlanIdStopsStopId | deliveryPlanning services | delivery plans, master_orders, salesOrders | Không/không khai báo | Bearer JWT; role guard tùy route |
| POST | /api/delivery/confirm | DeliveryController.postDeliveryConfirm | delivery/master-order services | master_orders, salesOrders, returnOrders, fundLedgers, arLedgers | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/delivery/orders | DeliveryController.getDeliveryOrders | delivery/master-order services | master_orders, salesOrders, returnOrders, fundLedgers, arLedgers | Không rõ trong OpenAPI; kiểm tra handler | Bearer JWT; role guard tùy route |
| POST | /api/delivery/payment | DeliveryController.postDeliveryPayment | delivery/master-order services | master_orders, salesOrders, returnOrders, fundLedgers, arLedgers | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/delivery/reconciliation | DeliveryController.getDeliveryReconciliation | delivery/master-order services | master_orders, salesOrders, returnOrders, fundLedgers, arLedgers | Không/không khai báo | Bearer JWT; role guard tùy route |
| POST | /api/delivery/return | DeliveryController.postDeliveryReturn | delivery/master-order services | master_orders, salesOrders, returnOrders, fundLedgers, arLedgers | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/delivery/returns | DeliveryController.getDeliveryReturns | delivery/master-order services | master_orders, salesOrders, returnOrders, fundLedgers, arLedgers | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/dms-inventory/history | DmsInventoryController.getDmsInventoryHistory | dmsInventoryReconciliation.service | inventories, products, DMS reconciliation records | Không rõ trong OpenAPI; kiểm tra handler | Bearer JWT; role guard tùy route |
| GET | /api/dms-inventory/latest | DmsInventoryController.getDmsInventoryLatest | dmsInventoryReconciliation.service | inventories, products, DMS reconciliation records | Không/không khai báo | Bearer JWT; role guard tùy route |
| POST | /api/dms-inventory/preview | DmsInventoryController.postDmsInventoryPreview | dmsInventoryReconciliation.service | inventories, products, DMS reconciliation records | Không/không khai báo | Bearer JWT; role guard tùy route |
| POST | /api/dms-inventory/{importId}/commit | DmsInventoryController.postDmsInventoryImportIdCommit | dmsInventoryReconciliation.service | inventories, products, DMS reconciliation records | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/docs | systemController.handler | systemService/apiMonitor | system metadata, audit logs, in-memory metrics | Không/không khai báo | Public hoặc guard riêng |
| GET | /api/docs/openapi.json | systemController.handler | systemService/apiMonitor | system metadata, audit logs, in-memory metrics | Không/không khai báo | Public hoặc guard riêng |
| POST | /api/enterprise/integrations/drain | EnterpriseController.postEnterpriseIntegrationsDrain | enterprise services | tenant-scoped enterprise collections | Không/không khai báo | Bearer JWT; role guard tùy route |
| POST | /api/enterprise/outbox/drain | EnterpriseController.postEnterpriseOutboxDrain | enterprise services | tenant-scoped enterprise collections | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/enterprise/readiness | EnterpriseController.getEnterpriseReadiness | enterprise services | tenant-scoped enterprise collections | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/enterprise/status | EnterpriseController.getEnterpriseStatus | enterprise services | tenant-scoped enterprise collections | Không/không khai báo | Bearer JWT; role guard tùy route |
| POST | /api/excel/export | ExcelController.postExcelExport | ExcelInteractionService | salesOrders, master_orders, products, customers, inventories | Không/không khai báo | Bearer JWT; role guard tùy route |
| POST | /api/excel/import/preview | ExcelController.postExcelImportPreview | ExcelInteractionService | salesOrders, master_orders, products, customers, inventories | Không/không khai báo | Bearer JWT; role guard tùy route |
| POST | /api/excel/products/resolve | ExcelController.postExcelProductsResolve | ExcelInteractionService | salesOrders, master_orders, products, customers, inventories | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/export/customers.xlsx | ExportController.handler | importExport services | domain collections theo loại export | Không rõ trong OpenAPI; kiểm tra handler | Bearer JWT; role guard tùy route |
| GET | /api/export/orders.xlsx | ExportController.handler | importExport services | domain collections theo loại export | Không rõ trong OpenAPI; kiểm tra handler | Bearer JWT; role guard tùy route |
| GET | /api/export/products.xlsx | ExportController.handler | importExport services | domain collections theo loại export | Không rõ trong OpenAPI; kiểm tra handler | Bearer JWT; role guard tùy route |
| GET | /api/export/types | ExportController.handler | importExport services | domain collections theo loại export | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/external-debt-orders | ExternalDebtOrdersController.getExternalDebtOrders | externalDebtOrderService | externalDebtOrders, arLedgers | Không/không khai báo | Bearer JWT; role guard tùy route |
| POST | /api/external-debt-orders | ExternalDebtOrdersController.postExternalDebtOrders | externalDebtOrderService | externalDebtOrders, arLedgers | Không/không khai báo | Bearer JWT; role guard tùy route |
| POST | /api/field-operations/executions/{executionId}/complete | FieldOperationsController.postFieldOperationsExecutionsExecutionIdComplete | fieldOperation services | field operation collections, users/customers | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/field-operations/plans | FieldOperationsController.getFieldOperationsPlans | fieldOperation services | field operation collections, users/customers | Không/không khai báo | Bearer JWT; role guard tùy route |
| POST | /api/field-operations/plans | FieldOperationsController.postFieldOperationsPlans | fieldOperation services | field operation collections, users/customers | Không/không khai báo | Bearer JWT; role guard tùy route |
| POST | /api/field-operations/plans/{planId}/stops/{stopId}/check-in | FieldOperationsController.postFieldOperationsPlansPlanIdStopsStopIdCheckIn | fieldOperation services | field operation collections, users/customers | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/funds/delivery-cash-in-transit | fundController.getFundsDeliveryCashInTransit | fundService/FundPostingService | fundLedgers, deliveryCashSubmissions, expenseVouchers, fundTransfers | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/funds/delivery-cash-shortages/{id}/history | fundController.getFundsDeliveryCashShortagesIdHistory | fundService/FundPostingService | fundLedgers, deliveryCashSubmissions, expenseVouchers, fundTransfers | Không rõ trong OpenAPI; kiểm tra handler | Bearer JWT; role guard tùy route |
| POST | /api/funds/delivery-cash-shortages/{id}/repayments | fundController.postFundsDeliveryCashShortagesIdRepayments | fundService/FundPostingService | fundLedgers, deliveryCashSubmissions, expenseVouchers, fundTransfers | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/funds/delivery-cash-submissions | fundController.getFundsDeliveryCashSubmissions | fundService/FundPostingService | fundLedgers, deliveryCashSubmissions, expenseVouchers, fundTransfers | Không/không khai báo | Bearer JWT; role guard tùy route |
| POST | /api/funds/delivery-cash-submissions | fundController.postFundsDeliveryCashSubmissions | fundService/FundPostingService | fundLedgers, deliveryCashSubmissions, expenseVouchers, fundTransfers | Không/không khai báo | Bearer JWT; role guard tùy route |
| POST | /api/funds/delivery-cash-submissions/preview | fundController.postFundsDeliveryCashSubmissionsPreview | fundService/FundPostingService | fundLedgers, deliveryCashSubmissions, expenseVouchers, fundTransfers | Không/không khai báo | Bearer JWT; role guard tùy route |
| PUT | /api/funds/delivery-cash-submissions/{id} | fundController.putFundsDeliveryCashSubmissionsId | fundService/FundPostingService | fundLedgers, deliveryCashSubmissions, expenseVouchers, fundTransfers | Không/không khai báo | Bearer JWT; role guard tùy route |
| POST | /api/funds/delivery-cash-submissions/{id}/confirm | fundController.postFundsDeliveryCashSubmissionsIdConfirm | fundService/FundPostingService | fundLedgers, deliveryCashSubmissions, expenseVouchers, fundTransfers | Không/không khai báo | Bearer JWT; role guard tùy route |
| POST | /api/funds/delivery-cash-submissions/{id}/shortages | fundController.postFundsDeliveryCashSubmissionsIdShortages | fundService/FundPostingService | fundLedgers, deliveryCashSubmissions, expenseVouchers, fundTransfers | Không/không khai báo | Bearer JWT; role guard tùy route |
| POST | /api/funds/delivery-shortage-repayments/{id}/confirm | fundController.postFundsDeliveryShortageRepaymentsIdConfirm | fundService/FundPostingService | fundLedgers, deliveryCashSubmissions, expenseVouchers, fundTransfers | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/funds/expenses | fundController.getFundsExpenses | fundService/FundPostingService | fundLedgers, deliveryCashSubmissions, expenseVouchers, fundTransfers | Không/không khai báo | Bearer JWT; role guard tùy route |
| POST | /api/funds/expenses | fundController.postFundsExpenses | fundService/FundPostingService | fundLedgers, deliveryCashSubmissions, expenseVouchers, fundTransfers | Không/không khai báo | Bearer JWT; role guard tùy route |
| PUT | /api/funds/expenses/{id} | fundController.putFundsExpensesId | fundService/FundPostingService | fundLedgers, deliveryCashSubmissions, expenseVouchers, fundTransfers | Không/không khai báo | Bearer JWT; role guard tùy route |
| POST | /api/funds/expenses/{id}/confirm | fundController.postFundsExpensesIdConfirm | fundService/FundPostingService | fundLedgers, deliveryCashSubmissions, expenseVouchers, fundTransfers | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/funds/ledger | fundController.getFundsLedger | fundService/FundPostingService | fundLedgers, deliveryCashSubmissions, expenseVouchers, fundTransfers | Không rõ trong OpenAPI; kiểm tra handler | Bearer JWT; role guard tùy route |
| GET | /api/funds/transfers | fundController.getFundsTransfers | fundService/FundPostingService | fundLedgers, deliveryCashSubmissions, expenseVouchers, fundTransfers | Không/không khai báo | Bearer JWT; role guard tùy route |
| POST | /api/funds/transfers | fundController.postFundsTransfers | fundService/FundPostingService | fundLedgers, deliveryCashSubmissions, expenseVouchers, fundTransfers | Không/không khai báo | Bearer JWT; role guard tùy route |
| PUT | /api/funds/transfers/{id} | fundController.putFundsTransfersId | fundService/FundPostingService | fundLedgers, deliveryCashSubmissions, expenseVouchers, fundTransfers | Không/không khai báo | Bearer JWT; role guard tùy route |
| POST | /api/funds/transfers/{id}/confirm | fundController.postFundsTransfersIdConfirm | fundService/FundPostingService | fundLedgers, deliveryCashSubmissions, expenseVouchers, fundTransfers | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/health | health routes.getHealth | startupState/systemService | không DB hoặc startup state | Không/không khai báo | Public hoặc guard riêng |
| GET | /api/import-orders | ImportOrdersController.handler | importOrderService | importOrders, products, inventories, stockTransactions | Không/không khai báo | Bearer JWT; role guard tùy route |
| POST | /api/import-orders | ImportOrdersController.handler | importOrderService | importOrders, products, inventories, stockTransactions | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/import-orders/{id} | ImportOrdersController.handler | importOrderService | importOrders, products, inventories, stockTransactions | Không/không khai báo | Bearer JWT; role guard tùy route |
| PUT | /api/import-orders/{id} | ImportOrdersController.handler | importOrderService | importOrders, products, inventories, stockTransactions | Không/không khai báo | Bearer JWT; role guard tùy route |
| POST | /api/import-orders/{id}/cancel | ImportOrdersController.postImportOrdersIdCancel | importOrderService | importOrders, products, inventories, stockTransactions | Không/không khai báo | Bearer JWT; role guard tùy route |
| POST | /api/import-orders/{id}/post | ImportOrdersController.postImportOrdersIdPost | importOrderService | importOrders, products, inventories, stockTransactions | Không/không khai báo | Bearer JWT; role guard tùy route |
| POST | /api/import/commit | ImportController.handler | import services | import_sessions, import rows, domain collections | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/import/logs | ImportController.handler | import services | import_sessions, import rows, domain collections | Không/không khai báo | Bearer JWT; role guard tùy route |
| POST | /api/import/preview | ImportController.handler | import services | import_sessions, import rows, domain collections | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/import/templates | ImportController.handler | import services | import_sessions, import rows, domain collections | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/integrations/jobs | IntegrationsController.getIntegrationsJobs | IntegrationService | integrationOutbox/integration state | Không/không khai báo | Bearer JWT; role guard tùy route |
| POST | /api/integrations/jobs | IntegrationsController.postIntegrationsJobs | IntegrationService | integrationOutbox/integration state | Không/không khai báo | Bearer JWT; role guard tùy route |
| POST | /api/integrations/jobs/{id}/retry | IntegrationsController.postIntegrationsJobsIdRetry | IntegrationService | integrationOutbox/integration state | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/inventory-movement | InventoryMovementController.getInventoryMovement | InventoryReportService | stockTransactions, inventories, products | Không/không khai báo | Bearer JWT; role guard tùy route |
| POST | /api/inventory/check | inventoryController.postInventoryCheck | inventoryStock.service | inventories, products | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/inventory/current | inventoryController.getInventoryCurrent | inventoryStock.service | inventories, products | Không/không khai báo | Bearer JWT; role guard tùy route |
| POST | /api/inventory/normalize-one-warehouse | inventoryController.postInventoryNormalizeOneWarehouse | inventoryStock.service | inventories, products | Không/không khai báo | Bearer JWT; role guard tùy route |
| POST | /api/inventory/rebuild | inventoryController.postInventoryRebuild | inventoryStock.service | inventories, products | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/master-orders | masterOrderController.handler | masterOrder services | master_orders, salesOrders, returnOrders | Không/không khai báo | Bearer JWT; role guard tùy route |
| POST | /api/master-orders | masterOrderController.handler | masterOrder services | master_orders, salesOrders, returnOrders | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/master-orders/delivery-today | masterOrderController.getMasterOrdersDeliveryToday | masterOrder services | master_orders, salesOrders, returnOrders | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/master-orders/delivery-today-orders | masterOrderController.getMasterOrdersDeliveryTodayOrders | masterOrder services | master_orders, salesOrders, returnOrders | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/master-orders/delivery-today-summary | masterOrderController.getMasterOrdersDeliveryTodaySummary | masterOrder services | master_orders, salesOrders, returnOrders | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/master-orders/delivery-today-summary/{deliveryStaffCode} | masterOrderController.getMasterOrdersDeliveryTodaySummaryDeliveryStaffCode | masterOrder services | master_orders, salesOrders, returnOrders | Không/không khai báo | Bearer JWT; role guard tùy route |
| POST | /api/master-orders/delivery-today/confirm-accounting | masterOrderController.postMasterOrdersDeliveryTodayConfirmAccounting | masterOrder services | master_orders, salesOrders, returnOrders | Không/không khai báo | Bearer JWT; role guard tùy route |
| PATCH | /api/master-orders/delivery-today/{id} | masterOrderController.patchMasterOrdersDeliveryTodayId | masterOrder services | master_orders, salesOrders, returnOrders | Không/không khai báo | Bearer JWT; role guard tùy route |
| POST | /api/master-orders/delivery-today/{id}/admin-unlock | masterOrderController.postMasterOrdersDeliveryTodayIdAdminUnlock | masterOrder services | master_orders, salesOrders, returnOrders | Không/không khai báo | Bearer JWT; role guard tùy route |
| POST | /api/master-orders/print-aggregate | masterOrderController.postMasterOrdersPrintAggregate | masterOrder services | master_orders, salesOrders, returnOrders | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/master-orders/unmerged-child-orders | masterOrderController.handler | masterOrder services | master_orders, salesOrders, returnOrders | Không/không khai báo | Bearer JWT; role guard tùy route |
| DELETE | /api/master-orders/{id} | masterOrderController.handler | masterOrder services | master_orders, salesOrders, returnOrders | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/master-orders/{id} | masterOrderController.handler | masterOrder services | master_orders, salesOrders, returnOrders | Không/không khai báo | Bearer JWT; role guard tùy route |
| PATCH | /api/master-orders/{id} | masterOrderController.handler | masterOrder services | master_orders, salesOrders, returnOrders | Không/không khai báo | Bearer JWT; role guard tùy route |
| PUT | /api/master-orders/{id} | masterOrderController.handler | masterOrder services | master_orders, salesOrders, returnOrders | Không/không khai báo | Bearer JWT; role guard tùy route |
| POST | /api/master-orders/{id}/cancel | masterOrderController.handler | masterOrder services | master_orders, salesOrders, returnOrders | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/master-return-orders | MasterReturnOrdersController.getMasterReturnOrders | masterReturnOrderService | masterReturnOrders, returnOrders | Không/không khai báo | Bearer JWT; role guard tùy route |
| POST | /api/master-return-orders | MasterReturnOrdersController.postMasterReturnOrders | masterReturnOrderService | masterReturnOrders, returnOrders | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/master-return-orders/unmerged-return-orders | MasterReturnOrdersController.getMasterReturnOrdersUnmergedReturnOrders | masterReturnOrderService | masterReturnOrders, returnOrders | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/master-return-orders/{id} | MasterReturnOrdersController.getMasterReturnOrdersId | masterReturnOrderService | masterReturnOrders, returnOrders | Không/không khai báo | Bearer JWT; role guard tùy route |
| PATCH | /api/master-return-orders/{id} | MasterReturnOrdersController.patchMasterReturnOrdersId | masterReturnOrderService | masterReturnOrders, returnOrders | Không/không khai báo | Bearer JWT; role guard tùy route |
| PUT | /api/master-return-orders/{id} | MasterReturnOrdersController.putMasterReturnOrdersId | masterReturnOrderService | masterReturnOrders, returnOrders | Không/không khai báo | Bearer JWT; role guard tùy route |
| POST | /api/master-return-orders/{id}/cancel | MasterReturnOrdersController.postMasterReturnOrdersIdCancel | masterReturnOrderService | masterReturnOrders, returnOrders | Không/không khai báo | Bearer JWT; role guard tùy route |
| POST | /api/master-return-orders/{id}/receive | MasterReturnOrdersController.postMasterReturnOrdersIdReceive | masterReturnOrderService | masterReturnOrders, returnOrders | Không/không khai báo | Bearer JWT; role guard tùy route |
| POST | /api/mobile-legacy/cash/submit | MobileLegacyController.postMobileLegacyCashSubmit | retired/compatibility route | không đọc hoặc compatibility | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/mobile-legacy/customers | MobileLegacyController.getMobileLegacyCustomers | retired/compatibility route | không đọc hoặc compatibility | Không rõ trong OpenAPI; kiểm tra handler | Bearer JWT; role guard tùy route |
| GET | /api/mobile-legacy/debts | MobileLegacyController.getMobileLegacyDebts | retired/compatibility route | không đọc hoặc compatibility | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/mobile-legacy/delivery-orders | MobileLegacyController.getMobileLegacyDeliveryOrders | retired/compatibility route | không đọc hoặc compatibility | Không/không khai báo | Bearer JWT; role guard tùy route |
| POST | /api/mobile-legacy/delivery/confirm | MobileLegacyController.postMobileLegacyDeliveryConfirm | retired/compatibility route | không đọc hoặc compatibility | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/mobile-legacy/delivery/customer-debts | MobileLegacyController.getMobileLegacyDeliveryCustomerDebts | retired/compatibility route | không đọc hoặc compatibility | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/mobile-legacy/delivery/orders | MobileLegacyController.getMobileLegacyDeliveryOrders | retired/compatibility route | không đọc hoặc compatibility | Không rõ trong OpenAPI; kiểm tra handler | Bearer JWT; role guard tùy route |
| POST | /api/mobile-legacy/delivery/payment | MobileLegacyController.postMobileLegacyDeliveryPayment | retired/compatibility route | không đọc hoặc compatibility | Không/không khai báo | Bearer JWT; role guard tùy route |
| POST | /api/mobile-legacy/delivery/return | MobileLegacyController.postMobileLegacyDeliveryReturn | retired/compatibility route | không đọc hoặc compatibility | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/mobile-legacy/delivery/returns | MobileLegacyController.getMobileLegacyDeliveryReturns | retired/compatibility route | không đọc hoặc compatibility | Không/không khai báo | Bearer JWT; role guard tùy route |
| POST | /api/mobile-legacy/inventory/rebuild | MobileLegacyController.postMobileLegacyInventoryRebuild | retired/compatibility route | không đọc hoặc compatibility | Không/không khai báo | Bearer JWT; role guard tùy route |
| POST | /api/mobile-legacy/login | MobileLegacyController.postMobileLegacyLogin | retired/compatibility route | không đọc hoặc compatibility | Không/không khai báo | Bearer JWT; role guard tùy route |
| POST | /api/mobile-legacy/logout | MobileLegacyController.postMobileLegacyLogout | retired/compatibility route | không đọc hoặc compatibility | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/mobile-legacy/me | MobileLegacyController.getMobileLegacyMe | retired/compatibility route | không đọc hoặc compatibility | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/mobile-legacy/products | MobileLegacyController.getMobileLegacyProducts | retired/compatibility route | không đọc hoặc compatibility | Không rõ trong OpenAPI; kiểm tra handler | Bearer JWT; role guard tùy route |
| POST | /api/mobile-legacy/refresh | MobileLegacyController.postMobileLegacyRefresh | retired/compatibility route | không đọc hoặc compatibility | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/mobile-legacy/roles | MobileLegacyController.getMobileLegacyRoles | retired/compatibility route | không đọc hoặc compatibility | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/mobile-legacy/sales/orders | MobileLegacyController.getMobileLegacySalesOrders | retired/compatibility route | không đọc hoặc compatibility | Không rõ trong OpenAPI; kiểm tra handler | Bearer JWT; role guard tùy route |
| POST | /api/mobile-legacy/sales/orders | MobileLegacyController.postMobileLegacySalesOrders | retired/compatibility route | không đọc hoặc compatibility | Không/không khai báo | Bearer JWT; role guard tùy route |
| DELETE | /api/mobile-legacy/sales/orders/{id} | MobileLegacyController.deleteMobileLegacySalesOrdersId | retired/compatibility route | không đọc hoặc compatibility | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/mobile-legacy/sales/orders/{id} | MobileLegacyController.getMobileLegacySalesOrdersId | retired/compatibility route | không đọc hoặc compatibility | Không rõ trong OpenAPI; kiểm tra handler | Bearer JWT; role guard tùy route |
| PUT | /api/mobile-legacy/sales/orders/{id} | MobileLegacyController.putMobileLegacySalesOrdersId | retired/compatibility route | không đọc hoặc compatibility | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/mobile-legacy/stock | MobileLegacyController.getMobileLegacyStock | retired/compatibility route | không đọc hoặc compatibility | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/mobile-sales/products | MobileSalesController.getMobileSalesProducts | mobile sales services | salesOrders, customers, products, inventories | Không rõ trong OpenAPI; kiểm tra handler | Bearer JWT; role guard tùy route |
| POST | /api/mobile-sales/products | MobileSalesController.postMobileSalesProducts | mobile sales services | salesOrders, customers, products, inventories | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/mobile-sales/products/search | MobileSalesController.getMobileSalesProductsSearch | mobile sales services | salesOrders, customers, products, inventories | Không rõ trong OpenAPI; kiểm tra handler | Bearer JWT; role guard tùy route |
| PUT | /api/mobile-sales/products/{id} | MobileSalesController.putMobileSalesProductsId | mobile sales services | salesOrders, customers, products, inventories | Không/không khai báo | Bearer JWT; role guard tùy route |
| PATCH | /api/mobile-sales/products/{id}/status | MobileSalesController.patchMobileSalesProductsIdStatus | mobile sales services | salesOrders, customers, products, inventories | Không/không khai báo | Bearer JWT; role guard tùy route |
| POST | /api/mobile/auth/login | mobile route handlers.postMobileAuthLogin | mobile services | customers, products, users, salesOrders, master_orders, inventories, arLedgers, fundLedgers | Không/không khai báo | Public hoặc guard riêng |
| GET | /api/mobile/auth/me | mobile route handlers.getMobileAuthMe | mobile services | customers, products, users, salesOrders, master_orders, inventories, arLedgers, fundLedgers | Không/không khai báo | Bearer JWT; role guard tùy route |
| POST | /api/mobile/auth/refresh | mobile route handlers.postMobileAuthRefresh | mobile services | customers, products, users, salesOrders, master_orders, inventories, arLedgers, fundLedgers | Không/không khai báo | Public hoặc guard riêng |
| GET | /api/mobile/auth/roles | mobile route handlers.getMobileAuthRoles | mobile services | customers, products, users, salesOrders, master_orders, inventories, arLedgers, fundLedgers | Không/không khai báo | Bearer JWT; role guard tùy route |
| POST | /api/mobile/cash/submit | mobile route handlers.postMobileCashSubmit | mobile services | customers, products, users, salesOrders, master_orders, inventories, arLedgers, fundLedgers | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/mobile/catalog/customers | mobile route handlers.getMobileCatalogCustomers | mobile services | customers, products, users, salesOrders, master_orders, inventories, arLedgers, fundLedgers | Không rõ trong OpenAPI; kiểm tra handler | Bearer JWT; role guard tùy route |
| GET | /api/mobile/catalog/products | mobile route handlers.getMobileCatalogProducts | mobile services | customers, products, users, salesOrders, master_orders, inventories, arLedgers, fundLedgers | Không rõ trong OpenAPI; kiểm tra handler | Bearer JWT; role guard tùy route |
| GET | /api/mobile/catalog/stock | mobile route handlers.getMobileCatalogStock | mobile services | customers, products, users, salesOrders, master_orders, inventories, arLedgers, fundLedgers | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/mobile/customers | mobile route handlers.handler | mobile services | customers, products, users, salesOrders, master_orders, inventories, arLedgers, fundLedgers | Không rõ trong OpenAPI; kiểm tra handler | Bearer JWT; role guard tùy route |
| GET | /api/mobile/debts | mobile route handlers.getMobileDebts | mobile services | customers, products, users, salesOrders, master_orders, inventories, arLedgers, fundLedgers | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/mobile/delivery-orders | mobile route handlers.getMobileDeliveryOrders | mobile services | customers, products, users, salesOrders, master_orders, inventories, arLedgers, fundLedgers | Không/không khai báo | Bearer JWT; role guard tùy route |
| POST | /api/mobile/delivery/cash/submit | mobile route handlers.postMobileDeliveryCashSubmit | mobile services | customers, products, users, salesOrders, master_orders, inventories, arLedgers, fundLedgers | Không/không khai báo | Bearer JWT; role guard tùy route |
| POST | /api/mobile/delivery/confirm | mobile route handlers.postMobileDeliveryConfirm | mobile services | customers, products, users, salesOrders, master_orders, inventories, arLedgers, fundLedgers | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/mobile/delivery/customer-debts | mobile route handlers.getMobileDeliveryCustomerDebts | mobile services | customers, products, users, salesOrders, master_orders, inventories, arLedgers, fundLedgers | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/mobile/delivery/orders | mobile route handlers.handler | mobile services | customers, products, users, salesOrders, master_orders, inventories, arLedgers, fundLedgers | Không rõ trong OpenAPI; kiểm tra handler | Bearer JWT; role guard tùy route |
| POST | /api/mobile/delivery/orders/{id}/confirm | mobile route handlers.handler | mobile services | customers, products, users, salesOrders, master_orders, inventories, arLedgers, fundLedgers | Không/không khai báo | Bearer JWT; role guard tùy route |
| POST | /api/mobile/delivery/payment | mobile route handlers.postMobileDeliveryPayment | mobile services | customers, products, users, salesOrders, master_orders, inventories, arLedgers, fundLedgers | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/mobile/delivery/report | mobile route handlers.getMobileDeliveryReport | mobile services | customers, products, users, salesOrders, master_orders, inventories, arLedgers, fundLedgers | Không/không khai báo | Bearer JWT; role guard tùy route |
| POST | /api/mobile/delivery/return | mobile route handlers.postMobileDeliveryReturn | mobile services | customers, products, users, salesOrders, master_orders, inventories, arLedgers, fundLedgers | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/mobile/delivery/returns | mobile route handlers.getMobileDeliveryReturns | mobile services | customers, products, users, salesOrders, master_orders, inventories, arLedgers, fundLedgers | Không/không khai báo | Bearer JWT; role guard tùy route |
| POST | /api/mobile/delivery/save-money | mobile route handlers.postMobileDeliverySaveMoney | mobile services | customers, products, users, salesOrders, master_orders, inventories, arLedgers, fundLedgers | Không/không khai báo | Bearer JWT; role guard tùy route |
| POST | /api/mobile/inventory/rebuild | mobile route handlers.postMobileInventoryRebuild | mobile services | customers, products, users, salesOrders, master_orders, inventories, arLedgers, fundLedgers | Không/không khai báo | Bearer JWT; role guard tùy route |
| POST | /api/mobile/login | mobile route handlers.handler | mobile services | customers, products, users, salesOrders, master_orders, inventories, arLedgers, fundLedgers | Không/không khai báo | Public hoặc guard riêng |
| GET | /api/mobile/me | mobile route handlers.handler | mobile services | customers, products, users, salesOrders, master_orders, inventories, arLedgers, fundLedgers | Không/không khai báo | Bearer JWT; role guard tùy route |
| POST | /api/mobile/orders | mobile route handlers.postMobileOrders | mobile services | customers, products, users, salesOrders, master_orders, inventories, arLedgers, fundLedgers | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/mobile/products | mobile route handlers.handler | mobile services | customers, products, users, salesOrders, master_orders, inventories, arLedgers, fundLedgers | Không rõ trong OpenAPI; kiểm tra handler | Bearer JWT; role guard tùy route |
| POST | /api/mobile/refresh | mobile route handlers.handler | mobile services | customers, products, users, salesOrders, master_orders, inventories, arLedgers, fundLedgers | Không/không khai báo | Public hoặc guard riêng |
| GET | /api/mobile/roles | mobile route handlers.getMobileRoles | mobile services | customers, products, users, salesOrders, master_orders, inventories, arLedgers, fundLedgers | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/mobile/sales/debts | mobile route handlers.getMobileSalesDebts | mobile services | customers, products, users, salesOrders, master_orders, inventories, arLedgers, fundLedgers | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/mobile/sales/orders | mobile route handlers.handler | mobile services | customers, products, users, salesOrders, master_orders, inventories, arLedgers, fundLedgers | Không rõ trong OpenAPI; kiểm tra handler | Bearer JWT; role guard tùy route |
| POST | /api/mobile/sales/orders | mobile route handlers.handler | mobile services | customers, products, users, salesOrders, master_orders, inventories, arLedgers, fundLedgers | Không/không khai báo | Bearer JWT; role guard tùy route |
| DELETE | /api/mobile/sales/orders/{id} | mobile route handlers.deleteMobileSalesOrdersId | mobile services | customers, products, users, salesOrders, master_orders, inventories, arLedgers, fundLedgers | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/mobile/sales/orders/{id} | mobile route handlers.handler | mobile services | customers, products, users, salesOrders, master_orders, inventories, arLedgers, fundLedgers | Không rõ trong OpenAPI; kiểm tra handler | Bearer JWT; role guard tùy route |
| PUT | /api/mobile/sales/orders/{id} | mobile route handlers.handler | mobile services | customers, products, users, salesOrders, master_orders, inventories, arLedgers, fundLedgers | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/mobile/stock | mobile route handlers.handler | mobile services | customers, products, users, salesOrders, master_orders, inventories, arLedgers, fundLedgers | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/orders | orderController.getOrders | orderService/SalesOrder services | salesOrders, products, customers, inventories, stockTransactions, arLedgers | Không rõ trong OpenAPI; kiểm tra handler | Bearer JWT; role guard tùy route |
| POST | /api/orders | orderController.postOrders | orderService/SalesOrder services | salesOrders, products, customers, inventories, stockTransactions, arLedgers | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/orders/search | orderController.getOrdersSearch | orderService/SalesOrder services | salesOrders, products, customers, inventories, stockTransactions, arLedgers | Không rõ trong OpenAPI; kiểm tra handler | Bearer JWT; role guard tùy route |
| DELETE | /api/orders/{id} | orderController.deleteOrdersId | orderService/SalesOrder services | salesOrders, products, customers, inventories, stockTransactions, arLedgers | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/orders/{id} | orderController.getOrdersId | orderService/SalesOrder services | salesOrders, products, customers, inventories, stockTransactions, arLedgers | Không rõ trong OpenAPI; kiểm tra handler | Bearer JWT; role guard tùy route |
| PATCH | /api/orders/{id} | orderController.patchOrdersId | orderService/SalesOrder services | salesOrders, products, customers, inventories, stockTransactions, arLedgers | Không/không khai báo | Bearer JWT; role guard tùy route |
| PUT | /api/orders/{id} | orderController.putOrdersId | orderService/SalesOrder services | salesOrders, products, customers, inventories, stockTransactions, arLedgers | Không/không khai báo | Bearer JWT; role guard tùy route |
| POST | /api/orders/{id}/cancel | orderController.postOrdersIdCancel | orderService/SalesOrder services | salesOrders, products, customers, inventories, stockTransactions, arLedgers | Không/không khai báo | Bearer JWT; role guard tùy route |
| PATCH | /api/orders/{id}/vat-invoice-setting | orderController.patchOrdersIdVatInvoiceSetting | orderService/SalesOrder services | salesOrders, products, customers, inventories, stockTransactions, arLedgers | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/permissions | UsersController.handler | userService/userRepository | users, roles/permissions | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/platform/tenants | PlatformController.getPlatformTenants | PlatformService | platform/audit/config collections | Không/không khai báo | Bearer JWT; role guard tùy route |
| POST | /api/platform/tenants | PlatformController.postPlatformTenants | PlatformService | platform/audit/config collections | Không/không khai báo | Bearer JWT; role guard tùy route |
| PUT | /api/platform/tenants/{tenantId}/subscription | PlatformController.putPlatformTenantsTenantIdSubscription | PlatformService | platform/audit/config collections | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/print/import-order/{id} | PrintController.handler | print services | salesOrders, master_orders, returnOrders, products, customers | Không/không khai báo | Bearer JWT; role guard tùy route |
| POST | /api/print/import-orders/aggregate | PrintController.postPrintImportOrdersAggregate | print services | salesOrders, master_orders, returnOrders, products, customers | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/print/import-orders/{id} | PrintController.getPrintImportOrdersId | print services | salesOrders, master_orders, returnOrders, products, customers | Không/không khai báo | Public hoặc guard riêng |
| GET | /api/print/master-order/{id} | PrintController.handler | print services | salesOrders, master_orders, returnOrders, products, customers | Không/không khai báo | Bearer JWT; role guard tùy route |
| POST | /api/print/master-orders/batch | PrintController.postPrintMasterOrdersBatch | print services | salesOrders, master_orders, returnOrders, products, customers | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/print/master-orders/{id} | PrintController.getPrintMasterOrdersId | print services | salesOrders, master_orders, returnOrders, products, customers | Không/không khai báo | Public hoặc guard riêng |
| POST | /api/print/master-return-orders/batch | PrintController.postPrintMasterReturnOrdersBatch | print services | salesOrders, master_orders, returnOrders, products, customers | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/print/master-return-orders/{id} | PrintController.getPrintMasterReturnOrdersId | print services | salesOrders, master_orders, returnOrders, products, customers | Không/không khai báo | Public hoặc guard riêng |
| GET | /api/print/order/{id} | PrintController.handler | print services | salesOrders, master_orders, returnOrders, products, customers | Không/không khai báo | Bearer JWT; role guard tùy route |
| POST | /api/print/orders/batch | PrintController.postPrintOrdersBatch | print services | salesOrders, master_orders, returnOrders, products, customers | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/print/orders/{id} | PrintController.getPrintOrdersId | print services | salesOrders, master_orders, returnOrders, products, customers | Không rõ trong OpenAPI; kiểm tra handler | Public hoặc guard riêng |
| GET | /api/print/receipts/{id} | PrintController.getPrintReceiptsId | print services | salesOrders, master_orders, returnOrders, products, customers | Không/không khai báo | Public hoặc guard riêng |
| POST | /api/print/render | PrintController.postPrintRender | print services | salesOrders, master_orders, returnOrders, products, customers | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/print/types | PrintController.getPrintTypes | print services | salesOrders, master_orders, returnOrders, products, customers | Không/không khai báo | Public hoặc guard riêng |
| GET | /api/print/{type}/{id} | PrintController.getPrintTypeId | print services | salesOrders, master_orders, returnOrders, products, customers | Không/không khai báo | Public hoặc guard riêng |
| GET | /api/products | productController.handler | productService/productRepository | products, inventories | Không rõ trong OpenAPI; kiểm tra handler | Bearer JWT; role guard tùy route |
| POST | /api/products | productController.handler | productService/productRepository | products, inventories | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/products/search | productController.getProductsSearch | productService/productRepository | products, inventories | Không rõ trong OpenAPI; kiểm tra handler | Bearer JWT; role guard tùy route |
| DELETE | /api/products/{id} | productController.handler | productService/productRepository | products, inventories | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/products/{id} | productController.handler | productService/productRepository | products, inventories | Không rõ trong OpenAPI; kiểm tra handler | Bearer JWT; role guard tùy route |
| PUT | /api/products/{id} | productController.handler | productService/productRepository | products, inventories | Không/không khai báo | Bearer JWT; role guard tùy route |
| PATCH | /api/products/{id}/status | productController.patchProductsIdStatus | productService/productRepository | products, inventories | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/promotions | PromotionsController.getPromotions | promotionService | promotions, products | Không/không khai báo | Bearer JWT; role guard tùy route |
| POST | /api/promotions | PromotionsController.postPromotions | promotionService | promotions, products | Không/không khai báo | Bearer JWT; role guard tùy route |
| POST | /api/promotions/calculate | PromotionsController.postPromotionsCalculate | promotionService | promotions, products | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/promotions/group-items | PromotionsController.getPromotionsGroupItems | promotionService | promotions, products | Không/không khai báo | Bearer JWT; role guard tùy route |
| POST | /api/promotions/group-items | PromotionsController.postPromotionsGroupItems | promotionService | promotions, products | Không/không khai báo | Bearer JWT; role guard tùy route |
| DELETE | /api/promotions/group-items/{id} | PromotionsController.deletePromotionsGroupItemsId | promotionService | promotions, products | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/promotions/group-rules | PromotionsController.getPromotionsGroupRules | promotionService | promotions, products | Không/không khai báo | Bearer JWT; role guard tùy route |
| POST | /api/promotions/group-rules | PromotionsController.postPromotionsGroupRules | promotionService | promotions, products | Không/không khai báo | Bearer JWT; role guard tùy route |
| DELETE | /api/promotions/group-rules/{id} | PromotionsController.deletePromotionsGroupRulesId | promotionService | promotions, products | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/promotions/product-rules | PromotionsController.getPromotionsProductRules | promotionService | promotions, products | Không/không khai báo | Bearer JWT; role guard tùy route |
| POST | /api/promotions/product-rules | PromotionsController.postPromotionsProductRules | promotionService | promotions, products | Không/không khai báo | Bearer JWT; role guard tùy route |
| DELETE | /api/promotions/product-rules/{id} | PromotionsController.deletePromotionsProductRulesId | promotionService | promotions, products | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/promotions/programs | PromotionsController.getPromotionsPrograms | promotionService | promotions, products | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/promotions/programs/{programCode} | PromotionsController.getPromotionsProgramsProgramCode | promotionService | promotions, products | Không/không khai báo | Bearer JWT; role guard tùy route |
| PUT | /api/promotions/programs/{programCode} | PromotionsController.putPromotionsProgramsProgramCode | promotionService | promotions, products | Không/không khai báo | Bearer JWT; role guard tùy route |
| POST | /api/promotions/programs/{programCode}/cancel | PromotionsController.postPromotionsProgramsProgramCodeCancel | promotionService | promotions, products | Không/không khai báo | Bearer JWT; role guard tùy route |
| POST | /api/promotions/programs/{programCode}/group-products | PromotionsController.postPromotionsProgramsProgramCodeGroupProducts | promotionService | promotions, products | Không/không khai báo | Bearer JWT; role guard tùy route |
| DELETE | /api/promotions/programs/{programCode}/group-products/{id} | PromotionsController.deletePromotionsProgramsProgramCodeGroupProductsId | promotionService | promotions, products | Không/không khai báo | Bearer JWT; role guard tùy route |
| PUT | /api/promotions/programs/{programCode}/group-products/{id} | PromotionsController.putPromotionsProgramsProgramCodeGroupProductsId | promotionService | promotions, products | Không/không khai báo | Bearer JWT; role guard tùy route |
| POST | /api/promotions/programs/{programCode}/products | PromotionsController.postPromotionsProgramsProgramCodeProducts | promotionService | promotions, products | Không/không khai báo | Bearer JWT; role guard tùy route |
| DELETE | /api/promotions/programs/{programCode}/products/{id} | PromotionsController.deletePromotionsProgramsProgramCodeProductsId | promotionService | promotions, products | Không/không khai báo | Bearer JWT; role guard tùy route |
| PUT | /api/promotions/programs/{programCode}/products/{id} | PromotionsController.putPromotionsProgramsProgramCodeProductsId | promotionService | promotions, products | Không/không khai báo | Bearer JWT; role guard tùy route |
| POST | /api/promotions/programs/{programCode}/tiers | PromotionsController.postPromotionsProgramsProgramCodeTiers | promotionService | promotions, products | Không/không khai báo | Bearer JWT; role guard tùy route |
| DELETE | /api/promotions/programs/{programCode}/tiers/{id} | PromotionsController.deletePromotionsProgramsProgramCodeTiersId | promotionService | promotions, products | Không/không khai báo | Bearer JWT; role guard tùy route |
| PUT | /api/promotions/programs/{programCode}/tiers/{id} | PromotionsController.putPromotionsProgramsProgramCodeTiersId | promotionService | promotions, products | Không/không khai báo | Bearer JWT; role guard tùy route |
| DELETE | /api/promotions/{id} | PromotionsController.deletePromotionsId | promotionService | promotions, products | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/purchase/orders | PurchaseController.getPurchaseOrders | PurchaseService | purchase orders, products, inventories, stockTransactions | Không rõ trong OpenAPI; kiểm tra handler | Bearer JWT; role guard tùy route |
| POST | /api/purchase/orders | PurchaseController.postPurchaseOrders | PurchaseService | purchase orders, products, inventories, stockTransactions | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/purchase/orders/{id} | PurchaseController.getPurchaseOrdersId | PurchaseService | purchase orders, products, inventories, stockTransactions | Không rõ trong OpenAPI; kiểm tra handler | Bearer JWT; role guard tùy route |
| POST | /api/purchase/orders/{id}/approve | PurchaseController.postPurchaseOrdersIdApprove | PurchaseService | purchase orders, products, inventories, stockTransactions | Không/không khai báo | Bearer JWT; role guard tùy route |
| POST | /api/purchase/orders/{id}/receive | PurchaseController.postPurchaseOrdersIdReceive | PurchaseService | purchase orders, products, inventories, stockTransactions | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/purchase/payables | PurchaseController.getPurchasePayables | PurchaseService | purchase orders, products, inventories, stockTransactions | Không/không khai báo | Bearer JWT; role guard tùy route |
| POST | /api/purchase/payments | PurchaseController.postPurchasePayments | PurchaseService | purchase orders, products, inventories, stockTransactions | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/purchase/receipts | PurchaseController.getPurchaseReceipts | PurchaseService | purchase orders, products, inventories, stockTransactions | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/purchase/returns | PurchaseController.getPurchaseReturns | PurchaseService | purchase orders, products, inventories, stockTransactions | Không/không khai báo | Bearer JWT; role guard tùy route |
| POST | /api/purchase/returns | PurchaseController.postPurchaseReturns | PurchaseService | purchase orders, products, inventories, stockTransactions | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/receipts | ReceiptsController.handler | receiptService | receipts, arLedgers, fundLedgers | Không/không khai báo | Bearer JWT; role guard tùy route |
| POST | /api/receipts | ReceiptsController.handler | receiptService | receipts, arLedgers, fundLedgers | Không/không khai báo | Bearer JWT; role guard tùy route |
| DELETE | /api/receipts/{id} | ReceiptsController.deleteReceiptsId | receiptService | receipts, arLedgers, fundLedgers | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/reports/catalog | reportController.getReportsCatalog | ReportCenterService/domain report services | salesOrders, master_orders, returnOrders, stockTransactions, inventories, arLedgers, fundLedgers, products, importOrders | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/reports/dashboard | reportController.handler | ReportCenterService/domain report services | salesOrders, master_orders, returnOrders, stockTransactions, inventories, arLedgers, fundLedgers, products, importOrders | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/reports/debts | reportController.handler | ReportCenterService/domain report services | salesOrders, master_orders, returnOrders, stockTransactions, inventories, arLedgers, fundLedgers, products, importOrders | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/reports/debts/ar-ledger | reportController.getReportsDebtsArLedger | ReportCenterService/domain report services | salesOrders, master_orders, returnOrders, stockTransactions, inventories, arLedgers, fundLedgers, products, importOrders | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/reports/debts/by-delivery | reportController.getReportsDebtsByDelivery | ReportCenterService/domain report services | salesOrders, master_orders, returnOrders, stockTransactions, inventories, arLedgers, fundLedgers, products, importOrders | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/reports/debts/by-salesman | reportController.getReportsDebtsBySalesman | ReportCenterService/domain report services | salesOrders, master_orders, returnOrders, stockTransactions, inventories, arLedgers, fundLedgers, products, importOrders | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/reports/debts/customer-detail/{customerCode}? | reportController.getReportsDebtsCustomerDetailCustomerCode? | ReportCenterService/domain report services | salesOrders, master_orders, returnOrders, stockTransactions, inventories, arLedgers, fundLedgers, products, importOrders | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/reports/debts/customers | reportController.getReportsDebtsCustomers | ReportCenterService/domain report services | salesOrders, master_orders, returnOrders, stockTransactions, inventories, arLedgers, fundLedgers, products, importOrders | Không rõ trong OpenAPI; kiểm tra handler | Bearer JWT; role guard tùy route |
| GET | /api/reports/debts/init | reportController.getReportsDebtsInit | ReportCenterService/domain report services | salesOrders, master_orders, returnOrders, stockTransactions, inventories, arLedgers, fundLedgers, products, importOrders | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/reports/delivery | reportController.handler | ReportCenterService/domain report services | salesOrders, master_orders, returnOrders, stockTransactions, inventories, arLedgers, fundLedgers, products, importOrders | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/reports/finance | reportController.handler | ReportCenterService/domain report services | salesOrders, master_orders, returnOrders, stockTransactions, inventories, arLedgers, fundLedgers, products, importOrders | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/reports/inventory-movement | reportController.getReportsInventoryMovement | ReportCenterService/domain report services | salesOrders, master_orders, returnOrders, stockTransactions, inventories, arLedgers, fundLedgers, products, importOrders | Không/không khai báo | Bearer JWT; role guard tùy route |
| POST | /api/reports/inventory/normalize-one-warehouse | reportController.postReportsInventoryNormalizeOneWarehouse | ReportCenterService/domain report services | salesOrders, master_orders, returnOrders, stockTransactions, inventories, arLedgers, fundLedgers, products, importOrders | Không/không khai báo | Bearer JWT; role guard tùy route |
| POST | /api/reports/inventory/rebuild | reportController.postReportsInventoryRebuild | ReportCenterService/domain report services | salesOrders, master_orders, returnOrders, stockTransactions, inventories, arLedgers, fundLedgers, products, importOrders | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/reports/overview | reportController.getReportsOverview | ReportCenterService/domain report services | salesOrders, master_orders, returnOrders, stockTransactions, inventories, arLedgers, fundLedgers, products, importOrders | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/reports/returns | reportController.getReportsReturns | ReportCenterService/domain report services | salesOrders, master_orders, returnOrders, stockTransactions, inventories, arLedgers, fundLedgers, products, importOrders | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/reports/run/{code} | reportController.getReportsRunCode | ReportCenterService/domain report services | salesOrders, master_orders, returnOrders, stockTransactions, inventories, arLedgers, fundLedgers, products, importOrders | Không rõ trong OpenAPI; kiểm tra handler | Bearer JWT; role guard tùy route |
| GET | /api/reports/sales | reportController.handler | ReportCenterService/domain report services | salesOrders, master_orders, returnOrders, stockTransactions, inventories, arLedgers, fundLedgers, products, importOrders | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/reports/stock | reportController.handler | ReportCenterService/domain report services | salesOrders, master_orders, returnOrders, stockTransactions, inventories, arLedgers, fundLedgers, products, importOrders | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/reports/stock-card | reportController.getReportsStockCard | ReportCenterService/domain report services | salesOrders, master_orders, returnOrders, stockTransactions, inventories, arLedgers, fundLedgers, products, importOrders | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/return-orders | returnController.getReturnOrders | returnOrderService | returnOrders, salesOrders, inventories, stockTransactions, arLedgers | Không/không khai báo | Bearer JWT; role guard tùy route |
| POST | /api/return-orders | returnController.postReturnOrders | returnOrderService | returnOrders, salesOrders, inventories, stockTransactions, arLedgers | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/return-orders/by-sales-order/{salesOrderId} | returnController.getReturnOrdersBySalesOrderSalesOrderId | returnOrderService | returnOrders, salesOrders, inventories, stockTransactions, arLedgers | Không/không khai báo | Bearer JWT; role guard tùy route |
| PUT | /api/return-orders/by-sales-order/{salesOrderId}/items | returnController.putReturnOrdersBySalesOrderSalesOrderIdItems | returnOrderService | returnOrders, salesOrders, inventories, stockTransactions, arLedgers | Không/không khai báo | Bearer JWT; role guard tùy route |
| POST | /api/return-orders/{id}/cancel | returnController.postReturnOrdersIdCancel | returnOrderService | returnOrders, salesOrders, inventories, stockTransactions, arLedgers | Không/không khai báo | Bearer JWT; role guard tùy route |
| POST | /api/return-orders/{id}/confirm-accounting | returnController.postReturnOrdersIdConfirmAccounting | returnOrderService | returnOrders, salesOrders, inventories, stockTransactions, arLedgers | Không/không khai báo | Bearer JWT; role guard tùy route |
| PUT | /api/return-orders/{id}/items | returnController.putReturnOrdersIdItems | returnOrderService | returnOrders, salesOrders, inventories, stockTransactions, arLedgers | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/returns | returnController.handler | returnOrderService | returnOrders, salesOrders, inventories, stockTransactions, arLedgers | Không/không khai báo | Bearer JWT; role guard tùy route |
| POST | /api/returns | returnController.handler | returnOrderService | returnOrders, salesOrders, inventories, stockTransactions, arLedgers | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/returns/by-sales-order/{salesOrderId} | returnController.getReturnsBySalesOrderSalesOrderId | returnOrderService | returnOrders, salesOrders, inventories, stockTransactions, arLedgers | Không/không khai báo | Bearer JWT; role guard tùy route |
| PUT | /api/returns/by-sales-order/{salesOrderId}/items | returnController.putReturnsBySalesOrderSalesOrderIdItems | returnOrderService | returnOrders, salesOrders, inventories, stockTransactions, arLedgers | Không/không khai báo | Bearer JWT; role guard tùy route |
| POST | /api/returns/{id}/cancel | returnController.postReturnsIdCancel | returnOrderService | returnOrders, salesOrders, inventories, stockTransactions, arLedgers | Không/không khai báo | Bearer JWT; role guard tùy route |
| POST | /api/returns/{id}/confirm-accounting | returnController.postReturnsIdConfirmAccounting | returnOrderService | returnOrders, salesOrders, inventories, stockTransactions, arLedgers | Không/không khai báo | Bearer JWT; role guard tùy route |
| PUT | /api/returns/{id}/items | returnController.putReturnsIdItems | returnOrderService | returnOrders, salesOrders, inventories, stockTransactions, arLedgers | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/roles | UsersController.handler | userService/userRepository | users, roles/permissions | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/sales-orders | orderController.handler | orderService/SalesOrder services | salesOrders, products, customers, inventories, stockTransactions, arLedgers | Không/không khai báo | Bearer JWT; role guard tùy route |
| POST | /api/sales-orders | orderController.handler | orderService/SalesOrder services | salesOrders, products, customers, inventories, stockTransactions, arLedgers | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/sales-orders/search | orderController.getSalesOrdersSearch | orderService/SalesOrder services | salesOrders, products, customers, inventories, stockTransactions, arLedgers | Không rõ trong OpenAPI; kiểm tra handler | Bearer JWT; role guard tùy route |
| DELETE | /api/sales-orders/{id} | orderController.handler | orderService/SalesOrder services | salesOrders, products, customers, inventories, stockTransactions, arLedgers | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/sales-orders/{id} | orderController.handler | orderService/SalesOrder services | salesOrders, products, customers, inventories, stockTransactions, arLedgers | Không/không khai báo | Bearer JWT; role guard tùy route |
| PATCH | /api/sales-orders/{id} | orderController.handler | orderService/SalesOrder services | salesOrders, products, customers, inventories, stockTransactions, arLedgers | Không/không khai báo | Bearer JWT; role guard tùy route |
| PUT | /api/sales-orders/{id} | orderController.handler | orderService/SalesOrder services | salesOrders, products, customers, inventories, stockTransactions, arLedgers | Không/không khai báo | Bearer JWT; role guard tùy route |
| POST | /api/sales-orders/{id}/cancel | orderController.handler | orderService/SalesOrder services | salesOrders, products, customers, inventories, stockTransactions, arLedgers | Không/không khai báo | Bearer JWT; role guard tùy route |
| PATCH | /api/sales-orders/{id}/vat-invoice-setting | orderController.patchSalesOrdersIdVatInvoiceSetting | orderService/SalesOrder services | salesOrders, products, customers, inventories, stockTransactions, arLedgers | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/search/ar-ledger | searchController.getSearchArLedger | searchService/searchRepository | products, customers, users, salesOrders, master_orders, arLedgers, inventories | Không rõ trong OpenAPI; kiểm tra handler | Bearer JWT; role guard tùy route |
| GET | /api/search/customers | searchController.getSearchCustomers | searchService/searchRepository | products, customers, users, salesOrders, master_orders, arLedgers, inventories | Không rõ trong OpenAPI; kiểm tra handler | Bearer JWT; role guard tùy route |
| GET | /api/search/delivery-staff | searchController.getSearchDeliveryStaff | searchService/searchRepository | products, customers, users, salesOrders, master_orders, arLedgers, inventories | Không rõ trong OpenAPI; kiểm tra handler | Bearer JWT; role guard tùy route |
| GET | /api/search/master-orders | searchController.getSearchMasterOrders | searchService/searchRepository | products, customers, users, salesOrders, master_orders, arLedgers, inventories | Không rõ trong OpenAPI; kiểm tra handler | Bearer JWT; role guard tùy route |
| GET | /api/search/orders | searchController.getSearchOrders | searchService/searchRepository | products, customers, users, salesOrders, master_orders, arLedgers, inventories | Không rõ trong OpenAPI; kiểm tra handler | Bearer JWT; role guard tùy route |
| GET | /api/search/products | searchController.getSearchProducts | searchService/searchRepository | products, customers, users, salesOrders, master_orders, arLedgers, inventories | Không rõ trong OpenAPI; kiểm tra handler | Bearer JWT; role guard tùy route |
| GET | /api/search/sales-staff | searchController.getSearchSalesStaff | searchService/searchRepository | products, customers, users, salesOrders, master_orders, arLedgers, inventories | Không rõ trong OpenAPI; kiểm tra handler | Bearer JWT; role guard tùy route |
| GET | /api/search/staffs | searchController.getSearchStaffs | searchService/searchRepository | products, customers, users, salesOrders, master_orders, arLedgers, inventories | Không rõ trong OpenAPI; kiểm tra handler | Bearer JWT; role guard tùy route |
| GET | /api/search/users | searchController.getSearchUsers | searchService/searchRepository | products, customers, users, salesOrders, master_orders, arLedgers, inventories | Không rõ trong OpenAPI; kiểm tra handler | Bearer JWT; role guard tùy route |
| GET | /api/search/{type} | searchController.getSearchType | searchService/searchRepository | products, customers, users, salesOrders, master_orders, arLedgers, inventories | Không rõ trong OpenAPI; kiểm tra handler | Bearer JWT; role guard tùy route |
| GET | /api/staffs | UsersController.handler | userService/userRepository | users, roles/permissions | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/stock | StockController.getStock | inventoryStock.service | inventories, products | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/stock-card | StockCardController.getStockCard | InventoryReportService | stockTransactions, products, inventories | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/system/api-monitor | systemController.getSystemApiMonitor | systemService/apiMonitor | system metadata, audit logs, in-memory metrics | Không/không khai báo | Bearer JWT; role guard tùy route |
| POST | /api/system/api-monitor/reset | systemController.postSystemApiMonitorReset | systemService/apiMonitor | system metadata, audit logs, in-memory metrics | Không/không khai báo | Bearer JWT; role guard tùy route |
| POST | /api/system/backup | systemController.handler | systemService/apiMonitor | system metadata, audit logs, in-memory metrics | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/system/backups | systemController.getSystemBackups | systemService/apiMonitor | system metadata, audit logs, in-memory metrics | Không/không khai báo | Bearer JWT; role guard tùy route |
| POST | /api/system/backups/{fileName}/verify | systemController.postSystemBackupsFileNameVerify | systemService/apiMonitor | system metadata, audit logs, in-memory metrics | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/system/data-source | systemController.getSystemDataSource | systemService/apiMonitor | system metadata, audit logs, in-memory metrics | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/system/health | systemController.getSystemHealth | systemService/apiMonitor | system metadata, audit logs, in-memory metrics | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/system/health/db | systemController.getSystemHealthDb | systemService/apiMonitor | system metadata, audit logs, in-memory metrics | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/system/reconciliation-reports | systemController.getSystemReconciliationReports | systemService/apiMonitor | system metadata, audit logs, in-memory metrics | Không/không khai báo | Bearer JWT; role guard tùy route |
| POST | /api/system/reconciliation/run | systemController.postSystemReconciliationRun | systemService/apiMonitor | system metadata, audit logs, in-memory metrics | Không/không khai báo | Bearer JWT; role guard tùy route |
| POST | /api/system/reset | systemController.handler | systemService/apiMonitor | system metadata, audit logs, in-memory metrics | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/system/settings | systemController.handler | systemService/apiMonitor | system metadata, audit logs, in-memory metrics | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/system/settings/{key} | systemController.getSystemSettingsKey | systemService/apiMonitor | system metadata, audit logs, in-memory metrics | Không/không khai báo | Bearer JWT; role guard tùy route |
| PUT | /api/system/settings/{key} | systemController.putSystemSettingsKey | systemService/apiMonitor | system metadata, audit logs, in-memory metrics | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/system/status | systemController.handler | systemService/apiMonitor | system metadata, audit logs, in-memory metrics | Không/không khai báo | Public hoặc guard riêng |
| GET | /api/users | UsersController.handler | userService/userRepository | users, roles/permissions | Không/không khai báo | Bearer JWT; role guard tùy route |
| POST | /api/users | UsersController.handler | userService/userRepository | users, roles/permissions | Không/không khai báo | Bearer JWT; role guard tùy route |
| DELETE | /api/users/{id} | UsersController.deleteUsersId | userService/userRepository | users, roles/permissions | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/warehouse-advanced/reservations | WarehouseAdvancedController.getWarehouseAdvancedReservations | WarehouseService | warehouses, inventories, stockTransactions | Không/không khai báo | Bearer JWT; role guard tùy route |
| POST | /api/warehouse-advanced/reservations | WarehouseAdvancedController.postWarehouseAdvancedReservations | WarehouseService | warehouses, inventories, stockTransactions | Không/không khai báo | Bearer JWT; role guard tùy route |
| POST | /api/warehouse-advanced/reservations/{id}/release | WarehouseAdvancedController.postWarehouseAdvancedReservationsIdRelease | WarehouseService | warehouses, inventories, stockTransactions | Không/không khai báo | Bearer JWT; role guard tùy route |
| GET | /api/warehouse-advanced/stock-counts | WarehouseAdvancedController.getWarehouseAdvancedStockCounts | WarehouseService | warehouses, inventories, stockTransactions | Không/không khai báo | Bearer JWT; role guard tùy route |
| POST | /api/warehouse-advanced/stock-counts | WarehouseAdvancedController.postWarehouseAdvancedStockCounts | WarehouseService | warehouses, inventories, stockTransactions | Không/không khai báo | Bearer JWT; role guard tùy route |

## Phụ lục B — API aliases cần tính chung khi benchmark

- `/api/sales-orders` và `/api/orders` cùng mount `orderRoutes`.
- `/api/products` và `/api/mobile-sales/products` cùng mount `productRoutes`.
- Report legacy `/api/stock`, `/api/inventory-movement`, `/api/stock-card`, `/api/debts*`, `/api/dashboard` cùng tồn tại với `/api/reports/*`.
- `/api/master-orders/delivery-today` và `/api/delivery-today` cùng gọi `masterOrderController.listDeliveryToday`.
- `/api/mobile/customers` và `/api/mobile/products` forward sang `/api/mobile/catalog/*`.

Khi đo traffic, phải gộp alias về cùng handler/query plan để không đánh giá thấp tần suất.
