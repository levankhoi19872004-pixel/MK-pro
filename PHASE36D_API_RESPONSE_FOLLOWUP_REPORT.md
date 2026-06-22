# PHASE36D — Sửa lại ZIP follow-up tối ưu P0/P1 API chậm sau Phase36C

## 0. Baseline và phạm vi sửa lại

- Baseline thực tế: `MK-pro-phase36d-api-response-followup-patched.zip` được tạo từ `MK-pro-phase36c-api-response-p0p1-optimization-patched.zip`.
- File prompt người dùng gửi lại có nội dung Phase36B/Phase35, nhưng yêu cầu hiện tại là **sửa lại ZIP Phase36D**. Vì vậy lần sửa này **không quay lại Phase35/Phase36B** và không đổi tên artifact về Phase36B.
- Phạm vi sửa lại: chỉ các điểm còn khớp trực tiếp log chậm P0/P1 sau Phase36C/36D:
  - `DELETE /api/sales-orders/:id`
  - `GET /api/debts/customers`
  - kiểm tra regression các tối ưu Phase36C/36D hiện có

---

## 1. Tổng quan dự án

| Hạng mục | Kết quả |
|---|---|
| Tech stack | Node.js + Express + MongoDB/Mongoose |
| Kiến trúc | Monolith ERP/DMS, route/controller/service/repository/domain |
| Module ảnh hưởng trực tiếp | Bán hàng/xóa đơn, công nợ |
| Module chỉ kiểm tra regression | Giao hàng, xác nhận kế toán, tồn kho, dashboard, khuyến mại, trả hàng |
| Nguyên tắc giữ nguyên | Không đổi business rule, API contract, schema MongoDB, nguồn chuẩn AR/tồn/quỹ/trả hàng |

---

## 2. Root cause và xử lý theo API

### P0 — `DELETE /api/sales-orders/:id`

| Mục | Chi tiết |
|---|---|
| File | `src/domain/lifecycle/SalesOrderDeletionService.js`, `src/repositories/salesOrderDeletion.repository.js` |
| Hàm | `deleteSalesOrder()`, `loadSalesOrderDeletionContext()` |
| Query log liên quan | `StockTransaction.find`/dependency lookup theo order keys, trước đó có log `$in` lặp và nhiều query |
| Nguyên nhân chậm | Flow cần kiểm tra nhiều dependency trước khi xóa. Phase36D trước đã giảm `find().limit(20)` sang `findOne().select().lean()`, nhưng service vẫn còn hydrate dependency context ngoài transaction rồi hydrate lại trong transaction. |
| Ảnh hưởng nghiệp vụ | Xóa đơn stock-posted có thể mất nhiều giây; người dùng dễ bấm lại hoặc tưởng treo. |
| Sửa lại trong ZIP Phase36D | Giữ early guard cho `ALREADY_DELETED`/`ORDER_ALREADY_MERGED`, sau đó chỉ hydrate dependency context **một lần trong transaction**. Khi dependency không cho xóa, transaction throw lỗi và rollback an toàn. |
| Không đổi | Vẫn giữ hard delete policy, reverse stock qua `InventoryPostingService.reverseMovement()`, không xóa đơn đã gộp/đã phát sinh tài chính/trả hàng có giá trị. |

### P1 — `GET /api/debts/customers`

| Mục | Chi tiết |
|---|---|
| File | `src/services/DebtReadService.js`, `src/services/reportLegacy.service.source/part-02.jsfrag`, `src/services/reportLegacy.service.source/part-03.jsfrag`, `src/services/reportLegacy.service.js` |
| Hàm | `loadOrderDebtRows()`, `debtReport()`, `debtArLedger()` |
| Query log liên quan | `ArLedger.find orderId $in` |
| Nguyên nhân chậm | Query AR theo order keys dễ trả full document/payload lớn. Phase36D trước đã thêm projection cho report legacy, nhưng `DebtReadService.loadOrderDebtRows()` vẫn chưa có projection. |
| Sửa lại trong ZIP Phase36D | Thêm `DEBT_ORDER_LEDGER_PROJECTION` và `.select(DEBT_ORDER_LEDGER_PROJECTION)` cho `ArLedger.find({ $and: [activeArFilter(), orderRefCondition(keys)] })`. |
| Không đổi | Vẫn deduplicate `orderKeys`, vẫn đọc nguồn chuẩn `arLedgers`, không cache công nợ realtime. |

### P0/P1 đã xử lý ở Phase36C/Phase36D và chỉ kiểm tra regression

