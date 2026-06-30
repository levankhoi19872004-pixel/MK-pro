# PHASE33 — MASTER ORDER PRODUCT ABC SORT REPORT

## 1. Tổng quan dự án / baseline

Baseline: `MK-pro-phase32-information-reports-completion-patched.zip`

Tech stack xác nhận:

- Node.js / Express
- MongoDB / Mongoose
- Frontend JS thuần
- Print Domain: `src/domain/print/*`
- Excel export: `src/services/excel/ExcelInteractionService.js`
- Mẫu in: `templates/printTemplates.js` + `services/printDataBuilder.js`

Quy mô ZIP sau giải nén: khoảng 500+ file source trực tiếp, nhiều bundle/source fragment và test legacy.

## 2. Khảo sát hệ thống

Các khu vực đã kiểm tra:

| Khu vực | File/Hàm | Nhận xét |
|---|---|---|
| Đơn tổng bán/giao | `src/domain/print/builders/MasterPickingBuilder.js` / `buildMasterPicking()` | Đã có merge dòng và sort trong print domain, nhưng comparator nằm cục bộ trong file. |
| Đơn tổng trả hàng | `src/domain/print/builders/ReturnPickingBuilder.js` / `buildReturnPicking()` | Đã merge dòng nhưng sau merge chưa sort ABC theo tên SP. |
| Đơn tổng nhập kho | `src/domain/print/builders/ImportPickingBuilder.js` / `buildImportPicking()` | Đã merge dòng nhưng sau merge chưa sort ABC theo tên SP. Vá thêm để bảo đảm “đơn tổng các loại”. |
| Excel đơn tổng | `src/services/excel/ExcelInteractionService.js` / `masterItemRows()` | Sheet `SanPham` đang đi theo thứ tự đơn con/items, chưa sort ABC theo tên SP. |
| Mẫu in HC/PC | `services/printDataBuilder.legacy.js` / `buildWarehouseGroups()` | Đã có cơ chế `itemSort === 'PRODUCT_NAME_ASC'` hoặc `printMode` bắt đầu bằng `MASTER_`. Phase33 bảo đảm các document cần thiết có `itemSort`. |
| UI đơn tổng | `public/js/app/06-master-delivery.js` | Màn danh sách đơn tổng không render danh sách sản phẩm trực tiếp, chỉ gọi API in/xuất. |
| Đơn tổng trả UI | `public/js/app/debt/07d-master-return-orders.js` | Popup chỉ render phiếu trả con, không render danh sách sản phẩm tổng hợp trực tiếp. |

## 3. Nguyên nhân hiện tại

- Đơn tổng bán/giao trong print domain đã có sort theo tên, nhưng logic sort chưa được chuẩn hóa thành utility dùng chung.
- Đơn tổng trả hàng và đơn tổng nhập kho đang dùng `mergeLines(...)` rồi render theo thứ tự mặc định của `PrintMergeService`, tức ưu tiên `warehouseCode → lineType → productCode → price`, không phải tên sản phẩm.
- Excel sheet `SanPham` của đơn tổng đang flatten theo thứ tự `master.children → order.items`, nên giữ thứ tự đơn con/items thay vì ABC tên sản phẩm.

## 4. Phương án đã chọn

Chọn **Phương án A — production-grade có utility dùng chung** nhưng giới hạn phạm vi an toàn.

Lý do:

- Tránh mỗi nơi sort một kiểu.
- Dễ test độc lập.
- Không đổi schema/API/business rule.
- Chỉ thay đổi thứ tự hiển thị/in/xuất.

## 5. File đã thêm/sửa

### File thêm mới

- `src/utils/productSort.js`
- `test/master-order-product-abc-sort.test.js`
- `PHASE33_MASTER_ORDER_PRODUCT_ABC_SORT_REPORT.md`

### File đã sửa

- `src/domain/print/builders/MasterPickingBuilder.js`
- `src/domain/print/builders/ReturnPickingBuilder.js`
- `src/domain/print/builders/ImportPickingBuilder.js`
- `src/services/excel/ExcelInteractionService.js`

