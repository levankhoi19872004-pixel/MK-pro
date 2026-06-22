# PHASE36E — DASHBOARD SALESORDER AGGREGATE OPTIMIZATION REPORT

## 1. Tổng quan

Phase36E xử lý đúng log chậm mới của API Monitor:

| Endpoint | Query chậm | Before từ monitor | Mục tiêu |
|---|---|---:|---:|
| `GET /api/dashboard/home` | `SalesOrder.aggregate` | tổng response ~3.067s | < 1.2s nếu dữ liệu tương đương |
| `SalesOrder.aggregate` trong dashboard | `$match` trạng thái trước, normalize ngày sau | ~2.116s | không scan rộng toàn bộ `salesOrders` |

Không có MongoDB live trong sandbox nên không ghi số after giả. Sau deploy cần đo lại trên Render API Monitor.

## 2. Root cause

### Endpoint

`GET /api/dashboard/home`

### File / hàm

| File | Hàm |
|---|---|
| `src/controllers/dashboardController.js` | `home` |
| `src/services/dashboard/HomeDashboardService.js` | `getHomeDashboard` |
| `src/services/dashboard/SalesDashboardQuery.js` | `aggregateSales` |
| `src/services/dashboard/SalesDashboardQuery.js` | `buildActualSalesPipeline` |

### Pipeline cũ

`HomeDashboardService.getHomeDashboard()` gọi `SalesDashboardQuery.aggregateSales()` 3 lần:

- `monthlySales`: doanh số tháng đã xác nhận kế toán.
- `monthlyPendingSales`: đơn bán tháng còn chờ xác nhận.
- `todaySales`: đơn bán hôm nay đang hoạt động.

Trong `buildActualSalesPipeline`, pipeline cũ bắt đầu bằng:

```javascript
[
  { $match: { $and: matchFilters } },
  ...businessDateStages(dateFrom, dateTo, ['orderDate', 'date', 'documentDate']),
  { $set: { ... } },
  ...lineValuationStages(...),
  ...salesDocumentAggregationStages(),
  salesFacetStage()
]
```

`businessDateStages()` phải normalize nhiều định dạng ngày bằng `$set` rồi mới `$match`. Vì `$match` thời gian không nằm ở đầu pipeline theo dạng index-friendly, MongoDB có thể phải đọc nhiều đơn bán còn hiệu lực trước rồi mới lọc theo tháng/ngày.

### Dashboard block bị ảnh hưởng

- Doanh số NVBH theo tháng.
- Đơn chờ xác nhận kế toán theo tháng.
- Doanh số hôm nay.
- Tổng doanh số / net sales / tỷ lệ hoàn thành.
- Data quality valuation.

### Vì sao chậm

1. `SalesOrder.aggregate` bắt đầu bằng trạng thái/lifecycle, chưa có prefilter ngày ở `$match` đầu.
2. Date filter phụ thuộc normalize date trong aggregation, khó tận dụng index `orderDate`, `date`, `documentDate`, `createdAt`.
3. Pipeline giữ document rộng trước khi `$unwind items` và `$lookup products`.
4. `$lookup products` trước đây dùng `localField/foreignField`, có thể hydrate toàn bộ product document trong mảng match dù dashboard chỉ cần giá bán tham chiếu.

## 3. Cách sửa

### 3.1. Thêm prefilter ngày index-friendly vào `$match` đầu tiên

Thêm helper trong `SalesDashboardQuery.js`:

```javascript
function dateRangePrefilter(dateFrom, dateTo, fields = []) { ... }
```

Pipeline mới:

```javascript
const salesDatePrefilter = dateRangePrefilter(dateFrom, dateTo, ['orderDate', 'date', 'documentDate']);
const earlyMatchFilters = [...matchFilters];
if (salesDatePrefilter?.$match) earlyMatchFilters.push(salesDatePrefilter.$match);

return [
  { $match: { $and: earlyMatchFilters } },
  { $project: salesDashboardProjection() },
  ...businessDateStages(dateFrom, dateTo, ['orderDate', 'date', 'documentDate']),
  ...
];
```

Ý nghĩa:

- `$match` đầu tiên giờ có cả filter trạng thái và filter ngày/tháng.
- Giữ fallback legacy qua `createdAt` và regex tháng cho field string ngày cũ.
- Sau khi prefilter hẹp, vẫn chạy `businessDateStages()` để đảm bảo đúng nghiệp vụ ngày legacy.

### 3.2. Projection trước normalize/group

Thêm helper:

```javascript
function salesDashboardProjection() { ... }
```

Projection chỉ giữ các field dashboard sales cần:

```text
_id, id, code, orderCode, salesOrderCode, documentCode, invoiceCode,
orderDate, date, documentDate, createdAt, updatedAt, modifiedAt, stateChangedAt,
salesStaffCode, salesStaffName, salesmanCode, salesmanName, nvbhCode, nvbhName,
afterPromoAmount, totalAfterPromotion, goodsAmountAfterPromotion, netAmount,
totalAmount, grandTotal, amount, total,
items.productCode, items.code, items.sku, items.productId, items.barcode,
items.quantity, items.qty, items.totalQty, items.stockQuantity, items.baseQuantity,
items.lineType, items.type, items.kind, items.itemType, items.isPromo,
items.promoQuantity, items.promotionQuantity, items.freeQty, items.freeQuantity,
items.soldQuantity, items.saleQuantity,
items.lineAmountAtOrder, items.finalAmount, items.netAmount, items.lineAmount,
items.amount, items.totalAmount,
items.finalPriceAtOrder, items.finalPrice, items.priceAfterTaxAfterPromotion,
items.priceAfterPromotion, items.priceAfterDiscount, items.netPrice,
items.unitPrice, items.salePrice, items.price,
items.catalogSalePriceAtOrder, items.priceAfterTaxBeforePromotionAtOrder,
items.listPriceAfterVat, items.productSnapshot.salePrice,
items.catalogSalePrice, items.grossPrice, items.originalPrice,
items.basePrice, items.listPrice
```

Không project `items: 1` toàn bộ.

### 3.3. Thu hẹp product lookup trong aggregate

Old:

```javascript
$lookup: {
  from: Product.collection.name,
  localField: '_dashboardProductCode',
  foreignField: 'code',
  as: '_dashboardProductMatches'
}
```

New:

```javascript
$lookup: {
  from: Product.collection.name,
  let: { productCode: '$_dashboardProductCode' },
  pipeline: [
    { $match: { $expr: { $eq: ['$code', '$$productCode'] } } },
    { $project: { code: 1, salePrice: 1, price: 1, sellPrice: 1, giaBan: 1 } }
  ],
  as: '_dashboardProductMatches'
}
```

Dashboard chỉ cần các field giá để fallback định giá, không cần hydrate toàn bộ product document.

### 3.4. Cache

| Nội dung | Quyết định |
|---|---|
| Có dùng cache không | Có, giữ cache summary ngắn đã có từ Phase36B/36D |
| TTL | Theo `DashboardCacheService`, hiện dùng short TTL summary |
| Cache key | `period:today` + freshness version |
| Lý do an toàn | Chỉ cache dashboard summary tổng quan |
| Không cache | Công nợ realtime, tồn kho realtime, giao hàng đang thao tác, xác nhận kế toán, thu tiền |

Cache không thay thế tối ưu query; Phase36E đã thu hẹp query trước khi cache phát huy hiệu quả ở lần hit.

### 3.5. Route `/`

`src/routes/static.routes.js` vẫn chỉ gọi:

```javascript
renderIndexPage()
```

Không gọi `getHomeDashboard()` server-side. Frontend fetch `/api/dashboard/home` sau khi UI shell đã tải.

## 4. Diff Old/New quan trọng

### 4.1. Date prefilter + projection

Old:

```javascript
return [
  { $match: { $and: matchFilters } },
  ...businessDateStages(dateFrom, dateTo, ['orderDate', 'date', 'documentDate']),
  {
    $set: {
      _dashboardBusinessKey: salesDocumentKeyExpression(),
      _dashboardVersionSort: documentVersionExpression(),
      _dashboardRootActualAmount: rootActualSalesAmountExpression()
    }
  },
  ...lineValuationStages(...)
];
```

New:

```javascript
const salesDatePrefilter = dateRangePrefilter(dateFrom, dateTo, ['orderDate', 'date', 'documentDate']);
const earlyMatchFilters = [...matchFilters];
if (salesDatePrefilter?.$match) earlyMatchFilters.push(salesDatePrefilter.$match);

return [
  { $match: { $and: earlyMatchFilters } },
  { $project: salesDashboardProjection() },
  ...businessDateStages(dateFrom, dateTo, ['orderDate', 'date', 'documentDate']),
  {
    $set: {
      _dashboardBusinessKey: salesDocumentKeyExpression(),
      _dashboardVersionSort: documentVersionExpression(),
      _dashboardRootActualAmount: rootActualSalesAmountExpression()
    }
  },
  ...lineValuationStages(...)
];
```

### 4.2. Product lookup projection

Old:

```javascript
{
  $lookup: {
    from: Product.collection.name,
    localField: '_dashboardProductCode',
    foreignField: 'code',
    as: '_dashboardProductMatches'
  }
}
```

New:

```javascript
{
  $lookup: {
    from: Product.collection.name,
    let: { productCode: '$_dashboardProductCode' },
    pipeline: [
      { $match: { $expr: { $eq: ['$code', '$$productCode'] } } },
      { $project: { code: 1, salePrice: 1, price: 1, sellPrice: 1, giaBan: 1 } }
    ],
    as: '_dashboardProductMatches'
  }
}
```

