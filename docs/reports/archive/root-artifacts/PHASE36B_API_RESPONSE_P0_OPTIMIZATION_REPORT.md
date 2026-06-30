# PHASE36B — API Response P0 Optimization Report

Baseline: `MK-pro-phase35-header-branding-ui-patched.zip`  
Output: `MK-pro-phase36b-api-response-p0-optimization-patched.zip`  
Ngày thực hiện: 2026-06-22

## 1. Tổng quan dự án

| Hạng mục | Ghi nhận |
|---|---|
| Kiến trúc | Node.js + Express monolith, MongoDB/Mongoose, frontend JS truyền thống, source bundle cho một số file lớn |
| Module liên quan Phase36B | App giao hàng, đơn tổng giao hôm nay, dashboard home, khuyến mại, Mongo index service |
| Quy mô mã nguồn | Khoảng 1.000+ file source/runtime JS/CSS/HTML/JSON, có cơ chế generated source bundle |
| Nguyên tắc giữ nguyên | Không đổi business rule, không đổi API contract, không đổi schema nghiệp vụ, không bỏ dữ liệu để làm nhanh |

## 2. Phạm vi xử lý

Chỉ xử lý 5 endpoint có log chậm thực tế từ API Monitor:

1. `GET /api/delivery/orders`
2. `POST /api/master-orders/delivery-today/confirm-accounting`
3. `GET /api/dashboard/home`
4. `GET /api/promotions/programs`
5. `GET /api/delivery/returns`

Không tối ưu lan rộng sang tồn kho, công nợ, quỹ, import/export hoặc nghiệp vụ bán hàng ngoài các điểm nóng trên.

---

## 3. Root cause theo từng API

| API | File / hàm | Query chậm | Root cause |
|---|---|---|---|
| `GET /api/delivery/orders` | `src/engines/delivery.legacy.engine.source/part-01.jsfrag` → `masterAssignmentMongoClause`; `part-02.jsfrag` → `findOrders` | `SalesOrder.find({ $and: [{ $or: [{ masterOrderId: { $exists, $nin } }, ...] }] })` | Query kiểm tra liên kết đơn tổng bằng nhiều alias legacy với `$exists + $nin`, dễ làm Mongo scan rộng, dù API giao hàng thường đã có `deliveryDate/NVGH/status`. |
| `POST /api/master-orders/delivery-today/confirm-accounting` | `src/services/master-order/deliveryAccountingCommand.impl.js`; `src/repositories/orderRepository.js` | `SalesOrder.find({ id: { $in: [...] } })` và fallback identity rộng | Backend nạp SalesOrder gốc bằng nhiều identity từ `master.children`, trong đó có nhiều key không cần thiết; frontend chưa khóa submit nên có thể double click/call lặp gần nhau. |
| `GET /api/dashboard/home` | `src/services/dashboard/HomeDashboardService.js`; `DashboardCacheService.js`; `DeliveryDashboardQuery.js` | Nhiều aggregate/find mỗi lần load, khoảng 13 query | Cache dashboard mặc định tắt; `freshnessVersion()` nếu bật có thể tự tạo 7 query kiểm tra version; delivery month filter luôn bọc `$or` kể cả khi toàn bộ refs là `SO...`. |
| `GET /api/promotions/programs` | `src/services/promotionService.js`; `public/js/app/admin/08e-promotion-programs.js` | `PromotionProductRule.find({})`, `PromotionGroupItem.find({})` | Backend có cache chương trình nhưng các list rule chưa có projection; frontend có thể gọi lặp cùng request và search input không debounce. |
| `GET /api/delivery/returns` | `src/engines/delivery.legacy.engine.source/part-01.jsfrag`, `part-02.jsfrag`, `part-03.jsfrag` | `SalesOrder.findOne({ $or: [{ id }, { code }, { orderCode }, ...] })` | Khi app truyền mã `SO...`, backend vẫn dùng `$or` nhiều field thay vì tra trực tiếp field `id` đã có index trước. |

---

## 4. Thay đổi chính đã thực hiện

### 4.1. `GET /api/delivery/orders`

**File sửa:**

- `src/engines/delivery.legacy.engine.source/part-01.jsfrag`
- `src/engines/delivery.legacy.engine.source/part-02.jsfrag`
- `src/engines/delivery.legacy.engine.js` — generated runtime đã refresh
- `config/source-bundles.json` — cập nhật hash source bundle tương ứng
- `src/services/mongoIndexService.js`

