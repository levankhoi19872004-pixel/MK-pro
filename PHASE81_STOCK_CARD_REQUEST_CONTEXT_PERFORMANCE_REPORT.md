# PHASE 81 — STOCK CARD REQUEST-SCOPED QUERY REUSE

## 1. API đang xử lý

```text
GET /api/stock-card
GET /api/reports/stock-card
GET /api/reports/run/stock-card
```

Ba endpoint dùng chung `InventoryReportService.stockCardReport()`.

## 2. Baseline

Baseline được đo bằng controlled model stubs trên cùng fixture. Không kết nối hoặc ghi dữ liệu production.

| Chỉ số | Baseline |
|---|---:|
| `StockTransaction.aggregate()` | 3 |
| `Product.find()` | 2 |
| `inventoryStockService.getInventorySummary()` | 1 |
| Mongo operations lower bound | 7 |
| Payload | 2.614 byte |
| Response SHA-256 | `2f7a5b827a2f6927e5957514eb85a46f51caf63c0c1a5630d09991379495e382` |
| Docs examined | N/A — không có MongoDB test dataset an toàn |
| Avg/P95 | N/A — không tự tạo số liệu |

`inventoryStockService.getInventorySummary()` hiện có lower bound hai Mongo reads (`inventories` và `products`), vì vậy tổng lower bound là 3 aggregate + 2 product/catalog reads + 2 inventory-summary reads = 7.

## 3. Nguyên nhân gốc rễ

| File | Hàm | Dòng sau patch | Vấn đề | Bằng chứng |
|---|---|---:|---|---|
| `src/services/reports/InventoryReportService.js` | `stockCardReport` | 314–394 | Trước patch tự gọi `loadTransactionsUntil()` và `loadProducts()`, sau đó gọi `inventoryMovementReport()` khiến hai nguồn bị đọc lại | Baseline: aggregate 3 lần, Product.find 2 lần |
| Cùng file | `inventoryMovementReport` | 301–305 | Tự dựng đầy đủ context DB cho mọi lần gọi | Stock Card cần kết quả movement nhưng đã có cùng transaction/catalog |

## 4. Phương án

### Phương án A — Production-grade — Đã triển khai

- Tạo `loadInventoryReportContext(dateTo)` chỉ sống trong một request.
- Tách phần tính toán thành `buildInventoryMovementReport(query, context)` không query DB.
- `inventoryMovementReport()` vẫn tự tải context khi được gọi trực tiếp.
- `stockCardReport()` tải một context rồi dùng lại cho movement và card rows.

**Lợi ích:** bỏ đúng hai lượt đọc trùng, không cache/stale data, không đổi contract.  
**Nhược điểm:** tách logic nội bộ thành helper lớn.  
**Effort:** Medium.  
**Rủi ro:** Low, đã kiểm chứng golden response bit-for-bit.

### Phương án B — Cân bằng effort — Không chọn

Truyền preload data qua object query/options cho `inventoryMovementReport()`.

**Lợi ích:** diff ngắn.  
**Nhược điểm:** trộn dữ liệu nội bộ vào query từ controller, dễ bị lạm dụng và khó bảo trì.  
**Effort:** Easy.  
**Rủi ro:** Medium.

## 5. File thay đổi

```text
src/services/reports/InventoryReportService.js
test/inventory-stock-card-query-reuse.test.js
test/inventory-stock-card-api-contract.test.js
API_PERFORMANCE_AUDIT.md
PHASE81_STOCK_CARD_REQUEST_CONTEXT_PERFORMANCE_REPORT.md
```

Không sửa route, controller, model, schema, index, package hoặc frontend.

## 6. Diff chính

```diff
- async function inventoryMovementReport(query = {}) {
-   const [transactions, productMap, currentStock, futureTransactions] = await Promise.all([...]);
-   // tính movement
- }
+ async function loadInventoryReportContext(dateTo) {
+   const [transactions, productMap, currentStock, futureTransactions] = await Promise.all([...]);
+   return { today, transactions, productMap, currentStock, futureTransactions };
+ }
+
+ function buildInventoryMovementReport(query, context) {
+   // giữ nguyên toàn bộ công thức movement hiện tại
+ }
+
+ async function inventoryMovementReport(query = {}) {
+   const context = await loadInventoryReportContext(dateTo);
+   return buildInventoryMovementReport(query, context);
+ }
```

```diff
- const [transactions, productMap, movement] = await Promise.all([
-   loadTransactionsUntil(dateTo),
-   loadProducts(),
-   inventoryMovementReport(...)
- ]);
+ const context = await loadInventoryReportContext(dateTo);
+ const { transactions, productMap } = context;
+ const movement = buildInventoryMovementReport(..., context);
```

## 7. Kết quả đo

| Chỉ số | Trước | Sau | Cải thiện |
|---|---:|---:|---:|
| Query/request lower bound | 7 | 5 | -2 (-28,6%) |
| `StockTransaction.aggregate()` | 3 | 2 | -33,3% |
| `Product.find()` | 2 | 1 | -50% |
| Docs examined | N/A | N/A | Cần executionStats trên DB an toàn |
| Payload | 2.614 byte | 2.614 byte | Không đổi |
| Avg | N/A | N/A | Chưa có DB đại diện |
| P95 | N/A | N/A | Chưa có DB đại diện |

Response trước và sau có cùng SHA-256:

```text
2f7a5b827a2f6927e5957514eb85a46f51caf63c0c1a5630d09991379495e382
```

## 8. Test

### Test mới

- Unit/golden response và query count.
- API controller/date guard/response contract.
- Permission guard giữ nguyên.
- Empty dataset.
- Dataset 10.000 giao dịch.
- Search, sort, pagination.
- Concurrent requests.
- Không N+1 theo số giao dịch/sản phẩm.

Kết quả: **6/6 pass**.

### Quality gate

| Kiểm tra | Kết quả |
|---|---:|
| JavaScript syntax | 821/821 pass |
| Source bundles | 18/18 pass |
| Source size budget | Pass |
| Targeted report/inventory tests | 29/31; 2 lỗi shell UI có sẵn trên baseline |
| Full suite | 704/709 pass |
| Baseline trước phase | 698/703 pass |
| Regression mới | 0 |

Sáu test thêm mới đều pass. Năm lỗi full-suite còn lại là các lỗi nền đã tồn tại trước Phase 81.

## 9. Index/query plan

Không thêm index. Query shape không thay đổi; chỉ loại đọc lặp trong cùng request. Do không có MongoDB dataset an toàn nên `explain("executionStats")` chưa được chạy và không có số `totalDocsExamined` được giả lập.

## 10. Regression checklist

- [x] Bán hàng không thay đổi.
- [x] Import không thay đổi.
- [x] Tồn kho vẫn dùng `stockTransactions` và `inventories`, kho `MAIN`.
- [x] Công nợ không thay đổi.
- [x] Quỹ không thay đổi.
- [x] Trả hàng/reversal giữ nguyên golden totals.
- [x] Giao hàng không thay đổi.
- [x] Báo cáo giữ nguyên payload/contract.
- [x] Mobile app không thay đổi.
- [x] Phân quyền Stock Card giữ nguyên.

## 11. Rủi ro còn lại và điểm dừng

Phase này chỉ bỏ đọc trùng. `Inventory Movement` vẫn đọc lịch sử rộng và xử lý/pagination bằng JavaScript; cần Phase 2 riêng với benchmark DB và `executionStats` trước khi thay query/index.

**Dừng sau Phase 81 để review.**
