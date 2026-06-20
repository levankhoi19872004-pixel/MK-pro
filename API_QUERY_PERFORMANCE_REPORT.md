# API_QUERY_PERFORMANCE_REPORT

## 1. Phạm vi và baseline

- Baseline: `MK-pro-phase05-dependency-god-service-refactor-patched.zip`.
- Chỉ tối ưu hai endpoint báo cáo tồn kho có cùng context truy vấn: `GET /api/reports/inventory-movement` và `GET /api/reports/stock-card`.
- Không thay API contract, schema, package, business rule tồn kho hoặc nguồn chuẩn `inventories`/`stockTransactions`.
- Không thêm cache và không thêm/xóa index.
- Dataset kiểm soát: 1x = 500 sản phẩm/10.000 giao dịch; 5x = 2.000 sản phẩm/50.000 giao dịch; 10x = 2.000 sản phẩm/100.000 giao dịch.

## 2. Root cause đo được

1. Mỗi request đọc danh mục sản phẩm hai lần: một lần dựng `productMap`, một lần trong `getInventorySummary()`.
2. Aggregate trả toàn bộ document `stockTransactions`, gồm payload/audit không được response sử dụng.
3. Báo cáo nhập-xuất-tồn vẫn sort toàn bộ ledger dù phép cộng theo sản phẩm không phụ thuộc thứ tự.
4. Thẻ kho có mã sản phẩm chính xác nhưng vẫn đọc toàn bộ ledger rồi lọc trong Node.js.

## 3. Thay đổi

- Chia sẻ `preloadedProductsPromise` trong phạm vi một request; query Product giảm từ 2 xuống 1.
- Projection hẹp cho `inventories` và hai loại projection riêng cho movement/stock-card.
- Bỏ `$sort` ở movement; stock-card vẫn giữ sort deterministic.
- Khi `q` khớp chính xác mã/alias sản phẩm, đưa `$match` identity lên đầu pipeline stock-card trước bước chuẩn hóa ngày.
- Fuzzy search và trường hợp không nhận diện exact alias vẫn giữ đường đọc cũ để bảo toàn behavior.

## 4. Benchmark trước/sau

### GET /api/reports/inventory-movement

| Dataset | p50 trước → sau | p95 trước → sau | Cải thiện p95 | Throughput trước → sau | Query | Docs examined | DB bytes |
|---|---:|---:|---:|---:|---:|---:|---:|
| 1x | 174.36 → 124.14 ms | 182.20 → 128.23 ms | **29.6%** | 5.302 → 7.048 rps | 4 → 3 | 11,500 → 11,000 | 9,507,200 → 2,178,969 B |
| 5x | 1159.49 → 610.07 ms | 1191.74 → 628.71 ms | **47.2%** | 0.827 → 1.513 rps | 4 → 3 | 56,000 → 54,000 | 47,163,482 → 10,785,561 B |
| 10x | 2686.44 → 1387.48 ms | 2686.44 → 1387.48 ms | **48.4%** | 0.361 → 0.680 rps | 4 → 3 | 106,000 → 104,000 | 92,259,940 → 20,754,209 B |

### GET /api/reports/stock-card

| Dataset | p50 trước → sau | p95 trước → sau | Cải thiện p95 | Throughput trước → sau | Query | Docs examined | DB bytes |
|---|---:|---:|---:|---:|---:|---:|---:|
| 1x | 179.73 → 16.72 ms | 190.01 → 19.82 ms | **89.6%** | 5.194 → 31.721 rps | 4 → 3 | 11,500 → 1,020 | 9,507,200 → 210,688 B |
| 5x | 1157.42 → 67.15 ms | 1172.72 → 72.22 ms | **93.8%** | 0.837 → 8.423 rps | 4 → 3 | 56,000 → 4,025 | 47,163,482 → 834,367 B |
| 10x | 2389.39 → 81.59 ms | 2389.39 → 81.59 ms | **96.6%** | 0.405 → 5.926 rps | 4 → 3 | 106,000 → 4,050 | 92,259,940 → 842,526 B |

### Kết luận acceptance

- Movement: p95 cải thiện 29,6% / 47,2% / 48,4% trên 1x/5x/10x.
- Stock-card exact code: p95 cải thiện 89,6% / 93,8% / 96,6%.
- Query count giảm 4 → 3, không tăng memory/query count và response HTTP giữ nguyên.

