# MK-Pro Performance Test Guide

Ngày: 2026-06-19  
Benchmark mới: `scripts/performance/api-benchmark.js`  
Phạm vi: GET-only, chạy lặp lại được, không tạo/xóa dữ liệu và không tự kết nối production.

## 1. Safety model

Script có các chốt sau:

- Chỉ phát `GET`; không hỗ trợ POST/PUT/PATCH/DELETE.
- Base URL mặc định là `http://127.0.0.1:3000`.
- URL không phải localhost bị từ chối, trừ khi người chạy chủ động đặt `PERF_ALLOW_REMOTE=true`.
- Có timeout cho từng request.
- Concurrency do người chạy cấu hình và mặc định không vượt các mức audit 1/5/10/20/50.
- JWT là biến môi trường, không ghi vào output.
- `PERF_IN_PROCESS=1` chỉ mở Express app trên port ngẫu nhiên; không gọi bootstrap DB/index/job.
- Không có cleanup database vì script không ghi dữ liệu. Output JSON, nếu bật, là artifact duy nhất.

Không dùng `PERF_ALLOW_REMOTE=true` cho production. Guard này chỉ dành cho môi trường test/QA đã được xác nhận.

## 2. Kiểm tra công cụ

```powershell
node scripts/performance/api-benchmark.js --help
node --check scripts/performance/api-benchmark.js
```

Runtime khuyến nghị: Node 20.20+ hoặc Node 22, đúng engine `>=20.20 <23` của dự án. Baseline audit ban đầu chạy trên Node 24.16 nên cần tạo lại mốc chính thức trên runtime được hỗ trợ.

## 3. Chạy không database

Đây là lệnh an toàn nhất để kiểm tra Express/middleware:

```powershell
$env:PERF_IN_PROCESS='1'
$env:PERF_ENDPOINTS='/api/health,/api/system/status'
$env:PERF_REQUESTS_PER_LEVEL='50'
$env:PERF_CONCURRENCY='1,5,10,20,50'
$env:PERF_OUTPUT="$env:TEMP\mk-pro-api-baseline.json"
node scripts/performance/api-benchmark.js
```

Trong mode này, tuyệt đối không thêm endpoint cần MongoDB rồi diễn giải failure thành lỗi hiệu năng; app không có database connection.

## 4. Chạy với server test độc lập

Điều kiện bắt buộc trước khi chạy:

1. `MONGO_URI` trỏ rõ ràng tới test database, không phải production/backup production có quyền ghi.
2. Dataset được seed cố định và có thể tái tạo.
3. Server được khởi động theo runbook của môi trường test.
4. Token là user test có role đúng và không chứa dữ liệu thật.
5. Tắt background jobs không liên quan nếu chúng làm nhiễu phép đo; ghi rõ cấu hình đã tắt.

Ví dụ gọi server local đang chạy:

```powershell
$env:PERF_BASE_URL='http://127.0.0.1:3000'
$env:PERF_ENDPOINTS='/api/sales-orders/search?q=A,/api/inventory/current'
$env:PERF_TOKEN='<test-jwt>'
$env:PERF_REQUESTS_PER_LEVEL='50'
$env:PERF_WARMUP_REQUESTS='5'
$env:PERF_CONCURRENCY='1,5,10,20'
$env:PERF_TIMEOUT_MS='10000'
$env:PERF_OUTPUT="$env:TEMP\mk-pro-test-db-baseline.json"
node scripts/performance/api-benchmark.js
```

Không đặt token trong file, command history dùng chung hoặc commit. Xóa biến sau khi chạy:

```powershell
Remove-Item Env:PERF_TOKEN -ErrorAction SilentlyContinue
```

## 5. Cấu hình benchmark

