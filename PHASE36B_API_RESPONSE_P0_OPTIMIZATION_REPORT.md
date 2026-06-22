# PHASE36C — API Response P0/P1 Optimization Report

> Baseline: `MK-pro-phase36b-api-response-p0-optimization-patched.zip`  
> Output theo yêu cầu người dùng: `MK-pro-phase36b-api-response-p0-optimization-patched.zip`  
> Ngày xử lý: 22/06/2026  
> Phạm vi: chỉ các endpoint có log chậm thực tế từ API Monitor ngày 22/06/2026.

## 1. Tổng quan thay đổi

Phase36c tiếp tục trên nền Phase36B, tập trung vào các query vẫn còn chậm trong log thực tế:

- `POST /api/master-orders/delivery-today/confirm-accounting`
- `GET /api/delivery/orders`
- `GET /api/dashboard/home`
- `GET /`
- `GET /api/stock`
- `GET /api/promotions/programs`
- `GET /api/delivery/returns`
- `POST /api/master-return-orders` / monitor ghi `POST /` liên quan `ReturnOrder.updateMany`

Nguyên tắc giữ nguyên:

- Không đổi business rule.
- Không đổi API contract.
- Không cache công nợ/tồn kho/giao hàng/xác nhận kế toán realtime.
- Không bỏ dữ liệu nghiệp vụ để làm nhanh.
- Các thay đổi đều theo hướng giảm query rộng, thêm projection/lean, filter sớm, chống duplicate/lặp request.

---

## 2. Root cause theo API

| API | File / Hàm | Query / Điểm nóng | Nguyên nhân chậm | Ảnh hưởng nghiệp vụ |
|---|---|---|---|---|
| `POST /api/master-orders/delivery-today/confirm-accounting` | `src/services/master-order/deliveryAccountingCommand.impl.js` / `confirmDeliveryAccountingInternal` | Trước đó flow đi qua `listMasterOrders({ dateFrom, dateTo })`, hydrate con theo ngày, sau đó mới lọc các đơn được chọn. Log ghi nhận `SalesOrder.find({ id: { $in } })` và tổng 47 query. | Khi kế toán chỉ tick một số đơn, backend vẫn có thể quét/hydrate nhiều masterOrders trong ngày. Dễ phát sinh fan-out query trước khi vào phần post AR/fund. | Xác nhận kế toán chậm, dễ bị người dùng bấm lại, rủi ro request trùng dù Phase36B đã có guard ngắn. |
| `GET /api/delivery/orders` | `src/engines/delivery.legacy.engine.source/part-02.jsfrag` / `findOrders` | Query master link đã giảm ở Phase36B nhưng vẫn chưa filter inactive mặc định và returnOrders chưa projection. | API app giao hàng gọi thường xuyên; nếu dữ liệu có đơn hủy/xóa hoặc field legacy thì payload và scan còn dư. | Có thể làm App giao hàng chậm; cần giữ nguyên phân quyền NVGH. |
| `GET /api/dashboard/home` | `src/services/dashboard/DashboardCacheService.js`, `public/js/bootstrap/03-tab-loader.js` | Dashboard có khoảng 13 query/lần load. | Phase36B đã có TTL cache 45 giây cho summary. Phase36c phát hiện trang `/` đang kích hoạt tab dashboard ngay sau khi shell render. | Người dùng mở trang chính thấy chậm dù dữ liệu dashboard chưa cần ngay trong tick đầu. |
| `GET /` | `public/js/bootstrap/03-tab-loader.js` | Initial tab load gọi dashboard ngay `setTimeout(..., 0)`. | Shell UI và dashboard-heavy API chạy quá sát nhau, dễ khiến monitor ghi `/` chậm hoặc người dùng thấy màn đầu nặng. | Không sai dữ liệu nhưng ảnh hưởng cảm nhận tốc độ mở phần mềm. |
| `GET /api/stock` | `src/services/inventoryStock.service.js` / `getInventorySummary` | `Product.find({})` | API tồn kho đọc tất cả inventory rồi lại load toàn bộ product document để map tên/quy cách. | Payload lớn, chậm khi danh mục sản phẩm tăng. Không được cache tồn kho realtime dài vì tồn kho là nguồn chuẩn. |
| `GET /api/promotions/programs` | `src/services/promotionService.js`, `src/controllers/promotionController.js`, `public/js/app/admin/08e-promotion-programs.js` | `PromotionProductRule.find({})`, `PromotionGroupItem.find({})`, frontend gọi 3 tab song song. | Backend đã có projection/cache ngắn từ Phase36B, nhưng frontend vẫn gọi 3 request cho 3 tab khi vào màn khuyến mại. | Không sai rule khuyến mại, nhưng tải màn khuyến mại còn chậm và dễ tạo duplicate monitor log. |
| `GET /api/delivery/returns` | `src/engines/delivery.legacy.engine.source/part-02.jsfrag`, `part-03.jsfrag` | `ReturnOrder.find(...)` chưa projection ở một số path. | Khi xem hàng trả theo đơn/NVGH/ngày, returnOrders có thể trả document rộng gồm nhiều field không cần cho UI. | App giao hàng tab Hàng trả chậm nếu số phiếu trả tăng. |
| `POST /` liên quan `ReturnOrder.updateMany` | `src/services/masterReturnOrderService.js` / `createMasterReturnOrder` | `ReturnOrder.updateMany(groupableReturnOrderMongoFilter + {$or: selectedIds})` | Monitor ghi route `POST /`, root cause thật là tạo đơn tổng trả hàng. `updateMany` mang theo filter rộng `$or empty masterReturnOrderId/masterReturnOrderCode`; dù có selected IDs, query planner vẫn có thể tốn chi phí. | Gộp trả hàng chậm; cần giữ atomic claim để tránh một phiếu bị gộp hai lần. |

