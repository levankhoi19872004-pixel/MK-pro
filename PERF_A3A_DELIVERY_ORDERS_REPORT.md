# PERF-A3A — Delivery Orders DB-Native Read Optimization

## 1. Gate

**Trạng thái:** `PASS_WITH_DEFERRED_RUNTIME`

- E1 source/static evidence: **PASS**.
- E2 deterministic offline evidence: **PASS**.
- E3 Mongo `executionStats`, index stats và production p95: **DEFERRED_TO_PERF_A6**.
- Không tuyên bố endpoint đã đạt production p95 ≤1.000 ms tại gate này.

## 2. Root cause của reader cũ

Reader legacy đọc một tập ứng viên theo cap `limit × 5`, sau đó mới enrich master metadata, lọc ngày/NVGH/NVBH trong JavaScript và cuối cùng mới `slice` để phân trang. Trên fixture deterministic 10.000 đơn, truy vấn 100 dòng:

- DB trả **500** SalesOrder candidate.
- Sau lọc JavaScript chỉ trả **58** dòng, thấp hơn limit 100 dù scope còn dữ liệu.
- Pagination được áp dụng sau filter.
- History reader tải **298** version candidate và **298** allocation candidate cho 100 đơn.

Điều này vừa overfetch, vừa có nguy cơ trả thiếu trang vì cap được áp trước filter thực tế.

## 3. Optimized path

Feature flag: `PERF_DELIVERY_CANONICAL_FILTER_V1`.

- Mặc định **OFF**: chạy nguyên legacy reader.
- ON: dùng DB-native canonical fast path.
- Query không đủ canonical scope hoặc có free-text search: fallback legacy có telemetry `delivery_orders_legacy_fallback`.

Fast path thực hiện:

1. Lọc `deliveryDateKey` và canonical staff/customer code tại repository.
2. Canonical code dùng exact equality để compound index có thể được sử dụng.
3. Chạy nhánh legacy disjoint cho date/string/alias cũ.
4. Chạy nhánh master-order scope để giữ đơn chỉ có NVGH trong master metadata.
5. Merge và deduplicate theo canonical order identity.
6. Sort ổn định rồi giới hạn trang trước khi đọc financial state.
7. Trả `nextCursor` cho keyset pagination; deep offset >5.000 dòng fail-closed bằng `DELIVERY_KEYSET_CURSOR_REQUIRED`, không trả thiếu âm thầm.

Với limit 100:

- Reader xử lý **202** candidate thay vì 500.
- Trả đủ **100** dòng.
- Mức giảm logical rows processed: **59.60%**.

## 4. Latest financial state

Đã thêm aggregate grouping theo canonical identity và latest version, không dùng global `$limit`:

- Version candidate: 298 → 100 (**giảm 66.44%**).
- Allocation candidate: 298 → 100 (**giảm 66.44%**).
- Repository calls giữ hằng số: version 1 call, allocation 2 call, return 1 call.
- Exact effective-version allocation vẫn được giữ khi tồn tại stale/future candidate.
- Zero, null, undefined và NaN tiếp tục qua financial guards hiện hữu.

## 5. Correctness parity

| Kiểm chứng | Kết quả |
|---|---:|
| Page 1 IDs và thứ tự khớp oracle | PASS |
| Page 2 keyset IDs và thứ tự khớp oracle | PASS |
| Page overlap | 0 |
| Financial snapshot hash | MATCH |
| Max debt deviation | 0 |
| Payment state | MATCH |
| Return state | MATCH |
| Staff scope leak | 0 |
| Date scope leak | 0 |
| Duplicate identity | 0 |
| Legacy master assignments preserved | PASS |

Financial snapshot SHA-256 của legacy và optimized đều là:

`3621e1426c2daf77a8b0f9f91e2f8495075a8f37ba1f04f142dcad21fa0141d7`

## 6. Logical work comparison

| Limit | Legacy rows processed | Optimized rows processed | Giảm | Legacy rows trả | Optimized rows trả |
|---:|---:|---:|---:|---:|---:|
| 50 | 500 | 102 | 79.60% | 50 | 50 |
| 100 | 500 | 202 | 59.60% | 58 | 100 |
| 200 | 1000 | 400 | 60.00% | 154 | 200 |

Offline duration và heap delta chỉ so sánh work thuật toán trên fixture, không đại diện Mongo latency hoặc production p95.

## 7. Index desired state

Đã khai báo các non-unique index candidate trong managed registry:

- `idx_orders_delivery_date_key_staff_created`
- `idx_orders_delivery_date_key_sales_created`
- `idx_orders_delivery_date_key_customer_created`
- `idx_master_orders_delivery_staff_updated`

Gate này chỉ kiểm chứng source desired state; index hiện hữu và hiệu quả thực tế phải được xác minh bằng Mongo index stats/explain tại PERF-A6.

## 8. Test evidence

- RED-first: **1 PASS / 1 expected FAIL** trước implementation.
- PERF-A3A GREEN: **22/22 PASS**.
- Full dependency-free performance regression PERF-A1B → PERF-A3A: **73/73 PASS**.
- JavaScript syntax: **1.619 file PASS**.
- Hai test integration cũ cần `mongoose` không chạy do ZIP không có `node_modules`; phân loại `NOT_RUN_DEPENDENCY`, không phải functional regression.

## 9. Changed files

### Production

- `src/models/SalesOrder.js`
- `src/routes/newOperationsRoutes.js`
- `src/services/mongoIndexService.js`
- `src/services/delivery/DeliveryFinancialLatestStateBatchReader.js` — mới.
- `src/services/delivery/DeliveryPaymentStateReadService.js`
- `src/services/delivery/deliveryTodayCanonicalOrderReader.js`
- `src/services/v2/deliveryTodayNew.service.js`
- `package.json`

### Test và tooling

- `test/performance/perf-a3a/*`
- `scripts/performance/perf-a3a/run-delivery-orders-repro.js`

Không xóa file, không migration dữ liệu và không thay đổi write-side financial SSoT.

## 10. Rollback

Tắt feature flag để quay lại reader cũ:

```bash
PERF_DELIVERY_CANONICAL_FILTER_V1=0
```

Không cần schema migration để rollback application path. Các index non-unique không được tự drop bởi rollback này.