| Biến | Mặc định | Ý nghĩa |
| --- | --- | --- |
| `PERF_BASE_URL` | `http://127.0.0.1:3000` | Server đích |
| `PERF_IN_PROCESS` | false | Mở Express app nội bộ, không DB bootstrap |
| `PERF_ENDPOINTS` | health + status | Danh sách path phân cách dấu phẩy |
| `PERF_TOKEN` | rỗng | Bearer token cho endpoint GET được bảo vệ |
| `PERF_REQUESTS_PER_LEVEL` | 50 | Request mỗi endpoint/mức concurrency |
| `PERF_WARMUP_REQUESTS` | 3 | Request warm-up |
| `PERF_CONCURRENCY` | `1,5,10,20,50` | Các mức tải |
| `PERF_TIMEOUT_MS` | 5000 | Timeout mỗi request |
| `PERF_OUTPUT` | rỗng | Đường dẫn JSON output tùy chọn |
| `PERF_ALLOW_REMOTE` | false | Cho phép host không-local; không dùng production |

Output gồm success/failure/status, throughput, min/avg/median/p95/p99/max, response bytes, CPU/RSS/heap delta, event-loop delay và các header API monitor nếu endpoint phát chúng.

## 6. Đọc timing và query metrics

Middleware hiện có phát các header:

| Header | Ý nghĩa |
| --- | --- |
| `X-Response-Time-Ms` | Tổng thời gian server đo |
| `X-Mongo-Time-Ms` | Tổng thời gian Mongoose query/aggregate được trace |
| `X-JS-Time-Ms` | Phần còn lại được middleware quy về JS/non-Mongo |
| `X-DB-Queries` | Số Query/Aggregate `exec()` trong request |

Lưu ý:

- Query chạy ngoài AsyncLocalStorage/request context có thể không được đếm.
- Mongo time cộng dồn có thể khác wall time khi query chạy song song.
- `JS time` không tách chính xác controller/service/serialization/network.
- Response không có header thì script báo 0; 0 không tự động có nghĩa là endpoint đã truy vấn 0 lần.
- Process metrics của `PERF_IN_PROCESS=1` gồm cả client và server.

Muốn đo từng tầng chính xác hơn, patch profiling sau phê duyệt phải dùng feature flag, slow-only và không log token/body nhạy cảm.

## 7. Dataset chuẩn

Mỗi domain nên có ba kích thước seed cố định:

| Mức | Mục đích | Ví dụ |
| --- | --- | --- |
| S | Correctness/smoke | 0, 1, 10 record |
| M | Baseline thường ngày | 1k product/customer, 10k order, 100k ledger |
| L | Capacity/regression | 10k–100k master data, 100k–1m order/ledger tùy production distribution |

Dataset phải ghi:

- số document mỗi collection;
- date range và timezone;
- distribution status/role/warehouse/customer/product;
- average/max items per order;
- null/legacy/duplicate/alias rate;
- index list;
- seed commit/hash;
- hardware và MongoDB/Node version.

Không copy PII thật. Nếu snapshot production được phép dùng, phải anonymize và đặt trong môi trường cô lập theo chính sách dữ liệu.

## 8. Ma trận regression bắt buộc

| Case | Điều cần xác nhận |
| --- | --- |
| Dataset rỗng | Schema/status đúng, không chia 0/null bất ngờ |
| Một bản ghi | Giá trị và ordering đúng |
| Dataset lớn | p95/p99, query count, heap, timeout |
| Null/undefined | Normalize/fallback parity |
| Product/customer code string và number | Identity map không lệch |
| Mã trùng/alias | Priority hiện tại được giữ |
| Concurrent requests | Không race, deadlock, pool exhaustion |
| Database chậm | Timeout/error mapping đúng, không treo promise |
| Query fail | HTTP/error schema/audit đúng |
| Transaction rollback | Không partial inventory/AR/fund posting |
| Unauthorized/forbidden | 401/403 và không rò dữ liệu |
| Date filters | đầu/cuối ngày, timezone, legacy date |
| Pagination | page boundary, stable sort, total/summary |
| Regex search | Unicode, ký tự đặc biệt, empty/long q |
| Large response | bytes, serialization, memory |

Các domain-sensitive assertions:

