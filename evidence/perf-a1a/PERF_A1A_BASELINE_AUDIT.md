# PERF-A1A Baseline Audit và Performance Contract

## Kết luận gate

**Trạng thái tổng thể: `PASS_WITH_DEFERRED_RUNTIME`**

- **E1 — Source/static evidence:** PASS.
- **5 artifact bắt buộc:** PASS.
- **Production source bị sửa:** Không.
- **Source ZIP mới được tạo:** Không.
- **E2/E3:** Được ghi nhận là deferred cho PERF-A1B và các gate triển khai; không chặn PERF-A1A.

### Runtime evidence được hoãn đúng chính sách

1. Chưa có MongoDB production-like/sanitized dataset để tái đo p50/p95, query count, `docsExamined`, `keysExamined` và `explain("executionStats")`.
2. Chưa có index list/index stats production để xác minh unique AR idempotency guard và index drift.
3. ZIP không chứa `node_modules`; không tự cài dependency từ mạng và không chạy migration/index/write script.
4. Baseline latency 16/26/60 đơn được giữ nhãn **reported baseline**, không giả mạo thành benchmark đã tái hiện.

Các thiếu hụt trên là đầu vào của PERF-A1B, không thỏa điều kiện `BLOCKED_ENGINEERING` vì source đọc được, không hỏng và call graph truy vết đầy đủ.

## 1. Baseline identity

| Mục | Giá trị |
|---|---|
| Input ZIP | `MK-pro-phaseA-canonical-delivery-financial-read-model-fixed(1).zip` |
| SHA-256 | `07d8b6cf20394bd63beddf736e163a7268c360f67fbf87f7a2dca0f500db456d` |
| Kích thước ZIP | 5,318,757 bytes |
| Source tree hash sau giải nén¹ | `d263e9dbc951aa52792a8310aa8065d81bc96880f73726ecf37952513633232c` |
| Số file | 2,135 |
| Số thư mục | 158 |
| Dung lượng giải nén | 19,144,946 bytes |
| Package manager | npm (`package-lock.json`, `.npmrc`) |
| Package | `kho-minh-khai-pro-v45-delivery-3tabs` `1.0.0` |
| Entry point | `server.js` |
| Node engine | `>=20.20 <23` |
| npm engine | `>=10` |
| Runtime audit container | Node v22.16.0; npm 10.9.2 |
| Test framework | Node built-in test runner (`node --test`) + `scripts/run-tests.js` |

¹ Thuật toán: SHA-256 trên `relative_path\0file_bytes\0` của toàn bộ file theo thứ tự path tăng dần.

## 2. Toolchain và command contract đọc từ repo

### Có sẵn

- Start: `node server.js`
- Dev: `node server.js`
- Test: `node scripts/run-tests.js`
- OpenAPI test: `node --test test/openapi.test.js`
- Syntax: `node scripts/check-js-syntax.js`
- Quality: `node scripts/run-quality-gate.js`
- Legacy quality: `npm run check:lock-registry && npm run check:path-portability && npm run check:syntax && npm run check:source-bundles && npm run check:source-size && npm run check:csp-xss && npm run check:enterprise && npm run docs:check && npm test && npm audit --omit=dev --audit-level=high`
- Source bundle build/check:
  - `node scripts/build-source-bundles.js`
  - `node scripts/build-source-bundles.js --check`
- API benchmark: `node scripts/performance/api-benchmark.js`
- Canonical delivery financial benchmark: `node --expose-gc scripts/performance/benchmark-canonical-delivery-financial-read-model.js`
- Mongo index registry/apply: `node scripts/ensure-mongo-indexes.js`
- Mongo index audit: `node scripts/audit-mongo-indexes.js`

### Không có

- Không có script `lint` chuẩn độc lập.
- Không có script `typecheck`; codebase JavaScript, không thấy TypeScript build.
- Không có application compile build truyền thống; build-like gate là syntax/source bundle/docs/quality.

## 3. Kiến trúc và quy mô

| Khu vực | Vai trò |
|---|---|
| `server.js`, `src/app.js` | Bootstrap Express |
| `src/routes`, `src/controllers` | HTTP boundary |
| `src/services` | Business logic, command/read orchestration |
| `src/repositories`, `src/models` | Mongo/Mongoose access |
| `public` | Web/mobile frontend |
| `scripts` | Benchmark, migration, index governance, quality gate |
| `test` | Unit/static/integration contract tests |
| `docs`, `config`, `reports`, `evidence` | Contracts và evidence lịch sử |