---

## 3. File đã sửa

| Nhóm | File |
|---|---|
| Confirm accounting P0 | `src/services/master-order/deliveryAccountingCommand.impl.js` |
| Delivery orders/returns P0/P1 | `src/engines/delivery.legacy.engine.source/part-01.jsfrag` |
| Delivery orders/returns P0/P1 | `src/engines/delivery.legacy.engine.source/part-02.jsfrag` |
| Delivery returns P1 | `src/engines/delivery.legacy.engine.source/part-03.jsfrag` |
| Generated delivery bundle | `src/engines/delivery.legacy.engine.js` |
| Source bundle hash | `config/source-bundles.json` |
| Master return P2 | `src/services/masterReturnOrderService.js` |
| Stock P1 | `src/services/inventoryStock.service.js` |
| Promotion P1 backend | `src/services/promotionService.js` |
| Promotion P1 controller | `src/controllers/promotionController.js` |
| Promotion P1 frontend | `public/js/app/admin/08e-promotion-programs.js` |
| Initial `/` shell | `public/js/bootstrap/03-tab-loader.js` |
| Mongo index plan | `src/services/mongoIndexService.js` |
| Test cập nhật | `test/phase36b-delivery-performance-static.test.js` |
| Test mới | `test/phase36c-api-response-p0p1-static.test.js` |

Không sửa module ngoài endpoint có log chậm.

---

## 4. Diff Old/New quan trọng

### 4.1 Confirm accounting: từ full-day master scan sang selected-first

**Old**

```javascript
const masterOrders = await listMasterOrders({ excludeInactive: 1, dateFrom: date, dateTo: date });
const targetMasters = new Map();
const targetChildren = [];

for (const master of masterOrders) {
  const children = Array.isArray(master.children) ? master.children : [];
  const matched = children.filter((child) => {
    if (isInactiveStatus(child)) return false;
    const deliveryDate = dateUtil.toDateOnly(child.deliveryDate || master.deliveryDate || child.date || master.date);
    if (deliveryDate !== date) return false;
    return childKeys(child).some((key) => selectedIdSet.has(key));
  });
}
```

**New**

```javascript
let selectionContext = await buildTargetMasterContextFromSelectedOrders(date, selectedOrderIds);
if (!selectionContext.targetChildren.length) {
  selectionContext = await buildTargetMasterContextByFullDayFallback(date, selectedIdSet);
}
const targetMasters = selectionContext.targetMasters;
const targetChildren = selectionContext.targetChildren;
```

Bổ sung helper:

```javascript
async function buildTargetMasterContextFromSelectedOrders(date, selectedOrderIds = []) {
  const selectedSourceOrders = selectedIdSet.size
    ? await findSalesOrdersByIdentityBatched([...selectedIdSet], ACCOUNTING_CHILD_ORDER_PROJECTION)
    : [];

  const masterRefs = uniqueStrings((selectedSourceOrders || []).flatMap(masterRefsFromChild));
  const masterMatches = await masterOrderRepository.findManyByIdentityMatches(masterRefs, {
    projection: ACCOUNTING_MASTER_PROJECTION
  });
  const childrenMap = await buildMasterChildrenMapFast(masters, { identityBatchSize: 250 });
}
```

Ý nghĩa:

- Ưu tiên đọc đúng salesOrders được tick chọn.
- Chỉ hydrate masterOrders liên quan đến các đơn đó.
- Chỉ fallback full-day scan cho dữ liệu legacy thiếu master link.
- Vẫn giữ duplicate-submit guard Phase36B.

### 4.2 Master return: bỏ `updateMany` rộng, dùng `bulkWrite updateOne` theo phiếu được chọn

**Old**

```javascript
const claimFilter = appendAndClauses(baseClaimFilter, [
  { $or: claimIdentityClauses }
]);
const claimResult = await MongoStore.returnOrders.updateMany(claimFilter, { $set: patch }, { session });
```

**New**

```javascript
const claimOps = children.map((child) => ({
  updateOne: {
    filter: appendAndClauses(baseClaimFilter, [returnOrderIdentityClause(child)]),
    update: { $set: claimPatch }
  }
}));
const claimResult = claimOps.length
  ? await MongoStore.returnOrders.bulkWrite(claimOps, { ordered: true, session })
  : { matchedCount: 0 };
```

Ý nghĩa:

- Vẫn atomic trong transaction.
- Vẫn kiểm `claimedCount !== children.length` để chống race condition.
- Query claim không còn là một `updateMany` rộng dễ bị API Monitor bắt chậm.

### 4.3 `/api/stock`: bỏ `Product.find({})`

**Old**

```javascript
let productQuery = Product.find({})
  .select('id code productCode sku name productName unit baseUnit conversionRate packing packingQty unitsPerCase minStock maxStock');
productsPromise = productQuery.lean();
```

**New**

```javascript
const inventoryRows = await inventoryQuery.lean();
const aliases = inventoryProductAliases(inventoryRows);
let productQuery = Product.find(buildProductLookupFilterByAliases(aliases))
  .select('id code productCode sku name productName unit baseUnit conversionRate packing packingQty unitsPerCase minStock maxStock');
products = await productQuery.lean();
```

Ý nghĩa:

- Products chỉ lookup theo alias sản phẩm đang có trong inventories.
- Giữ tồn kho realtime theo `inventories`.
- Không thêm cache dài cho tồn kho.

### 4.4 Promotions: giảm 3 request tab thành 1 request batch

**Backend mới**

```javascript
async function listPromotionProgramsByType(query = {}) {
  const types = ['productRules', 'groupItems', 'groupRules'];
  const entries = await Promise.all(types.map(async (type) => [type, await listPromotionPrograms({ ...query, type })]));
  return Object.fromEntries(entries);
}
```

**Controller mới**

```javascript
if (req.query?.type === 'all') {
  return res.json({ ok: true, programsByType: await promotionService.listPromotionProgramsByType(req.query) });
}
```

**Frontend mới**

```javascript
params.set('type','all');
const json = await api(`/api/promotions/programs?${params.toString()}`);
const byType = json.programsByType || {};
```

Ý nghĩa:

- Màn khuyến mại chỉ cần một request list ban đầu.
- API contract cũ vẫn giữ: nếu `type=productRules/groupItems/groupRules` thì vẫn trả `{ programs }` như trước.

### 4.5 `/`: trì hoãn dashboard-heavy initial load

**Old**

```javascript
setTimeout(()=>loadTabDataOnce(getActiveTabName()), 0);
```

**New**

```javascript
const initialTabName = getActiveTabName();
const initialTabDelayMs = initialTabName === 'dashboardTab' ? 650 : 0;
setTimeout(()=>loadTabDataOnce(initialTabName), initialTabDelayMs);
```

Ý nghĩa:

- Trang `/` trả shell UI trước.
- Dashboard vẫn tải nếu đang là tab active, nhưng không chen vào tick render đầu.
- Không đổi UI/tab mặc định.

