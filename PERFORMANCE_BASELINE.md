# MK-Pro API Performance Baseline

Ngày đo: 2026-06-19  
Commit khảo sát: `e5d300c`  
Mục đích: tạo mốc trước tối ưu, không kết nối MongoDB production và không phát sinh request ghi dữ liệu.

## 1. Phạm vi và điều kiện an toàn

- Benchmark chỉ dùng `GET`.
- Chế độ `PERF_IN_PROCESS=1` nạp trực tiếp Express `app`; không gọi `startServer()`, `connectDB()`, tạo index, recovery hoặc background job.
- Chỉ đo các endpoint không cần MongoDB: `/api/health`, `/api/system/status` và `/api/system/api-monitor`.
- Endpoint nghiệp vụ phụ thuộc MongoDB chưa được đo động vì workspace không có test database/dataset được xác nhận an toàn.
- Không chạy `explain()` trên production. Vì vậy `totalDocsExamined`, `totalKeysExamined` và thời gian query của API nghiệp vụ được ghi `N/A`, không suy đoán thành số liệu.
- Benchmark server và benchmark client chạy trong cùng một Node process; CPU/RSS/heap là tổng của cả hai, không phải riêng server.

## 2. Môi trường

| Thuộc tính | Giá trị |
| --- | --- |
| OS | Windows, `win32 x64` |
| Node thực tế | `v24.16.0` |
| Node engine của dự án | `>=20.20 <23` |
| Package manager | npm `11.16.0` |
| Database | Không kết nối |
| Warm-up | 3 request/endpoint |
| Request mỗi mức | 50 |
| Concurrency | 1, 5, 10, 20, 50 |
| Timeout | 5.000 ms |

Node 24 nằm ngoài engine được khai báo. Các số dưới đây đủ để phát hiện regression trong cùng môi trường, nhưng phải đo lại trên Node 20 hoặc 22 và test MongoDB đại diện trước khi dùng làm SLA production.

## 3. Baseline test hiện có

Lệnh chạy an toàn:

```powershell
node scripts/run-tests.js
```

| Chỉ số | Kết quả |
| --- | ---: |
| Tổng test | 665 |
| Pass | 664 |
| Fail | 1 |
| Skip | 0 |
| TAP duration | 5.711,52 ms |
| Wall clock | 5.916 ms |

Test fail:

```text
test/audit-service-case-portability.test.js
audit service has one portable lowercase module and both APIs
```

Phân loại: lỗi môi trường/path case-sensitivity trên Windows. Test kỳ vọng `src/services/AuditService.js` không tồn tại, nhưng filesystem Windows coi đường dẫn này trùng với file thật `auditService.js`. Không có bằng chứng lỗi nghiệp vụ hoặc timeout. Không sửa test để làm suite pass.

`npm test` chưa được dùng làm số baseline vì bước `pretest` cần binary `terser` đang thiếu trong `node_modules`, dù dependency có trong manifest/lockfile. Không chạy cài package vì audit không được thay đổi dependency hoặc lockfile.

## 4. Baseline API

### 4.1 Kết quả latency chính

Tổng 750 request được đo: 500 request public và 250 request authenticated monitor. Tất cả trả HTTP 200, không timeout.

| API | Dataset | Concurrent | Avg ms | p95 ms | p99 ms | Max ms | Query/request | Response bytes | Trạng thái |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| `GET /api/health` | Không DB | 1 | 1,26 | 2,59 | 3,66 | 3,66 | 0 | 97 | 50/50 pass |
| `GET /api/health` | Không DB | 5 | 5,77 | 10,30 | 11,26 | 11,26 | 0 | 97 | 50/50 pass |
| `GET /api/health` | Không DB | 10 | 8,80 | 16,93 | 17,63 | 17,63 | 0 | 97 | 50/50 pass |
| `GET /api/health` | Không DB | 20 | 11,55 | 17,49 | 17,77 | 17,77 | 0 | 97 | 50/50 pass |
| `GET /api/health` | Không DB | 50 | 18,82 | 26,19 | 26,73 | 26,73 | 0 | 97 | 50/50 pass |
| `GET /api/system/status` | Không DB | 1 | 0,98 | 1,66 | 5,98 | 5,98 | 0 | 569 | 50/50 pass |
| `GET /api/system/status` | Không DB | 5 | 4,40 | 6,45 | 6,51 | 6,51 | 0 | 569 | 50/50 pass |
| `GET /api/system/status` | Không DB | 10 | 6,99 | 10,47 | 11,76 | 11,76 | 0 | 569 | 50/50 pass |
| `GET /api/system/status` | Không DB | 20 | 10,87 | 13,74 | 14,15 | 14,15 | 0 | 569 | 50/50 pass |
| `GET /api/system/status` | Không DB | 50 | 27,86 | 31,26 | 31,36 | 31,36 | 0 | 569 | 50/50 pass |
| `GET /api/system/api-monitor?limit=10` | In-memory monitor | 1 | 1,78 | 3,88 | 5,05 | 5,05 | 0 | 334 | 50/50 pass |
| `GET /api/system/api-monitor?limit=10` | In-memory monitor | 5 | 7,65 | 11,62 | 13,19 | 13,19 | 0 | 334 | 50/50 pass |
| `GET /api/system/api-monitor?limit=10` | In-memory monitor | 10 | 11,37 | 16,80 | 17,05 | 17,05 | 0 | 334 | 50/50 pass |
| `GET /api/system/api-monitor?limit=10` | In-memory monitor | 20 | 23,40 | 36,74 | 36,97 | 36,97 | 0 | 334 | 50/50 pass |
| `GET /api/system/api-monitor?limit=10` | In-memory monitor | 50 | 31,99 | 42,28 | 42,43 | 42,43 | 0 | 334 | 50/50 pass |

