# PHASE37_MONGODB_INDEX_RECOMMENDATIONS

## Mục tiêu

Phase37 tách Dashboard Home thành overview nhẹ và các API lazy-load. Các index dưới đây **chỉ là khuyến nghị kiểm tra/tạo trên MongoDB Atlas**, không tự chạy migration trong mã nguồn vì dự án chưa có quy trình migration index riêng cho phase này.

## Khuyến nghị index

### 1. `orders` / `salesorders` — overview doanh số theo ngày/tháng

Query phục vụ:

```javascript
db.orders.aggregate([
  { $match: { orderDate: { $gte: '2026-06-01', $lte: '2026-06-30' }, status: { $nin: [...] }, lifecycleStatus: { $nin: [...] } } },
  { $project: { totalAmount: 1, amount: 1, orderDate: 1, status: 1, lifecycleStatus: 1, accountingStatus: 1 } },
  { $group: ... }
])
```

Index đề xuất:

```javascript
db.orders.createIndex({ orderDate: 1, status: 1, lifecycleStatus: 1, accountingStatus: 1 }, { name: 'idx_dashboard_sales_orderDate_status_accounting' })
```

Lý do: overview/sales-staff lọc theo tháng/ngày trước, sau đó lọc trạng thái và kế toán.

Rủi ro: nếu `orderDate` dữ liệu legacy không đồng nhất, index này chỉ hỗ trợ tốt phần dữ liệu có `orderDate` chuẩn `YYYY-MM-DD`.

Rollback:

```javascript
db.orders.dropIndex('idx_dashboard_sales_orderDate_status_accounting')
```

---

### 2. `orders` / `salesorders` — delivery overview theo ngày giao

Query phục vụ:

```javascript
db.orders.aggregate([
  { $match: { deliveryDate: { $gte: '2026-06-22', $lte: '2026-06-22' }, status: { $nin: [...] }, deliveryStatus: { $nin: [...] } } },
  { $project: { deliveryStatus: 1, status: 1, deliveryDate: 1 } },
  { $group: ... }
])
```

Index đề xuất:

```javascript
db.orders.createIndex({ deliveryDate: 1, deliveryStaffCode: 1, status: 1, lifecycleStatus: 1, deliveryStatus: 1 }, { name: 'idx_dashboard_delivery_date_staff_status' })
```

Lý do: hỗ trợ dashboard delivery và app giao hàng theo ngày/NVGH.

Rủi ro: index rộng hơn, cần kiểm tra dung lượng collection trước khi tạo.

Rollback:

```javascript
db.orders.dropIndex('idx_dashboard_delivery_date_staff_status')
```

---

### 3. `master_orders` — delivery summary tháng

Query phục vụ:

```javascript
db.master_orders.aggregate([
  { $match: { deliveryDate: { $gte: '2026-06-01', $lte: '2026-06-30' }, status: { $nin: [...] } } },
  { $project: { childOrderIds: 1, deliveryStaffCode: 1, deliveryStatus: 1, totalAmount: 1 } }
])
```

Index đề xuất:

```javascript
db.master_orders.createIndex({ deliveryDate: 1, deliveryStatus: 1, status: 1 }, { name: 'idx_dashboard_master_delivery_date_status' })
```

Lý do: giảm scan trong delivery-summary lazy API.

Rollback:

```javascript
db.master_orders.dropIndex('idx_dashboard_master_delivery_date_status')
```

---

### 4. `returnOrders` — hàng trả dashboard

Index đề xuất:

```javascript
db.returnOrders.createIndex({ returnDate: 1, status: 1, returnState: 1, accountingStatus: 1 }, { name: 'idx_dashboard_returns_date_status' })
```

Lý do: hỗ trợ overview return count/amount và sales-staff return summary.

Rollback:

```javascript
db.returnOrders.dropIndex('idx_dashboard_returns_date_status')
```

---

### 5. `fundLedgers` — thu/chi hôm nay

Index đề xuất:

```javascript
db.fundLedgers.createIndex({ date: 1, direction: 1, status: 1 }, { name: 'idx_dashboard_fund_date_direction' })
```

Lý do: overview chỉ cần tổng thu/chi trong ngày, không cần quét toàn bộ quỹ.

Rollback:

```javascript
db.fundLedgers.dropIndex('idx_dashboard_fund_date_direction')
```

---

### 6. `arLedgers` — công nợ lazy detail

Index đề xuất:

```javascript
db.arLedgers.createIndex({ customerCode: 1, status: 1, date: -1 }, { name: 'idx_dashboard_ar_customer_status_date' })
```

Lý do: công nợ không được cache realtime trong overview; khi lazy-load chi tiết vẫn cần index theo khách/trạng thái/ngày.

Rollback:

```javascript
db.arLedgers.dropIndex('idx_dashboard_ar_customer_status_date')
```

## Cách triển khai an toàn

1. Tạo từng index ngoài giờ cao điểm.
2. Đo `GET /api/dashboard/overview`, `/api/dashboard/sales-staff`, `/api/dashboard/delivery-summary` trước/sau.
3. Nếu index làm tăng chi phí ghi/import rõ rệt, rollback index ít hiệu quả nhất.
4. Không xóa index cũ khi chưa có bằng chứng không còn query dùng.
