# PERF-A4B — Report Center và Heavy Report Orchestration

## 1. Gate decision

**PASS_WITH_DEFERRED_RUNTIME**

- E1 source/static: PASS.
- E2 deterministic offline: PASS.
- E3 Mongo query plan, production heap, worker throughput và p95: dời sang PERF-A6.
- Hai feature flag mặc định OFF; không kết nối Mongo, không rebuild snapshot và không sửa production data trong gate này.

## 2. Root cause và RED evidence

### Data-quality fan-out cũ

Request `data-quality` gọi đồng thời bốn domain report `sales`, `inventory`, `delivery`, `returns` với semantics full/export. Fixture E2 materialize 28.000 logical row, giữ bốn dataset cùng lúc và concurrency bằng 4.

### Preview cũ

Report Center yêu cầu full/export từ domain service, assemble 10.000 row rồi mới slice 50 row. Vì vậy pagination ở lớp UI không làm giảm work của domain service.

RED-first: 2 test chứng minh fan-out/materialization PASS; GREEN contract expected-fail vì chưa có execution policy và snapshot service.

## 3. Thiết kế mới

### 3.1 Preview/export isolation

Khi `PERF_REPORT_DB_PAGINATION_V1=1`:

- Preview xóa `full`, `export`, `__exportAll`; limit mặc định 50, hard limit 200.
- Sales grouping được thực hiện trong `SalesReportService`, trả page/meta đã xử lý thay vì Report Center paginate lần hai.
- Các domain report nhận query preview bounded; Report Center tôn trọng `prePagedMeta`.
- Export Report Center trả HTTP 202 và tạo background job `report_export_excel`. Frontend poll status/progress rồi tải artifact.
- Export có hard guard 50.000 row và 64 MiB. Đây là background generation có guard, không tuyên bố streaming.

### 3.2 Data-quality snapshot

Khi `PERF_REPORT_CENTER_SNAPSHOT_V1=1`, HTTP read path chỉ đọc một `ReportDataQualitySnapshot` versioned. Response công bố `snapshotVersion`, `sourceVersion`, `generatedAt`, `sourceTimestamp`, `sourceRange` và stale warning.

Snapshot thiếu sẽ fail-closed bằng `503 REPORT_DATA_QUALITY_SNAPSHOT_UNAVAILABLE`; không âm thầm fan-out live reports. Snapshot cũ vẫn được trả với cảnh báo rõ ràng. Rebuild chạy ngoài request, concurrency mặc định 2, hard-cap 3, timeout từng domain, tối đa 5.000 anomaly row và 8 MiB.

Rebuild command là dry-run-first; apply yêu cầu `--apply --confirm-rebuild`. Gate này không chạy command với Mongo.

### 3.3 Concurrency/admission control

- Fan-out bounded mặc định 2, hard-cap 3.
- Timeout mỗi report mặc định 30 giây; abort signal được truyền xuống task.
- Admission control tối đa 4 request đang chạy trong một Node.js process; vượt ngưỡng trả 429.
- Data-quality không cho partial result. Infrastructure chỉ trả partial khi caller chủ động cho phép và phải kèm warning.
- Admission store hiện process-local, không được coi là distributed/shared limiter.

## 4. RED/GREEN logical work

| Path | Legacy | GREEN | Giảm |
|---|---:|---:|---:|
| Data-quality rows materialized trên HTTP read | 28.000 | 50 snapshot rows | 99,82% |
| Data-quality full/export calls trên HTTP read | 4 | 0 | 100% |
| Preview rows materialized để trả 50 | 10.000 | 50 | 99,50% |
| Preview full/export calls | 1 | 0 | 100% |

Các số trên là logical E2, không phải V8 heap, Mongo `docsExamined` hoặc production p95.

## 5. Domain parity và SSoT

Fixture 120 row/domain, page 2 limit 50:

| Domain | Page IDs/order | Pagination meta | Summary | SSoT |
|---|---|---|---|---|
| Inventory | MATCH | MATCH | MATCH | inventories + stockTransactions |
| Sales | MATCH | MATCH | MATCH | orders + arLedgers |
| Debt | MATCH | MATCH | MATCH | arLedgers |
| Fund | MATCH | MATCH | MATCH | fundLedgers |
| Return | MATCH | MATCH | MATCH | returnOrders + arLedgers |
| Delivery | MATCH | MATCH | MATCH | master_orders + orders + fundLedgers |

Data-quality projection dùng chung `DataQualityProjectionBuilder` cho legacy rebuild và snapshot rebuild. Fixture tạo 6 anomaly: 3 critical, 3 major. Snapshot read chạy một repository read và không gọi domain report.

Không thay đổi write-side hoặc SSoT.

## 6. Test evidence

| Nhóm | Kết quả |
|---|---:|
| RED-first | 2 PASS / 1 expected FAIL |
| PERF-A4B GREEN | 25/25 PASS |
| PERF-A1B → A4B regression | 150/150 PASS |
| Report/export/background dependency-free | 96/96 PASS |
| JavaScript syntax | 1.654/1.654 PASS |
| Functional failure | 0 |

Chín existing runtime test không thể load vì ZIP không có `node_modules/mongoose`; được ghi `NOT_RUN_DEPENDENCY`, không phải regression chức năng.

## 7. Feature flags và rollback

```bash
PERF_REPORT_DB_PAGINATION_V1=0
PERF_REPORT_CENTER_SNAPSHOT_V1=0
```

Release candidate giữ cả hai OFF. Rollback tức thời bằng cách đặt flag về 0; không có schema migration bắt buộc cho legacy path. Snapshot model chỉ được sử dụng khi flag snapshot bật và snapshot đã rebuild/verify.

## 8. Changed files

- 14 file thêm mới.
- 13 file chỉnh sửa.
- 0 file xóa.

Danh sách/hash chi tiết: `PERF_A4B_CHANGED_FILES.json`.

## 9. Deferred runtime evidence

PERF-A6 phải xác minh: Mongo query plan/docsExamined, repository pagination thật theo từng domain, snapshot freshness production, worker queue capacity, shared/distributed admission, heap/GC, timeout/abort thực tế, 5xx và production p95.