Trong phạm vi có thể đo an toàn:

- p95 nhanh nhất: 1,66 ms, `/api/system/status`, concurrency 1.
- p95 chậm nhất: 42,28 ms, `/api/system/api-monitor`, concurrency 50.
- Đây không phải kết luận về API nghiệp vụ nhanh/chậm nhất; cả ba endpoint đều không truy vấn MongoDB.

### 4.2 Throughput

| API | c=1 | c=5 | c=10 | c=20 | c=50 |
| --- | ---: | ---: | ---: | ---: | ---: |
| `/api/health` req/s | 780,46 | 848,28 | 1.104,66 | 1.537,99 | 1.670,32 |
| `/api/system/status` req/s | 1.004,62 | 1.111,42 | 1.380,63 | 1.651,69 | 1.460,39 |
| `/api/system/api-monitor?limit=10` req/s | 555,01 | 635,09 | 800,76 | 768,55 | 1.096,12 |

### 4.3 CPU, memory và event-loop

Một lượt xác nhận độc lập 500 request được chạy lại cùng ngày để thu process metrics. Do client và server cùng process, kết quả chỉ dùng làm mốc regression tương đối.

| Chỉ số quan sát | Min | Max | Ghi chú |
| --- | ---: | ---: | --- |
| CPU user mỗi batch 50 request | 0 ms | 15 ms | Độ phân giải Windows làm nhiều batch ngắn được làm tròn về 0 |
| CPU system mỗi batch | 0 ms | 15 ms | Không tách server/client |
| Heap trước batch | 49,62 MB | 70,73 MB | Có ảnh hưởng GC giữa các batch |
| Heap sau batch | 52,35 MB | 76,99 MB | Không phải retained heap sau full GC |
| Heap delta | -11,73 MB | +7,46 MB | Delta âm/dương do GC là bình thường |
| RSS delta | -4,65 MB | +9,49 MB | Process-level |
| Event-loop p95 có mẫu | 10,31 ms | 19,42 ms | Batch dưới độ phân giải monitor có thể báo 0 |

Không thấy failure hoặc heap tăng đơn điệu trong lượt đo ngắn. Kết quả này không thay thế soak test dài và không chứng minh không có memory leak.

## 5. Baseline MongoDB còn thiếu

Các API dưới đây là ứng viên bắt buộc đo trên test DB đại diện. Audit không gán số latency giả.

| API | Dataset cần có | Concurrent | Avg/p95/p99 | Query/request | Docs examined/returned | Trạng thái |
| --- | --- | ---: | --- | ---: | --- | --- |
| `/api/sales-orders/search` | 1k/10k/100k orders | 1/5/10/20 | N/A | N/A | N/A | Chưa có test DB |
| `/api/dashboard/home` | 12 tháng sales/AR/return | 1/5/10/20 | N/A | dự kiến nhiều query, cần đo | N/A | Chưa có test DB |
| `/api/inventory/current` | 1k/10k/100k SKU | 1/5/10/20 | N/A | N/A | N/A | Chưa có test DB |
| `/api/reports/inventory-movement` | lịch sử 1/3/5 năm | 1/5/10 | N/A | N/A | N/A | Static risk Critical |
| `/api/reports/sales` | tháng nhỏ/lớn | 1/5/10 | N/A | N/A | N/A | Static risk Major |
| report debt period/detail | AR 1/3/5 năm | 1/5/10 | N/A | N/A | N/A | Static risk Major |
| `/api/mobile/catalog/products` | 1k/10k/100k SKU | 1/5/10/20 | N/A | N/A | N/A | Chưa có test DB |
| `/api/mobile/catalog/customers` | 1k/10k customers + sales tháng | 1/5/10/20 | N/A | N/A | N/A | Static risk Major |
| `/api/excel/export` master orders | 1/100/500/2.000 ID | 1/2 | N/A | có thể gần 2N theo code | N/A | Không chạy POST trong audit |

## 6. Phân loại latency

Áp dụng ngưỡng mặc định trong yêu cầu, chỉ sau khi có dataset đại diện:

| Severity | p95 |
| --- | ---: |
| Critical | trên 2.000 ms hoặc timeout/treo |
| Major | 800–2.000 ms |
| Medium | 300–800 ms |
| Minor | dưới 300 ms nhưng còn lãng phí tài nguyên |

Các finding trong audit gắn `static risk` không được diễn giải là latency đã đo. Đây là cảnh báo dựa trên query fan-out, full scan hoặc độ phức tạp code.

## 7. Số liệu lịch sử, không phải baseline hiện tại

- `docs/V45_API_MONITOR_DB_MONGO_JS_TIME_REPORT.md` từng ghi `/api/debts` cũ khoảng 22.964 ms: Mongo 22.600 ms, JS 364 ms, 5 query.
- `docs/V45_DEBTS_API_OPTIMIZED_REPORT.md` cho biết luồng debt cũ đã được thay bằng endpoint AR tối ưu.
- `IMPORT_ORDER_POST_PERFORMANCE_PATCH.md` ghi luồng import post cũ khoảng 165.903 ms trước patch.

Ba số trên chỉ là regression warning. Không dùng chúng để tuyên bố hiệu năng code hiện tại.

## 8. Kết luận baseline

Express/middleware/auth path không phụ thuộc database xử lý ổn ở tải tối đa 50 concurrent trong phép đo ngắn. Chưa thể xác định API nghiệp vụ chậm nhất bằng số liệu thực tế nếu chưa có test MongoDB đại diện. Static audit cho thấy ưu tiên đo đầu tiên là export master orders, inventory movement, debt report, dashboard và inventory current.

