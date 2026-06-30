# PHASE36D — MongoDB Index Recommendations

> Chỉ là khuyến nghị kiểm tra/chạy trên MongoDB Atlas sau deploy. Phase36D không tự thêm migration/index vào code.

## 1. `salesorders` — delete sales order / confirm-accounting / delivery orders

### Query liên quan
- `SalesOrder.find({ id: { $in: [...] } })`
- `SalesOrder.findOne({ id/code/orderCode/salesOrderCode })`
- `GET /api/delivery/orders` theo `deliveryDate + deliveryStaffCode + status + masterOrderId/masterOrderCode`

### Index đề xuất

```javascript
db.salesorders.createIndex({ id: 1 })
db.salesorders.createIndex({ code: 1 })
db.salesorders.createIndex({ orderCode: 1 })
db.salesorders.createIndex({ salesOrderCode: 1 })
db.salesorders.createIndex({ deliveryDate: 1, deliveryStaffCode: 1, status: 1, masterOrderId: 1 })
db.salesorders.createIndex({ deliveryDate: 1, deliveryStaffCode: 1, status: 1, masterOrderCode: 1 })
```

### Rủi ro
- Index nhiều trên collection đơn bán làm tăng chi phí ghi/import/xác nhận.
- Cần kiểm tra index đã tồn tại trước khi tạo để tránh trùng.

### Rollback

```javascript
db.salesorders.dropIndex({ id: 1 })
db.salesorders.dropIndex({ code: 1 })
db.salesorders.dropIndex({ orderCode: 1 })
db.salesorders.dropIndex({ salesOrderCode: 1 })
db.salesorders.dropIndex({ deliveryDate: 1, deliveryStaffCode: 1, status: 1, masterOrderId: 1 })
db.salesorders.dropIndex({ deliveryDate: 1, deliveryStaffCode: 1, status: 1, masterOrderCode: 1 })
```

## 2. `stocktransactions` — DELETE `/api/sales-orders/:id`

### Query liên quan
- Kiểm tra bút toán tồn theo `orderId/orderCode/salesOrderId/salesOrderCode/refId/refCode/sourceId/sourceCode`.

### Index đề xuất

```javascript
db.stocktransactions.createIndex({ orderId: 1 })
db.stocktransactions.createIndex({ orderCode: 1 })
db.stocktransactions.createIndex({ sourceId: 1 })
db.stocktransactions.createIndex({ sourceCode: 1 })
```

### Rủi ro
- Nếu collection stockTransactions lớn, tạo index cần chạy lúc thấp tải.

### Rollback

```javascript
db.stocktransactions.dropIndex({ orderId: 1 })
db.stocktransactions.dropIndex({ orderCode: 1 })
db.stocktransactions.dropIndex({ sourceId: 1 })
db.stocktransactions.dropIndex({ sourceCode: 1 })
```

## 3. `arledgers` — debts/customers + delete dependency check

### Query liên quan
- `ArLedger.find(match)` cho chi tiết công nợ.
- Staff-scope seed query theo `type + sales/delivery staff`.
- Dependency check khi xóa đơn theo `orderId/orderCode/refId/refCode/sourceId/sourceCode`.

### Index đề xuất

```javascript
db.arledgers.createIndex({ date: -1, createdAt: -1 })
db.arledgers.createIndex({ customerCode: 1, date: -1 })
db.arledgers.createIndex({ orderId: 1 })
db.arledgers.createIndex({ orderCode: 1 })
db.arledgers.createIndex({ refId: 1 })
db.arledgers.createIndex({ refCode: 1 })
db.arledgers.createIndex({ type: 1, salesStaffCode: 1, date: -1 })
db.arledgers.createIndex({ type: 1, deliveryStaffCode: 1, date: -1 })
```

### Rủi ro
- AR là source chuẩn công nợ, cần đo explain trước/sau.
- Không tạo unique index nếu chưa audit dữ liệu trùng.

### Rollback

```javascript
db.arledgers.dropIndex({ date: -1, createdAt: -1 })
db.arledgers.dropIndex({ customerCode: 1, date: -1 })
db.arledgers.dropIndex({ orderId: 1 })
db.arledgers.dropIndex({ orderCode: 1 })
db.arledgers.dropIndex({ refId: 1 })
db.arledgers.dropIndex({ refCode: 1 })
db.arledgers.dropIndex({ type: 1, salesStaffCode: 1, date: -1 })
db.arledgers.dropIndex({ type: 1, deliveryStaffCode: 1, date: -1 })
```

## 4. `users` — search/delivery-staff

### Query liên quan
- `User.find` role/type/staffType + mã NVGH.

### Index đề xuất

