# PHASE34 — MASTER ORDER CURRENT PICKING GROUP REPORT

## 1. Kết luận

Đã sửa lỗi sản phẩm đổi khu bốc trong danh mục `products` nhưng đơn tổng/phiếu bốc vẫn hiển thị theo HC/PC cũ.

Nguyên tắc mới:

```text
Gộp dòng đơn tổng → hydrate khu bốc hiện tại từ products → tách HC/PC → sort ABC → render/in/xuất
```

Không migration dữ liệu cũ, không tạo schema/collection mới, không đổi số lượng/giá/thành tiền.

---

## 2. Khảo sát hệ thống

### File đã kiểm tra

| File | Vai trò |
|---|---|
| `src/models/Product.js` | Xác nhận field chuẩn khu bốc là `pickingZone`; legacy fields: `warehouseCode`, `printGroup` |
| `src/utils/pickingZone.util.js` | Chuẩn hóa HC/PC, `pickingZoneFrom`, `legacyPrintGroupCode` |
| `src/domain/print/PrintReadService.js` | Load `products` hiện tại vào `productMap` khi in master/import/master-return |
| `src/domain/print/PrintLineNormalizer.js` | Chuẩn hóa dòng in, trước đây ưu tiên snapshot item trước catalog |
| `src/domain/print/builders/MasterPickingBuilder.js` | Build phiếu bốc đơn tổng bán/giao |
| `src/domain/print/builders/ReturnPickingBuilder.js` | Build đơn tổng trả hàng |
| `src/domain/print/builders/ImportPickingBuilder.js` | Build phiếu nhập/đơn tổng nhập kho |
| `src/services/master-order/masterOrderPrintLegacy.impl.js` | Luồng legacy build aggregate master print |
| `src/services/excel/ExcelInteractionService.js` | Xuất Excel đơn tổng/nhập kho |
| `templates/printTemplates.js` | Render theo `warehouseGroups`, nhận dữ liệu đã chuẩn hóa từ document |

### Field HC/PC thực tế

Field chuẩn trong `products`:

```js
pickingZone
```

Các field legacy vẫn đọc fallback:

```js
warehouseCode
warehouseName
printGroup
printGroupName
```

---

## 3. Nguyên nhân gốc

Nguyên nhân chính:

- Dòng đơn con/master cũ có thể đã copy `pickingZone`, `warehouseCode`, `printGroup` tại thời điểm tạo/import đơn.
- Khi sản phẩm trong danh mục đổi từ HC sang PC, dữ liệu snapshot trong `salesOrders.items` hoặc master print input không tự đổi.
- `PrintLineNormalizer.pickingZoneOf()` trước đây ưu tiên `item` trước `product`, nên snapshot cũ thắng catalog hiện tại.

Cơ chế cũ:

```js
pickingZoneFrom(item, item.productSnapshot, item.product, parent, product)
```

Cơ chế mới cho đơn tổng/phiếu bốc:

```js
getCurrentPickingZone(item, product, 'HC')
```

Trong đó `product.pickingZone` là nguồn ưu tiên số 1.

---

## 4. Thiết kế luồng chuẩn

```text
salesOrders / returnOrders / importOrders items
        ↓
Product map từ collection products hiện tại
        ↓
normalizeLine(..., currentProductPickingZone: true)
        ↓
getCurrentPickingZone(item, product)
        ↓
mergeLines theo warehouseCode + lineType + productCode + price
        ↓
tách HC/PC
        ↓
sort ABC tên sản phẩm trong từng nhóm
        ↓
render / print / export Excel
```

Nếu không tìm thấy sản phẩm trong catalog:

```text
fallback về snapshot trên item để vẫn in/xuất được chứng từ cũ
```

---

## 5. File thêm mới

### `src/utils/productHydration.js`

Thêm utility dùng chung:

- `getCurrentPickingZone(item, product)`
- `applyCurrentProductPickingZone(item, product)`
- `hydrateProductsByCode(items)`
- `getCurrentPickingZoneSource(item, product)`

Quy tắc ưu tiên:

```text
products.pickingZone → item snapshot → default HC
```

### `test/master-order-current-picking-group.test.js`

Thêm test chứng minh:

- Stale HC được chuyển sang PC theo catalog.
- Stale PC được chuyển về HC theo catalog.
- Không tìm thấy product thì fallback snapshot.
- Master/Return/Import picking đều dùng current product picking zone.
- Sort ABC Phase33 vẫn giữ đúng sau hydrate.

---

## 6. File đã sửa

| File | Nội dung sửa |
|---|---|
| `src/domain/print/PrintLineNormalizer.js` | Thêm chế độ `currentProductPickingZone` để ưu tiên `products.pickingZone` |
| `src/domain/print/builders/MasterPickingBuilder.js` | Dùng `currentProductPickingZone: true` khi build master picking |
| `src/domain/print/builders/ReturnPickingBuilder.js` | Dùng `currentProductPickingZone: true` cho master return |
| `src/domain/print/builders/ImportPickingBuilder.js` | Dùng `currentProductPickingZone: true` cho import picking |
| `src/services/master-order/masterOrderPrintLegacy.impl.js` | Legacy aggregate print cũng hydrate HC/PC từ catalog hiện tại |
| `src/services/excel/ExcelInteractionService.js` | Xuất Excel đơn tổng/nhập kho có cột `Khu bốc` lấy theo products hiện tại |

