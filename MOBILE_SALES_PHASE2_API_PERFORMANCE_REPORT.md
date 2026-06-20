# MOBILE SALES PHASE 2 — API PERFORMANCE & STABILITY REPORT

## 1. Phạm vi triển khai

Triển khai toàn bộ **Giai đoạn 2 — Tối ưu API mobile** trên nền mã nguồn đã hoàn thành Giai đoạn 1.

Phạm vi gồm:

1. Lazy-load dữ liệu theo tab, giảm request khi mở app.
2. API nhóm sản phẩm riêng, không tải hàng nghìn sản phẩm chỉ để lấy tên nhóm.
3. Phân trang server-side cho khách hàng, sản phẩm, đơn hàng và công nợ.
4. Tổng KPI đơn hàng/công nợ được tính độc lập với trang đang hiển thị.
5. Tối ưu doanh số tháng theo khách bằng MongoDB aggregation.
6. Chuẩn hóa timeout, AbortController, request replacement và telemetry ở API client.
7. Tách cache metadata sản phẩm khỏi tồn kho/quota trực tiếp.
8. Bổ sung công cụ read-only audit MongoDB query plan.
9. Giữ nguyên contract ghi đơn, tồn kho, khuyến mại, công nợ và offline đã khóa ở Giai đoạn 1.

Không thay đổi schema MongoDB, package hoặc business rule bán hàng.

---

## 2. Luồng trước và sau

### 2.1. Khi mở app

**Trước Phase 2**

```text
initSalesApp()
→ đọc IndexedDB pending
→ GET công nợ
→ GET tối đa 300 khách hàng
→ GET tối đa 100 đơn hôm nay
→ khởi tạo product autocomplete
→ GET tối đa 2.000 sản phẩm để suy ra nhóm hàng
```

**Sau Phase 2**

```text
initSalesApp()
→ đọc IndexedDB pending (local)
→ GET trang khách hàng đầu tiên, 40 dòng
→ render màn hình đầu

Mở tab Đặt hàng
→ GET /api/mobile/product-groups
→ tìm sản phẩm theo từ khóa, 50 dòng/lần

Mở tab Công nợ
→ GET trang công nợ, 30 khách/lần + KPI tổng chính xác

Mở tab Báo cáo
→ GET trang đơn hôm nay, 30 đơn/lần + KPI tổng chính xác
```

Số API bắt buộc lúc mở màn hình bán hàng giảm từ khoảng **4 request chính xuống 1 request**.

### 2.2. Dữ liệu sản phẩm

**Trước**

```text
Product.find(...).limit(2000)
→ hydrate tồn kho/quota cho toàn bộ
→ frontend duyệt để lấy group
```

**Sau**

```text
GET /api/mobile/product-groups
→ MongoDB aggregate distinct group
→ cache metadata group ngắn hạn

GET /api/mobile/products?q=...&group=...&page=1&limit=50
→ lọc group tại MongoDB trước skip/limit
→ cache metadata sản phẩm
→ đọc tồn kho/quota trực tiếp sau cache
```

Tồn kho và quota **không nằm trong cache metadata**.

---

## 3. Kiến trúc thay đổi

### 3.1. Pagination dùng chung

File mới:

```text
src/services/mobile/mobilePagination.util.js
```

Hàm:

```javascript
parseMobilePagination(query, { defaultLimit, maxLimit })
buildPagination({ page, limit, totalRows })
```

Response chuẩn:

```javascript
pagination: {
  page,
  limit,
  totalRows,
  totalPages,
  hasMore
}
```

### 3.2. Mobile debt query

File mới:

```text
src/services/mobile/mobileDebtQuery.service.js
```

Public boundary vẫn là:

```text
src/services/DebtReadService.js
```

Data flow:

```text
Mobile debts route
→ DebtReadService.getMobileCustomerDebts()
→ mobileDebtQuery.service
→ arLedgers aggregation
→ DebtCollection pending batch
→ rows + exact summary + pagination
```

Quy tắc quyền:

- Có mã NVBH/NVGH thì scope theo mã và alias mã.
- Tên chỉ fallback khi không có mã.
- Pending collection chỉ tính allocation thuộc tập đơn trong scope.
- Không đọc hoặc ghi công nợ từ nguồn khác `arLedgers`.

### 3.3. Catalog metadata cache

File:

```text
src/services/mobile/catalog.service.js
```

Cache chỉ gồm:

- Tên/mã sản phẩm.
- Đơn vị/quy cách.
- Giá danh mục.
- Nhóm/category.

Không cache:

- `availableQty`.
- `maxOrderQty`.
- DMS quota còn lại.

Mỗi request sản phẩm vẫn gọi:

```text
inventoryStock.service.getAvailableStocks()
InternalSaleAllocation.find(...)
```

sau khi lấy metadata.

### 3.4. Monthly customer sales

File:

```text
src/services/customerMonthlySales.service.js
```

Trước đây service có thể tải các đơn phù hợp về Node.js để tổng hợp. Sau patch, MongoDB thực hiện:

```text
$match khách hàng + tháng + trạng thái
→ $group theo customerCode
→ $sum doanh số
→ $sum số đơn
```

Chỉ các khách của page hiện tại được đưa vào aggregation.

---

## 4. API contract

### 4.1. Khách hàng mobile

```http
GET /api/mobile/customers?q=&page=1&limit=40
GET /api/mobile/catalog/customers?q=&page=1&limit=40
```

Response:

```javascript
{
  ok: true,
  source: 'mobile-catalog-paged-with-monthly-sales-and-debt',
  salesMonth: 'YYYY-MM',
  items: [],
  customers: [],
  total: 0,
  pagination: {
    page: 1,
    limit: 40,
    totalRows: 0,
    totalPages: 0,
    hasMore: false
  }
}
```

Mỗi khách được hydrate theo batch:

- Doanh số tháng.
- Nợ hiện tại từ `arLedgers`.

### 4.2. Nhóm sản phẩm

```http
GET /api/mobile/product-groups
GET /api/mobile/catalog/product-groups
```

Response:

```javascript
{
  ok: true,
  source: 'mobile-product-groups-distinct',
  cacheHit: false,
  groups: [],
  items: [],
  total: 0
}
```

### 4.3. Sản phẩm

```http
GET /api/mobile/products?q=&group=&page=1&limit=50
GET /api/mobile/catalog/products?q=&group=&page=1&limit=50
```

Response bổ sung:

```javascript
{
  metadataCacheHit: false,
  metadataCacheTtlMs: 15000,
  stockCached: false,
  inventorySource: 'inventories',
  items: [],
  pagination: {}
}
```

### 4.4. Đơn hàng mobile

```http
GET /api/mobile/sales/orders?mine=1&date=YYYY-MM-DD&page=1&limit=30&q=
```

Backend dùng một aggregation `$facet`:

- Nhánh `rows`: sort → skip → limit → projection.
- Nhánh `totals`: tổng số đơn, doanh số, đã thu, còn nợ trên toàn bộ phạm vi lọc.

### 4.5. Công nợ mobile

```http
GET /api/mobile/debts?page=1&limit=30&includePaid=0
GET /api/mobile/sales/debts?page=1&limit=30&includePaid=0
```

Response:

```javascript
{
  ok: true,
  source: 'mobile-ar-ledger-paged',
  summary: {
    totalDebt,
    totalDebit,
    totalCredit,
    pendingCollected,
    availableDebt,
    customerCount,
    orderCount
  },
  items: [],
  pagination: {}
}
```

KPI không còn phụ thuộc vào 30 khách đang hiển thị.

---

## 5. API client mobile

File:

```text
public/mobile/js/api.js
```

Đã bổ sung:

- Timeout mặc định 15 giây.
- Timeout riêng 30 giây cho command tạo/sửa/thu nợ.
- `AbortController`.
- `requestKey`.
- `cancelPrevious`.
- Request ID `X-Client-Request-Id`.
- Telemetry ring tối đa 100 bản ghi.
- Event `mkpro:mobile-api-perf`.
- Mã lỗi `REQUEST_TIMEOUT` và `REQUEST_ABORTED`.
- Không đưa các option nội bộ như `requestKey`, `timeoutMs` vào URL query.

Tìm khách/sản phẩm/đơn/công nợ có thể hủy request trước khi request mới thay thế.

---

## 6. Thay đổi frontend

### Startup

`initSalesApp()` chỉ:

1. Khôi phục draft.
2. Đọc pending offline từ IndexedDB.
3. Tải page khách hàng đầu tiên.
4. Render giỏ.

### Lazy load theo tab

```text
orderTab  → ensureProductToolsInitialized()
debtTab   → loadDebts()
reportTab → loadTodayOrders()
```

### Incremental loading

Thêm các nút:

```text
customerLoadMoreBtn
debtLoadMoreBtn
orderLoadMoreBtn
```

Page mới được merge theo stable ID/code để tránh dòng trùng.

### KPI

- KPI công nợ lấy từ `response.summary`.
- KPI đơn hôm nay lấy từ `response.summary`.
- Không cộng lại riêng trên page đang hiển thị.

---

## 7. Query plan và index

File mới:

```text
scripts/audit-mobile-query-plans.js
```

Mặc định script chỉ đọc `INDEX_DEFINITIONS`, không kết nối database và không thay đổi index.

Chạy static:

```bash
node scripts/audit-mobile-query-plans.js
```

Chạy `explain('executionStats')` read-only trên môi trường được cho phép:

```bash
MOBILE_QUERY_PLAN_AUDIT_DB=1 MONGO_URI='...' node scripts/audit-mobile-query-plans.js
```

### Kết quả static

| Query | Index hiện có liên quan | Đánh giá |
|---|---|---|
| Product active + code | `idx_products_active_code` | Phù hợp cho page cơ bản |
| Orders theo NVBH/ngày | `idx_orders_sales_staff_order_date_status` | Có index nền phù hợp |
| AR sale theo NVBH | `idx_ar_sale_sales_staff_type_date` | Có index nền phù hợp |
| Customers theo canonical `salesStaffCode` | Chỉ thấy index legacy `staffCode, route, isActive` | Cần chạy explain production trước khi đề xuất index mới |

Không tự tạo index mới vì chưa có `executionStats` trên dữ liệu production.

Index ứng viên chỉ để đánh giá sau khi có bằng chứng:

```javascript
{ salesStaffCode: 1, isActive: 1, code: 1 }
```

---

## 8. Chỉ số cấu trúc trước và sau

| Chỉ số | Trước Phase 2 | Sau Phase 2 |
|---|---:|---:|
| Request dữ liệu chính khi mở app | Khoảng 4 | 1 |
| Khách hàng lần tải đầu | Tối đa 300 | 40/page |
| Đơn hôm nay | Tối đa 100 | 30/page |
| Khách công nợ | Tối đa 100 | 30/page |
| Nguồn nhóm SP | Tối đa 2.000 full product rows | Distinct group strings |
| Group filter | Lọc Node.js sau `limit` | Lọc MongoDB trước `skip/limit` |
| Monthly sales | Tổng hợp ngoài query/page rộng | Mongo aggregation cho page hiện tại |
| Order KPI | Dựa trên list tải được | Exact totals qua `$facet` |
| Debt KPI | Có nguy cơ phụ thuộc page | Exact totals độc lập page |
| Search request cũ | Không thống nhất | Có Abort/request sequence |
| API timeout | Không thống nhất | 15 giây mặc định |
| Stock trong product cache | Có | Không |

Chưa có MongoDB production và thiết bị Android thật trong môi trường kiểm thử, nên không khẳng định số p50/p95 latency thực tế. Sau deploy nên đo qua event `mkpro:mobile-api-perf`.

---

## 9. Danh sách file thay đổi

### Backend

```text
src/services/mobile/mobilePagination.util.js
src/services/mobile/mobileDebtQuery.service.js
src/services/mobile/catalog.service.js
src/services/mobile/debts.service.js
src/services/mobile/sales.service.source/part-01.jsfrag
src/services/mobile/sales.service.source/part-03.jsfrag
src/services/mobile/sales.service.js
src/services/DebtReadService.js
src/services/customerMonthlySales.service.js
src/routes/mobile/catalog.routes.js
src/routes/mobile/sales.routes.js
src/routes/mobile/debts.routes.js
src/routes/mobile/index.js
src/controllers/mobile/catalog.controller.js
scripts/audit-mobile-query-plans.js
```

### Frontend

```text
public/mobile/js/api.js
public/mobile/js/config.js
public/mobile/js/ui.js
public/mobile/js/sales.source/part-01.jsfrag
public/mobile/js/sales.source/part-01b.jsfrag
public/mobile/js/sales.source/part-02.jsfrag
public/mobile/js/sales.source/part-03.jsfrag
public/mobile/js/sales.js
public/mobile/mobile.source/mobile-03.css
public/mobile/sales.html
```

### Build/docs/test

```text
config/source-bundles.json
docs/openapi.json
test/mobile-sales-phase2-api-performance.test.js
```

Một số static regression test được cập nhật vì contract có chủ đích đổi từ list cố định sang pagination/lazy loading.

---

## 10. Diff quan trọng

### Startup cũ

```javascript
await loadDebts({ silent: true });
await loadCustomers('');
loadTodayOrders();
initProductAutocomplete();
```

### Startup mới

```javascript
await loadPendingOfflineOrders();
await loadCustomers('', { reset: true });
renderCart();
```

### Product groups cũ

```javascript
getProducts('', { all: true, limit: 5000 });
```

### Product groups mới

```javascript
mobileApi.getProductGroups();
```

### Product cache cũ

```text
cache toàn response sau khi hydrate tồn/quota
```

### Product cache mới

```text
cache metadata page
→ hydrate tồn/quota mới ở mỗi request
```

### Order list cũ

```javascript
SalesOrder.find(...).limit(100)
```

### Order list mới

