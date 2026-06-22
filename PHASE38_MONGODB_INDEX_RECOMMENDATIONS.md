# PHASE38 — MONGODB INDEX RECOMMENDATIONS

## 1. Index bắt buộc cho dashboardDailyStats

### Collection

```text
dashboardDailyStats
```

### Query phục vụ

```javascript
DashboardDailyStat.findOne({ date })
DashboardDailyStat.find({ date: { $gte: dateFrom, $lte: dateTo } }).sort({ date: 1 })
```

### Index

```javascript
db.dashboardDailyStats.createIndex({ date: 1 }, { unique: true, name: 'uniq_dashboard_daily_stats_date' })
```

### Lý do

- Mỗi ngày chỉ có một document read model.
- Dashboard overview/sales-staff/delivery-summary cần đọc theo ngày/range cực nhanh.

### Rủi ro

- Nếu dữ liệu cũ đã có nhiều document cùng `date`, unique index sẽ fail.
- Cần kiểm tra duplicate trước khi tạo index nếu collection đã từng được tạo thủ công.

### Rollback

```javascript
db.dashboardDailyStats.dropIndex('uniq_dashboard_daily_stats_date')
```

---

## 2. Index range theo tháng

### Collection

```text
dashboardDailyStats
```

### Query phục vụ

```javascript
DashboardDailyStat.find({ date: { $gte: '2026-06-01', $lte: '2026-06-22' } }).sort({ date: 1 })
```

### Index

```javascript
db.dashboardDailyStats.createIndex({ month: 1, date: 1 }, { name: 'idx_dashboard_daily_stats_month_date' })
```

### Lý do

- Hữu ích nếu sau này query theo `month` hoặc lưu nhiều tenant/company.

### Rollback

```javascript
db.dashboardDailyStats.dropIndex('idx_dashboard_daily_stats_month_date')
```

---

## 3. Index fallback live-query nếu read model thiếu

Các index này chỉ phục vụ fallback live-query, không phải đường đọc chính sau Phase38.

```javascript
db.salesorders.createIndex({ orderDate: 1, status: 1, lifecycleStatus: 1 })
db.salesorders.createIndex({ deliveryDate: 1, deliveryStaffCode: 1, status: 1 })
db.masterorders.createIndex({ deliveryDate: 1, deliveryStatus: 1, status: 1 })
db.returnorders.createIndex({ returnDate: 1, status: 1, lifecycleStatus: 1 })
db.fundledgers.createIndex({ date: 1, direction: 1, type: 1 })
```

Không tự chạy migration nếu chưa có quy trình. Nếu dùng script của dự án, chạy:

```bash
npm run mongo:indexes
```