Dự án là monolith lớn: 2,135 file, nhiều phase compatibility và legacy identity/date alias. Hiệu năng không thể tối ưu an toàn chỉ bằng “thêm index”; cần giảm query orchestration, chuẩn hóa identity/date và chuyển aggregate sang read model.

## 4. Reported baseline

> Các số dưới đây do người dùng cung cấp; chưa tái đo độc lập trong gate này.

| Endpoint | Workload | Total | Query |
|---|---:|---:|---:|
| Bulk commit | 16 đơn | 55.288s | 252 |
| Bulk commit | 26 đơn | 89.839s | 413 |
| Bulk commit | 60 đơn | 210.881s | 986 |
| Delivery orders | request hiện tại | 2.1-2.7s | chưa tái đo |
| Suggestions | request hiện tại | 1.3-1.7s | chưa tái đo |
| Sales-staff dashboard | request hiện tại | 2.4-4.0s | chưa tái đo |
| Delivery-summary dashboard | request hiện tại | 1.2-1.3s | chưa tái đo |

### Suy luận được source hỗ trợ

- Bulk query/order:
  - 252 / 16 = **15.75**
  - 413 / 26 = **15.88**
  - 986 / 60 = **16.43**
- Total/order:
  - 55.288 / 16 = **3.46s**
  - 89.839 / 26 = **3.46s**
  - 210.881 / 60 = **3.51s**

Độ tuyến tính rất cao khớp với source: vòng `for` tuần tự, transaction từng đơn và chuỗi reconcile/correction/read-back lặp lại.

## 5. Phát hiện theo mức độ

## P0 — Rủi ro correctness phải khóa trước khi tăng concurrency

### P0.1 Bulk-commit là `N × command-query-chain`

`DeliveryAdjustmentBulkCommitService.commitManyAdjustments` xử lý từng target tuần tự và gọi một transaction riêng cho mỗi đơn. Mỗi transaction lại truy vấn order, latest version, AR balance/idempotency, correction state, payment allocation, safety balance và after-balance.

**Tác động:** latency và query gần tuyến tính theo số đơn; 60 đơn đạt ~210.9 giây/986 query.

**Không được làm:** bỏ transaction, bỏ safety balance, bỏ idempotency hoặc bỏ after-write verification.

### P0.2 AR idempotency DB guard chưa được static source bảo đảm là unique

Main managed registry khai báo `idx_arledger_idempotencyKey` **non-unique**. Unique guards được triển khai bằng script riêng sau data audit. Không có DB evidence để xác nhận production đã apply.

**Tác động:** contract “duplicate ledger = 0” chưa thể PASS chỉ bằng application check, nhất là khi chuyển sang concurrency.

### P0.3 Canonical financial parity là hard constraint

Bulk, delivery list, dashboard và reports cùng đọc/resolve order identity, return, allocation/version và AR theo nhiều đường khác nhau. Tối ưu từng endpoint riêng dễ tạo split-brain.

**Contract:** sai lệch công nợ tuyệt đối 0; returnOrders/AR/Fund SSoT không thay đổi.

## P1 — Bottleneck lớn

### P1.1 Delivery orders đọc dư và phân trang sau JavaScript

- SalesOrder query có thể đọc `max(limit*5,500)`, cap 2000.
- Date/staff filters dùng nhiều alias/regex và có phần lọc sau query.
- Master metadata lookup limit tối thiểu 1000.
- Latest versions và allocations được resolve trong JS.

**Tác động:** p95 2.1-2.7s dù query count cố định.

### P1.2 Suggestions dùng regex rộng

Order/customer suggestion dùng case-insensitive regex trên nhiều field. Các index B-tree hiện tại không giúp nhiều cho substring regex không neo.

**Tác động:** p95 1.3-1.7s; khó đạt 200-400ms ổn định.

### P1.3 Dashboard read model fallback quá đắt

- Read model thiếu một ngày -> fallback live cho toàn range.
- Sales dashboard fallback chạy nhiều aggregate/query song song.
- Delivery dashboard fallback chạy master aggregate, child order query và return aggregates.
- Cache result `fallback-live-query` không được coi là cache hit.