**Cách sửa:**

- Tách điều kiện liên kết đơn tổng thành:
  - canonical: `masterOrderId`, `masterOrderCode`
  - legacy fallback: `masterOrderNo`, `deliveryMasterId`, `deliveryMasterCode`
- Bỏ query `$exists + $nin` ở path chính; dùng `{ $type: 'string', $gt: '' }`.
- `findOrders()` chạy canonical trước, legacy chỉ chạy khi canonical không có kết quả và vẫn được scope bởi `deliveryDate/NVGH/status/keyword`.
- Giữ `.select(DELIVERY_ORDER_SELECT)`, `.lean()`, `.limit()` sẵn có.
- Bổ sung index compound phục vụ path mới:
  - `idx_orders_delivery_staff_master_id_status`
  - `idx_orders_delivery_staff_master_code_status`

**Diff quan trọng:**

```diff
- function masterAssignmentMongoClause() {
-   return { $or: [
-     { masterOrderId: { $exists: true, $nin: [null, ''] } },
-     { masterOrderCode: { $exists: true, $nin: [null, ''] } },
-     { masterOrderNo: { $exists: true, $nin: [null, ''] } },
-     { deliveryMasterId: { $exists: true, $nin: [null, ''] } },
-     { deliveryMasterCode: { $exists: true, $nin: [null, ''] } }
-   ] };
- }
+ function canonicalMasterAssignmentMongoClause() {
+   return { $or: [nonEmptyStringClause('masterOrderId'), nonEmptyStringClause('masterOrderCode')] };
+ }
+ function legacyMasterAssignmentMongoClause() {
+   return { $or: [
+     nonEmptyStringClause('masterOrderNo'),
+     nonEmptyStringClause('deliveryMasterId'),
+     nonEmptyStringClause('deliveryMasterCode')
+   ] };
+ }
```

---

### 4.2. `POST /api/master-orders/delivery-today/confirm-accounting`

**File sửa:**

- `src/services/master-order/deliveryAccountingCommand.impl.js`
- `src/repositories/orderRepository.js`
- `public/js/delivery/delivery-web-view.source/part-01.jsfrag`
- `public/js/delivery/delivery-web-view.source/part-03.jsfrag`
- `public/js/delivery/delivery-web-view.js` — generated runtime đã refresh
- `.env.example`
- `.env.production.example`

**Cách sửa:**

- Backend thêm short in-memory duplicate-submit guard theo `(date + orderIds + confirmedBy)`, mặc định `8000ms`.
- Deduplicate `orderIds` ngay khi nhận request.
- Thêm `orderRepository.findManyByIds()` để query trực tiếp `{ id: { $in } }` khi key là mã `SO...`.
- Chỉ fallback `findManyByIdentity()` cho các key còn thiếu, có projection hẹp.
- Frontend web delivery thêm `accountingSubmitting` lock, disable nút xác nhận trong khi API đang chạy.

**Diff quan trọng:**

```diff
+ const CONFIRM_ACCOUNTING_GUARD_TTL_MS = Math.max(1000, Number(process.env.CONFIRM_ACCOUNTING_GUARD_TTL_MS || 8000));
+ const confirmAccountingInFlight = new Map();
+ const ACCOUNTING_SALES_ORDER_PROJECTION = [
+   'id', 'code', 'documentCode', 'invoiceCode', 'orderCode', 'salesOrderId', 'salesOrderCode',
+   'salesStaffCode', 'salesStaffName', 'salesmanCode', 'salesmanName',
+   'deliveryStaffCode', 'deliveryStaffName', 'masterOrderId', 'masterOrderCode', 'updatedAt'
+ ].join(' ');
```

```diff
- const sourceSalesOrders = selectedOrderKeys.length
-   ? await orderRepository.findManyByIdentity(selectedOrderKeys)
-   : [];
+ const sourceSalesOrdersById = selectedSalesOrderIds.length
+   ? await orderRepository.findManyByIds(selectedSalesOrderIds, {
+     projection: ACCOUNTING_SALES_ORDER_PROJECTION,
+     limit: Math.max(selectedSalesOrderIds.length, 1)
+   })
+   : [];
```

