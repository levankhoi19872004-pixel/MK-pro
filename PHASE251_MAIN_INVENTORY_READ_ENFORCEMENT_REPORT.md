# PHASE251 — MAIN INVENTORY READ ENFORCEMENT REPORT

**Baseline:** artifact Phase250B  
**Ngày thực hiện:** 12/07/2026  
**Mục tiêu duy nhất:** mọi operational inventory read đang hoạt động chỉ tính `warehouseCode: MAIN`.  
**Không migration, không xóa warehouse legacy, không sửa inventory writer hoặc stockTransactions.**

## 1. Kết luận

Canonical inventory read đã được khóa bằng một predicate dùng chung:

```js
mainInventoryFilter(existingFilter)
// => { ...existingFilter, warehouseCode: 'MAIN' }
```

Fixture bắt buộc:

```text
P001 MAIN    = 100
P001 HC      = 50
P001 PC      = 20
P001 missing = 10
```

Kết quả tất cả canonical read được test:

```text
100
```

không phải `180`.

Không có fallback ngầm coi warehouse trống là MAIN.

## 2. Canonical policy mới

### `src/domain/inventory/mainInventoryReadPolicy.js`

- `mainWarehouseCode()` — chuẩn hóa warehouse canonical từ business constant, mặc định `MAIN`.
- `mainInventoryFilter(filter)` — giữ filter hiện có nhưng cưỡng chế exact `warehouseCode: MAIN`.
- `isMainWarehouseRow(row)` — chỉ true với mã warehouse exact sau normalize; blank/missing/HC/PC đều false.

Policy không sửa document và không chứa write operation.

## 3. Path đã sửa

| Path | File/hàm | Sửa |
|---|---|---|
| Available stock | `src/services/inventoryStock.service.js#getAvailableStocks()` khoảng dòng 115–155 | Query thêm canonical MAIN predicate, projection và `.lean()`. |
| Inventory summary | `inventoryStock.service.js#getInventorySummary()` khoảng dòng 166–265 | `find(mainInventoryFilter())`; không load/gộp toàn collection đa warehouse. |
| Legacy operational current stock | `inventoryService.source/part-02.jsfrag#getCurrentStock()` khoảng dòng 177 | Khởi tạo filter bằng `mainInventoryFilter()`. |
| Generated runtime tương ứng | `src/services/inventoryService.js` | Runtime generated path dùng exact MAIN filter trước `InventoryLegacy.find()`. |
| Reconciliation inventory side | `src/domain/reconciliation/ReconciliationService.js` khoảng dòng 77 | Aggregate bắt đầu bằng `$match: mainInventoryFilter()`. |
| Analytics/report projection | `src/services/analytics/ProjectionService.js` khoảng dòng 99 | Aggregate bắt đầu bằng exact MAIN match; bỏ fallback missing warehouse thành MAIN. |
| Source-bundle registry | `config/source-bundles.json` | Cập nhật source hash cho inventoryService source fragments. |

## 4. Path đúng sẵn hoặc được hưởng canonical service

| Path | Trạng thái |
|---|---|
| `inventoryService#getSnapshot` | Đã có `warehouseCode: MAIN`. |
| Bulk stock validation trong inventory service | Đã có MAIN predicate/normalize. |
| Product availability | Dùng `inventoryStockService.getAvailableStocks()` nên nhận MAIN-only. |
| Mobile product list | Dùng cùng `inventoryStockService`. |
| Sales-order stock validation | `checkAvailableForItems()` dùng `getAvailableStocks()` MAIN-only. |
| Current inventory report/export | Dùng `getInventorySummary()` MAIN-only. |
| Search/import validation callers | Tiếp tục gọi canonical availability helper. |

## 5. Path legacy/exempt có chủ đích