### P1.4 Dashboard cache invalidation có lỗi key-prefix

`invalidate(period)` xóa `${period}:*`, trong khi key thật bắt đầu `sales-staff:` hoặc `delivery-summary:`. Rủi ro stale cache nếu caller tin rằng đã invalidate.

### P1.5 Report Center tạo resource fan-out

`data-quality` chạy bốn full/export reports song song. Nhiều report xử lý/filter/paginate sau khi tải tập dữ liệu rộng.

**Tác động:** một request có thể tạo DB/CPU/RAM spike; song song giảm wall-clock nhưng tăng áp lực hệ thống.

### P1.6 Closeout version index governance rời rạc

`deliveryCloseoutVersions` không có entry trong main managed index registry. Script rời cũng chưa bao phủ query latest theo toàn bộ identity aliases + sort.

## P2 — Cải thiện và điểm mạnh

### Điểm mạnh

- Delivery orders đã dùng projection, `lean()` và batch joins song song; không có per-order N+1.
- Managed index registry và index audit service đã tồn tại.
- DashboardDailyStat read model và cache TTL đã tồn tại.
- Report facade lazy-load.
- Có read/action endpoint contracts, feature-oriented test suite và benchmark scripts.
- Bulk transaction scope theo từng đơn tránh transaction 60 đơn quá lớn.

### Cải thiện P2

- Chuẩn hóa `canonicalOrderKey`, `businessDateKey`, normalized staff/search fields.
- Thêm `.limit(1)` cho latest single-order lookup.
- Ghi metrics `docsExamined/returned`, query fingerprint và read-model completeness.
- Tách preview report khỏi full export.
- Dùng shared cache/version counter thay vì 7 freshness queries.

## 6. Query/transaction/caching assessment theo endpoint

| Endpoint | Query shape | Tuần tự/song song | N+1 | Transaction | Cache/read model |
|---|---|---|---|---|---|
| Bulk commit | ~16 query/order theo reported baseline | **Tuần tự theo order** | `N × chain` | 1 transaction/order | Không có batch context |
| Delivery orders | 1-2 primary + 3 batch joins | joins song song | Không per-order | Không | Canonical financial reader |
| Suggestions | 1 staff hoặc 1 SalesOrder query + JS | đơn | Không | Không | Không |
| Sales-staff dashboard | read model hoặc 6 live branches | fallback song song | Không per-row | Không | Daily stats + process-local cache |
| Delivery dashboard | read model hoặc 5 live branches; month branch 2 queries | fallback song song | Không per-master | Không | Daily stats + process-local cache |
| Report Center data-quality | 4 full reports | song song | Domain-dependent batch joins | Không | Chưa dùng anomaly snapshot trên request |

Chi tiết query fingerprint nằm trong `PERF_A1A_QUERY_INVENTORY.csv`.

## 7. Performance Contract

| Hạng mục | Gate đầu | Mục tiêu dài hạn |
|---|---:|---:|
| Bulk 60 đơn | ≤45 giây | ≤20 giây hoặc chuyển job |
| Bulk query 60 đơn | ≤500 | ≤300 |
| Delivery orders p95 | ≤1 giây | ≤500ms |
| Suggestions p95 | ≤400ms | ≤200ms |
| Dashboard cache hit | ≤150ms | giữ ổn định |
| Dashboard read model complete | ≤500ms | giữ ổn định |
| Sai lệch công nợ | 0 | 0 |
| Duplicate ledger | 0 | 0 |
| 5xx | Không tăng | Giảm/không tăng |
| Transaction/idempotency | Bắt buộc giữ | Bắt buộc giữ |

### Điều kiện đo hợp lệ

- Cùng dataset/scope, cùng Mongo tier/region, warm-up xác định.
- Tối thiểu 3 run; báo p50/p95/max và query count.
- Tách cache hit/cache miss/read model/fallback.
- Ghi source SHA, feature flags, index list và explain evidence.
- So sánh financial snapshot trước/sau; không chỉ so HTTP 200.

## 8. Phương án nâng cấp

### Phương án A — Production-grade dài hạn (khuyến nghị)

1. Gate A1B: benchmark có query tracing + production-like index/explain audit.
2. Bulk:
   - prefetch batch orders/versions/returns/allocations/AR/idempotency;
   - bounded concurrency nhỏ theo transaction từng order;
   - unique idempotency DB guard;
   - nếu vẫn >20s, chuyển async job có progress/checkpoint.