### 4.6 Delivery orders/returns: filter sớm + projection returnOrders

```javascript
if (!truthy(query.includeInactive) && !truthy(query.showInactive)) {
  filter.status = { $nin: ['cancelled', 'canceled', 'void', 'deleted', 'removed', 'duplicate_cancelled'] };
}
```

```javascript
if (query && typeof query.select === 'function') query = query.select(DELIVERY_RETURN_SELECT);
```

Ý nghĩa:

- App giao hàng không kéo đơn hủy/xóa nếu không yêu cầu rõ.
- `ReturnOrder.find` trả field cần cho UI thay vì hydrate document rộng.

---

## 5. Đo trước / sau

Sandbox hiện tại không có MongoDB live và không có dữ liệu Render production, nên **không thể benchmark thời gian thật**. Không ghi số “sau” giả.

| API | Trước từ API Monitor | Sau trong sandbox | Cải thiện | Ghi chú |
|---|---:|---:|---:|---|
| `POST /api/master-orders/delivery-today/confirm-accounting` | 15.013s | Chưa đo live | Chưa tính | Đã đổi flow selected-first, giảm full-day master hydrate. Cần đo lại trên Render API Monitor sau deploy. |
| `GET /api/delivery/orders` | 3.841s | Chưa đo live | Chưa tính | Đã filter inactive sớm, giữ canonical master path, projection/lean. Cần đo lại trên Render. |
| `GET /api/dashboard/home` | 3.381s | Chưa đo live | Chưa tính | Phase36B đã cache summary 45s; Phase36c trì hoãn initial dashboard load từ `/`. Cần đo lại. |
| `GET /` | 1.711s | Chưa đo live | Chưa tính | Initial shell không gọi dashboard ngay tick đầu. Cần đo lại Web Vitals/API Monitor. |
| `GET /api/stock` | 1.047s | Chưa đo live | Chưa tính | Đã bỏ `Product.find({})`, lookup products theo inventory aliases. Cần đo lại. |
| `GET /api/promotions/programs` | 1.213s | Chưa đo live | Chưa tính | Frontend batch `type=all`, backend vẫn projection/lean/cache ngắn. Cần đo lại. |
| `GET /api/delivery/returns` | 1.074s | Chưa đo live | Chưa tính | ReturnOrder projection added. Cần đo lại. |
| `POST /api/master-return-orders` / monitor `POST /` | 1.522s | Chưa đo live | Chưa tính | Đã đổi `updateMany` rộng sang `bulkWrite updateOne`. Cần đo lại. |

---

## 6. Test thực tế đã chạy

| Lệnh | Kết quả |
|---|---|
| `npm run check:syntax` | PASS — `SYNTAX_OK 971 JavaScript files` |
| `node --test test/phase36b-delivery-performance-static.test.js` | PASS — 6/6 |
| `node --test test/phase36c-api-response-p0p1-static.test.js` | PASS — 6/6 |
| `node scripts/build-source-bundles.js --check --target=src/engines/delivery.legacy.engine.js` | PASS — target delivery engine bundle OK |

Ghi chú: không chạy full integration với MongoDB vì sandbox không có MongoDB production/live.

---

## 7. Regression checklist

| Khu vực | Kết luận |
|---|---|
| Bán hàng | Không đổi route bán hàng, không đổi tính tiền đơn bán. |
| Giao hàng | Có sửa read path `/api/delivery/orders`; giữ phân quyền NVGH qua route binding hiện có, không bỏ filter owner. |
| Trả hàng | Có sửa read projection và claim gộp trả hàng; không đổi rule returnOrders là nguồn chuẩn. |
| Đối soát | Không đổi công thức đối soát. |
| Kế toán xác nhận | Có sửa flow chọn đơn; giữ duplicate guard, trạng thái confirmed/reconfirm, post AR/fund/bonus hiện có. |
| Công nợ | Không đổi `arLedgers` SSoT, không post trùng theo logic hiện có. |
| Tồn kho | Không đổi `inventories` SSoT, chỉ giảm Product lookup phụ trợ. |
| Quỹ | Không đổi `fundLedgers` posting. |
| Khuyến mại | Không đổi rule tính khuyến mại; chỉ đổi list admin batch request. |
| Dashboard | Không cache thêm công nợ/tồn kho realtime; chỉ giữ summary cache Phase36B và trì hoãn initial load. |
| App mobile | Không sửa mobile bundle; chỉ sửa backend delivery engine dùng chung. |

