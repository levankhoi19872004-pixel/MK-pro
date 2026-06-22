# PHASE37_DASHBOARD_OVERVIEW_REDESIGN_REPORT

## 1. Tổng quan

Phase37 xử lý nguyên nhân gốc của dashboard chậm: màn Tổng quan cũ bắt `GET /api/dashboard/home` đọc cùng lúc KPI, bảng NVBH, bảng NVGH theo tháng/hôm nay, công nợ, hàng trả và data quality. Sau Phase36E, query đơn lẻ đã được vá nhưng thiết kế vẫn khiến một request phải gánh nhiều aggregate nặng.

Phase37 triển khai **Phương án B — split API + lazy-load + overview nhẹ + cache ngắn**, giữ API cũ để tương thích nhưng frontend mới không còn block màn đầu bằng `/api/dashboard/home`.

Baseline sử dụng: `MK-pro-phase36e-dashboard-salesorder-aggregate-patched.zip`.

## 2. Audit dashboard cũ

| Khối dashboard hiện tại | File/API | Collection đọc | Query chính | Bắt buộc hiển thị ngay | Có thể lazy-load | Mức rủi ro |
|---|---|---|---|---|---|---|
| KPI doanh số/tháng/ngày | `/api/dashboard/home`, `HomeDashboardService` | `orders`, `returnOrders`, `salesTargets` | `SalesOrder.aggregate`, `ReturnOrder.aggregate`, `SalesTarget.find` | Có | Một phần | Cao nếu tính sai doanh số |
| Bảng chỉ tiêu NVBH | `/api/dashboard/home` | `orders`, `returnOrders`, `arLedgers`, `users`, `salesTargets` | nhiều aggregate + merge theo nhân viên | Không | Có | Trung bình |
| Bảng giao hàng tháng | `/api/dashboard/home` | `master_orders`, `orders`, `returnOrders`, `users` | `MasterOrder.aggregate` + batch `SalesOrder.find` | Không | Có | Trung bình |
| Bảng giao hàng hôm nay | `/api/dashboard/home` | `master_orders`, `orders`, `returnOrders` | `listDeliveryTodaySummary` | Không | Có | Trung bình |
| Công nợ trong dashboard | `/api/dashboard/home` | `arLedgers` | aggregate current debt | Không nên block màn đầu | Có | Cao nếu cache sai |
| Data quality/pricing fallback | `/api/dashboard/home` | `orders`, `products` | unwind items + lookup products | Không | Có | Cao, query nặng |

## 3. Thiết kế dashboard mới

### Nhóm A — Hiển thị ngay

- Doanh số hôm nay.
- Doanh số tháng đã xác nhận.
- Đơn hôm nay.
- Đơn chờ xác nhận kế toán.
- Hàng trả tháng.
- Đã giao / chờ giao hôm nay.
- Thu/chi quỹ hôm nay ở mức tổng.

Các KPI này đi qua API mới:

```text
GET /api/dashboard/overview
```

### Nhóm B — Lazy-load

- Bảng chỉ tiêu NVBH theo tháng.
- Bảng giao hàng tháng.
- Bảng giao hàng hôm nay.
- Data quality chi tiết.
- Công nợ theo NVBH trong dashboard.

Các khối này đi qua API mới:

```text
GET /api/dashboard/sales-staff
GET /api/dashboard/delivery-summary
```

### Nhóm C — Chuyển sang báo cáo riêng ở phase sau

- Top sản phẩm.
- Top khách hàng.
- Biểu đồ 7 ngày/30 ngày.
- Chi tiết sản phẩm/công nợ/tồn kho.

Phase37 chưa thêm các API này để tránh mở rộng phạm vi quá lớn; report đã giữ hướng thiết kế.

## 4. API mới/cũ