```diff
+ async function withAccountingSubmitLock(work) {
+   if (state.accountingSubmitting) {
+     message('Đang xác nhận kế toán, vui lòng không bấm lặp.');
+     return null;
+   }
+   setAccountingSubmitting(true);
+   try { return await work(); }
+   finally { setAccountingSubmitting(false); }
+ }
```

---

### 4.3. `GET /api/dashboard/home`

**File sửa:**

- `src/services/dashboard/DashboardCacheService.js`
- `src/services/dashboard/DeliveryDashboardQuery.js`
- `.env.example`
- `.env.production.example`

**Cách sửa:**

- Bật short TTL cache cho dashboard summary mặc định `45000ms`.
- Không dùng cache cho API công nợ/tồn kho chi tiết; chỉ cache response tổng quan dashboard home.
- Mặc định freshness version là `ttl-only`, tránh phát sinh thêm 7 query version mỗi lần load.
- Nếu cần kiểm tra version nghiêm ngặt có thể bật `HOME_DASHBOARD_CACHE_STRICT_FRESHNESS=true`.
- `DeliveryDashboardQuery.childOrderFilter()` trả `{ id: { $in: [...] } }` trực tiếp khi toàn bộ reference là mã `SO...`, không bọc `$or` dư thừa.

**Diff quan trọng:**

```diff
- const CACHE_TTL_MS = Math.max(0, Number(process.env.HOME_DASHBOARD_CACHE_TTL_MS || 0));
+ const CACHE_TTL_MS = Math.max(0, Number(process.env.HOME_DASHBOARD_CACHE_TTL_MS === undefined
+   ? 45000
+   : process.env.HOME_DASHBOARD_CACHE_TTL_MS));
+ const STRICT_FRESHNESS = String(process.env.HOME_DASHBOARD_CACHE_STRICT_FRESHNESS || 'false').toLowerCase() === 'true';
```

```diff
+ if (!STRICT_FRESHNESS) return 'ttl-only';
```

```diff
+ if (salesOrderIds.length && !otherValues.length) return { id: { $in: salesOrderIds } };
```

---

### 4.4. `GET /api/promotions/programs`

**File sửa:**

- `src/services/promotionService.js`
- `public/js/app/admin/08e-promotion-programs.js`
- `src/services/mongoIndexService.js`
- `.env.example`
- `.env.production.example`

**Cách sửa:**

- Tách projection constants cho product rules, group items, group rules và program list.
- `.find(filter)` của promotion rules/items đã có `.select(...).lean()`.
- Frontend deduplicate request đang in-flight theo `type + query params`.
- Search input debounce `250ms`, giảm request lặp khi gõ.
- Cache chương trình giữ TTL ngắn mặc định `30000ms`, đã có clear khi create/update/delete.
- Bổ sung index chính xác cho promotion program/rule lookups.

**Diff quan trọng:**

```diff
+ const PROMOTION_PROGRAM_LIST_PROJECTION = 'id code programCode groupCode programName name content programContent description productCode startDate endDate isActive source';
```

```diff
- return PromotionProductRule.find(filter).sort({ programCode: 1, productCode: 1 }).lean();
+ return PromotionProductRule.find(filter).select(PROMOTION_PRODUCT_RULE_PROJECTION).sort({ programCode: 1, productCode: 1 }).lean();
```

```diff
+ const programListRequests = new Map();
+ if(programListRequests.has(requestKey)) return programListRequests.get(requestKey);
+ promotionProgramSearchTimer=setTimeout(()=>loadPromotionProgramsByType(activeType),250);
```

---

### 4.5. `GET /api/delivery/returns`

**File sửa:**

- `src/engines/delivery.legacy.engine.source/part-01.jsfrag`
- `src/engines/delivery.legacy.engine.source/part-02.jsfrag`
- `src/engines/delivery.legacy.engine.js` — generated runtime đã refresh
- `src/services/mongoIndexService.js`

**Cách sửa:**

- Thêm helper `directOrderLookupCandidates()`.
- Khi key có dạng `SO...`, lookup trực tiếp `id` trước, sau đó mới fallback alias.
- `getCanonicalOrderByKey()` và `saveReturn()` dùng `resolveSalesOrderByKnownCode()`.
- Query đọc có projection `DELIVERY_ORDER_SELECT` và `.lean()`.
- Bổ sung index fallback `orderCode`, `salesOrderCode`.