---

## 8. Index cần kiểm tra/tạo trên MongoDB Atlas

Đã bổ sung vào `src/services/mongoIndexService.js`. Sau deploy nên chạy:

```bash
npm run mongo:indexes
```

Các nhóm index đáng chú ý:

- `salesOrders`: `deliveryMasterId`, `deliveryMasterCode`, compound delivery date/staff/master link/status.
- `returnOrders`: compound `masterReturnOrderId + masterReturnOrderCode + returnMergeStatus` cho guard gộp trả.
- `products`: `productCode`, `sku`, `id` để `/api/stock` lookup alias nhanh.
- `inventories`: `code`, `sku`, `productId` để đối chiếu alias tồn kho.

Không tự drop index cũ trong Phase36c.

---

## 9. Rủi ro còn lại

1. **Confirm accounting vẫn còn phần post AR/fund/bonus theo từng đơn**  
   Phase36c tối ưu phần chọn/hydrate trước khi post. Chưa bulk sâu toàn bộ `postDeliveryCollectionsAfterAccountingConfirmed`, `postBonusAllowanceAR`, audit log vì đây là khu vực nghiệp vụ kế toán nhạy cảm.

2. **Dashboard/home chưa tách API nhỏ lazy-load theo từng card**  
   Phase36B đã có cache summary 45 giây; Phase36c chỉ giảm tác động initial `/`. Tách dashboard thành nhiều API nhỏ là phương án P1 dài hạn, cần làm riêng để tránh đổi contract màn home.

3. **`/api/stock` vẫn phải đọc inventoryRows realtime**  
   Không cache dài vì tồn kho là nguồn chuẩn. Nếu inventory collection lớn, bước sau nên thêm pagination/filter cho màn tồn kho và API riêng cho dropdown.

4. **Source bundle full check có baseline drift ngoài phạm vi ở mobile canonical source**  
   Phase36c chỉ check target bundle đã sửa: `src/engines/delivery.legacy.engine.js`. Không refresh mobile bundle để tránh thay đổi App Giao Hàng đã chốt.

5. **Cần đo lại trên Render API Monitor sau deploy**  
   Sandbox chỉ kiểm chứng tĩnh/syntax, không có dữ liệu MongoDB live nên chưa có số “sau” thật.

---

## 10. Phương án tiếp theo nếu API Monitor vẫn còn chậm

### Phương án A — Production grade, dài hạn

- Tách dashboard thành các API lazy-load theo card.
- Bulk/idempotent sâu hơn trong confirm accounting: collection/fund/bonus/audit theo batch có guard sourceId/sourceType rõ ràng.
- Tách `/api/stock` thành:
  - `/api/stock/summary`
  - `/api/stock/list?page&limit&q`
  - `/api/stock/options` cho dropdown.

Effort: Hard  
Rủi ro: cao ở kế toán xác nhận, cần test regression công nợ/quỹ/return kỹ.

### Phương án B — Cân bằng effort

- Deploy Phase36c, chạy `npm run mongo:indexes`.
- Theo dõi API Monitor 1–2 ngày.
- Chỉ vá tiếp endpoint vẫn > mục tiêu, ưu tiên confirm-accounting nếu còn > 3s.

Effort: Medium  
Rủi ro: thấp hơn, phù hợp vận hành hiện tại của NPP.

---

## 11. Kết luận

Phase36c đã xử lý đúng các query rộng/log chậm thực tế:

- `confirm-accounting`: selected-first, giảm full-day master hydrate.
- `delivery/orders`: filter inactive sớm, giữ projection/lean/canonical master link.
- `delivery/returns`: projection returnOrders.
- `/api/stock`: bỏ `Product.find({})`.
- `promotions/programs`: batch `type=all`, giảm request frontend lặp.
- `/`: trì hoãn dashboard-heavy load.
- `master return`: bỏ `ReturnOrder.updateMany` rộng, chuyển sang `bulkWrite updateOne` theo phiếu chọn.

Cần đo lại trên Render API Monitor sau deploy để xác nhận mục tiêu thời gian thật.
