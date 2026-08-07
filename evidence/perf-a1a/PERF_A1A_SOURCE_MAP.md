# PERF-A1A Source Map

**Dự án:** MK-Pro  
**Nguồn:** `MK-pro-phaseA-canonical-delivery-financial-read-model-fixed(1).zip`  
**SHA-256:** `07d8b6cf20394bd63beddf736e163a7268c360f67fbf87f7a2dca0f500db456d`  
**Gate:** `PASS_WITH_DEFERRED_RUNTIME`  
**Source tree SHA-256:** `d263e9dbc951aa52792a8310aa8065d81bc96880f73726ecf37952513633232c` (SHA-256 của chuỗi `relative_path\0file_bytes\0` theo thứ tự path tăng dần).  
**Phạm vi:** Static source audit E1; không sửa production source.  
**Sinh lúc:** 2026-08-06T09:37:01+07:00

## 1. Kiến trúc tổng quan

```text
server.js
└── src/app.js
    ├── src/routes/index.js
    │   ├── /api/new       -> newOperationsRoutes
    │   ├── /api/dashboard -> dashboardRoutes
    │   └── /api           -> reportRoutes
    ├── src/controllers
    ├── src/services
    │   ├── delivery / v2 / accounting
    │   ├── dashboard
    │   └── reports
    ├── src/repositories
    └── src/models -> MongoDB/Mongoose

public/        Web/mobile frontend
scripts/       migration, index audit, benchmark, quality gates
test/          Node built-in test runner tests
config/docs/   contracts, OpenAPI, deployment configuration
```

- Node.js/Express monolith, MongoDB/Mongoose.
- `src/services/mongoIndexService.js` là managed index registry chính.
- Một số index quan trọng của closeout correction/AR unique guard nằm trong script rời, không phải toàn bộ đều được đảm bảo bởi registry startup.
- Report facade lazy-load module, giảm startup memory nhưng không giảm query volume trên request.

## 2. Route map

| Endpoint | Route | Controller | Service chính | Model/collection chính |
|---|---|---|---|---|
| `POST /api/new/delivery-today/adjustments/bulk-commit` | `src/routes/newOperationsRoutes.js:260-292` | Inline async route | `DeliveryAdjustmentBulkCommitService.commitManyAdjustments` | SalesOrder, DeliveryCloseoutVersion, ReturnOrder, OrderPaymentAllocation, ArLedger |
| `GET /api/new/delivery-today/orders` | `src/routes/newOperationsRoutes.js:68-87` | Inline async route | `deliveryTodayNewService.listOrders` | SalesOrder, MasterOrder, ReturnOrder, DeliveryCloseoutVersion, OrderPaymentAllocation |
| `GET /api/new/delivery-today/suggestions` | `src/routes/newOperationsRoutes.js:52-66` | Inline async route | `deliveryTodayNewService.suggestions` | SalesOrder, User/Staff |
| `GET /api/dashboard/sales-staff` | `src/routes/dashboardRoutes.js:19`; `src/controllers/dashboardController.js:106-122` | `salesStaff` | `HomeDashboardService.getSalesStaffDashboard` | DashboardDailyStat, SalesTarget; fallback User/SalesOrder/ReturnOrder/ArLedger |
| `GET /api/dashboard/delivery-summary` | `src/routes/dashboardRoutes.js:20`; `src/controllers/dashboardController.js:124-140` | `deliverySummary` | `HomeDashboardService.getDeliveryDashboard` | DashboardDailyStat; fallback MasterOrder/SalesOrder/ReturnOrder/User |
| `GET /api/reports/*` | `src/routes/reportRoutes.js:29-52` | `reportController` | `ReportServiceFacade` / `ReportCenterService` | Theo domain report |

## 3. Hot path: bulk-commit

```text
newOperationsRoutes
└── DeliveryAdjustmentBulkCommitService.commitManyAdjustments
    └── for each target (SERIAL)
        └── withOptionalMongoTransaction (new session/transaction per order)
            └── DeliveryAdjustmentCommitService.commitOneAdjustment
                ├── SalesOrder.findOne(wide identity $or)
                ├── DeliveryCloseoutVersion.find(...).sort(...)  [không limit(1)]
                ├── OrderPaymentDebtReconcileService preflight
                │   ├── canonical AR balance lookup
                │   └── idempotency lookup
                ├── DeliveryCloseoutCorrectionService.createCorrection
                │   ├── return/version/allocation reads
                │   └── version/allocation/order writes as needed
                └── OrderPaymentDebtReconcileService apply/verify
                    ├── balance safety re-read
                    ├── pre-post idempotency re-read
                    ├── AR ledger post
                    └── after-balance re-read
```