**Diff quan trọng:**

```diff
+ if (/^SO[0-9A-Z_-]+$/i.test(key)) {
+   push({ id: key });
+   push({ code: key });
+   push({ orderCode: key });
+   push({ salesOrderId: key });
+   push({ salesOrderCode: key });
+   return candidates;
+ }
```

```diff
- const lookup = buildOrderLookup(key);
- let query = this.SalesOrder.findOne(lookup);
+ const order = await this.resolveSalesOrderByKnownCode(key, options);
```

---

## 5. File đã sửa / thêm

| Loại | File |
|---|---|
| Sửa | `.env.example` |
| Sửa | `.env.production.example` |
| Sửa | `config/source-bundles.json` |
| Sửa | `src/engines/delivery.legacy.engine.source/part-01.jsfrag` |
| Sửa | `src/engines/delivery.legacy.engine.source/part-02.jsfrag` |
| Sửa | `src/engines/delivery.legacy.engine.js` |
| Sửa | `src/repositories/orderRepository.js` |
| Sửa | `src/services/master-order/deliveryAccountingCommand.impl.js` |
| Sửa | `src/services/dashboard/DashboardCacheService.js` |
| Sửa | `src/services/dashboard/DeliveryDashboardQuery.js` |
| Sửa | `src/services/promotionService.js` |
| Sửa | `src/services/mongoIndexService.js` |
| Sửa | `public/js/app/admin/08e-promotion-programs.js` |
| Sửa | `public/js/delivery/delivery-web-view.source/part-01.jsfrag` |
| Sửa | `public/js/delivery/delivery-web-view.source/part-03.jsfrag` |
| Sửa | `public/js/delivery/delivery-web-view.js` |
| Thêm | `test/phase36b-delivery-performance-static.test.js` |

---

## 6. Đo trước / sau

Không có MongoDB live/Render API Monitor trong sandbox, nên **không ghi số cải thiện giả**. Bảng dưới dùng số “Trước” từ log thực tế bạn cung cấp; cột “Sau” là trạng thái kiểm chứng tĩnh và cần đo lại sau deploy.

| API | Trước | Sau | Cải thiện | Ghi chú |
|---|---:|---:|---:|---|
| `GET /api/delivery/orders` | 1.397s–3.215s | Chưa đo live | Chưa kết luận % | Path chính không còn query rộng `$exists + $nin`; có projection/lean/limit; cần đo Render. |
| `POST /api/master-orders/delivery-today/confirm-accounting` | 4.244s–4.296s | Chưa đo live | Chưa kết luận % | Có chống duplicate submit 8s; SalesOrder source load ưu tiên `{ id: { $in } }`; cần đo với cùng số đơn. |
| `GET /api/dashboard/home` | 2.884s–3.381s | Chưa đo live | Chưa kết luận % | Request đầu vẫn phải aggregate; request lặp trong 45s sẽ cache hit, tránh 10+ query. |
| `GET /api/promotions/programs` | 1.060s–1.213s | Chưa đo live | Chưa kết luận % | Có backend projection/cache, frontend dedupe/debounce; cần đo tab khuyến mại sau deploy. |
| `GET /api/delivery/returns` | 1.074s | Chưa đo live | Chưa kết luận % | Mã `SO...` lookup trực tiếp theo `id` trước; fallback `$or` chỉ khi cần. |

### Cách đo lại trên Render

1. Deploy ZIP/commit mới.
2. Chạy đảm bảo index MongoDB:

```bash
npm run mongo:indexes
```

3. Mở lại API Monitor và thao tác đúng màn hình đã sinh log chậm.
4. Ghi lại cùng 5 API trên sau deploy, đặc biệt:
   - `/api/delivery/orders` theo cùng NVGH/ngày.
   - `/api/master-orders/delivery-today/confirm-accounting` với cùng số đơn tick chọn.
   - `/api/dashboard/home` request đầu và request lặp trong 45 giây.
   - `/api/promotions/programs` khi mở tab và khi gõ search.
   - `/api/delivery/returns?salesOrderId=SO...`.

---

## 7. Test thực tế

