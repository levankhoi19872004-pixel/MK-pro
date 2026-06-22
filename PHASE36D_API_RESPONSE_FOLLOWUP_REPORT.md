# PHASE36D — Bổ sung xử lý log 22:44 dashboard/promotions

## 0. Baseline và phạm vi

- Baseline thực tế: `MK-pro-phase36d-api-response-followup-patched.zip` do người dùng tải lên.
- Người dùng ghi bổ sung log mới dưới tên Phase36B, nhưng file đang dùng tiếp là Phase36D. Vì vậy artifact đầu ra vẫn giữ đúng Phase36D, không quay lại Phase35/Phase36B.
- Phạm vi bổ sung lần này chỉ xử lý 2 log mới 22:44 ngày 22/06/2026:
  - `GET /api/dashboard/home` — response 4.014s, `MasterOrder.aggregate` khoảng 2.403s.
  - `GET /api/promotions/programs` — response 1.662s, `PromotionGroupItem.find({})` khoảng 1.656s.
- Không đổi business rule, API contract, schema MongoDB; không cache công nợ/tồn kho/giao hàng/xác nhận kế toán.

---

## 1. Tổng quan dự án

| Hạng mục | Kết quả |
|---|---|
| Tech stack | Node.js + Express + MongoDB/Mongoose |
| Kiến trúc | Monolith ERP/DMS, tách route/controller/service/repository/domain |
| Module sửa trực tiếp | Dashboard home, promotion programs |
| Module kiểm tra regression | Xóa đơn, công nợ, delivery, stock, confirm-accounting, returns |
| Nguồn chuẩn không đổi | `inventories`, `arLedgers`, `fundLedgers`, `returnOrders`, `salesOrders`, `masterOrders`, `products` |

---

## 2. Root cause bổ sung theo log 22:44

### P1 — `GET /api/dashboard/home`

| Mục | Chi tiết |
|---|---|
| File | `src/services/dashboard/HomeDashboardService.js`, `src/services/dashboard/DeliveryDashboardQuery.js`, `src/services/dashboard/DashboardMongoExpressions.js`, `src/controllers/dashboardController.js` |
| Hàm | `HomeDashboardService.getHomeDashboard()`, `DeliveryDashboardQuery.aggregateDeliveryMonth()` |
| Query log nổi bật | `MasterOrder.aggregate([{ $match: { status/lifecycleStatus/deliveryStatus: { $nin: [...] } } }, ...])` |
| Nguyên nhân chậm | `aggregateDeliveryMonth()` đã có `businessDateStages(dateFrom, dateTo, ['deliveryDate','date'])`, nhưng stage đầu tiên vẫn là `$match` trạng thái. Việc chuẩn hóa ngày bằng `$set` trên `_dashboardBusinessDate` khiến MongoDB khó tận dụng index ngày ở stage sớm, nên `MasterOrder.aggregate` vẫn có nguy cơ scan nhiều `masterOrders` trước khi lọc tháng. |
| Ảnh hưởng nghiệp vụ | Dashboard cache miss có thể kéo response lên 4s+, làm trang home chậm dù route `/` đã lazy-load shell UI. |
| Xử lý bổ sung | Thêm `dateRangePrefilter(dateFrom, dateTo, ['deliveryDate','date'])` ngay sau `activeDocumentFilter()`, trước `businessDateStages()`. Prefilter hỗ trợ `YYYY-MM-DD`, BSON Date, legacy `DD/MM/YYYY`, `DD-MM-YYYY`, `DD.MM.YYYY`, và fallback `createdAt`. Sau đó vẫn giữ `businessDateStages()` để lọc chính xác, tránh loại sai dữ liệu legacy. |
| Cache | Giữ TTL cache ngắn 45s cho dashboard summary qua `DashboardCacheService`. Không cache công nợ/tồn kho realtime riêng lẻ. |

#### Field dashboard cần projection/giữ lại trước group/hydrate

`DeliveryDashboardQuery.aggregateDeliveryMonth()` chỉ giữ các field cần cho dashboard giao hàng tháng:

```text
id, code, deliveryDate, date,
deliveryStaffCode, deliveryStaffName, deliveryCode, deliveryName, nvghCode, nvghName,
salesStaffCode, salesStaffName, salesmanCode, nvbhCode,
status, deliveryStatus,
totalAmount, amount, grandTotal, total, value,
orderCount, childOrderCount,
childOrderIds, orderIds, salesOrderIds, children, childOrders, salesOrders, orderCodes, salesOrderCodes
```

