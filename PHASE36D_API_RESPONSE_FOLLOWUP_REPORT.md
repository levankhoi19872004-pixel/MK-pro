# PHASE36D — Follow-up tối ưu P0/P1 API chậm còn lại sau Phase36C

## 0. Baseline

- Baseline ZIP: `MK-pro-phase36c-api-response-p0p1-optimization-patched.zip`
- Mục tiêu: tiếp tục đúng từ Phase36C, không quay lại Phase35/Phase36B.
- Phạm vi sửa: chỉ các endpoint có log chậm thực tế ngày 22/06/2026 và phần Phase36C chưa xử lý sâu.

---

## 1. Tổng quan dự án

| Hạng mục | Kết quả |
|---|---|
| Tech stack | Node.js + Express + MongoDB/Mongoose |
| Kiểu kiến trúc | Monolith ERP/DMS, có route/controller/service/repository/domain |
| Module ảnh hưởng | Bán hàng/xóa đơn, công nợ, tìm kiếm NVGH, report legacy AR |
| Source bundle | `src/services/reportLegacy.service.js` được generate từ `src/services/reportLegacy.service.source/*` |
| Nguyên tắc giữ nguyên | Không đổi business rule, API contract, schema MongoDB, nguồn chuẩn AR/tồn/quỹ/trả hàng |

---

## 2. Root cause theo API

### P0 — `DELETE /api/sales-orders/:id`

| Mục | Chi tiết |
|---|---|
| File | `src/domain/lifecycle/SalesOrderDeletionService.js`, `src/repositories/salesOrderDeletion.repository.js` |
| Hàm | `deleteSalesOrder()`, `loadSalesOrderDeletionContext()` |
| Query chậm liên quan | `StockTransaction.find(refFilter).limit(20)`, `ArLedger.find(refFilter).limit(20)` và các collection tài chính liên quan |
| Nguyên nhân | Context xóa đơn được load trước khi quyết định reject các case đã xóa/đã gộp; các dependency check chỉ cần biết có/không nhưng lại load tối đa 20 dòng ở nhiều collection, lặp lại trong transaction. `orderKeys()` chưa deduplicate bằng `Set`, có nguy cơ tạo `$in` chứa mã lặp nếu `id/code/orderCode` trùng nhau. |
| Ảnh hưởng nghiệp vụ | Xóa đơn stock-posted bị chậm; nếu người dùng bấm lại có thể gây cảm giác treo dù guard nghiệp vụ vẫn chặn xóa sai. |
| Phase36D xử lý | Deduplicate `orderKeys`; chuyển dependency check từ `find().limit(20)` sang `findOne().select(...).lean()`; thêm early-exit cho đơn đã xóa/đã gộp trước khi load context nặng. |

### P0 — `POST /api/master-orders/delivery-today/confirm-accounting`

| Mục | Chi tiết |
|---|---|
| File | `src/services/master-order/deliveryAccountingCommand.impl.js` |
| Hàm | `confirmDeliveryAccounting()`, `confirmDeliveryAccountingInternal()` |
| Query log | `SalesOrder.find({ id: { $in: [...] } })` |
| Nguyên nhân gốc từ log | Trước Phase36C có nguy cơ quét đơn tổng theo ngày rồi hydrate đơn con; log ghi nhiều query và có double submit. |
| Phase36C đã xử lý | Selected-first, duplicate submit guard, query theo selected order trước. |
| Phase36D xử lý | Kiểm tra regression, không sửa sâu thêm để tránh ảnh hưởng AR-SALE/AR-RETURN/AR-RECEIPT/fund. |

### P0 — `GET /api/delivery/orders`

| Mục | Chi tiết |
|---|---|
| File | `src/engines/delivery.legacy.engine.source/*`, `src/engines/delivery.legacy.engine.js` |
| Hàm | `findOrders()`, `listOrders()` |
| Query log cũ | `$or + $exists + $nin` trên master link |
| Phase36C đã xử lý | Giữ canonical master link, projection/lean, filter sớm theo ngày/NVGH/status. |
| Phase36D xử lý | Kiểm tra regression, không bỏ `items` ở Phase36D vì `buildCanonicalOrder()` và trả hàng cần dữ liệu dòng hàng; nếu muốn tối ưu sâu tiếp nên tách API list/detail riêng ở phase sau. |