### Điểm hiệu năng

- `DeliveryAdjustmentBulkCommitService.js:77-119` xử lý **tuần tự**.
- `transaction.util.js` tạo session/transaction riêng khi caller không truyền session dùng chung.
- Đây là mẫu `N × command-query-chain`, không phải chỉ một query N+1 đơn giản.
- Latest closeout query tải toàn bộ version rồi lấy `[0]`.
- Các safety re-read/idempotency guard là cần thiết cho correctness; không được cắt bỏ để lấy tốc độ.
- Bulk path chưa truyền các batch maps/caches mà reconcile service đã có hook hỗ trợ.

### Transaction

- Có transaction cho từng đơn.
- Không có transaction toàn 60 đơn, đây là lựa chọn an toàn về lock/rollback scope nhưng overhead cao khi chạy tuần tự.
- Phương án tối ưu phải giữ atomicity/idempotency theo đơn hoặc chuyển thành job có checkpoint.

## 4. Hot path: delivery orders

```text
deliveryTodayNewService.listOrders
├── deliveryTodayCanonicalOrderReader.listSalesOrders
│   ├── SalesOrder.find + projection + sort + limit
│   ├── JS normalize/filter date/staff
│   ├── MasterOrder.find metadata batch
│   └── JS enrich/filter/slice
└── Promise.all
    ├── ReturnOrder.find batch
    ├── DeliveryCloseoutVersion.find batch + JS latest
    └── OrderPaymentAllocation.find batch + JS current
```

### Điểm tốt

- Projection và `lean()` được dùng.
- Ba join chạy song song.
- Query count cố định; không query từng order.

### Bottleneck/rủi ro

- Reader có thể lấy `max(limit*5, 500)`, cap 2000 rồi mới lọc/cắt trong JavaScript.
- Date filter là `$or` nhiều kiểu Date/string/key/regex; delivery staff filter có trường hợp cố ý đẩy sang JS.
- Master metadata lookup tối thiểu limit 1000.
- Version query không limit theo từng identity; allocation query cap 5000.
- Tối ưu phải giữ legacy identity/date parity, nếu không có thể “nhanh nhưng thiếu đơn”.

## 5. Hot path: suggestions

```text
deliveryTodayNewService.suggestions
├── searchService.searchStaffs -> searchRepository.findStaffs
└── SalesOrder.find(match)
    ├── regex case-insensitive trên nhiều field
    ├── sort newest
    ├── limit 50-100
    └── JS de-duplicate/filter/project
```

- Keyword staff có guard tối thiểu 2 ký tự.
- Order/customer suggestions vẫn dựa vào regex rộng; B-tree index khó hỗ trợ substring regex không neo.
- Mục tiêu p95 200-400ms cần normalized prefix/search projection hoặc search engine/index chuyên dụng.

## 6. Dashboard

### Sales-staff

```text
HomeDashboardService.getSalesStaffDashboard
├── DashboardCacheService.freshnessVersion
├── cache read
├── SalesTarget lookup
├── DashboardDailyStatsService.buildSalesStaffDashboard
│   └── DashboardDailyStat.find(date range)
└── fallback khi read model thiếu/incomplete
    └── Promise.all: active users + sales aggregates + returns + debt
```

### Delivery-summary

```text
HomeDashboardService.getDeliveryDashboard
├── cache/read model
└── fallback Promise.all
    ├── active staff
    ├── MasterOrder aggregate -> SalesOrder children batch
    ├── delivery today aggregate
    └── return aggregates month/today
```

### Cache/read-model findings

- Cache là `Map` trong process, TTL mặc định 45 giây; không shared giữa instances.
- Cache hit bị từ chối nếu cached result có `meta.source === fallback-live-query`.
- `invalidate(period)` chỉ xóa key bắt đầu bằng `${period}:`; các key thực tế `sales-staff:${period}:...` và `delivery-summary:${period}:...` không khớp. Đây là lỗi invalidation/stale-data risk.
- Strict freshness nếu bật sẽ chạy 7 `findOne().sort()` trước mỗi cache read.
- `DashboardDailyStatsService` yêu cầu đủ mọi ngày; thiếu một ngày thì fallback live cho toàn range.