| API | Trạng thái |
|---|---|
| `POST /api/master-orders/delivery-today/confirm-accounting` | Phase36C đã selected-first + duplicate-submit guard. Không sửa sâu thêm để tránh rủi ro AR/fund. |
| `GET /api/delivery/orders` | Phase36C đã filter sớm/projection/lean/canonical master link. Không tách payload list/detail ở lần sửa này vì có rủi ro tab hàng giao/trả hàng. |
| `GET /api/dashboard/home` và `GET /` | Phase36C đã lazy-load/cached summary an toàn. Không cache công nợ/tồn kho realtime. |
| `GET /api/stock` | Phase36C đã tránh `Product.find({})` ở current stock summary và lookup theo alias inventory. |
| `GET /api/promotions/programs` | Phase36C đã batch `type=all`; không đổi rule tính khuyến mại. |
| `GET /api/search/delivery-staff` | Phase36D đã giảm alias rộng và giữ projection/lean. |
| `GET /api/delivery/returns` | Phase36C đã ưu tiên lookup mã `SO...` theo `id`, fallback `$or` khi cần. |

---

## 3. File đã sửa trong lần sửa lại ZIP Phase36D

| File | Thay đổi |
|---|---|
| `src/domain/lifecycle/SalesOrderDeletionService.js` | Bỏ hydrate dependency context ngoài transaction; chỉ hydrate một lần trong transaction sau early guard. |
| `src/services/DebtReadService.js` | Thêm projection cho query `ArLedger.find` theo order keys. |
| `test/phase36d-api-response-followup-static.test.js` | Tăng test tĩnh từ 5 lên 6, kiểm tra context delete chỉ hydrate một lần trong transaction và `DebtReadService` có projection. |
| `PHASE36D_API_RESPONSE_FOLLOWUP_REPORT.md` | Cập nhật báo cáo đúng trạng thái sửa lại ZIP Phase36D. |

Các file Phase36D trước đó vẫn giữ nguyên trong ZIP:

- `src/repositories/salesOrderDeletion.repository.js`
- `src/repositories/searchRepository.js`
- `src/services/reportLegacy.service.source/part-02.jsfrag`
- `src/services/reportLegacy.service.source/part-03.jsfrag`
- `src/services/reportLegacy.service.js`
- `config/source-bundles.json`
- `PHASE36D_MONGODB_INDEX_RECOMMENDATIONS.md`

---

## 4. Diff Old/New quan trọng

### 4.1. `DELETE /api/sales-orders/:id` — không hydrate context 2 lần

```diff
-  const related = await deletionRepository.loadSalesOrderDeletionContext(order);
   const actor = actorFromCommand(command);
-  const decision = decideSalesOrderDeletion(order, related, { ...command, ...actor });
+  const earlyDecision = decideSalesOrderDeletion(order, {}, { ...command, ...actor });
+  if (earlyDecision.mode === 'ALREADY_DELETED') { ... }
+  if (!earlyDecision.allowed && ['ORDER_ALREADY_MERGED'].includes(earlyDecision.code)) { ... }
 
   const commandId = command.idempotencyKey || makeId('SOD');
+  let finalDecision = null;
 
   await tx.withMongoTransaction(async (session) => {
+    // Phase36D revised: chỉ hydrate dependency context một lần trong transaction.
     const relatedInTx = await deletionRepository.loadSalesOrderDeletionContext(order, { session });
     const decisionInTx = decideSalesOrderDeletion(order, relatedInTx, { ...command, ...actor });
+    finalDecision = decisionInTx;
```

### 4.2. `GET /api/debts/customers` — projection cho `DebtReadService`

```diff
+const DEBT_ORDER_LEDGER_PROJECTION = 'id code type source sourceId sourceType refType refId refCode orderId orderCode salesOrderId salesOrderCode customerCode customerName debit credit amount status date createdAt salesStaffCode salesStaffName salesmanCode salesmanName nvbhCode nvbhName deliveryStaffCode deliveryStaffName deliveryCode deliveryName nvghCode nvghName';
+
 async function loadOrderDebtRows(orderKeys = [], options = {}) {
   const keys = [...new Set(orderKeys.map(text).filter(Boolean))];
   if (!keys.length) return [];
-  let query = ArLedger.find({ $and: [activeArFilter(), orderRefCondition(keys)] }).limit(Math.max(200, keys.length * 50));
+  let query = ArLedger.find({ $and: [activeArFilter(), orderRefCondition(keys)] })
+    .select(DEBT_ORDER_LEDGER_PROJECTION)
+    .limit(Math.max(200, keys.length * 50));
   query = withSession(query, options.session);
   return query.lean();
 }
```

---