### P1 — `GET /api/debts/customers`

| Mục | Chi tiết |
|---|---|
| File | `src/services/reportLegacy.service.source/part-02.jsfrag`, `src/services/reportLegacy.service.source/part-03.jsfrag`, generated `src/services/reportLegacy.service.js` |
| Hàm | `debtReport()`, `debtArLedger()` |
| Query chậm | `ArLedger.find(match)` sau aggregate công nợ |
| Nguyên nhân | Query chi tiết AR đang trả full document trong khi UI chỉ cần field định danh, khách, order, debit/credit, staff, status/note. |
| Ảnh hưởng nghiệp vụ | Công nợ khách hàng load chậm, payload lớn; không được cache vì AR realtime là nguồn chuẩn. |
| Phase36D xử lý | Thêm `DEBT_AR_LEDGER_DETAIL_PROJECTION`, áp dụng `.select(...).lean()` cho query chi tiết công nợ và sổ công nợ. Không đổi cách aggregate/source `arLedgers`. |

### P1 — `GET /api/search/delivery-staff`

| Mục | Chi tiết |
|---|---|
| File | `src/repositories/searchRepository.js` |
| Hàm | `findStaffs()` |
| Query chậm | `User.find` với nhiều alias code field `$exists + $nin` |
| Nguyên nhân | Với search NVGH, code cũ kiểm tra tồn tại mã trên toàn bộ alias NVBH + NVGH + employee, làm `$or` rộng không cần thiết. Role filter chỉ theo `role`, chưa hỗ trợ `roles/staffType/type`. |
| Ảnh hưởng nghiệp vụ | Autocomplete NVGH chậm, dễ scan nhiều user hơn cần thiết. |
| Phase36D xử lý | Thêm role-specific code fields: delivery chỉ kiểm `code/staffCode/deliveryStaffCode/shipperCode/employeeCode/maNhanVien`; hỗ trợ role filter trên `role/roles/staffType/type`; giữ projection + lean. |

### P1 — `GET /api/dashboard/home`, `GET /`, `/api/stock`, `/api/promotions/programs`, `/api/delivery/returns`

| API | Trạng thái Phase36D |
|---|---|
| `GET /api/dashboard/home` | Phase36C đã lazy-load/cache summary. Phase36D không cache thêm để tránh sai công nợ/tồn kho realtime. |
| `GET /` | Phase36C đã delay dashboard-heavy load. Phase36D giữ nguyên. |
| `GET /api/stock` | Phase36C đã chuyển current stock qua `inventories` và product lookup theo aliases từ inventory. Phase36D kiểm tra không sửa sâu thêm. |
| `GET /api/promotions/programs` | Phase36C đã batch `type=all`. Phase36D kiểm tra không sửa thêm. |
| `GET /api/delivery/returns` | Phase36C đã ưu tiên lookup SO trực tiếp và projection returnOrders. Phase36D kiểm tra không sửa thêm. |

---

## 3. File đã sửa

| File | Thay đổi |
|---|---|
| `src/domain/lifecycle/SalesOrderDeletionService.js` | Early-exit cho đơn đã xóa/đã gộp trước khi load dependency context nặng. |
| `src/repositories/salesOrderDeletion.repository.js` | Deduplicate `orderKeys`; thêm projection; đổi `find().limit(20)` sang `findOne().select().lean()` cho dependency check. |
| `src/repositories/searchRepository.js` | Role-specific staff code fields cho NVBH/NVGH; role filter mở rộng `role/roles/staffType/type`; giữ projection/lean. |
| `src/services/reportLegacy.service.source/part-02.jsfrag` | Thêm projection cho query chi tiết AR trong `debtReport()`. |
| `src/services/reportLegacy.service.source/part-03.jsfrag` | Thêm projection cho `debtArLedger()`. |
| `src/services/reportLegacy.service.js` | Generated lại từ source fragments. |
| `config/source-bundles.json` | Refresh hash cho `src/services/reportLegacy.service.js`. |
| `test/phase36d-api-response-followup-static.test.js` | Test tĩnh Phase36D. |
| `PHASE36D_MONGODB_INDEX_RECOMMENDATIONS.md` | Khuyến nghị index Atlas, không tự migration. |