## 7. Reports và Report Center

| Domain | Source path | Query pattern |
|---|---|---|
| Tồn kho | `InventoryReportService` | `Product.find({})` full catalog + `StockTransaction.aggregate(...).allowDiskUse(true)` |
| Bán hàng | `SalesReportService` | active users + full Product map + SalesOrder aggregate + AR batch enrichment |
| Công nợ | Debt report services / canonical AR readers | ledger reads rồi group/filter/page |
| Quỹ | `FinanceReportService` | FundLedger canonical reads/summary |
| Trả hàng | `ReturnReportService` | ReturnOrder aggregate + AR return-credit batch lookup |
| Giao hàng | `DeliveryReportService` | MasterOrder + child SalesOrder + FundLedger, join trong JS |
| Dashboard report | `DashboardReportService` | fan-out nhiều domain aggregates |

### Report Center

- `GET /api/reports/run/data-quality`: `ReportCenterService.js:888-903` chạy **4 full/export reports song song**, rồi tạo anomaly rows và filter trong JS.
- `GET /api/reports/overview`: `ReportCenterService.js:914-953` gọi `DashboardReportService.dashboardReport`, không thấy reuse trực tiếp cache/read model của `HomeDashboardService`.
- Nhiều report preview vẫn lấy tập dữ liệu rộng/full rồi paginate sau assemble; nguy cơ RAM/CPU và DB spike.
- Song song giúp giảm wall-clock nhưng không giảm tổng tài nguyên; có thể làm chậm toàn hệ thống khi nhiều người chạy.

## 8. Index map quan trọng

### Có trong managed registry

- SalesOrder: id/code/order aliases, date/staff/status, customer/date, master aliases.
- ReturnOrder: nhiều alias + status/returnStatus.
- OrderPaymentAllocation: unique idempotency, unique order/source/version, các index đơn identity.
- ArLedger: nhiều identity/source/customer/date indexes; **managed idempotencyKey hiện là non-unique**.
- DashboardDailyStat: unique `date`, `month+date`.
- SalesTarget: unique `period+salesStaffCode`.
- StockTransaction/FundLedger: domain indexes tương đối đầy đủ.

### Không thể xác minh từ static source

- Index thật đang tồn tại trên production Mongo.
- `$indexStats`, cardinality, selectivity.
- `explain("executionStats")`.
- Unique AR idempotency guard đã được apply hay chưa.
- Closeout-version script rời đã chạy hay chưa.

### Khoảng trống đáng chú ý

- `deliveryCloseoutVersions` không có entry trong main `INDEX_DEFINITIONS`.
- Query latest version chưa được bao phủ bởi canonical identity + status + descending version.
- Delivery reader dùng `deliveryDateKey` nhưng managed SalesOrder indexes chủ yếu bắt đầu bằng `deliveryDate`.
- Suggestion regex không được giải quyết bằng các B-tree index hiện tại.

## 9. Nơi đọc rộng rồi lọc/phân trang trong JavaScript

1. Delivery orders: overfetch 5×/500-2000, normalize/filter/slice sau DB.
2. Latest versions: tải candidates rồi chọn latest trong JS.
3. Allocations: tải tối đa 5000 candidates rồi resolve current trong JS.
4. Suggestions: query candidates rồi de-duplicate/filter.
5. Report Center/report services: nhiều mẫu assemble full rows rồi paginate/filter.
6. Dashboard read model: tải toàn daily docs trong range rồi kiểm completeness; hợp lý ở volume nhỏ nhưng fallback rất đắt.

## 10. Cache/read model hiện có

- `DashboardDailyStat`: production-oriented read model, nhưng completeness policy còn “all-or-nothing”.
- `reportingSnapshots`: có model/index registry, chưa thấy được dùng trực tiếp cho toàn bộ Report Center hot path.
- Dashboard in-memory TTL cache.
- Delivery financial canonical read service/read mode đã tồn tại.
- Không thấy request-level batch context được tái sử dụng xuyên suốt bulk-commit.