## 6. Nội dung thay đổi chính

### 6.1. Thêm utility sort dùng chung

File: `src/utils/productSort.js`

Thêm các hàm:

```javascript
function compareProductNameAsc(a = {}, b = {}) {
  const byName = getProductSortName(a).localeCompare(getProductSortName(b), 'vi', {
    sensitivity: 'base',
    numeric: true
  });
  if (byName !== 0) return byName;

  return getProductSortCode(a).localeCompare(getProductSortCode(b), 'vi', {
    sensitivity: 'base',
    numeric: true
  });
}

function comparePickingZoneThenProductNameAsc(a = {}, b = {}) {
  const byZone = zoneRank(a) - zoneRank(b);
  if (byZone !== 0) return byZone;
  return compareProductNameAsc(a, b);
}
```

Ý nghĩa:

- Sort theo tên sản phẩm tiếng Việt.
- Trùng tên thì sort theo mã sản phẩm.
- Với đơn tổng HC/PC: giữ HC trước PC, sau đó sort ABC trong từng nhóm.

### 6.2. Đơn tổng bán/giao

File: `src/domain/print/builders/MasterPickingBuilder.js`

Old:

```javascript
const nameCompare = cleanText(a.productName).localeCompare(cleanText(b.productName), 'vi', {
  sensitivity: 'base',
  numeric: true
});
```

New:

```javascript
const { comparePickingZoneThenProductNameAsc } = require('../../../utils/productSort');

function compareMasterPickingLines(a = {}, b = {}) {
  const productCompare = comparePickingZoneThenProductNameAsc(a, b);
  if (productCompare) return productCompare;
  return toNumber(a.catalogPrice) - toNumber(b.catalogPrice);
}
```

Lý do:

- Chuẩn hóa comparator dùng chung.
- Vẫn giữ tie-break theo giá catalog để tránh đổi nhóm merge/phân biệt dòng cùng SP khác giá.

### 6.3. Đơn tổng trả hàng

File: `src/domain/print/builders/ReturnPickingBuilder.js`

Old:

```javascript
const mergedLines = mergeLines(rawLines, { priceField: 'finalPrice' });
```

New:

```javascript
const mergedLines = sortProductsByPickingZoneThenNameAsc(
  mergeLines(rawLines, { priceField: 'finalPrice' })
);
```

Đồng thời thêm:

```javascript
itemSort: 'PRODUCT_NAME_ASC'
```

Lý do:

- Gộp dòng trả hàng trước.
- Sort sau gộp để không làm sai tổng số lượng/thành tiền.
- Đánh dấu cho print builder tiếp tục dùng chuẩn ABC.

### 6.4. Đơn tổng nhập kho

File: `src/domain/print/builders/ImportPickingBuilder.js`

Old:

```javascript
const mergedLines = mergeLines(rawLines, { priceField: 'costPrice' });
```

New:

```javascript
const mergedLines = sortProductsByPickingZoneThenNameAsc(
  mergeLines(rawLines, { priceField: 'costPrice' })
);
```

Lý do:

- Bảo đảm “đơn tổng các loại” có cùng chuẩn sort.
- Không thay đổi giá nhập, số lượng, lineAmount.

### 6.5. Excel đơn tổng

File: `src/services/excel/ExcelInteractionService.js`

Old:

```javascript
return masters.flatMap((master) => ... orderItems(order).map(...));
```

New:

```javascript
return masters.flatMap((master) => {
  const masterOrderCode = firstValue(master, ['code', 'id']);
  return (Array.isArray(master.children) ? master.children : []).flatMap((order) =>
    orderItems(order).map((item) => ({ ... }))
  ).sort((a, b) => compareProductNameAsc(a, b)
    || String(a.orderCode || '').localeCompare(String(b.orderCode || ''), 'vi', { numeric: true }));
});
```

Lý do:

- Sheet `SanPham` của Excel đơn tổng hiển thị SP theo ABC trong từng đơn tổng.
- Không gộp lại dữ liệu Excel, không đổi số dòng/giá/số lượng.

## 7. Test thực tế

### 7.1. Syntax check

Lệnh:

```bash
npm run check:syntax
```

Kết quả:

```text
SYNTAX_OK 966 JavaScript files
```

### 7.2. Test riêng Phase33

Lệnh:

```bash
node --test test/master-order-product-abc-sort.test.js
```

Kết quả:

```text
# tests 6
# pass 6
# fail 0
```

Đã kiểm tra:

- Sort ABC tiếng Việt theo tên sản phẩm.
- Tie-break theo mã sản phẩm khi trùng tên.
- Giữ HC trước PC và sort ABC trong từng nhóm.
- `buildMasterPicking()` gộp trước, sort sau, không đổi tổng.
- `buildReturnPicking()` gộp trước, sort sau, không đổi tổng.
- `buildImportPicking()` gộp trước, sort sau, không đổi tổng.
- Excel đơn tổng có source sort sheet `SanPham` theo `compareProductNameAsc`.

### 7.3. Kiểm tra bổ sung

Có chạy thêm:

```bash
node --test test/picking-zone-master-order-alpha.test.js
```

Kết quả:

- 5 pass
- 2 fail

Hai fail nằm ở phần assertion legacy đọc `src/services/importOrderService.js` và `public/index.html` wrapper, không thuộc phạm vi Phase33. Các assertion liên quan trực tiếp đến master order sort/HC-PC đã pass.

### 7.4. Source bundle gate

Có thử chạy:

```bash
npm run check:source-bundles
```

Kết quả không chạy được vì môi trường ZIP không có `node_modules` và thiếu package `terser`:

```text
Cannot find module 'terser'
```

Đây là hạn chế môi trường kiểm tra, không phải lỗi cú pháp Phase33.

## 8. Regression checklist

| Hạng mục | Kết quả |
|---|---|
| Tạo đơn tổng | Không sửa logic tạo/gán, chỉ sửa print/export sort |
| Gán NVGH | Không ảnh hưởng |
| In đơn tổng HC/PC | Giữ HC trước PC, sort ABC trong từng nhóm |
| Đơn con | Không sửa |
| Giá bán | Không sửa |
| Giá sau khuyến mại | Không sửa |
| Quy cách | Không sửa |
| Tồn kho | Không sửa |
| Công nợ | Không sửa |
| Trả hàng | Chỉ sort dòng in/xuất đơn tổng trả, không sửa nghiệp vụ trả hàng |
| Excel đơn tổng | Sheet `SanPham` sort ABC trong từng đơn tổng, không đổi dữ liệu |
| Schema/collection | Không sửa |

## 9. Rủi ro còn lại

- Các file bundle/minified legacy không được rebuild do môi trường thiếu `terser`. Source active backend đã được sửa và syntax pass.
- Nếu còn màn frontend nào tự render product lines từ API children mà không qua print/export, cần kiểm tra UI thực tế; trong khảo sát hiện tại các màn master UI chủ yếu render danh sách đơn con/đơn tổng, không render bảng sản phẩm tổng hợp trực tiếp.
- Excel `SanPham` hiện sort các dòng sản phẩm trong từng đơn tổng nhưng vẫn giữ dạng chi tiết theo đơn con, không gộp lại thành tổng SP; đây là chủ ý để không thay đổi dữ liệu xuất.

## 10. Kết luận

Phase33 đạt mục tiêu chính:

- Đơn tổng bán/giao: sort ABC theo tên SP sau merge.
- Đơn tổng trả hàng: sort ABC theo tên SP sau merge.
- Đơn tổng nhập kho: sort ABC theo tên SP sau merge.
- In HC/PC: vẫn tách nhóm, sort riêng từng nhóm.
- Excel đơn tổng: sheet sản phẩm được sort ABC theo tên SP.
- Không đổi số lượng, giá, thành tiền, schema hoặc business rule.
