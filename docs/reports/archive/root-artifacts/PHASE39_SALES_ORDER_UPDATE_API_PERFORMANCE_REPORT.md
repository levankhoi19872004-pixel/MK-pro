# PHASE39 - Tối ưu `PUT /api/sales-orders/:id`

## 1. Tổng quan dự án

- Baseline: `MK-pro-phase38-dashboard-read-model-patched(1).zip`
- Kiến trúc: Node.js/Express monolith, MongoDB/Mongoose, route web API `/api/sales-orders`.
- API khảo sát: `PUT /api/sales-orders/:id`.
- Route: `src/routes/orderRoutes.js`.
- Controller: `src/controllers/orderController.js -> update()`.
- Service runtime: `src/services/orderService.js -> SalesOrderCommandService -> orderLegacy.service.updateOrder()`.
- Repository chính: `src/repositories/orderRepository.js`.
- Models liên quan: `SalesOrder`, `Product`, `InventoryLegacy`, `StockTransaction`, `ReturnOrder`.
- Middleware liên quan: `auth.middleware`, `inventoryMaintenance.middleware`, `apiMonitor.middleware`.

## 2. Root cause

| Mức độ | Nguyên nhân | Bằng chứng | File/hàm |
|---|---|---|---|
| P0 | Sửa đơn đã `stockPosted` luôn đảo tồn toàn bộ đơn rồi trừ lại toàn bộ đơn | `updateOrder()` gọi `reverseSalesOrderPosting(current)` rồi `applySalesOrderPosting(orderToSave)` cho mọi lần sửa posted order | `src/services/orderLegacy.service.source/part-03.jsfrag` |
| P0 | Cơ chế full reverse/repost tạo N+1 query theo từng sản phẩm | `postStockMovement()` xử lý từng item: tìm product, kiểm duplicate transaction, normalize inventory, insert transaction, update inventory, save balance | `src/services/inventoryService.source/part-01.jsfrag` |
| P0 | Có rủi ro idempotency khi repost SALE cũ | `SALE` transaction cũ có idempotency key theo order/product; repost sau edit có thể bị skip duplicate | `inventoryService.postStockMovement()` |
| P1 | Lookup đơn SO đi qua `$or` nhiều field trong hot path | `findByIdOrCode()` build `$or` trên id/code/documentCode/invoiceCode/orderCode/salesOrderCode | `src/repositories/orderRepository.js` |
| P1 | API Monitor dễ gây hiểu nhầm: last latency và historical slowest query hiển thị chung | UI ưu tiên `maxQueryTraces/slowestQueryMs` nên có thể thấy API lần cuối 27ms nhưng query lịch sử 654ms | `src/middlewares/apiMonitor.middleware.js`, `public/js/app/09-system.js` |
| P2 | Thiếu một số index hỗ trợ lọc lifecycle/status/createdAt | `mongoIndexService` đã có id/code/orderCode/salesOrderCode nhưng thiếu index riêng lifecycle/status/createdAt | `src/services/mongoIndexService.js` |

## 3. Phương án A - Production grade đã triển khai

### Nội dung sửa

1. Sửa `updateOrder()` để dùng delta tồn kho thay vì full reverse/repost:
   - So sánh số lượng tồn theo từng sản phẩm giữa `current.items` và `orderToSave.items`.
   - Nếu không đổi số lượng: chỉ lưu đơn + sync return draft, không ghi tồn.
   - Nếu tăng số lượng: gọi `InventoryPostingService.postSaleEditDelta(..., 'OUT')` đúng phần tăng.
   - Nếu giảm số lượng: gọi `InventoryPostingService.postSaleEditDelta(..., 'IN')` đúng phần giảm.
   - Không đụng AR/Fund vì luồng bán hàng hiện tại chỉ post AR ở xác nhận kế toán.

2. Tối ưu lookup hot path SO:
   - Với mã dạng `SO...`, `orderRepository.findByIdOrCode()` đi thẳng `{ id: value }`.
   - `patchByIdentity()` với mã SO cũng giới hạn identity field là `['id']`.

3. Bổ sung index MongoDB:
   - `idx_orders_status_order_date`: `{ status: 1, orderDate: -1 }`
   - `idx_orders_lifecycle_order_date`: `{ lifecycleStatus: 1, orderDate: -1 }`
   - `idx_orders_created_at_desc`: `{ createdAt: -1 }`

4. Sửa API Monitor để tách rõ:
   - `lastSlowestQueryMs/Label`: query chậm nhất của lần gọi cuối.
   - `slowestQueryMs/Label`: query chậm nhất lịch sử của route.
   - Bảng “Tất cả API” hiển thị query của lần cuối để tránh hiểu nhầm kiểu `API 27ms nhưng query 654ms`.

### Lợi ích

- Với sửa đơn nhưng không đổi số lượng: giảm phần tồn kho từ full reverse + full repost xuống 0 movement.
- Với sửa một vài dòng trong đơn nhiều sản phẩm: chỉ ghi delta của dòng thay đổi, không quét/gửi lại toàn bộ đơn.
- Giảm mạnh query count cho API `PUT /api/sales-orders/:id`, đặc biệt đơn nhiều dòng hàng.
- Giảm rủi ro lệch tồn do idempotency của transaction SALE cũ.
- Giữ nguyên API contract và business rule.

### Nhược điểm / rủi ro còn lại

