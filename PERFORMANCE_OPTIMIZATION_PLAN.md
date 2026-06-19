# MK-Pro Performance Optimization Plan

Trạng thái: đề xuất, chưa áp dụng  
Ngày: 2026-06-19  
Nguyên tắc: mỗi patch độc lập, giữ nguyên business rule/API contract/schema/index/package và phải có baseline trước–sau trên test DB.

## 1. Guardrails bắt buộc

- Không sửa logic tồn kho, công nợ, quỹ, trạng thái đơn, accounting confirmation, idempotency hoặc transaction để đổi lấy tốc độ.
- Không thêm/chỉnh index production nếu chưa có query thực tế và `explain("executionStats")` trên dataset đại diện.
- Không bỏ authentication, authorization, validation, audit hoặc security middleware.
- Không dùng `Promise.all()` không giới hạn cho tập dữ liệu lớn.
- Các luồng posting inventory/AR/fund, lock theo thứ tự, sync và transaction vẫn tuần tự nếu thứ tự là điều kiện đúng đắn.
- Mỗi patch phải có feature flag hoặc khả năng revert gọn nếu thay đổi query plan đáng kể.

## 2. P0 — Chặn fan-out và chứng minh bottleneck lớn

### P0.1 PERF-01 — Export master order tạo N+1 query

**Vị trí:** `src/services/excel/ExcelInteractionService.js`, `loadMasterOrders()`; helper đọc master/children trong `src/services/master-order/masterOrderQuery.impl.js`.

**Hiện trạng:** tối đa 2.000 selected IDs được đưa vào `Promise.all`; mỗi `getMasterOrder()` đọc master và children. Trường hợp xấu có thể phát sinh khoảng 4.000 query đồng thời.

**Phương án A — production-grade**

1. Normalize và de-duplicate identity để query, nhưng giữ nguyên danh sách ID đầu vào để ráp output đúng thứ tự và duplicate.
2. Đọc master theo `$in` theo chunk 200–500.
3. Đọc toàn bộ child orders cho các master tìm thấy theo batch/chunk.
4. Lập `Map` với chính quy tắc identity hiện tại; ráp kết quả theo thứ tự selected IDs.
5. Không thêm package; nếu cần chunk dùng helper cục bộ nhỏ.

```diff
- const rows = await Promise.all(ids.map(id => masterOrderService.getMasterOrder(id)));
+ const masters = await findMastersByIdentityChunked(ids, 250);
+ const childrenByMaster = await loadChildrenForMastersChunked(masters, 250);
+ const rows = ids.map(id => assembleExistingShape(id, masters, childrenByMaster));
```

- Effort: Medium.
- Lợi ích kỳ vọng: từ gần `2N` query xuống khoảng `2 × ceil(N/chunkSize)`; với 2.000 ID và chunk 200–500 là khoảng 8–20 query; loại burst 4.000 promise.
- Rủi ro: sai priority giữa `_id`/code/alias, mất thứ tự, duplicate selected ID, master thiếu.
- Regression: 0/1/100/500/2.000 ID; duplicate; invalid ID; mixed `_id` và code; thứ tự sheet; giá trị/format workbook bit-for-bit.
- Tiêu chí đạt: query count tăng theo số chunk, không theo `2N`; output semantic parity 100%; không timeout ở 2.000 ID.
- Rollback: revert riêng batch helper và `loadMasterOrders()`.

**Phương án B — effort thấp**

Chia IDs thành chunk 25 và chạy tuần tự từng chunk, vẫn gọi `getMasterOrder()` hiện tại. Query count không giảm nhưng pool không bị dội tức thời. Effort Easy, rủi ro thấp; chọn khi cần hotfix bảo vệ DB trước khi hoàn thiện batch read.

### P0.2 PERF-02 — Inventory movement đọc toàn bộ lịch sử

**Vị trí:** `src/services/reports/InventoryReportService.js`, `loadTransactionsUntil()` và `inventoryMovementReport()`; business-date expression trong `DashboardMongoExpressions.js`.

**Phương án A — production-grade**