```javascript
SalesOrder.aggregate([
  { $match },
  { $facet: { rows: [...], totals: [...] } }
])
```

---

## 11. Kiểm thử

### Test mới Phase 2

`test/mobile-sales-phase2-api-performance.test.js` kiểm tra:

1. Pagination clamp và `hasMore`.
2. Customer/Product query có skip/limit/count tại MongoDB.
3. Group filter trước pagination.
4. Product groups endpoint riêng.
5. Metadata cache không chứa stock.
6. Batch-load monthly sales và debt.
7. Order `$facet` rows/totals.
8. Debt đi qua `DebtReadService`.
9. Pending debt không tính allocation ngoài owner scope.
10. Timeout/Abort/telemetry.
11. Option nội bộ không rò vào URL.
12. Startup lazy loading.
13. Tab lazy loading.
14. Load-more UI.
15. Query plan audit read-only.

### Full-suite

| Bộ mã | Pass | Fail | Skip |
|---|---:|---:|---:|
| ZIP đầu vào Phase 1 | 828/833 | 4 | 1 |
| Sau Phase 2 | 842/847 | 4 | 1 |

Bốn lỗi còn lại giống hoàn toàn ZIP đầu vào:

1. Cache-version DMS inventory frontend.
2. Import worker assertion `importMode` số 1.
3. Import worker assertion `importMode` số 2.
4. Cache-version sales-order web shard.

Không có lỗi regression mới.

### Quality gates

| Hạng mục | Kết quả |
|---|---:|
| JavaScript syntax | 845 file đạt |
| Source bundles | 18/18 đạt |
| Source-size budget | Đạt |
| Path portability | 1.023 paths đạt |
| Enterprise smoke | Đạt |
| OpenAPI | 308 operations, đồng bộ |
| Package lock registry | Đạt |
| `npm audit --omit=dev` | 0 vulnerability |

---

## 12. Side effect

| Module | Đánh giá |
|---|---|
| Tạo/sửa/xóa đơn | Không đổi command contract đã khóa ở Phase 1 |
| Inventory posting | Không sửa |
| Tồn kho SSoT | Vẫn dùng `inventories` qua `inventoryStock.service` |
| Khuyến mại | Không đổi công thức |
| Công nợ | Vẫn dùng `arLedgers`; chỉ tối ưu read/query |
| Phiếu thu nợ | Không đổi lifecycle/posting |
| Quỹ | Không ảnh hưởng |
| Giao hàng | Không ảnh hưởng |
| Trả hàng | Không ảnh hưởng |
| MongoDB schema | Không thay đổi |
| Index | Không tự tạo/thay đổi |
| Offline queue | Không thay đổi business rule Phase 1 |

---

## 13. Rollback

Có thể rollback độc lập theo nhóm:

1. **Frontend lazy loading**: khôi phục `sales.source/*`, `sales.html`, `api.js`.
2. **Catalog pagination/group endpoint**: khôi phục catalog route/controller/service.
3. **Orders pagination**: khôi phục `listSalesOrders()` cũ.
4. **Debt pagination**: khôi phục wrapper `DebtReadService.getCustomerDebts()` cũ.
5. **Metadata cache**: đặt TTL `0` bằng ENV hoặc khôi phục service.

Không có migration hoặc dữ liệu mới cần rollback.

---

## 14. Rủi ro còn lại

1. Chưa chạy MongoDB `explain()` trên production nên chưa phê duyệt index customers theo `salesStaffCode`.
2. Search regex trên nhiều field vẫn cần đo bằng dữ liệu production.
3. Mobile debt scope seed có guard 10.000 AR-SALE rows; quy mô hiện tại phù hợp nhưng cần theo dõi nếu một NVBH tích lũy trên ngưỡng này.
4. Chưa đo p50/p95 trên Android cấu hình thấp và mạng thật.
5. UI hiện vẫn dùng tab trên và chưa chuẩn hóa hoàn toàn loading/error/empty state; thuộc Giai đoạn 3.

---

## 15. Giai đoạn tiếp theo

**Giai đoạn 3 — Chuẩn hóa giao diện mobile** nên thực hiện sau khi deploy thử Phase 2 và theo dõi telemetry.

Phạm vi dự kiến:

- Hiển thị khách đang mua rõ hơn trong toàn bộ luồng.
- Nhãn Thùng/Lẻ cố định.
- Sửa số lượng trực tiếp trong giỏ.
- Tổng trước KM / KM / phải thanh toán.
- Sticky action bar.
- Search/filter danh sách đơn.
- Chuẩn hóa loading/error/empty state.
- Bottom navigation hoặc cải tiến thumb-zone.
- Lưu scroll position và hỗ trợ Back Android.
- Chuẩn vùng bấm, tương phản và accessibility.