---

## 4. Diff Old/New quan trọng

### 4.1. Deduplicate order keys khi xóa đơn

```diff
-function orderKeys(order = {}) {
-  return [
+function orderKeys(order = {}) {
+  return [...new Set([
     order.id,
     order._id,
     order.code,
@@
-  ].map((v) => String(v || '').trim()).filter(Boolean);
+  ].map((v) => String(v || '').trim()).filter(Boolean))];
 }
```

### 4.2. Dependency context: không load 20 dòng khi chỉ cần biết có/không

```diff
-    refFilter ? withSession(StockTransaction.find(refFilter).limit(20), session).lean() : [],
-    refFilter ? withSession(ArLedger.find(refFilter).limit(20), session).lean() : [],
+    refFilter ? firstWithProjection(StockTransaction.findOne(refFilter), DELETION_CONTEXT_PROJECTIONS.stockTransaction, session) : null,
+    refFilter ? firstWithProjection(ArLedger.findOne(refFilter), DELETION_CONTEXT_PROJECTIONS.ledgerRef, session) : null,
```

### 4.3. Early-exit delete flow

```diff
-  const related = await deletionRepository.loadSalesOrderDeletionContext(order);
   const actor = actorFromCommand(command);
+  const earlyDecision = decideSalesOrderDeletion(order, {}, { ...command, ...actor });
+  if (earlyDecision.mode === 'ALREADY_DELETED') { ... }
+  if (!earlyDecision.allowed && ['ORDER_ALREADY_MERGED'].includes(earlyDecision.code)) { ... }
+
+  const related = await deletionRepository.loadSalesOrderDeletionContext(order);
   const decision = decideSalesOrderDeletion(order, related, { ...command, ...actor });
```

### 4.4. Debt AR projection

```diff
+const DEBT_AR_LEDGER_DETAIL_PROJECTION = 'id code date createdAt type source refType refId refCode orderId orderCode salesOrderId salesOrderCode customerId customerCode customerName debit credit amount status note voidReason salesStaffCode salesStaffName salesmanCode salesmanName nvbhCode nvbhName deliveryStaffCode deliveryStaffName deliveryCode deliveryName nvghCode nvghName';
+
   const arLedgerRows = await runReportSource('chi tiết công nợ', query, () =>
     ArLedger.find(match)
+      .select(DEBT_AR_LEDGER_DETAIL_PROJECTION)
       .sort({ date: -1, createdAt: -1 })
       .limit(200)
       .lean()
   );
```

### 4.5. Search NVGH: giảm alias rộng

```diff
+const ROLE_SPECIFIC_STAFF_CODE_FIELDS = Object.freeze({
+  sales: ['code', 'staffCode', 'salesStaffCode', 'salesmanCode', 'employeeCode', 'maNhanVien'],
+  delivery: ['code', 'staffCode', 'deliveryStaffCode', 'shipperCode', 'employeeCode', 'maNhanVien']
+});
+
+function staffCodeExistsFilter(query = {}) {
+  return {
+    $or: roleSpecificStaffCodeFields(query).map(nonEmptyFieldFilter)
+  };
+}
```

---

## 5. Test thực tế

| Lệnh | Kết quả |
|---|---|
| `npm run check:syntax` | PASS — `SYNTAX_OK 972 JavaScript files` |
| `node --test test/phase36d-api-response-followup-static.test.js` | PASS — 5/5 |
| `node --test test/phase36c-api-response-p0p1-static.test.js test/phase36d-api-response-followup-static.test.js test/sales-order-delete-static-boundary.test.js test/sales-order-delete-policy.test.js` | PASS — 18/18 |
| `node scripts/build-source-bundles.js --check --target=src/services/reportLegacy.service.js` | PASS |

---

## 6. Bảng before/after

Không có MongoDB live/Render API Monitor trong sandbox nên **không ghi số after giả**.