## 5. Test thực tế

| Lệnh | Kết quả |
|---|---|
| `npm run check:syntax` | PASS — `SYNTAX_OK 972 JavaScript files` |
| `node --test test/phase36d-api-response-followup-static.test.js` | PASS — 6/6 |
| `node --test test/phase36c-api-response-p0p1-static.test.js test/phase36d-api-response-followup-static.test.js test/sales-order-delete-static-boundary.test.js test/sales-order-delete-policy.test.js` | PASS — 19/19 |
| `node scripts/build-source-bundles.js --check --target=src/services/reportLegacy.service.js` | NOT RUN/PASS không xác nhận — môi trường hiện thiếu `node_modules/terser`; lần sửa lại này không thay đổi source bundle/reportLegacy generated. |

---

## 6. Bảng before/after

Không có MongoDB live/Render API Monitor trong sandbox nên **không ghi số after giả**.

| API | Before từ log thực tế | After | Ghi chú |
|---|---:|---:|---|
| `confirm-accounting` | 15.013s | Cần đo lại trên Render API Monitor sau deploy | Phase36C đã selected-first; Phase36D kiểm tra regression. |
| `DELETE /api/sales-orders/:id` | 3.805s | Cần đo lại trên Render API Monitor sau deploy | Sửa lại Phase36D giảm hydrate dependency context 2 lần, giữ guard nghiệp vụ. |
| `delivery/orders` | 3.841s | Cần đo lại trên Render API Monitor sau deploy | Phase36C đã xử lý; chưa tách list/detail ở Phase36D. |
| `dashboard/home` | 3.683s | Cần đo lại trên Render API Monitor sau deploy | Phase36C đã lazy/cache summary an toàn. |
| `GET /` | 1.711s | Cần đo lại trên Render API Monitor sau deploy | Phase36C đã delay dashboard load. |
| `stock` | 1.763s | Cần đo lại trên Render API Monitor sau deploy | Phase36C đã xử lý current stock summary. |
| `promotions/programs` | 1.213s | Cần đo lại trên Render API Monitor sau deploy | Phase36C đã batch `type=all`. |
| `debts/customers` | 1.283s | Cần đo lại trên Render API Monitor sau deploy | Phase36D sửa lại thêm projection trong `DebtReadService`. |
| `delivery-staff search` | 1.158s | Cần đo lại trên Render API Monitor sau deploy | Phase36D đã giảm alias code filter. |
| `delivery/returns` | 1.074s | Cần đo lại trên Render API Monitor sau deploy | Phase36C đã xử lý lookup SO. |

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
| Công nợ | OK | Vẫn đọc `arLedgers`; chỉ giảm field trả về ở query đọc. |
| Tồn kho | OK | Không đổi nguồn chuẩn `inventories`; delete vẫn gọi reverse qua posting service. |
| Quỹ | OK | Không sửa fund ledger. |
| Khuyến mại | OK | Không sửa rule tính khuyến mại. |
| Dashboard | OK | Không cache thêm dữ liệu realtime. |
| App mobile | OK | Không đổi mobile API contract. |
| Import/export | OK | Không sửa import/export. |

---

## 8. Rủi ro còn lại

1. `DELETE /api/sales-orders/:id`: dependency check vẫn phải đọc nhiều collection để đảm bảo không xóa sai đơn đã có trả hàng/công nợ/quỹ. Lần sửa này giảm một vòng hydrate context, không gom bằng aggregate vì rủi ro nghiệp vụ.
2. `confirm-accounting`: chưa bulk toàn bộ AR/fund vì dễ sai idempotency nếu thiếu kiểm chứng live data.
3. `delivery/orders`: chưa tách API list/detail; nếu tiếp tục chậm trên Render thì phase sau nên tách payload danh sách khỏi chi tiết hàng.
4. `/api/debts/customers`: không cache công nợ realtime; cần index/explain trên Atlas.
5. Cần đo lại tất cả endpoint trong bảng trên bằng Render API Monitor sau deploy.
6. Cần kiểm tra các index trong `PHASE36D_MONGODB_INDEX_RECOMMENDATIONS.md` trước khi tạo trên Atlas.

---

## 9. Kết luận

ZIP Phase36D đã được sửa lại đúng hướng:

- Không quay lại Phase35/Phase36B dù prompt đính kèm đang ghi nhầm tên phase.
- Giảm thêm query/payload ở hai điểm còn đáng sửa an toàn: xóa đơn bán và công nợ.
- Giữ nguyên các tối ưu Phase36C/36D trước đó.
- Syntax và test tĩnh liên quan đều PASS.