```javascript
db.users.createIndex({ role: 1, isActive: 1 })
db.users.createIndex({ roles: 1, isActive: 1 })
db.users.createIndex({ staffType: 1, isActive: 1 })
db.users.createIndex({ deliveryStaffCode: 1, isActive: 1 })
db.users.createIndex({ staffCode: 1, isActive: 1 })
db.users.createIndex({ code: 1, isActive: 1 })
```

### Rủi ro
- Nếu `roles` là array, index multikey cần kiểm tra bằng explain.

### Rollback

```javascript
db.users.dropIndex({ role: 1, isActive: 1 })
db.users.dropIndex({ roles: 1, isActive: 1 })
db.users.dropIndex({ staffType: 1, isActive: 1 })
db.users.dropIndex({ deliveryStaffCode: 1, isActive: 1 })
db.users.dropIndex({ staffCode: 1, isActive: 1 })
db.users.dropIndex({ code: 1, isActive: 1 })
```

## 5. `masterorders` — dashboard `MasterOrder.aggregate`

### Query liên quan
- `GET /api/dashboard/home`
- `DeliveryDashboardQuery.aggregateDeliveryMonth()`
- `$match` trạng thái active + prefilter `deliveryDate/date/createdAt` + normalized business date stage.

### Index đề xuất cần kiểm tra bằng explain

```javascript
db.masterorders.createIndex({ deliveryDate: 1, status: 1, lifecycleStatus: 1, deliveryStatus: 1 })
db.masterorders.createIndex({ date: 1, status: 1, lifecycleStatus: 1, deliveryStatus: 1 })
db.masterorders.createIndex({ createdAt: 1, status: 1, lifecycleStatus: 1, deliveryStatus: 1 })
db.masterorders.createIndex({ deliveryStaffCode: 1, deliveryDate: 1, status: 1 })
```

### Lý do
- Log 22:44 ghi nhận `MasterOrder.aggregate` khoảng 2.403s.
- Phase36D bổ sung prefilter ngày trước normalized date stage; index trên các field ngày/status giúp MongoDB giảm số document phải đưa vào `$set/$project/$group`.

### Rủi ro
- Nếu dữ liệu `deliveryDate/date` có nhiều format legacy, index string/date có thể không tối ưu đồng đều.
- Index nhiều trên `masterorders` làm tăng chi phí ghi khi tạo/gộp/xác nhận đơn tổng.

### Rollback

```javascript
db.masterorders.dropIndex({ deliveryDate: 1, status: 1, lifecycleStatus: 1, deliveryStatus: 1 })
db.masterorders.dropIndex({ date: 1, status: 1, lifecycleStatus: 1, deliveryStatus: 1 })
db.masterorders.dropIndex({ createdAt: 1, status: 1, lifecycleStatus: 1, deliveryStatus: 1 })
db.masterorders.dropIndex({ deliveryStaffCode: 1, deliveryDate: 1, status: 1 })
```

## 6. Promotion collections — `/api/promotions/programs`

### Query liên quan
- `GET /api/promotions/programs?type=all`
- `GET /api/promotions/programs?type=groupItems`
- `promotionService.aggregatePromotionProgramSummaries()` dùng `$match`, `$project`, `$group` theo `programCode`.

### Index đề xuất cần kiểm tra bằng explain

```javascript
db.promotiongroupitems.createIndex({ programCode: 1, productCode: 1 })
db.promotiongroupitems.createIndex({ groupCode: 1, productCode: 1 })
db.promotiongroupitems.createIndex({ isActive: 1, programCode: 1 })
db.promotionproductrules.createIndex({ programCode: 1, productCode: 1 })
db.promotiongrouprules.createIndex({ programCode: 1, groupCode: 1, minAmount: 1 })
```

### Lý do
- Log 22:44 ghi nhận `PromotionGroupItem.find({})` khoảng 1.656s.
- Phase36D đã thay list-summary từ `find({})` sang aggregate summary; các index trên `programCode/productCode/isActive` hỗ trợ cả list summary, detail theo chương trình và tính khuyến mại theo sản phẩm.

### Rủi ro
- Collection khuyến mại thường nhỏ hơn đơn bán, nên cần explain trước khi tạo quá nhiều index.
- Không tạo unique index vì dữ liệu import có thể có nhiều dòng cùng chương trình/sản phẩm theo thời gian.

### Rollback

```javascript
db.promotiongroupitems.dropIndex({ programCode: 1, productCode: 1 })
db.promotiongroupitems.dropIndex({ groupCode: 1, productCode: 1 })
db.promotiongroupitems.dropIndex({ isActive: 1, programCode: 1 })
db.promotionproductrules.dropIndex({ programCode: 1, productCode: 1 })
db.promotiongrouprules.dropIndex({ programCode: 1, groupCode: 1, minAmount: 1 })
```