| Path | Lý do không sửa |
|---|---|
| Inventory normalize/rebuild writers đọc nhiều warehouse | Đây là writer/maintenance flow cần nhìn legacy rows để normalize; ngoài phạm vi read-only enforcement. |
| Warehouse stock count/warehouse-specific command | Caller truyền warehouse cụ thể cho nghiệp vụ quản trị kho; không phải operational MAIN read tổng hợp. |
| `stockTransactions` | SSoT movement history; phase cấm thay đổi. |
| Legacy warehouse documents | Không migration, không update/delete/archive trong Phase251. |

Không path operational nào được phép gắn output `MAIN` sau khi đã cộng HC/PC/missing rows.

## 6. Test evidence

### Lệnh

```bash
npm run check:syntax
npm run test:phase250b
npm run test:phase251
node --test test/phase250a-inventory-main-verification.test.js
npm run audit:inventory-warehouse-distribution
```

### Kết quả thực tế

| Gate | Kết quả |
|---|---|
| JavaScript syntax | PASS — 1.465 files |
| Phase250B regression | PASS — 17/17 |
| Phase251 suite | PASS — 13/13 |
| Phase250A Track B remediated checks | PASS — 2/2 |
| Read-only audit không URI | PASS safe-skip; không thử kết nối DB |

Test hành vi dùng fake query/model với bốn rows 100/50/20/10 và gọi trực tiếp:

- `getAvailableStocks()` → 100.
- `getInventorySummary()` → 100.
- `checkAvailableForItems()` → đủ ở 100, thiếu 1 ở 101.
- `getCurrentStock()` source function → 100.
- Reconciliation/projection pipeline bắt đầu bằng exact MAIN match.

## 7. Production audit read-only

Script từ Phase250A được giữ nguyên:

```bash
npm run audit:inventory-warehouse-distribution
```

Không có URI:

```text
INVENTORY_WAREHOUSE_AUDIT_SKIPPED_NO_URI
No database connection was attempted.
```

Với Mongo user chỉ có quyền `read`, script thống kê:

- warehouseCode;
- document count;
- total onHand/available;
- product xuất hiện nhiều warehouse;
- rows thiếu warehouseCode.

Phase251 chưa xác minh dữ liệu production vì không có URI read-only an toàn.

## 8. Source-bundle limitation

`inventoryService.js` là generated source bundle. Source fragments đã được sửa và registry source hash đã cập nhật. Tuy nhiên môi trường artifact không có dependency `terser`, nên:

```bash
npm run check:source-bundles
```

fail trước khi build/check với:

```text
Cannot find module 'terser'
```

Để giữ runtime đồng bộ trong ZIP, generated `inventoryService.js` được cập nhật tương đương tại đúng hàm `getCurrentStock`, và `node --check` pass. Trước deploy production nên chạy lại trong môi trường đã `npm ci`:

```bash
npm run build:source-bundles
npm run check:source-bundles
```

Đây là giới hạn môi trường build, không phải test nghiệp vụ MAIN bị fail.

## 9. Phạm vi không sửa

- Không thay đổi posting/reverse/idempotency.
- Không rebuild tồn.
- Không sửa stockTransactions.
- Không xóa hoặc remap legacy warehouse rows.
- Không sửa AR/Fund/Delivery/accounting.
- Không kết nối production.

## 10. Rủi ro còn lại

| Rủi ro | Mức | Biện pháp |
|---|---|---|
| Production đang có quantity hợp lệ chỉ nằm ở blank/legacy warehouse | High về dữ liệu, nhưng không được fallback | Chạy audit distribution và đối chiếu movement trước deploy. Migration phải là phase riêng. |
| Direct read mới phát sinh sau Phase251 không dùng policy | Medium | Thêm architecture/static guard ở phase sau nếu cần. |
| Source bundle chưa rebuild bằng terser trong workspace hiện tại | Medium | Chạy `npm ci`, build/check source bundles trong CI/release environment. |

## 11. Integrity

So với đầu Phase251:

- File mới: canonical MAIN policy + behavioral test + report.
- File writer inventory sửa: 0.
- `stockTransactions` sửa: 0.
- File bị xóa: 0.
- Migration/data write: 0.