- Trên test DB, tách raw-date prefilter an toàn trước bước normalize legacy date.
- Đưa product/category filter, grouping movement và pagination xuống aggregate.
- Dùng `$facet` cho `rows` và `summary`; chỉ đọc product/current inventory thật sự liên quan.
- Bảo toàn tuyệt đối opening, inbound, outbound, return, reversal, backcast và ending balance.

Effort Hard. Kỳ vọng giảm document truyền từ Mongo về Node từ toàn lịch sử xuống các group/page cần thiết; heap không còn tuyến tính theo toàn ledger. Rủi ro nghiệp vụ cao vì ledger có legacy date và reversal. Chỉ triển khai khi golden dataset cho kết quả bit-for-bit và `explain()` chứng minh scan giảm.

**Phương án B — cân bằng**

Giữ thuật toán Node hiện tại, thêm projection và raw-date prefilter có nhánh fallback legacy đã kiểm thử. Effort Medium; giảm I/O nhưng vẫn còn nhiều pass/full history ở dữ liệu cũ.

**Rollback:** giữ implementation cũ sau feature flag trong rollout đầu; tắt flag nếu lệch tổng hoặc p95 xấu hơn.

### P0.3 PERF-03 — Debt report xử lý toàn AR ở Node

**Vị trí:** `src/services/reports/DebtReportService.js`, `loadLedgersUntil()`, `periodDebtReport()`, `arLedgerDetailReport()`.

**Phương án A — production-grade**

- `$match` exact customer/date/accounting constraints sớm.
- Aggregate opening/period/closing trong Mongo.
- `$facet` summary và rows page; running balance phải có thiết kế riêng và golden tests.
- Chỉ project field cần cho response hiện tại.

Effort Hard. Kỳ vọng giảm toàn bộ AR transfer và Node sort/group. Rủi ro: số dư đầu kỳ, credit classification, cùng timestamp/thứ tự ledger. Rollback bằng feature flag query implementation.

**Phương án B — cân bằng**

Push exact customerCode và projection vào query hiện tại; giới hạn range theo rule được product duyệt. Effort Easy/Medium; chỉ giúp detail/customer-specific, không xử lý triệt để summary toàn khách.

## 3. P1 — Query pushdown và giới hạn dữ liệu

### PERF-04 — Sales/report pipeline tải dư dữ liệu

- **A:** tách summary pipeline/page pipeline; project field tối thiểu; chỉ tải product codes thật sự được tham chiếu; giữ valuation/snapshot semantics. Effort Hard. Regression: giá bán, khuyến mại, duplicate items, return, AR allocation, date boundaries.
- **B:** projection order/AR và cache product map TTL ngắn với invalidation hiện có. Effort Easy. Cache không che query sai và không được là điều kiện correctness.
- **Expected:** giảm heap/I/O; target cụ thể chỉ chốt sau baseline test DB.
- **Rollback:** revert projection/cache patch độc lập.

### PERF-05 — Dashboard fan-out 11 DB operations

- **A:** lập request-scoped query plan, giới hạn concurrency 3–4 bằng worker loop không dependency; chỉ gộp ba sales aggregates bằng `$facet` khi parity đạt. Effort Hard.
- **B:** bật `HOME_DASHBOARD_CACHE_TTL_MS` có kiểm soát và hạn chế `refresh=1` theo role/rate; không đổi query. Effort Easy/Ops.
- **Rủi ro:** cache stale, invalidation thiếu, gộp pipeline làm lệch confirmed/pending/today.
- **Regression:** empty/large dashboard, refresh, version invalidation, timezone/day boundary, data-quality counters.
- **Rollback:** TTL về 0 hoặc tắt feature flag query plan.

### PERF-06 — Current inventory full-scan và không paginate