| API | Mục đích | Dữ liệu trả | Cache | Query chính |
|---|---|---|---|---|
| `GET /api/dashboard/overview` | Mở KPI nhanh | `summary`, `overview`, `period`, `sources`, `metrics` | Có, TTL ngắn qua `DashboardCacheService` | root aggregate nhẹ trên `orders`, `returnOrders`, `fundLedgers`, `salesTargets` |
| `GET /api/dashboard/sales-staff` | Lazy-load bảng NVBH | `salesByStaff`, `summary`, `dataQuality` | Có, key riêng `sales-staff:<period>:<today>` | giữ công thức cũ `aggregateSales`, `aggregateReturns`, `aggregateCurrentDebt` |
| `GET /api/dashboard/delivery-summary` | Lazy-load bảng NVGH | `deliveryMonth`, `deliveryToday` | Có, key riêng `delivery-summary:<period>:<today>` | `DeliveryDashboardQuery` hiện có |
| `GET /api/dashboard/home` | Tương thích legacy | Response cũ đầy đủ | Có | không xóa để tránh phá client cũ |

## 5. Data strategy

### Phương án A — Read model `dashboardDailyStats`

Ưu điểm:

- Dashboard rất nhanh vì đọc sẵn số liệu tổng hợp.
- Không aggregate collection lớn mỗi lần mở.
- Phù hợp khi dữ liệu tăng mạnh hoặc bán SaaS.

Nhược điểm:

- Effort Hard.
- Cần rebuild/verify/rollback.
- Cần cập nhật khi tạo đơn, giao hàng, trả hàng, kế toán xác nhận, thu/chi quỹ.

### Phương án B — Split API + lazy-load + cache ngắn

Ưu điểm:

- Effort Medium.
- Không đổi schema.
- Ít rủi ro sai nghiệp vụ.
- Phù hợp quy mô hiện tại.

Nhược điểm:

- Cache miss vẫn có aggregate, nhưng được chia nhỏ và không block màn đầu.
- Khi dữ liệu tăng mạnh vẫn nên chuyển sang Phương án A.

Khuyến nghị: Phase37 đã triển khai Phương án B trước, đồng thời giữ đường nâng cấp sang Phương án A.

## 6. File đã sửa/thêm

| File | Loại | Ghi chú |
|---|---|---|
| `src/services/dashboard/DashboardOverviewService.js` | Thêm | API overview nhẹ, không kéo full `items`, không đọc `inventorySnapshots` |
| `src/services/dashboard/HomeDashboardService.js` | Sửa | Tách `getSalesStaffDashboard`, `getDeliveryDashboard`, export `listActiveStaff` |
| `src/controllers/dashboardController.js` | Sửa | Thêm handler `overview`, `salesStaff`, `deliverySummary` |
| `src/routes/dashboardRoutes.js` | Sửa | Thêm route `/overview`, `/sales-staff`, `/delivery-summary` |
| `public/js/app/00-dashboard.js` | Sửa | Frontend gọi overview trước, bảng nặng lazy-load, có abort/dedupe |
| `test/phase37-dashboard-overview-redesign-static.test.js` | Thêm | Static test Phase37 |
| `test/phase36e-dashboard-salesorder-aggregate-static.test.js` | Sửa | Cập nhật expectation: dashboard client có thể dùng `/overview` thay `/home` sau Phase37 |
| `PHASE37_MONGODB_INDEX_RECOMMENDATIONS.md` | Thêm | Khuyến nghị index theo API mới |

## 7. Diff Old/New quan trọng

### 7.1 Frontend dashboard

Old:

```javascript
const response = await fetch(`/api/dashboard/home?${params.toString()}`, { signal: dashboardRequestController.signal });
renderDashboard(payload.data || {});
```

New:

```javascript
const data = await fetchDashboardJson(`/api/dashboard/overview?${params.toString()}`, dashboardRequestController.signal);
renderDashboard(data || {});
setTimeout(() => loadDashboardBlocks({ force: options.force === true }), 250);
```

### 7.2 API tách mới

Old:

```javascript
router.get('/home', viewDashboard, dashboardController.home);
```

New:

```javascript
router.get('/home', viewDashboard, dashboardController.home);
router.get('/overview', viewDashboard, dashboardController.overview);
router.get('/sales-staff', viewDashboard, dashboardController.salesStaff);
router.get('/delivery-summary', viewDashboard, dashboardController.deliverySummary);
```

### 7.3 Overview service

Old: không có API overview nhẹ; màn đầu phụ thuộc `/api/dashboard/home`.

New:

```javascript
async function getOverview({ month, force = false } = {}) {
  const [targets, confirmedSales, pendingSales, todaySales, returns, deliveryToday, cash] = await Promise.all([...]);
  return { mode: 'overview', overview, summary, salesByStaff: null, deliveryMonth: null, deliveryToday: null };
}
```