3. Delivery list:
   - canonicalOrderKey/businessDateKey;
   - DB-native filter/sort/keyset pagination;
   - current-state read model cho latest version/allocation.
4. Suggestions: normalized search projection/prefix index hoặc Atlas Search.
5. Dashboard/Report:
   - backfill/repair daily stats;
   - shared cache + đúng invalidation;
   - reporting/anomaly snapshots;
   - preview DB pagination, export streaming/job.

**Lợi ích:** đạt mục tiêu dài hạn, giảm tải toàn hệ thống, giữ consistency.  
**Nhược điểm:** migration và parity testing lớn.  
**Effort:** Hard.  
**Rủi ro:** High nếu rollout không có shadow/feature flag; giảm bằng gate và canary.

### Phương án B — Cân bằng effort

1. Thêm `.limit(1)` cho single-order latest version lookup sau RED test.
2. Prefetch batch context tối thiểu cho bulk, nhưng giữ commit tuần tự hoặc concurrency=2.
3. Bổ sung compound indexes dựa trên explain; chưa migration toàn bộ identity.
4. Dashboard: backfill daily stats, sửa cache invalidation, giữ process-local cache.
5. Reports: giới hạn preview, chặn data-quality full fan-out bằng timeout/concurrency guard.

**Lợi ích:** cải thiện nhanh, thay đổi nhỏ hơn.  
**Nhược điểm:** legacy aliases và JS filtering vẫn còn; khó đạt ≤20s/≤500ms bền vững.  
**Effort:** Medium.  
**Rủi ro:** Medium; dễ tạo “tối ưu cục bộ” nếu thiếu parity test.

## 9. Commands đã thực hiện

| Command | Exit code | Kết quả |
|---|---:|---|
| `node --check src/services/delivery/DeliveryAdjustmentBulkCommitService.js` | 0 | PASS |
| `node --check src/services/delivery/DeliveryAdjustmentCommitService.js` | 0 | PASS |
| `node --check src/services/v2/deliveryTodayNew.service.js` | 0 | PASS |
| `node --check src/services/dashboard/HomeDashboardService.js` | 0 | PASS |
| `node scripts/check-js-syntax.js` | 0 | PASS — 1,583 JavaScript files |
| `node --test test/delivery-adjustment-bulk-commit-static.test.js` | 0 | PASS — 4/4 |
| `node --test test/canonical-delivery-read-only-boundary-static.test.js` | 0 | PASS — 7/7 |
| `node --test test/report-center-route-contract.test.js` | 0 | PASS — 2/2 |

Tổng kiểm chứng offline bổ sung: **13/13 test PASS**. Không gọi Mongo, không chạy migration, không apply/drop index, không cài dependency và không thay đổi production source.

## 10. Requirement status

| Requirement | Trạng thái | Evidence |
|---|---|---|
| A1A-REQ-001 Baseline | PASS | E1: ZIP SHA, tree hash, toolchain, scripts, architecture, scale |
| A1A-REQ-002 Hot endpoint trace | PASS | E1: route → controller/service → model/query, transaction/cache/index risks |
| A1A-REQ-003 Query inventory | PASS | E1: 29 fingerprints, đủ trường bắt buộc |
| A1A-REQ-004 Performance contract | PASS | E1: gate đầu + long-term + correctness invariants |
| A1A-REQ-005 Requirement matrix | PASS | E1: 19 requirements phủ PERF-A1A đến PERF-A6 |

## 11. Gate decision và handoff

**Gate PERF-A1A: `PASS_WITH_DEFERRED_RUNTIME`.**

PERF-A1B được phép tiếp nhận các evidence còn thiếu:

1. Dependency-resolved workspace theo `package-lock.json`.
2. Mongo production-like hoặc sanitized snapshot.
3. Read-only index list, `$indexStats` và `explain("executionStats")`.
4. Benchmark có dataset ID, warm-up, tối thiểu 3 run và p50/p95/max.
5. Xác minh unique ledger guard trước khi bật bounded concurrency.

`BLOCKED_ENGINEERING` chỉ áp dụng nếu source không đọc được, source hỏng hoặc không thể truy call graph; không có điều kiện nào xảy ra trong audit này.