- Sales: price, promotion, totals, ownership scope, order status.
- Inventory: ledger sum, `onHand`, reservation/availability semantics, reversal/idempotency.
- AR: opening/period/closing, debit/credit sign, allocation và running balance.
- Fund: source identity, amount, confirmation và rollback.
- Delivery/mobile: NVGH/NVBH scope, return/payment/confirm ordering.

## 9. MongoDB explain trên test DB

Chỉ thực hiện với chính query đã capture từ API test, giá trị parameter đại diện và quyền read-only nếu có thể.

```javascript
db.collection.explain('executionStats').find(
  /* exact filter */,
  /* exact projection */
).sort(/* exact sort */).limit(/* exact limit */)
```

Với aggregate:

```javascript
db.collection.explain('executionStats').aggregate([
  /* exact pipeline */
])
```

Lưu vào báo cáo:

```text
query/pipeline
existing indexes
winningPlan + rejectedPlans
nReturned
totalDocsExamined
totalKeysExamined
executionTimeMillis
response bytes
query count/request
```

Không dùng một lần explain cold-cache duy nhất để quyết định index. Chạy nhiều lần, ghi warm/cold state và đo write amplification/index size trước proposal production.

## 10. Lệnh test regression

Toàn suite hiện tại:

```powershell
node scripts/run-tests.js
```

Chạy nhóm file liên quan trực tiếp bằng Node test runner, ví dụ:

```powershell
node --test test/master-order-unmerged-query-behavior.test.js test/master-order-refactor-boundary.test.js test/excel-interaction-platform-behavior.test.js
node --test test/report-domain-accounting.test.js test/report-date-range-guard.test.js test/report-pagination-contract.test.js test/report-mongo-error-not-empty.test.js
node --test test/inventory-single-source.test.js test/inventory-posting-idempotency.test.js test/inventory-posting-atomic.test.js
node --test test/home-dashboard.test.js test/dashboard-summary-only.test.js
node --test test/mobile-catalog-month-sales-integration-static.test.js test/mobile-customer-ownership-scope.test.js
node --test test/import-sales-bulk-commit-performance-static.test.js test/debt-collection-import-atomic.test.js
```

Các static test không thay thế integration test MongoDB. Với patch query, cần thêm parity test chạy implementation cũ và mới trên cùng fixture rồi deep-compare response.

## 11. Quy trình before/after

1. Checkout cùng commit seed và reset test database bằng công cụ test đã phê duyệt.
2. Warm server/database theo cùng số request.
3. Chạy baseline ít nhất 3 lượt; lưu raw JSON.
4. Áp dụng đúng một patch.
5. Chạy toàn test + domain regression.
6. Reset lại cùng seed; chạy benchmark 3 lượt cùng cấu hình.
7. So sánh median của các lượt, không chọn lượt đẹp nhất.
8. Chạy concurrency tăng dần; dừng nếu error/timeout/pool pressure.
9. Chạy soak 15–60 phút cho patch có memory/concurrency risk.
10. Ghi quyết định pass/rollback.

Mẫu so sánh:

| API | Dataset | c | Before p95 | After p95 | Delta | Query before/after | Docs examined before/after | Bytes | Result |
| --- | --- | ---: | ---: | ---: | ---: | --- | --- | ---: | --- |
| | | | | | | | | | |

## 12. Acceptance và stop conditions

Pass khi:

- response/status/business values parity;
- không error/timeout mới;
- p95 không regression trên API lân cận;
- finding mục tiêu giảm query/docs/latency theo tiêu chí patch;
- heap/RSS ổn định qua soak;
- auth/audit/transaction tests pass.

Dừng test ngay khi:

- base URL hoặc DB identity không chứng minh là test;
- có response 5xx tăng nhanh, timeout liên tiếp hoặc Mongo pool saturation;
- phát hiện request write ngoài kế hoạch;
- dữ liệu test không tái tạo được;
- result correctness lệch dù latency đẹp hơn.

Sau test, chỉ cần xóa output JSON tạm và unset token. Script không tạo record nên không có database cleanup.
