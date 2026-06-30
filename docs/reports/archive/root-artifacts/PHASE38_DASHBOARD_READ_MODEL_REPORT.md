# PHASE38 — DASHBOARD READ MODEL REPORT

## 1. Tổng quan

Phase38 xử lý root cause sau Phase37: Dashboard đã tách API nhưng các API con vẫn query trực tiếp collection nghiệp vụ lớn khi mở màn.

Log trước từ API Monitor 23:56 ngày 22/06/2026:

| API | Query chậm | Before |
|---|---|---:|
| `/api/dashboard/sales-staff` | `SalesOrder.aggregate` | ~3.583s |
| `/api/dashboard/delivery-summary` | `SalesOrder.find id $in` | ~1.488s |
| `/api/dashboard/overview` | `ReturnOrder.aggregate` | ~1.494s |

Kết luận: lazy-load chỉ chuyển điểm chậm sang API con. Phase38 thêm read model `dashboardDailyStats` để các API dashboard đọc số liệu tổng hợp nhẹ khi đã rebuild dữ liệu.

Không có MongoDB live trong sandbox nên **không ghi số after giả**. After cần đo lại trên Render API Monitor sau deploy và sau khi chạy rebuild script.

---

## 2. Root cause

| API | File/hàm | Query chậm | Nguyên nhân | Phase38 xử lý |
|---|---|---|---|---|
| `/api/dashboard/overview` | `src/services/dashboard/DashboardOverviewService.js#getOverview` | `SalesOrder.aggregate`, `ReturnOrder.aggregate`, `FundLedger.aggregate` | Overview vẫn tính live từ bảng nghiệp vụ | Ưu tiên đọc `dashboardDailyStats`; fallback live-query nếu thiếu read model |
| `/api/dashboard/sales-staff` | `src/services/dashboard/HomeDashboardService.js#getSalesStaffDashboard` | `SalesOrder.aggregate`, `ReturnOrder.aggregate`, `ArLedger.aggregate` | Bảng NVBH tính lại từ orders/returns/debt mỗi lần mở | Ưu tiên đọc `dashboardDailyStats.staff.sales`; fallback live-query nếu thiếu dữ liệu |
| `/api/dashboard/delivery-summary` | `src/services/dashboard/HomeDashboardService.js#getDeliveryDashboard` | `MasterOrder.aggregate` + `SalesOrder.find id $in` + `ReturnOrder.aggregate` | Summary giao hàng hydrate đơn con để tính số tổng | Ưu tiên đọc `dashboardDailyStats.staff.delivery`; fallback live-query nếu thiếu dữ liệu |

---

## 3. Thiết kế read model

### Collection mới

```text
DashboardDailyStat -> collection dashboardDailyStats
```

### Schema tối thiểu

```text
tenantId
date: YYYY-MM-DD
month: YYYY-MM
sales
delivery
cash
returns
staff.sales
staff.delivery
dataQuality
source
generatedAt
updatedAt
```

### Tính chất

- `dashboardDailyStats` chỉ là read model đọc nhanh.
- Không thay thế SSoT.
- Không sửa dữ liệu gốc.
- Nếu thiếu dữ liệu, API fallback sang live query cũ và gắn `meta.source = "fallback-live-query"`.
- Nếu đủ dữ liệu theo range, API trả từ read model và gắn `meta.source = "dashboardDailyStats"`.

### Điều kiện dùng read model

Với dashboard theo tháng, service kiểm tra đủ document từ:

```text
dateFrom -> min(dateTo, today)
```

Nếu thiếu ngày trong range, không dùng read model để tránh sai số liệu tháng.

---

## 4. API thay đổi

| API | Trước Phase38 | Sau Phase38 | Fallback |
|---|---|---|---|
| `/api/dashboard/overview` | Aggregate live sales/returns/cash | Đọc `dashboardDailyStats` nếu đủ range | Live query cũ, `meta.source=fallback-live-query` |
| `/api/dashboard/sales-staff` | Aggregate live theo NVBH | Đọc `dashboardDailyStats.staff.sales` nếu đủ range | Live query cũ |
| `/api/dashboard/delivery-summary` | Aggregate master/returns + hydrate child orders | Đọc `dashboardDailyStats.staff.delivery` nếu đủ range | Live query cũ |
| `/api/dashboard/home` | Legacy full dashboard | Giữ tương thích | Không thay đổi contract |

---

## 5. Script rebuild

Thêm script:

```text
scripts/rebuild-dashboard-daily-stats.js
```

Cách chạy:

```bash
node scripts/rebuild-dashboard-daily-stats.js --date=2026-06-22
node scripts/rebuild-dashboard-daily-stats.js --from=2026-06-01 --to=2026-06-22
```

Khuyến nghị cho dashboard tháng hiện tại:

```bash
node scripts/rebuild-dashboard-daily-stats.js --from=2026-06-01 --to=2026-06-22
```

Nếu chỉ rebuild `--date=2026-06-22`, dashboard tháng có thể vẫn fallback live-query vì thiếu dữ liệu các ngày đầu tháng.

Script đọc từ nguồn chuẩn:

```text
salesOrders
returnOrders
masterOrders / salesOrders qua DeliveryDashboardQuery
arLedgers qua DebtDashboardQuery cho ngày hiện tại
fundLedgers
```

Script upsert vào `dashboardDailyStats`, không sửa dữ liệu nghiệp vụ gốc.

---

## 6. File đã sửa / thêm

| File | Loại | Nội dung |
|---|---|---|
| `src/models/DashboardDailyStat.js` | Thêm | Model read model dashboard daily stats |
| `src/models/index.js` | Sửa | Export `dashboardDailyStats` |
| `src/services/dashboard/DashboardDailyStatsService.js` | Thêm | Đọc/kết hợp read model cho overview, sales-staff, delivery-summary |
| `src/services/dashboard/DashboardOverviewService.js` | Sửa | Ưu tiên `dashboardDailyStats` trước fallback live aggregate |
| `src/services/dashboard/HomeDashboardService.js` | Sửa | `sales-staff` và `delivery-summary` ưu tiên read model |
| `src/controllers/dashboardController.js` | Sửa | Meta strategy/source Phase38 |
| `public/js/app/00-dashboard.js` | Sửa | Hiển thị source `dashboardDailyStats`/fallback và `updatedAt` |
| `src/services/mongoIndexService.js` | Sửa | Thêm index managed cho `dashboardDailyStats` |
| `scripts/rebuild-dashboard-daily-stats.js` | Thêm | Rebuild read model từ dữ liệu gốc |
| `test/phase38-dashboard-read-model-static.test.js` | Thêm | Static regression Phase38 |

---

## 7. Diff Old/New quan trọng

### 7.1 Overview API

Old:

```javascript
const [targets, confirmedSales, pendingSales, todaySales, returns, deliveryToday, cash] = await Promise.all([
  SalesTargetService.listByPeriod(range.period),
  aggregateSalesRoot(...),
  aggregateReturnsRoot(...),
  aggregateDeliveryToday(...),
  aggregateCashToday(...)
]);
```

New:

```javascript
const targets = await SalesTargetService.listByPeriod(range.period);
const readModel = await DashboardDailyStatsService.buildOverviewDashboard({ range, targets });
if (readModel) {
  DashboardCacheService.write(cacheKey, cacheVersion, readModel);
  return readModel;
}

// fallback live-query nếu dashboardDailyStats thiếu/incomplete
```

### 7.2 Sales staff API

Old:

```javascript
monthlySales: SalesDashboardQuery.aggregateSales(...)
monthlyReturns: SalesDashboardQuery.aggregateReturns(...)
currentDebt: DebtDashboardQuery.aggregateCurrentDebt()
```

New:

```javascript
const readModel = await DashboardDailyStatsService.buildSalesStaffDashboard({ range: { ...range, today }, targets });
if (readModel) return readModel;

// fallback live-query cũ nếu read model thiếu
```

### 7.3 Delivery summary API

Old:

```javascript
DeliveryDashboardQuery.aggregateDeliveryMonth(...)
DeliveryDashboardQuery.aggregateDeliveryToday(...)
DeliveryDashboardQuery.aggregateDeliveryReturns(...)
```

New:

```javascript
const readModel = await DashboardDailyStatsService.buildDeliveryDashboard({ range: { ...range, today } });
if (readModel) return readModel;

// fallback live-query cũ nếu read model thiếu
```

### 7.4 Cache guard

Old:

```javascript
if (cached) return { ...cached, cacheHit: true };
```

New:

```javascript
if (cached && cached.meta?.source !== 'fallback-live-query') {
  return { ...cached, cacheHit: true };
}
```

Lý do: sau khi rebuild xong read model, không để cache fallback cũ che read model mới.

---