| API | Before từ log thực tế | After | Ghi chú |
|---|---:|---:|---|
| `confirm-accounting` | 15.013s | Cần đo lại trên Render API Monitor sau deploy | Phase36C đã selected-first; Phase36D kiểm tra regression. |
| `DELETE /api/sales-orders/:id` | 3.805s | Cần đo lại trên Render API Monitor sau deploy | Phase36D giảm `$in` lặp/payload dependency context. |
| `delivery/orders` | 3.841s | Cần đo lại trên Render API Monitor sau deploy | Phase36C đã xử lý; Phase36D không đổi payload items để tránh sai nghiệp vụ. |
| `dashboard/home` | 3.683s | Cần đo lại trên Render API Monitor sau deploy | Phase36C đã lazy/cache summary an toàn. |
| `GET /` | 1.711s | Cần đo lại trên Render API Monitor sau deploy | Phase36C đã delay dashboard load. |
| `stock` | 1.763s | Cần đo lại trên Render API Monitor sau deploy | Phase36C đã chuyển current stock sang `inventories`. |
| `promotions/programs` | 1.213s | Cần đo lại trên Render API Monitor sau deploy | Phase36C đã batch `type=all`. |
| `debts/customers` | 1.283s | Cần đo lại trên Render API Monitor sau deploy | Phase36D thêm AR projection/lean. |
| `delivery-staff search` | 1.158s | Cần đo lại trên Render API Monitor sau deploy | Phase36D giảm alias code filter. |
| `delivery/returns` | 1.074s | Cần đo lại trên Render API Monitor sau deploy | Phase36C đã xử lý; Phase36D kiểm tra regression. |

---

## 7. Regression checklist

| Nghiệp vụ | Trạng thái | Ghi chú |
|---|---|---|
| Bán hàng | OK | Không đổi tạo/sửa đơn. |
| Xóa đơn | OK | Vẫn qua `SalesOrderDeletionService`; hard delete rule giữ nguyên. |
| Giao hàng | OK | Không đổi quyền NVGH/list giao. |
| Trả hàng | OK | Không đổi `returnOrders` SSoT. |
| Đối soát | OK | Không sửa logic đối soát. |
| Kế toán xác nhận | OK | Không sửa sâu flow AR/fund sau Phase36C. |
| Công nợ | OK | Vẫn đọc `arLedgers`; chỉ giảm field trả về ở query detail. |
| Tồn kho | OK | Không đổi nguồn chuẩn `inventories`; delete vẫn gọi reverse qua posting service. |
| Quỹ | OK | Không sửa fund ledger. |
| Khuyến mại | OK | Không sửa rule tính khuyến mại. |
| Dashboard | OK | Không cache thêm dữ liệu realtime. |
| App mobile | OK | Không đổi mobile API contract. |
| Import/export | OK | Không sửa import/export. |

---

## 8. Rủi ro còn lại

1. `DELETE /api/sales-orders/:id` vẫn load dependency context trong transaction lần 2 để đảm bảo an toàn dữ liệu. Phase36D chỉ giảm payload và early-exit; chưa gom toàn bộ dependency check thành một aggregate vì rủi ro nghiệp vụ.
2. `confirm-accounting` vẫn có các bước post collection/bonus/audit theo từng đơn trong một số nhánh nghiệp vụ. Chưa bulk toàn bộ vì dễ tạo sai AR/fund nếu thiếu idempotency chi tiết.
3. `delivery/orders` vẫn trả `items` vì `buildCanonicalOrder()` và tab hàng trả/hàng giao phụ thuộc dòng hàng. Muốn giảm sâu cần thiết kế API list/detail riêng ở phase sau.
4. `/api/debts/customers` vẫn aggregate AR theo logic cũ để giữ đúng số dư; không cache công nợ realtime.
5. Cần kiểm tra index trên MongoDB Atlas bằng `explain()` trước khi tạo index mới.
6. Các số after bắt buộc đo lại trên Render API Monitor sau deploy.

---

## 9. Kết luận

Phase36D đạt mục tiêu follow-up từ Phase36C:

- Không quay lại Phase35/Phase36B.
- Xử lý sâu thêm `DELETE /api/sales-orders/:id`.
- Giảm payload/query rộng cho `debts/customers`.
- Giảm alias query cho `search/delivery-staff`.
- Giữ nguyên các tối ưu Phase36C, không refactor lan rộng.
- Syntax/test/source bundle check đều PASS.