---

## 7. Diff Old/New quan trọng

### 7.1. PrintLineNormalizer — đổi cơ chế lấy HC/PC

Old:

```js
function pickingZoneOf(item = {}, parent = {}, product = {}) {
  return normalizePickingZone(
    pickingZoneFrom(item, item.productSnapshot, item.product, parent, product),
    PICKING_ZONES.HC
  );
}
```

New:

```js
function pickingZoneOf(item = {}, parent = {}, product = {}, options = {}) {
  if (options.currentProductPickingZone || options.pickingZonePolicy === 'CURRENT_PRODUCT') {
    return getCurrentPickingZone(item, product, PICKING_ZONES.HC);
  }
  return normalizePickingZone(
    pickingZoneFrom(item, item.productSnapshot, item.product, parent, product),
    PICKING_ZONES.HC
  );
}
```

Lý do:

- Không phá đơn con hoặc luồng in khác.
- Chỉ các builder đơn tổng/phiếu bốc bật `currentProductPickingZone`.

---

### 7.2. MasterPickingBuilder — bật catalog-first HC/PC

Old:

```js
...normalizeLine(item, { parent: child, product, mode: 'sale' })
```

New:

```js
...normalizeLine(item, {
  parent: child,
  product,
  mode: 'sale',
  currentProductPickingZone: true
})
```

Lý do:

- Đơn tổng bán/giao phải lấy HC/PC hiện tại từ danh mục sản phẩm.

---

### 7.3. Legacy aggregate print — không dùng snapshot cũ làm quyết định cuối

Old:

```js
const pickingZone = normalizePickingZone(pickingZoneFrom(item, product), PICKING_ZONES.HC);
```

New:

```js
const pickingZone = getCurrentPickingZone(item, product, PICKING_ZONES.HC);
```

Lý do:

- Bảo toàn cả luồng legacy nếu còn route cũ gọi aggregate print.

---

### 7.4. ExcelInteractionService — xuất Excel có Khu bốc hiện tại

New:

```js
function currentPickingZoneLabel(item = {}, product = {}) {
  return pickingZoneLabel(getCurrentPickingZone(item, product || {}, 'HC'));
}
```

Và thêm cột:

```js
{ label: 'Khu bốc', key: 'pickingZone', width: 10 }
```

Lý do:

- File Excel đơn tổng/nhập kho cũng phản ánh HC/PC hiện tại từ `products`.

---

## 8. Test thực tế

### Syntax check

```bash
npm run check:syntax
```

Kết quả:

```text
SYNTAX_OK 968 JavaScript files
```

### Test Phase34 + regression Phase33

```bash
node --test test/master-order-current-picking-group.test.js test/master-order-product-abc-sort.test.js
```

Kết quả:

```text
# tests 12
# pass 12
# fail 0
```

### Source bundle gate

Có chạy:

```bash
npm run check:source-bundles
```

Kết quả không chạy được do môi trường ZIP thiếu package dev dependency:

```text
Cannot find module 'terser'
```

Đây là hạn chế môi trường sandbox hiện tại, không phải lỗi logic Phase34.

---

## 9. Regression checklist

| Hạng mục | Kết quả |
|---|---|
| Tạo đơn tổng | Không đổi |
| Gán NVGH | Không đổi |
| Đơn con | Không đổi |
| Đơn tổng trả hàng | Đã dùng current product picking zone |
| In HC/PC | Đã hydrate từ `products.pickingZone` |
| Xuất Excel | Đã có `Khu bốc` current cho đơn tổng/nhập kho |
| Sort ABC Phase33 | Pass regression test |
| Giá bán | Không đổi logic giá |
| Giá sau khuyến mại | Không đổi |
| Quy cách | Không đổi |
| Tồn kho | Không đụng |
| Công nợ | Không đụng |
| Quỹ tiền | Không đụng |
| App giao hàng | Không đụng |
| App bán hàng | Không đụng |
| Schema/collection | Không đổi |

---

## 10. Rủi ro còn lại

1. Không migration dữ liệu cũ trong `masterOrders`/`salesOrders.items`; hệ thống hydrate runtime khi in/xuất.
2. Nếu một số màn UI cũ tự render trực tiếp từ snapshot item mà không đi qua Print Domain/Excel Domain thì vẫn có thể còn hiển thị HC/PC cũ. Trong khảo sát hiện tại, màn Đơn tổng web không render danh sách sản phẩm HC/PC chi tiết, nên rủi ro thấp.
3. Field HC/PC vẫn có nhiều legacy alias. Field chuẩn đã xác định là `products.pickingZone`; nên tiếp tục chuẩn hóa dần các màn sửa/import sản phẩm về field này.
4. Nếu không tìm thấy productCode trong catalog, hệ thống fallback snapshot cũ để không làm hỏng in chứng từ cũ.

---

## 11. Tiêu chí hoàn thành

Đạt các tiêu chí:

- Sản phẩm stale HC chuyển sang PC theo catalog hiện tại.
- Sản phẩm stale PC chuyển sang HC theo catalog hiện tại.
- Không đổi số lượng/giá/thành tiền.
- Không đổi schema/collection.
- Không làm hỏng sort ABC Phase33.
- `npm run check:syntax` pass.
- Có test chứng minh stale HC được hydrate thành PC theo catalog hiện tại.