### P1 — `GET /api/promotions/programs`

| Mục | Chi tiết |
|---|---|
| File | `src/controllers/promotionController.js`, `src/services/promotionService.js`, `public/js/app/admin/08e-promotion-programs.js` |
| Hàm | `promotionController.listPrograms()`, `promotionService.listPromotionPrograms()`, `promotionService.listPromotionProgramsByType()` |
| Query log nổi bật | `PromotionGroupItem.find({})` khoảng 1.656s |
| Nguyên nhân chậm | Endpoint danh sách chương trình chỉ cần metadata/summary, nhưng code cũ dùng `cfg.Model.find(...).select(...).lean()` lấy toàn bộ dòng group item rồi group trong memory. Với `PromotionGroupItem` nhiều dòng, payload và hydration qua Node vẫn lớn dù đã projection/lean. |
| Ảnh hưởng nghiệp vụ | Màn khuyến mại tải danh sách chậm, đặc biệt khi tab group item có nhiều sản phẩm. |
| Xử lý bổ sung | Thay list-summary bằng `aggregatePromotionProgramSummaries()` dùng `$project + $group` trong MongoDB. Endpoint danh sách chỉ trả metadata nhẹ theo chương trình; chi tiết rule/group item vẫn load qua `/api/promotions/programs/:programCode` khi người dùng mở chương trình. |
| Cache | Giữ cache ngắn `PROMOTION_PROGRAM_CACHE_TTL_MS` mặc định 30s; cache được clear khi create/update/delete/cancel promotion rule/group item/group rule. |

#### Field promotions cần projection/summary

Danh sách chương trình chỉ cần:

```text
programCode, programName, startDate, endDate, isActive, productCodes, lineCount, sources
```

Chi tiết rule/group item vẫn dùng các projection sẵn có:

```text
PROMOTION_PRODUCT_RULE_PROJECTION
PROMOTION_GROUP_ITEM_PROJECTION
PROMOTION_GROUP_RULE_PROJECTION
```

---

## 3. File đã sửa lần bổ sung 22:44

| File | Thay đổi |
|---|---|
| `src/services/dashboard/DeliveryDashboardQuery.js` | Thêm `dateRangePrefilter()` và áp dụng vào `MasterOrder.aggregate` trước `businessDateStages()`. |
| `src/services/promotionService.js` | Thêm `aggregatePromotionProgramSummaries()`; thay list programs summary từ `Model.find(...).lean()` sang aggregate `$project + $group`. |
| `test/phase36d-api-response-followup-static.test.js` | Tăng test Phase36D từ 6 lên 8, bổ sung static check cho dashboard MasterOrder prefilter và promotion program aggregate summary. |
| `PHASE36D_API_RESPONSE_FOLLOWUP_REPORT.md` | Cập nhật root cause riêng cho `MasterOrder.aggregate` và `PromotionGroupItem.find({})`. |
| `PHASE36D_MONGODB_INDEX_RECOMMENDATIONS.md` | Bổ sung khuyến nghị index cho `masterorders` và promotion collections. |

---

## 4. Diff Old/New quan trọng

### 4.1. Dashboard — thêm prefilter ngày trước normalized date stage

```diff
 async function aggregateDeliveryMonth(dateFrom, dateTo) {
+  const masterDatePrefilter = dateRangePrefilter(dateFrom, dateTo, ['deliveryDate', 'date']);
   const masters = await MasterOrder.aggregate([
     { $match: activeDocumentFilter() },
+    ...(masterDatePrefilter ? [masterDatePrefilter] : []),
     ...businessDateStages(dateFrom, dateTo, ['deliveryDate', 'date']),
     {
       $project: {
```

### 4.2. Dashboard — prefilter vẫn giữ legacy/fallback để không mất dữ liệu

```diff
+function dateRangePrefilter(dateFrom, dateTo, fields = []) {
+  const uniqueFields = unique([...fields, 'createdAt']);
+  ...
+  for (const field of uniqueFields) {
+    clauses.push({ [field]: { $gte: fromText, $lte: toText } });
+    clauses.push({ [field]: { $gte: startDate, $lt: endDate } });
+    if (legacyMonthRegex) clauses.push({ [field]: { $regex: legacyMonthRegex } });
+  }
+  return clauses.length ? { $match: { $or: clauses } } : null;
+}
```

