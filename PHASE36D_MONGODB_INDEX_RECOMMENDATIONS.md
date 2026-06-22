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