## 8. Test thực tế

| Lệnh | Kết quả |
|---|---|
| `npm run check:syntax` | PASS — `SYNTAX_OK 979 JavaScript files` |
| `node --test test/phase38-dashboard-read-model-static.test.js` | PASS — 5/5 |
| `node --test test/phase37-dashboard-overview-redesign-static.test.js` | PASS — 5/5 |
| `node --test test/phase36e-dashboard-salesorder-aggregate-static.test.js` | PASS — 5/5 |
| `node --test test/phase36d-api-response-followup-static.test.js` | PASS — 8/8 |
| `node --test test/phase36c-api-response-p0p1-static.test.js` | PASS — 6/6 |
| `node --test test/phase36b-delivery-performance-static.test.js` | PASS — 6/6 |
| `node --test test/sales-order-delete-policy.test.js test/sales-order-delete-list-visibility-static.test.js test/mobile-sales-delete-list-visibility-static.test.js` | PASS — 10/10 |

---

## 9. Before / After

| API | Before | After | Ghi chú |
|---|---:|---:|---|
| `/api/dashboard/sales-staff` | `SalesOrder.aggregate` ~3.583s | Cần đo lại trên Render | Sau khi rebuild đủ tháng, request thường đọc `dashboardDailyStats` |
| `/api/dashboard/delivery-summary` | `SalesOrder.find id $in` ~1.488s | Cần đo lại trên Render | Sau khi rebuild đủ tháng, không hydrate đơn con trong summary thường |
| `/api/dashboard/overview` | `ReturnOrder.aggregate` ~1.494s | Cần đo lại trên Render | Sau khi rebuild đủ tháng, đọc read model |

Không có MongoDB live trong sandbox nên không ghi số after giả.

---

## 10. Hướng dẫn deploy / đo lại

1. Deploy ZIP Phase38 lên Render.
2. Chạy index nếu dự án quản lý index bằng script:

```bash
npm run mongo:indexes
```

3. Rebuild read model cho tháng hiện tại đến hôm nay:

```bash
node scripts/rebuild-dashboard-daily-stats.js --from=2026-06-01 --to=2026-06-22
```

4. Mở Dashboard và đo lại API Monitor:

```text
GET /api/dashboard/overview
GET /api/dashboard/sales-staff
GET /api/dashboard/delivery-summary
```

5. Kiểm tra response/meta:

```json
"meta": {
  "source": "dashboardDailyStats"
}
```

Nếu response/meta là:

```json
"source": "fallback-live-query"
```

thì read model đang thiếu ngày trong range và API vẫn có thể chậm.

---

## 11. Regression checklist

| Khu vực | Kết quả |
|---|---|
| Bán hàng | Không đổi nghiệp vụ tạo/sửa/xóa đơn |
| Giao hàng | Không đổi flow giao hàng/App giao hàng |
| Trả hàng | Không đổi `returnOrders` SSoT |
| Đối soát | Không đổi xác nhận/đối soát |
| Kế toán xác nhận | Không đổi AR/fund posting |
| Công nợ | Không thay thế `arLedgers`; read model chỉ đọc snapshot dashboard |
| Tồn kho | Không dùng `inventorySnapshots` |
| Quỹ | Không đổi `fundLedgers` |
| Khuyến mại | Không đổi rule tính khuyến mại |
| Dashboard | Thêm read model + fallback an toàn |
| App mobile | Không sửa mobile app |
| Import/export | Không sửa import/export |

---

## 12. Rủi ro còn lại

1. **Cần rebuild định kỳ hoặc sau nghiệp vụ quan trọng**. Nếu chưa rebuild, dashboard fallback live-query và vẫn có thể chậm.
2. **Dữ liệu tháng cần đủ range**. Với dashboard tháng hiện tại, nên rebuild từ ngày 01 đến hôm nay.
3. **Công nợ trong read model là snapshot tại thời điểm rebuild**, không phải realtime. Nếu cần realtime tuyệt đối, giữ khối công nợ ngoài read model hoặc rebuild sau khi kế toán xác nhận.
4. **Phase sau nên cập nhật incremental** khi tạo đơn/giao hàng/trả hàng/xác nhận kế toán/thu chi, thay vì chỉ rebuild thủ công.
5. **Cần đo lại trên Render API Monitor** để xác nhận không còn `SalesOrder.aggregate`/`ReturnOrder.aggregate` trong request thường khi `meta.source=dashboardDailyStats`.