- Nếu dữ liệu tồn/transaction lịch sử đã lệch từ các lần sửa cũ, patch này không tự rebuild lại quá khứ. Cần chạy reconciliation riêng nếu nghi ngờ lệch tồn.
- Chưa đo được `explain()` thật trên MongoDB production trong môi trường sandbox, nên kết quả index phải xác minh trên Render/MongoDB sau deploy.
- `syncReturnDraftWithSalesOrder()` vẫn được giữ để bảo toàn nghiệp vụ trả hàng; API vẫn còn ít nhất 1 query return draft khi đơn có liên kết trả hàng.

Effort: Medium.

## 4. Phương án B - Cân bằng effort

Nếu muốn vá nhanh hơn, có thể chỉ làm:

- SO id lookup `{ id }` thay vì `$or`.
- Thêm/đảm bảo index `id`.
- Sửa API Monitor để không đọc nhầm historical query.

Nhược điểm: không xử lý gốc 98 query do full reverse/repost, nên API sửa đơn nhiều dòng vẫn chậm.

Effort: Easy.

## 5. File thay đổi

| File | Loại | Nội dung |
|---|---|---|
| `src/services/orderLegacy.service.source/part-03.jsfrag` | Sửa | Thêm helper tính stock delta và đổi flow updateOrder sang delta posting |
| `src/services/orderLegacy.service.js` | Build runtime | Rebuild từ source bundle |
| `src/repositories/orderRepository.js` | Sửa | Fast path lookup/patch mã SO bằng `{ id }` |
| `src/services/mongoIndexService.js` | Sửa | Bổ sung index status/lifecycle/createdAt |
| `src/middlewares/apiMonitor.middleware.js` | Sửa | Thêm lastSlowestQuery fields |
| `public/js/app/09-system.js` | Sửa | Bảng all API hiển thị query lần cuối thay vì query lịch sử |
| `config/source-bundles.json` | Sửa | Refresh hash cho `orderLegacy.service.js` |
| `test/sales-order-update-delta-performance.test.js` | Thêm | Test behavior delta inventory |
| `test/sales-order-update-delta-performance-static.test.js` | Thêm | Test static guard cho performance/instrumentation |

## 6. Test đã chạy

### Pass

```text
npm run check:syntax
SYNTAX_OK 981 JavaScript files

node --test \
  test/sales-order-update-delta-performance.test.js \
  test/sales-order-update-delta-performance-static.test.js \
  test/sales-order-flow.test.js \
  test/sales-order-inventory-posting-static.test.js \
  test/sales-order-pending-cancel-no-stock-reversal.test.js \
  test/mobile-sales-edit-delta.test.js \
  test/api-query-performance-optimizations.test.js

18 tests, 18 pass

node scripts/build-source-bundles.js --check --target=src/services/orderLegacy.service.js
[source-bundles] OK 1 bundle
```

### Không pass nhưng không thuộc phạm vi patch này

```text
npm test
FAILED tại pretest check:source-bundles:
public/mobile/js/delivery-mobile-view.js: canonical source hash changed
```

```text
node scripts/run-tests.js
Có lỗi cũ/ngoài phạm vi:
- test/accounting-ar-sale-staff-from-sales-order-static.test.js
- check-source-size-budget: src/engines/delivery.legacy.engine.source/part-01.jsfrag vượt budget 24771 > 24576 bytes
```

Các lỗi này không do file đã sửa trong Phase39 và nên xử lý bằng một phase riêng, tránh trộn phạm vi tối ưu API bán hàng.

## 7. Kết quả đo trước/sau dự kiến

Không có kết nối MongoDB production trong sandbox nên chưa chạy được explain thực tế. Kết quả dưới đây là theo phân tích query path và test behavior.

| Chỉ số | Trước | Sau | Ghi chú |
|---|---:|---:|---|
| Query count khi sửa đơn posted không đổi số lượng | Có thể rất cao, theo log là 98 | Giảm phần inventory movement về 0 | Vẫn còn find order, product hydrate, upsert, return draft check |
| Query count khi đổi 1 dòng trong đơn nhiều dòng | Full reverse + full repost toàn bộ dòng | Chỉ post delta dòng thay đổi | Giảm N+1 theo số dòng không đổi |
| `SalesOrder.findOneAndUpdate({ id })` | Phụ thuộc index thực tế production | Vẫn dùng `{ id }`, cần chạy `mongo:indexes` | Đã có definition `uniq_salesOrders_id` |
| Log `API total` vs `query 654ms` | Dễ đọc nhầm last vs history | Tách last/historical query | Cần reset API Monitor sau deploy để đo sạch |
| Rủi ro idempotency repost SALE | Có | Giảm | Delta dùng `SALES_ORDER_EDIT` refId riêng |

## 8. Việc cần làm sau deploy

Chạy trên Render shell hoặc local kết nối MongoDB production/staging:

```bash
npm run mongo:indexes
```

Sau đó kiểm tra MongoDB:

```js
db.orders.getIndexes()
db.orders.find({ id: "SO1782120525456660" }).explain("executionStats")
db.orders.aggregate([
  { $group: { _id: "$id", count: { $sum: 1 } } },
  { $match: { count: { $gt: 1 } } },
  { $limit: 20 }
])
```

Kỳ vọng:

- `find({ id })` dùng index `uniq_salesOrders_id`.
- Không có duplicate `id`.
- Sau khi reset API Monitor và thao tác lại, `PUT /api/sales-orders/:id` phải giảm query count rõ ràng.
