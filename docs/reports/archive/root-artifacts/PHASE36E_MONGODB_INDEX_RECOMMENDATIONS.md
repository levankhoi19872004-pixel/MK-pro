# PHASE36E — MONGODB INDEX RECOMMENDATIONS

Không tự chạy migration trong Phase36E. Các index dưới đây chỉ là khuyến nghị cần kiểm tra trên MongoDB Atlas trước khi tạo.

## 1. `salesorders` — dashboard SalesOrder.aggregate theo `orderDate`

| Mục | Nội dung |
|---|---|
| Collection | `salesorders` |
| Query phục vụ | `GET /api/dashboard/home` — `SalesOrder.aggregate` doanh số tháng/ngày |
| Index đề xuất | `db.salesorders.createIndex({ orderDate: 1, status: 1, lifecycleStatus: 1, deliveryStatus: 1 })` |
| Lý do | Phase36E đưa `$match` theo `orderDate` vào đầu pipeline; index giúp giảm scan khi `orderDate` là field chính |
| Rủi ro | Nếu `orderDate` chủ yếu là string nhiều định dạng, hiệu quả phụ thuộc chất lượng dữ liệu |
| Rollback | `db.salesorders.dropIndex('orderDate_1_status_1_lifecycleStatus_1_deliveryStatus_1')` |

## 2. `salesorders` — dashboard SalesOrder.aggregate theo `date/documentDate`

| Mục | Nội dung |
|---|---|
| Collection | `salesorders` |
| Query phục vụ | Dữ liệu legacy dùng `date` hoặc `documentDate` thay `orderDate` |
| Index đề xuất | `db.salesorders.createIndex({ date: 1, status: 1, lifecycleStatus: 1, deliveryStatus: 1 })` |
| Index đề xuất thêm | `db.salesorders.createIndex({ documentDate: 1, status: 1, lifecycleStatus: 1, deliveryStatus: 1 })` |
| Lý do | Giữ khả năng lọc nhanh cho đơn cũ trước khi normalize business date |
| Rủi ro | Tăng chi phí ghi nếu salesorders lớn; chỉ tạo nếu explain plan cho thấy cần |
| Rollback | `db.salesorders.dropIndex('date_1_status_1_lifecycleStatus_1_deliveryStatus_1')`; `db.salesorders.dropIndex('documentDate_1_status_1_lifecycleStatus_1_deliveryStatus_1')` |

## 3. `salesorders` — fallback `createdAt`

| Mục | Nội dung |
|---|---|
| Collection | `salesorders` |
| Query phục vụ | Fallback khi đơn không có ngày nghiệp vụ rõ ràng |
| Index đề xuất | `db.salesorders.createIndex({ createdAt: 1, status: 1, lifecycleStatus: 1, deliveryStatus: 1 })` |
| Lý do | `dateRangePrefilter()` luôn thêm fallback `createdAt` để tránh mất dữ liệu legacy |
| Rủi ro | Có thể ít hiệu quả nếu dashboard chủ yếu dựa vào `orderDate`; kiểm tra explain plan trước |
| Rollback | `db.salesorders.dropIndex('createdAt_1_status_1_lifecycleStatus_1_deliveryStatus_1')` |

## 4. `products` — dashboard product lookup

| Mục | Nội dung |
|---|---|
| Collection | `products` |
| Query phục vụ | `$lookup` product price theo `_dashboardProductCode` |
| Index đề xuất | `db.products.createIndex({ code: 1 })` |
| Lý do | `$lookup.pipeline` match `$code == $$productCode`; index `code` giúp tránh scan products |
| Rủi ro | Nếu đã có index/unique index `code`, không tạo thêm |
| Rollback | `db.products.dropIndex('code_1')` nếu index này được tạo riêng và không dùng bởi module khác |

## 5. Cách kiểm tra trước khi tạo index

Chạy trên MongoDB Atlas Shell:

```javascript
db.salesorders.getIndexes();
db.products.getIndexes();
```

Sau deploy Phase36E, đo explain cho pipeline dashboard thực tế hoặc bật API Monitor query explain nếu hệ thống đã hỗ trợ.

Chỉ tạo index còn thiếu và phục vụ trực tiếp log chậm `SalesOrder.aggregate`.