## 5. Explain plan và index

`explain('executionStats')`: **NOT RUN** vì môi trường không có `MONGO_URI` hoặc MongoDB production-like. Không giả lập và không tuyên bố `IXSCAN`. Query shape trước/sau nằm trong `API_QUERY_EXPLAIN_PLANS.json`; script chạy thật là `scripts/performance/explain-inventory-report-queries.js`.

Không thêm index. Hai index hiện hữu được giữ nguyên:

- `idx_stock_tx_product_date { productCode: 1, date: 1 }`.
- `idx_stock_tx_date_product_warehouse { date: 1, productCode: 1, warehouseCode: 1 }`.

Lý do: chưa có executionStats đáng tin cậy để chứng minh write cost của index mới. `INDEX_MANIFEST.json` ghi `NO_INDEX_CHANGE`.

## 6. API contract

Không đổi route, query parameter, status code hoặc response shape. Các golden/contract test stock-card giữ nguyên checksum và response.

## 7. File thêm/sửa/xóa

### Sửa

- `src/services/inventoryStock.service.js`
- `src/services/reports/InventoryReportService.js`

### Thêm

- `test/api-query-performance-optimizations.test.js`
- `scripts/performance/inventory-api-benchmark.js`
- `scripts/performance/explain-inventory-report-queries.js`
- `API_QUERY_PERFORMANCE_REPORT.md`
- `API_QUERY_BENCHMARK.json`
- `API_QUERY_BENCHMARK.csv`
- `API_QUERY_EXPLAIN_PLANS.json`
- `INDEX_MANIFEST.json`
- `API_QUERY_ROLLBACK.md`

### Xóa

- Không có.

## 8. Diff quan trọng

```diff
- const [inventoryRows, products] = await Promise.all([inventoryQuery.lean(), productQuery.lean()]);
+ const [inventoryRows, products] = await Promise.all([inventoryQuery.lean(), productsPromise]);
+ // productsPromise được chia sẻ từ report context; inventory query có projection hẹp.

- loadTransactionsUntil(dateTo) // toàn ledger + full document + sort
+ loadTransactionsUntil(dateTo, { identities, projection, sort })
+ // stock-card exact code: $match identity trước; movement: không sort; cả hai có $project.
```

## 9. Quality gate thực tế

| Gate | Kết quả |
|---|---:|
| New performance tests | PASS — 3/3 |
| Full test suite | PASS — 923, FAIL 0, SKIP 1 (924 total) |
| Syntax | PASS — 879 JavaScript |
| Source bundles | PASS — 18; checksum output thay đổi 0 |
| Path portability | PASS — 1.073 paths |
| Enterprise smoke | PASS — 10 modules / 11 flags |
| OpenAPI/docs check | PASS |
| npm audit production | PASS — 0 vulnerability |
| `npm run quality` | PASS — 18,31 giây |
| Startup HTTP gate | PASS — baseline 8 ms; after 6 ms |
| MongoDB connect/startup đầy đủ | NOT RUN — thiếu `MONGO_URI` |
| `explain('executionStats')` production-like | NOT RUN — thiếu MongoDB |

Ghi chú: khi chạy riêng một nhóm test, `dms-inventory-live-current.test.js` phụ thuộc bước assemble HTML của test runner nên fail cô lập; cùng test đó PASS trong full suite chuẩn `npm test`.

## 10. Rủi ro còn lại

- Exact product pushdown phụ thuộc dữ liệu mã/alias trong Product và StockTransaction; đã giữ fallback broad scan nếu không có exact match.
- Chưa xác nhận winning plan và `totalKeysExamined` trên MongoDB thật.
- Movement vẫn phải đọc toàn bộ ledger đến `dateTo` để giữ chính xác opening/ending; với dữ liệu lớn hơn 10x cần cân nhắc reporting projection, nhưng không được cache/summary hóa khi chưa có invalidation và reconciliation đúng.
- Benchmark là controlled model adapter, không thay thế latency mạng/Atlas I/O.

## 11. Rollback

Triển khai lại `MK-pro-phase05-dependency-god-service-refactor-patched.zip` hoặc khôi phục hai file service theo `API_QUERY_ROLLBACK.md`. Không cần rollback database vì không có schema/index/data migration.