### 4.3. Promotions — bỏ find-all summary, group trong MongoDB

```diff
-  const rows = await cfg.Model.find(buildProgramSearchFilter(query, cfg))
-    .select(PROMOTION_PROGRAM_LIST_PROJECTION)
-    .sort(cfg.sort)
-    .lean();
-  const groups = new Map();
-  ... group trong memory ...
-  const result = Array.from(groups.values()).map(toProgramSummary)
+  const rows = await aggregatePromotionProgramSummaries(query, cfg);
+  const result = rows.map((row) => {
+    const group = {
+      programCode: row.programCode,
+      programName: row.programName || (cfg.type === 'groupItems' ? row.programCode : ''),
+      startDate: row.startDate || '',
+      endDate: row.endDate || '',
+      isActive: row.isActive !== false,
+      productCodes: row.productCodes || [],
+      sources: row.sources || [cfg.source],
+      lineCount: row.lineCount || 0
+    };
+    return toProgramSummary(group);
+  })
```

### 4.4. Promotions — aggregate summary field tối thiểu

```diff
+async function aggregatePromotionProgramSummaries(query = {}, cfg = promotionTypeConfig(query.type)) {
+  const rows = await cfg.Model.aggregate([
+    { $match: buildProgramSearchFilter(query, cfg) },
+    { $project: { programCode, programName, startDate, endDate, productCode, isActiveRow } },
+    { $match: { programCode: { $gt: '' } } },
+    { $group: { _id: '$programCode', productCodes: { $addToSet: '$productCode' }, lineCount: { $sum: 1 } } },
+    { $project: { programCode: '$_id', programName: 1, startDate: 1, endDate: 1, productCodes: 1, isActive: 1, lineCount: 1 } }
+  ]).allowDiskUse(true).exec();
+  return rows.map((row) => ({ ...row, sources: [cfg.source] }));
+}
```

---

## 5. Test thực tế

| Lệnh | Kết quả |
|---|---|
| `npm run check:syntax` | PASS — `SYNTAX_OK 972 JavaScript files` |
| `node --test test/phase36d-api-response-followup-static.test.js` | PASS — 8/8 |
| `node --test test/phase36b-delivery-performance-static.test.js test/phase36c-api-response-p0p1-static.test.js test/phase36d-api-response-followup-static.test.js` | PASS — 20/20 |
| `node --test test/sales-order-delete-policy.test.js test/sales-order-delete-static-boundary.test.js test/sales-order-delete-list-visibility-static.test.js test/mobile-sales-delete-list-visibility-static.test.js` | PASS — 12/12 |

Không có MongoDB live trong sandbox nên không chạy được explain/benchmark thật trên Atlas.

---

## 6. Bảng before/after

Không có MongoDB live/Render API Monitor trong sandbox nên **không ghi số after giả**.

| API | Before từ log thực tế | After | Ghi chú |
|---|---:|---:|---|
| `GET /api/dashboard/home` | 4.014s | Cần đo lại trên Render API Monitor sau deploy | Đã thêm prefilter ngày trước `MasterOrder.aggregate` normalized stage; giữ cache summary 45s. |
| `MasterOrder.aggregate` trong dashboard | 2.403s | Cần đo lại trên Atlas explain/API Monitor | Cần kiểm tra index `deliveryDate/date/createdAt/status`. |
| `GET /api/promotions/programs` | 1.662s | Cần đo lại trên Render API Monitor sau deploy | Đã thay summary list từ `find({})` sang aggregate `$project + $group`. |
| `PromotionGroupItem.find({})` trong programs | 1.656s | Cần đo lại trên Atlas explain/API Monitor | Path danh sách không còn dùng find-all summary; detail vẫn find theo `programCode`. |
| `confirm-accounting` | 15.013s | Cần đo lại trên Render API Monitor sau deploy | Giữ tối ưu Phase36C selected-first. |
| `DELETE /api/sales-orders/:id` | 3.805s | Cần đo lại trên Render API Monitor sau deploy | Giữ sửa Phase36D trước đó. |
| `delivery/orders` | 3.841s | Cần đo lại trên Render API Monitor sau deploy | Giữ sửa Phase36C. |
| `stock` | 1.763s | Cần đo lại trên Render API Monitor sau deploy | Giữ sửa Phase36C. |
| `debts/customers` | 1.283s | Cần đo lại trên Render API Monitor sau deploy | Giữ sửa Phase36D trước đó. |
| `delivery-staff search` | 1.158s | Cần đo lại trên Render API Monitor sau deploy | Giữ sửa Phase36D trước đó. |
| `delivery/returns` | 1.074s | Cần đo lại trên Render API Monitor sau deploy | Giữ sửa Phase36C. |