## 5. File đã sửa/thêm

| File | Loại | Nội dung |
|---|---|---|
| `src/services/dashboard/SalesDashboardQuery.js` | Sửa | Thêm date prefilter, projection trước group, product lookup projection |
| `test/phase36e-dashboard-salesorder-aggregate-static.test.js` | Thêm | Static test cho pipeline dashboard sales aggregate |
| `PHASE36E_DASHBOARD_SALESORDER_AGGREGATE_REPORT.md` | Thêm | Báo cáo Phase36E |
| `PHASE36E_MONGODB_INDEX_RECOMMENDATIONS.md` | Thêm | Khuyến nghị index MongoDB |

## 6. Test thực tế

| Lệnh | Kết quả |
|---|---|
| `npm run check:syntax` | PASS — `SYNTAX_OK 973 JavaScript files` |
| `node --test test/phase36e-dashboard-salesorder-aggregate-static.test.js` | PASS — 5/5 |
| `node --test test/phase36d-api-response-followup-static.test.js` | PASS — 8/8 |
| `node --test test/phase36c-api-response-p0p1-static.test.js` | PASS — 6/6 |
| `node --test test/phase36b-delivery-performance-static.test.js` | PASS — 6/6 |
| `node --test test/sales-order-delete-list-visibility-static.test.js test/mobile-sales-delete-list-visibility-static.test.js test/sales-order-delete-static-boundary.test.js` | PASS — 7/7 |

Không chạy `test/home-dashboard.test.js` vì sandbox không có `node_modules/mongoose`. Lệnh này fail do thiếu dependency môi trường, không phải do lỗi syntax/source.

## 7. Before/After

| API | Before | After | Ghi chú |
|---|---:|---:|---|
| `GET /api/dashboard/home` | 3.067s | Cần đo lại trên Render | Sandbox không có MongoDB live |
| `SalesOrder.aggregate` | 2.116s | Cần đo lại trên Render | Đã thêm prefilter ngày + projection |
| Query count | 13 | Cần đo lại trên Render | API Monitor |

## 8. Hướng dẫn đo lại trên Render

1. Deploy ZIP Phase36E lên Render.
2. Mở dashboard home 3 lần:
   - Lần 1: cache miss.
   - Lần 2: cache hit.
   - Lần 3: sau TTL hoặc thêm `refresh=1` nếu cần đo cache miss.
3. Ghi lại trong API Monitor:
   - Tổng response `/api/dashboard/home`.
   - Thời gian `SalesOrder.aggregate`.
   - Số query.
4. So sánh với baseline:
   - Tổng response: 3.067s.
   - `SalesOrder.aggregate`: 2.116s.
   - Query count: 13.

## 9. Regression checklist

| Khu vực | Trạng thái | Ghi chú |
|---|---|---|
| Bán hàng | Không đổi nghiệp vụ | Chỉ tối ưu dashboard read aggregate |
| Giao hàng | Không ảnh hưởng | Không sửa delivery write flow |
| Trả hàng | Không ảnh hưởng | Không sửa `returnOrders` |
| Đối soát | Không ảnh hưởng | Không sửa reconciliation write flow |
| Kế toán xác nhận | Không ảnh hưởng | Không sửa confirm-accounting |
| Công nợ | Không cache realtime | Không sửa `arLedgers` |
| Tồn kho | Không cache realtime | Không dùng `inventorySnapshots` |
| Quỹ | Không ảnh hưởng | Không sửa `fundLedgers` |
| Khuyến mại | Không ảnh hưởng | Chỉ lookup product price trong dashboard aggregate |
| Dashboard | Đã tối ưu | Giữ API contract |
| App mobile | Không ảnh hưởng | Không sửa mobile routes |
| Import/export | Không ảnh hưởng | Không sửa import/export |

## 10. Rủi ro còn lại

1. Cần đo lại trên Render API Monitor vì sandbox không có MongoDB live.
2. Nếu dữ liệu ngày legacy quá nhiều dạng không chuẩn, prefilter regex tháng vẫn có thể chưa tận dụng index tuyệt đối, nhưng đã hẹp hơn scan toàn bộ.
3. Nên tạo index trên MongoDB Atlas theo file `PHASE36E_MONGODB_INDEX_RECOMMENDATIONS.md` sau khi kiểm tra index hiện có.
4. `$lookup` dạng pipeline cần MongoDB version hỗ trợ `$lookup.pipeline` với `let`; MongoDB Atlas hiện đại thường hỗ trợ. Nếu môi trường quá cũ, rollback về localField/foreignField và giữ projection date prefilter.