| Lệnh | Kết quả |
|---|---|
| `npm run check:syntax` | PASS — `SYNTAX_OK 970 JavaScript files` |
| `node --test test/phase36b-delivery-performance-static.test.js` | PASS — 6/6 tests |
| `npm run check:source-bundles -- --target=src/engines/delivery.legacy.engine.js` | PASS |
| `npm run check:source-bundles -- --target=public/js/delivery/delivery-web-view.js` | PASS |

Ghi chú minh bạch:

- Sandbox không có MongoDB live nên chưa chạy benchmark API thật.
- Có thử `node --test test/home-dashboard.test.js`; file này có các case UI/static baseline đang fail do `index.html` hiện là placeholder và assertion cũ, không dùng làm gate Phase36B. Không sửa lan rộng test này để tránh vượt phạm vi.
- Có thử `npm run check:source-bundles` full; baseline đang có mismatch sẵn ở `public/mobile/js/delivery-mobile-view.js`, không thuộc file Phase36B. Hai bundle Phase36B sửa đều check pass theo target.

---

## 8. Regression checklist

| Khu vực | Trạng thái | Ghi chú |
|---|---|---|
| Bán hàng | Không đổi business rule | Không sửa flow tạo/sửa đơn bán. |
| Giao hàng | Đã kiểm soát | Chỉ tối ưu query list orders/returns và lock nút kế toán. |
| Trả hàng | Không đổi SSoT | Vẫn dùng `returnOrders`; chỉ tối ưu lookup SalesOrder khi cần canonical order. |
| Đối soát | Không đổi | Không sửa rule đối soát. |
| Kế toán xác nhận | Đã kiểm soát | Guard chống submit lặp; không post lại công nợ/quỹ khi request trùng gần nhau. |
| Công nợ | Không đổi SSoT | Không sửa `arLedgers` rule; confirm vẫn qua posting hiện hữu. |
| Tồn kho | Không đổi | Không chạm `inventories` / stock posting. |
| Khuyến mại | Đã kiểm soát | Chỉ projection/cache/dedupe list; không đổi rule tính khuyến mại bán hàng. |
| Dashboard | Đã kiểm soát | Cache ngắn chỉ cho summary home; không dùng cho tồn kho/công nợ realtime chi tiết. |
| App mobile | Không sửa mobile app | Chỉ sửa web delivery view và backend dùng chung. |

---

## 9. Rủi ro còn lại

| Rủi ro | Mức | Khuyến nghị |
|---|---|---|
| Chưa có số “Sau” live | Medium | Bắt buộc đo lại trên Render API Monitor sau deploy. |
| Index mới chưa được tạo trên MongoDB Atlas | Medium | Chạy `npm run mongo:indexes`, sau đó kiểm tra tab Indexes trong Atlas. |
| Dashboard cache 45s có thể làm số tổng quan chậm cập nhật tối đa 45 giây | Low/Medium | Phù hợp summary; nếu muốn realtime tuyệt đối, đặt `HOME_DASHBOARD_CACHE_TTL_MS=0`. |
| Dashboard strict freshness tắt mặc định | Low | Nếu muốn cache tự invalid theo latest updatedAt, bật `HOME_DASHBOARD_CACHE_STRICT_FRESHNESS=true`, nhưng sẽ thêm query version. |
| Confirm-accounting guard là in-memory | Low | Phù hợp 1 Render web instance. Nếu scale nhiều instance, cần idempotency persistent bằng Mongo. |
| Legacy fallback delivery/orders vẫn tồn tại | Low | Cần giữ để không mất đơn cũ dùng alias; đã scope bởi date/NVGH/status nên không còn path rộng chính. |

---

## 10. Kết luận

Phase36B đã hoàn thành theo hướng P0 an toàn:

- Không còn path chính dễ thấy của `/api/delivery/orders` dùng `$or + $exists + $nin` rộng.
- Query đọc chính đã giữ/áp dụng projection + `.lean()`.
- `/api/delivery/returns` đã lookup `SO...` trực tiếp theo `id` trước.
- Confirm-accounting có frontend lock và backend guard chống gọi lặp gần nhau.
- Dashboard home có cache summary ngắn 45s và giảm query freshness fan-out mặc định.
- Khuyến mại có projection, cache, frontend dedupe/debounce.
- Syntax và test Phase36B pass.

Việc cần làm tiếp sau deploy: đo lại đúng 5 API bằng Render API Monitor và xác nhận index đã tạo trên MongoDB Atlas.