---

## 7. Kết luận cache ngắn

| Khu vực | Có dùng cache ngắn? | Lý do |
|---|---|---|
| Dashboard summary | Có, TTL mặc định 45s | Chỉ là số tổng quan; giảm các lần load lặp API Monitor/trang home; có `refresh=1` để bypass. |
| Promotion programs list | Có, TTL mặc định 30s | Danh sách CTKM ít thay đổi; đã có `clearPromotionProgramCache()` trong create/update/delete/cancel. |
| Công nợ realtime | Không | Cần chính xác theo `arLedgers`. |
| Tồn kho realtime | Không | Cần chính xác theo `inventories`. |
| Giao hàng/xác nhận kế toán | Không | Dữ liệu thao tác trực tiếp, tránh stale state. |

---

## 8. Hướng dẫn đo lại trên Render API Monitor sau deploy

Sau deploy ZIP này, cần đo lại tối thiểu 2 API mới báo chậm:

```text
GET /api/dashboard/home
GET /api/promotions/programs?type=all
GET /api/promotions/programs?type=groupItems
```

Cần kiểm tra trong API Monitor:

```text
MasterOrder.aggregate duration
PromotionGroupItem.find duration có còn xuất hiện ở endpoint list hay không
PromotionGroupItem.aggregate duration nếu monitor ghi aggregate
Response time tổng
Số query/request
Cache hit lần gọi thứ 2 trong vòng 30–45 giây
```

Trên MongoDB Atlas nên chạy explain cho:

```javascript
db.masterorders.explain('executionStats').aggregate([...dashboard pipeline...])
db.promotiongroupitems.explain('executionStats').aggregate([...program summary pipeline...])
```

---

## 9. Regression checklist

| Nghiệp vụ | Trạng thái | Ghi chú |
|---|---|---|
| Bán hàng | OK | Không sửa flow tạo/sửa đơn. |
| Xóa đơn | OK | Không đổi hard delete/reverse stock. |
| Giao hàng | OK | Không đổi quyền NVGH/list giao. |
| Trả hàng | OK | Không đổi `returnOrders` SSoT. |
| Đối soát | OK | Không sửa logic đối soát. |
| Kế toán xác nhận | OK | Không sửa AR/fund trong lần bổ sung này. |
| Công nợ | OK | Không cache công nợ realtime. |
| Tồn kho | OK | Không dùng `inventorySnapshots`, không cache tồn realtime. |
| Quỹ | OK | Không sửa fund ledger. |
| Khuyến mại | OK | Danh sách dùng aggregate summary; detail/tính khuyến mại vẫn giữ rule hiện tại. |
| Dashboard | OK | Thêm prefilter ngày và giữ cache summary ngắn. |
| App mobile | OK | Không đổi mobile API contract. |
| Import/export | OK | Không sửa import/export. |

---

## 10. Rủi ro còn lại

1. `MasterOrder.aggregate`: prefilter đã giảm scan trước stage normalized date, nhưng hiệu quả thật phụ thuộc index và format ngày thực tế trong `masterorders`.
2. `PromotionGroupItem` list summary: chuyển sang aggregate `$group`; cần đo lại trên Atlas để xác nhận giảm network/payload và query time.
3. `PromotionGroupItem.find` vẫn còn ở API chi tiết và tính khuyến mại, nhưng có filter theo `programCode` hoặc `productCode`; không còn là path list summary find-all.
4. Chưa tách sâu dashboard thành nhiều API nhỏ vì có rủi ro đổi API contract dashboard cũ.
5. Không ghi số after vì sandbox không có MongoDB live/Render API Monitor.