- **A:** `$match` search sớm, batch/lookup product cần thiết và `$facet` rows/summary. Nếu pagination làm đổi contract, phải tạo opt-in/version riêng và chờ duyệt. Effort Medium/Hard.
- **B:** giữ response contract, dùng cache full summary hiện có làm nguồn cho q-filter để tránh cold scan theo từng q. Effort Easy; cold cache vẫn full scan.
- **Rủi ro:** nhầm `onHand`/`availableQty`, alias product code, warehouse aggregation. Đây là correctness boundary bắt buộc.
- **Regression:** reconciliation fixtures, reserved stock, multi-warehouse, negative/zero, missing product, q Unicode.

### PERF-07 — Unmerged child orders tải tối đa 5.000 rows

- **A:** filter server-side và cursor pagination; nếu UI cần selection lớn, thêm endpoint/flow riêng theo phê duyệt contract. Effort Hard, cần API/UI approval.
- **B:** gộp 5 `.filter()` thành một pass và giữ hard cap hiện tại kèm cảnh báo telemetry. Effort Easy; payload lớn vẫn còn.
- **Rollback:** endpoint cũ song song trong giai đoạn chuyển đổi; không silent-change default response.

## 4. P2 — Search, mobile, import và Node processing

### PERF-08 — Regex contains rộng

- **A:** exact → prefix → contains fallback; đo `explain()` từng pha; giữ score/order hiện tại. Không đề xuất index trước bằng chứng. Effort Medium.
- **B:** exact code/barcode fast path trước query `$or` hiện tại. Effort Easy; search tên contains vẫn scan.
- **Regression:** Unicode/không dấu, code number/string, barcode, giá, ký tự regex, ordering, authorization scope.

### PERF-09 — Mobile customers tải sales tháng rồi group ở Node

- **A:** aggregate `$group` theo customerCode và chỉ trả metrics; batch cho danh sách customer page. Effort Medium.
- **B:** chỉ tính monthly sales cho page hiện tại hoặc hạ default limit sau khi mobile contract được duyệt. Effort Easy/Medium.
- **Rủi ro:** chọn sai field ngày/status/doanh số canonical; không được dùng order chưa xác nhận.

### PERF-10 — Import customer preload miss gây N+1

- **A:** preload một lần theo code/customerCode/phone/id và `_id: {$in}`; normalized map giữ priority hiện tại; miss sau preload là miss cuối. Effort Easy.
- **B:** chỉ thêm ObjectId batch vào preloader, giữ fallback cho non-ObjectId. Effort Easy, vẫn còn query miss khác.
- **Regression:** null, invalid ObjectId, string/number, duplicate aliases, cùng customer khớp nhiều field, row error order. Posting vẫn tuần tự.

### PERF-11 — Performance tracing/log bật mặc định

- **A:** feature flags cho query trace, sampling và slow-only; headers/response monitor không đổi; redact giữ nguyên. Effort Easy/Medium.
- **B:** cấu hình production `API_PERF_LOG=0`, `MOBILE_PERF_LOG=0`, giữ in-memory trace. Effort Ops/Easy.
- **Rủi ro:** mất visibility khi incident. Cần slow threshold và temporary enable runbook.

### PERF-12 — Response alias lặp payload

- **A:** versioned hoặc opt-in compact response, telemetry client usage rồi deprecate alias. Effort Hard và cần API approval.
- **B:** bật HTTP compression/caching phù hợp ở hạ tầng nếu đã có, không đổi JSON. Không thêm dependency trong patch này.
- **Rủi ro:** client cũ phụ thuộc alias. Không được tự ý xóa field.

### PERF-14 — `includes` trong loop autocomplete

- **A:** tạo `Set(canonicalCodes)` một lần và dùng `.has()`. Effort Easy, lợi ích nhỏ vì limit hiện tại ≤50.
- **B:** giữ nguyên; chỉ sửa khi cùng chạm file cho finding ưu tiên hơn và benchmark chứng minh có lợi.
- **Regression:** normalize code, string/number, null, duplicate và thứ tự.

## 5. Luồng phải bảo vệ, không parallel máy móc

### PERF-13 — Debt collection locks

Hai vòng lock/update tuần tự trong `DebtCollectionService.js` tạo khoảng `2N` query nhưng đang bảo vệ lock order và correctness.