## 8. Test thực tế

| Lệnh | Kết quả |
|---|---|
| `npm run check:syntax` | PASS — `SYNTAX_OK 975 JavaScript files` |
| `node --test test/phase37-dashboard-overview-redesign-static.test.js` | PASS — 5/5 |
| `node --test test/phase36e-dashboard-salesorder-aggregate-static.test.js test/phase36d-api-response-followup-static.test.js test/phase36c-api-response-p0p1-static.test.js test/phase36b-delivery-performance-static.test.js test/phase37-dashboard-overview-redesign-static.test.js` | PASS — 30/30 |

## 9. Before/After

Không có MongoDB live/Render API Monitor trong sandbox nên không ghi số after giả.

| Metric | Before | After |
|---|---:|---:|
| `GET /api/dashboard/home` | 3s–4s | Cần đo lại trên Render |
| `SalesOrder.aggregate` trong home | 2s–3.6s | Cần đo lại trên Render |
| `MasterOrder.aggregate` trong home | ~2.4s | Cần đo lại trên Render |
| Query count dashboard cũ | 7–13 | Cần đo lại trên Render |
| API mới `/api/dashboard/overview` | Chưa có | Cần đo lần đầu trên Render |

## 10. Hướng đo lại trên Render

1. Deploy ZIP Phase37.
2. Mở tab Tổng quan.
3. Trong API Monitor, kiểm tra:
   - `GET /api/dashboard/overview`
   - `GET /api/dashboard/sales-staff`
   - `GET /api/dashboard/delivery-summary`
   - xác nhận frontend không còn gọi `/api/dashboard/home` khi mở dashboard mới.
4. Đo 3 lần:
   - cache miss lần đầu
   - cache hit trong 30–60 giây
   - sau khi bấm Tải lại.
5. Nếu `/api/dashboard/overview` vẫn > 1.2s, kiểm tra index trong `PHASE37_MONGODB_INDEX_RECOMMENDATIONS.md`.

## 11. Regression checklist

| Hạng mục | Kết quả |
|---|---|
| Bán hàng | Không đổi business rule bán hàng |
| Giao hàng | Không đổi API giao hàng; chỉ tách dashboard delivery summary |
| Trả hàng | Không đổi `returnOrders`; overview chỉ đọc summary |
| Đối soát | Không sửa |
| Kế toán xác nhận | Không sửa |
| Công nợ | Không cache realtime trong overview; chi tiết vẫn lazy-load từ `arLedgers` |
| Tồn kho | Không đọc `inventorySnapshots`, không sửa tồn kho |
| Quỹ | Overview chỉ tổng hợp thu/chi ngày từ `fundLedgers` |
| Khuyến mại | Không sửa rule khuyến mại |
| Dashboard | Đã tách overview và lazy blocks |
| App mobile | Không sửa |
| Import/export | Không sửa |

## 12. Rủi ro còn lại

1. `GET /api/dashboard/sales-staff` vẫn dùng công thức cũ để giữ đúng nghiệp vụ, nên có thể còn nặng khi cache miss. Đây là block lazy-load, không còn block màn đầu.
2. Overview dùng root amount fields để hiển thị nhanh. Nếu có đơn legacy thiếu toàn bộ root amount và chỉ có item lines, KPI overview có thể thấp hơn bảng chi tiết; bảng chi tiết lazy-load vẫn dùng công thức cũ có line valuation.
3. Nên đo thực tế trên Render trước khi quyết định chuyển sang Phương án A `dashboardDailyStats`.
4. Cần tạo index Atlas theo file khuyến nghị để tận dụng `$match` ngày/status.
5. Khi dữ liệu tăng mạnh, nên triển khai read model `dashboardDailyStats` có rebuild/verify.

## 13. Kết luận

Phase37 không tiếp tục vá riêng `SalesOrder.aggregate`/`MasterOrder.aggregate`, mà đổi kiến trúc Dashboard Home sang:

```text
Shell UI -> overview nhẹ -> lazy-load bảng nặng
```

Cách này phù hợp mục tiêu vận hành hiện tại: mở màn nhanh, dễ đọc số liệu, giảm rủi ro dashboard bị chậm do một request aggregate quá nhiều collection.
