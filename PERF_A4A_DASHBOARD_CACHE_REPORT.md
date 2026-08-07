# PERF-A4A — Dashboard Cache và Read Model Hardening

## Gate decision

**PASS_WITH_DEFERRED_RUNTIME**

- E1 source/static: PASS.
- E2 deterministic offline: PASS.
- E3 Mongo/shared-cache/production p95: deferred to PERF-A6.
- Feature flags `PERF_DASHBOARD_CACHE_V2` và `PERF_DASHBOARD_READ_MODEL_V2` mặc định OFF.
- Không kết nối Mongo, không chạy repair/backfill, không thay đổi production data.

## Root cause

### Cache invalidation

Cache key thực tế có dạng `sales-staff:2026-08:*` và `delivery-summary:2026-08:*`, nhưng implementation cũ chỉ xóa khi key bắt đầu bằng `2026-08:`. Vì vậy `invalidate("2026-08")` không xóa hai cache detail endpoint.

Strict freshness cũ còn có thể chạy 7 `findOne().sort()` trên mỗi cache read khi bật `HOME_DASHBOARD_CACHE_STRICT_FRESHNESS=true`.

### Read model completeness

`DashboardDailyStatsService` đã phát hiện ngày thiếu nhưng chỉ trả `null`. Caller chuyển sang live query mà không giữ đầy đủ `missingDates`, `sourceVersion` và `sourceTimestamp`; completeness/fallback source không đủ quan sát để repair có kiểm chứng.

## Cache V2 design

- Canonical key: `dashboard-cache:v2:<module>:period=<period>:date=<date>:scope=<hash>`.
- Exact tags: module, period, scope và cache version.
- Reverse tag index xóa đúng key, không dùng substring.
- Cache hit V2 không gọi Mongo freshness query.
- Entry lưu cache version, source version, source timestamp, generatedAt và TTL.
- TTL chỉ là lớp phòng thủ; mutation đã xác nhận gọi invalidation.
- Store mặc định là process-local và được khai báo rõ **không phải shared cache**.
- Có store contract để thay adapter; cross-process shared-cache validation dời PERF-A6.
- Safe fallback: legacy TTL path hoặc live query.

## Read-model completeness design

- Enumerate đầy đủ ngày nghiệp vụ đến `min(dateTo, today)`.
- Detect `missingDates`, duplicate dates, invalid dates và unexpected dates.
- Complete path trả `meta.source=dashboardDailyStats`, `generatedAt`, `sourceTimestamp`, `sourceVersion`, `missingDates=[]`.
- Thiếu một ngày hoặc dữ liệu không hợp lệ: full live fallback; không silently mix nguồn và không cache fallback incomplete.
- Partial live-fill chỉ được planner cho phép khi caller chứng minh parity; endpoint mặc định không bật.
- Repair command dry-run-first, apply cần `--apply --confirm-repair`, chỉ rebuild ngày thiếu và verify lại.

## RED → GREEN evidence

| Evidence | RED | GREEN |
|---|---:|---:|
| Period invalidation | 2/2 stale keys còn lại | 2/2 key bị xóa |
| Strict freshness Mongo calls/cache read | 7 | 0 |
| A4A tests | 1 PASS + 2 expected FAIL | 25/25 PASS |
| Full PERF regression | — | 125/125 PASS |
| Relevant dashboard contracts | — | 20/20 PASS |
| JavaScript syntax | — | 1.640/1.640 PASS |

## Dashboard parity

Sales-staff deterministic snapshot:

- orderCount 3; salesAmount 300; pendingSalesAmount 30.
- returnAmount 15; netSalesAmount 285.
- todaySalesAmount 220; current debt 30.

Delivery deterministic snapshot:

- Month: assigned 3, delivered 2.
- Today: assigned 2, pending 1.

Snapshot SHA-256: `d4a1556a1c0541de0fc97d45a99b8d7d69f1a31336271dade851929cb0bbb4e9`.

Scope A/B cache keys độc lập. Cache hit không gọi target, live aggregate hoặc read-model query. Confirmed `DashboardDailyStat` upsert làm cache của period mất hiệu lực sau khi write thành công.

## Fallback và repair

- Missing-one-day: `meta.source=fallback-live-query`, `missingDates=["2026-08-06"]`.
- Không cache response incomplete để repair hiển thị ngay.
- Dry-run: `npm run performance:perf-a4a:repair:dry -- --period=YYYY-MM`.
- Apply: `npm run performance:perf-a4a:repair -- --period=YYYY-MM`.
- Không có repair hoặc Mongo write nào được chạy trong gate.

## Known limitations / deferred runtime

- Process-local Map không đồng bộ giữa nhiều process/instance.
- Chưa chứng minh shared adapter, connection behavior hoặc production invalidation propagation.
- Chưa xác minh cache hit ≤150ms, read model ≤500ms hoặc production 5xx/p95.
- `test/home-dashboard.test.js` NOT_RUN vì ZIP không có `node_modules/mongoose`.
- Một static assertion `renderIndexPage()` đã fail ngay trên ZIP A3B đầu vào; không liên quan và không phát sinh từ A4A.

## Changed files

### Production

- `src/services/dashboard/DashboardCacheService.js`
- `src/services/dashboard/DashboardReadModelCompletenessService.js`
- `src/services/dashboard/DashboardDailyStatsService.js`
- `src/services/dashboard/HomeDashboardService.js`
- `src/models/DashboardDailyStat.js`

### Tooling/config

- `scripts/rebuild-dashboard-daily-stats.js`
- `scripts/performance/perf-a4a/repair-dashboard-read-model.js`
- `scripts/performance/perf-a4a/run-dashboard-repro.js`
- `package.json`
- `ENVIRONMENT_VARIABLES.md`

### Tests

- `test/performance/perf-a4a/*.test.js`

Không xóa file.