- **A:** chỉ xem xét bulk/domain transaction design sau concurrency test và deadlock analysis; không nằm trong patch performance đầu tiên.
- **B:** giữ nguyên. Bổ sung metrics query count/lock wait để biết chi phí thật.

Tương tự, giữ tuần tự cho:

- Mobile sync có ordering/idempotency.
- Import theo chunk trong transaction.
- Nhận master return và posting inventory/AR.
- Xác nhận giao, posting AR/fund.
- Cập nhật nhiều dòng cùng product/order khi có race condition.

## 6. Kế hoạch P0–P3

| Phase | Patch độc lập | Điều kiện vào | Tiêu chí hoàn thành | Rollback |
| --- | --- | --- | --- | --- |
| P0.1 | Batch master-order export | Golden workbook + test DB | semantic parity; query count theo chunk; 2.000 IDs không pool burst | revert 2 file/helper |
| P0.2 | Prototype inventory movement | Seed 1/3/5 năm + explain | totals bit-for-bit; docs examined và p95 giảm có ý nghĩa | feature flag về legacy |
| P0.3 | Prototype debt period/detail | Golden AR ledger | opening/closing/running parity; p95/query scan giảm | feature flag về legacy |
| P1.1 | Sales report projection/pushdown | Sales fixtures đủ edge cases | schema/order/value parity | revert query implementation |
| P1.2 | Dashboard bounded plan/cache | freshness SLA được duyệt | không pool burst; stale ≤ SLA | TTL=0/disable flag |
| P1.3 | Inventory current query | semantics onHand/available đã khóa | summary parity, payload/query giảm | legacy implementation |
| P2.1 | Search two-phase | explain + relevance fixtures | order/result parity hoặc contract-approved | disable fast path |
| P2.2 | Mobile monthly sales aggregate | mobile dataset | metrics parity và p95 giảm | legacy group path |
| P2.3 | Import preload ObjectId | import fixtures | không N+1 miss; row results parity | revert preload patch |
| P3.1 | Slow-only profiling | security review | không PII/token; overhead <2% | env flags off |
| P3.2 | Benchmark regression CI | stable test dataset | trend p50/p95/p99/query count | non-blocking job |

## 7. Bằng chứng bắt buộc trước mọi index proposal

```text
Endpoint + controller/service/repository
Exact query filter
Sort
Projection
Dataset cardinality/distribution
Existing indexes
Winning plan
nReturned
totalDocsExamined
totalKeysExamined
executionTimeMillis
Candidate index
Estimated size/write amplification
Overlap với index hiện có
Before/after benchmark
```

Nếu thiếu các trường này, kết luận đúng là “chưa đủ bằng chứng”, không phải “cần thêm index”.

## 8. Regression gate chung

Mỗi patch chỉ được merge khi giữ nguyên:

- HTTP status, response keys/types và ordering đã cam kết.
- Authorization theo role/NVBH/NVGH/tenant.
- Giá, khuyến mại, tồn kho, công nợ, quỹ và trạng thái đơn.
- Transaction, idempotency và audit log.
- Kết quả dataset empty/one/large/null/duplicate/string-number/date-boundary.
- Failure/rollback behavior khi DB chậm, query fail và request đồng thời.

Performance gate đề xuất cho test DB:

- 0 timeout/error mới.
- Query/request không tăng ngoài lý do đã duyệt.
- p95 không regression quá 10% ở API liên quan.
- Patch P0 phải giảm ít nhất 50% query count hoặc docs examined tại dataset mục tiêu; nếu không đạt thì rollback thiết kế.
- Heap/RSS không tăng tuyến tính qua soak test.

## 9. Thứ tự khuyến nghị

Ưu tiên P0.1 vì bằng chứng tĩnh rõ nhất, phạm vi hẹp và không cần đổi contract/schema/index. P0.2 và P0.3 chỉ nên bắt đầu bằng benchmark/prototype trên test DB; không triển khai production khi chưa có golden parity và execution stats. Các thay đổi response/pagination/index là nhánh phê duyệt riêng, không gộp vào patch query nội bộ.
