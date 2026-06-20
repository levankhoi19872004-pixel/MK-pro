# BÁO CÁO KHÔI PHỤC XUẤT HÓA ĐƠN VAT / KHÔNG VAT

## 1. Phạm vi và kết luận

Bản vá được thực hiện trên mã nguồn `MK-pro-global-search-clear-button-patched(1).zip`, theo nguyên tắc isolation/zero-side-effect.

Kết luận chính:

1. Backend, route và service tạo hai workbook **vẫn còn tồn tại**; không có template `.xlsx` nào bị xóa.
2. Nguyên nhân người dùng thấy chức năng “bị mất” là hồi quy giao diện Report Center: hai nút bị chuyển vào một khối `<details>` mặc định đóng và đổi tên không còn trùng với nghiệp vụ quen thuộc.
3. Frontend cũ chia hai cơ chế gọi khác nhau; nút VAT hiển thị thành công theo `setTimeout` dù chưa kiểm tra HTTP, còn nút không VAT dựa vào handler xuất báo cáo dùng chung.
4. Khi kiểm tra sâu, service cũ còn hai rủi ro dữ liệu:
   - Chỉ kiểm tra một trường trạng thái đầu tiên và không loại đầy đủ soft-delete.
   - So sánh VAT bằng Boolean nghiêm ngặt, làm dữ liệu cũ như `"false"` hoặc `0` có thể bị xếp sai nhóm.
5. Bản vá triển khai Phương án A: một contract xuất dùng chung với `invoiceType`, một classifier dùng chung cho VAT/không VAT, hai nút độc lập, giữ các route cũ để tương thích.

Không thay đổi schema, package, trạng thái đơn, doanh số, khuyến mại, công nợ, quỹ, tồn kho hoặc dữ liệu VAT trong database.

---

## 2. Báo cáo khảo sát

### 2.1 Luồng frontend trước bản vá

| Thành phần | File / vị trí | Trạng thái trước bản vá |
|---|---|---|
| Nút VAT | `public/fragments/index/05-index-body.html`, trong khối tiện ích Excel | Có nhưng nằm trong `<details>` mặc định đóng; nhãn `Hóa đơn VAT TT78` |
| Nút không VAT | Cùng file | Có nhưng nằm trong `<details>` mặc định đóng; nhãn `Đơn không xuất hóa đơn` |
| Handler VAT | `public/js/app/admin/08f-vat-export.js` | Gọi `exportReportExcel('vatInvoiceTT78')`, sau 800 ms luôn báo đã gửi yêu cầu dù HTTP có thể lỗi |
| Handler không VAT | `public/js/app/admin/08a-reports.js`, generic `.report-export-btn` | Phụ thuộc cơ chế xuất báo cáo chung qua `data-report-type="vat-non-invoice-orders"` |
| Bộ lọc ngày | `#reportFromDate`, `#reportToDate` | Có sẵn trong Report Center |
| Điều kiện hiển thị | Không có permission UI riêng | Nút chỉ khó thấy do khối `<details>` đóng, không phải do role ẩn |

Bằng chứng UI trước bản vá:

```html
<details class="card report-directory-utility-card">
  ...
  <button id="exportVatInvoiceTT78Button">Hóa đơn VAT TT78</button>
  <button id="exportVatNonInvoiceOrdersButton"
          class="secondary report-export-btn"
          data-report-type="vat-non-invoice-orders">
    Đơn không xuất hóa đơn
  </button>
</details>
```

### 2.2 Luồng API/backend

| Lớp | File | Hàm/route | Kết quả khảo sát |
|---|---|---|---|
| Mount router | `src/routes/index.js:118` | `app.use('/api/export', exportRouter)` | Route vẫn được mount đúng |
| Route | `src/routes/importExportRoutes.js:54-57` | `GET /:type.xlsx`, `GET /:type` | Route xuất vẫn tồn tại |
| Authentication/authorization | `src/routes/importExportRoutes.js:17-21` | `requireRole(['admin','manager','accountant','warehouse'])` | Có xác thực và phân quyền theo convention hiện tại |
| Controller | `src/controllers/importExportController.js` | `exportExcel`, `sendWorkbook` | Controller vẫn gọi service và trả workbook |
| Header file | `src/controllers/importExportController.js:18-22` | `Content-Type`, `Content-Disposition` | Đúng MIME type Excel; lỗi service trả JSON với status phù hợp |
| Service façade | `src/services/importExportService.js` | Chuyển tiếp sang legacy service | Không bị xóa |
| Export dispatcher | `src/services/importExportLegacy.service.source/part-03.jsfrag` | `exportToExcel()` | Có hai alias cũ `vatInvoiceTT78` và `vat-non-invoice-orders` |
| Workbook VAT | `part-01.jsfrag` + `part-02.jsfrag` | `buildVatInvoiceTT78Workbook()` | Tạo động workbook TT78 |
| Workbook không VAT | `part-02.jsfrag` | `buildVatNonInvoiceOrdersWorkbook()` | Tạo động workbook danh sách/chi tiết |

### 2.3 Template và tài nguyên

- Không tìm thấy luồng nào đọc template hóa đơn `.xlsx` từ filesystem.
- Workbook được dựng động bằng `src/utils/excelWriter.util.js`.
- Vì vậy không có lỗi mất template, sai chữ hoa/thường hoặc đường dẫn Windows/Linux trong chức năng này.
- Thư mục `templates/` không phải nguồn của hai file hóa đơn trên.

### 2.4 Logic VAT trước bản vá

Cờ thực tế đang dùng:

```javascript
vatInvoiceRequired
```

Quy tắc tương thích dữ liệu cũ đã tồn tại trong hệ thống:

- `vatInvoiceRequired === false` → không xuất VAT.
- Giá trị khác `false`, kể cả thiếu trường → xuất VAT.

Nhược điểm trước bản vá:

```javascript
order.vatInvoiceRequired !== false
order.vatInvoiceRequired === false
```

Cách này phân loại sai nếu dữ liệu cũ lưu:

```text
"false"
0
"0"
"no"
```

### 2.5 Điều kiện trạng thái trước bản vá

Mã cũ:

```javascript
function isActiveDoc(row = {}) {
  const status = cleanText(row.status || row.deliveryStatus || row.lifecycleStatus).toLowerCase();
  return !['void', 'cancelled', 'canceled', 'deleted', 'removed'].includes(status);
}
```

Rủi ro:

- Chỉ kiểm tra trường trạng thái đầu tiên có giá trị.
- Nếu `status='delivered'` nhưng `lifecycleStatus='cancelled'`, đơn vẫn có thể lọt.
- Không kiểm tra `deleted`, `isDeleted`, `deletedAt`.
- Không loại `duplicate_cancelled` và `reversed`.

### 2.6 Phân quyền

Quyền hiện tại của namespace xuất file:

```javascript
requireRole(['admin', 'manager', 'accountant', 'warehouse'])
```

Bản vá giữ nguyên middleware, không mở rộng quyền và không tạo route bỏ qua xác thực.

### 2.7 Lịch sử thay đổi khả dĩ

ZIP không chứa `.git`, nên không thể khẳng định commit cụ thể. Dựa trên mã nguồn hiện tại và chú thích `REPORT CENTER V2`, nguyên nhân giao diện có khả năng xuất hiện khi Report Center được tái bố trí thành danh mục báo cáo/popup và nhóm tiện ích Excel vào `<details>`.

Đây là suy luận dựa trên cấu trúc mã hiện tại, không phải kết luận từ Git history.

---

## 3. Phân tích nguyên nhân gốc rễ

| Hiện tượng | Nguyên nhân trực tiếp | Nguyên nhân gốc rễ | File/hàm | Cơ chế gây lỗi | Mức độ |
|---|---|---|---|---|---|
| Không thấy hai chức năng xuất | Hai nút nằm trong `<details>` mặc định đóng và đổi nhãn | Hồi quy bố cục Report Center làm chức năng nghiệp vụ quan trọng bị xếp như tiện ích phụ | `public/fragments/index/05-index-body.html` | Người dùng không thấy nút khi mở tab báo cáo | Major UX |
| Nút VAT có thể báo thành công dù tải lỗi | Dùng `setTimeout()` thay vì chờ response | Handler cũ không quản lý trạng thái HTTP/blob | `public/js/app/admin/08f-vat-export.js` | UI báo thành công giả, không hiện lỗi backend | Major |
| Hai nút dùng hai luồng khác nhau | VAT có handler riêng, không VAT dùng generic report handler | Không có contract xuất hóa đơn thống nhất | `08f-vat-export.js`, `08a-reports.js` | Khó bảo trì, dễ mất một nhánh khi đổi layout | Major |
| Đơn hủy/xóa có thể lọt file | `isActiveDoc()` kiểm tra không đầy đủ | Logic trạng thái không xem tất cả trạng thái và soft-delete | `importExportLegacy.service.source/part-01.jsfrag::isActiveDoc` | Sai tập dữ liệu xuất | Critical data correctness |
| Chuỗi `"false"` có thể vào file VAT | So sánh strict Boolean | Không chuẩn hóa dữ liệu cũ | Hai workbook builder | Hai tập VAT/NON_VAT có thể phân loại không đúng | Critical data correctness |
| Dữ liệu ngày `createdAt` có nguy cơ lệch ngày | Dùng `T00:00:00.000Z` / `T23:59:59.999Z` | Khoảng ngày UTC không tương ứng ngày nghiệp vụ Việt Nam | Query workbook cũ | Mất/thừa giao dịch đầu/cuối ngày | Major |

Phân loại trường hợp thực tế:

- **Trường hợp A — Mất giao diện:** Có.
- **Trường hợp B — Mất route:** Không.
- **Trường hợp C — Mất service:** Không.
- **Trường hợp D — Mất template:** Không; workbook tạo động.
- **Trường hợp E — Sai logic phân loại:** Có rủi ro thực tế với dữ liệu kiểu chuỗi/số và soft-delete.
- **Trường hợp F — Lỗi deployment:** Không phát hiện đường dẫn/template phụ thuộc Windows; đã kiểm tra portability.

---

## 4. Hai phương án giải pháp

### Phương án A — Production-grade — Đã triển khai

**Thiết kế**

- Hai nút hiện rõ và độc lập trên Report Center.
- Một endpoint dùng chung:

```http
GET /api/export/invoice-orders.xlsx?invoiceType=VAT
GET /api/export/invoice-orders.xlsx?invoiceType=NON_VAT
```

- Một classifier chuẩn hóa:
  - Loại VAT.
  - Trạng thái hợp lệ.
  - Soft-delete.
  - Khoảng ngày Asia/Ho_Chi_Minh.
- Hai workbook giữ nguyên nghiệp vụ/format hiện có.
- Giữ route alias cũ để không làm hỏng bookmark/code khác.
- Test unit, UI, workbook và regression.

**Lợi ích**

- Một nguồn quy tắc phân loại duy nhất.
- Bảo đảm `VAT ∩ NON_VAT = ∅` và mọi đơn hoạt động thuộc đúng một nhóm.
- Không lặp event handler.
- Có loading, chống double-click, hiển thị lỗi thật.
- Tương thích dữ liệu cũ thiếu cờ VAT.

**Nhược điểm**

- Thêm một helper/service mới và một contract mới.
- Source-bundle sinh tự động cần được đồng bộ.

**Effort:** Medium.

**Rủi ro:** Thấp sau test; logic phân loại tác động trực tiếp tới tập đơn xuất nhưng đã được test bằng cả unit và workbook integration.

### Phương án B — Cân bằng effort — Không chọn

**Thiết kế**

- Chỉ đưa hai nút ra khỏi `<details>`.
- Giữ hai route/hàm và hai handler riêng.
- Không chuẩn hóa dữ liệu VAT hoặc trạng thái.

**Lợi ích**

- Ít file thay đổi.
- Thời gian triển khai ngắn.

**Nhược điểm**

- Không xử lý lỗi báo thành công giả.
- Không xử lý `"false"`, `0`, soft-delete và trạng thái mâu thuẫn.
- Hai luồng tiếp tục dễ lệch nhau.

**Effort:** Easy.

**Rủi ro:** Medium/High về dữ liệu; không đáp ứng đầy đủ tiêu chí chống trùng/chống bỏ sót.

---

## 5. Thiết kế và triển khai đã thực hiện

### 5.1 Classifier dùng chung

File mới:

```text
src/services/invoiceExportClassifier.js
```

Các hàm chính:

```javascript
normalizeInvoiceType(value)
isExplicitNonVatValue(value)
resolveInvoiceType(order)
isActiveInvoiceOrder(order)
buildInvoiceTypeMongoClause(invoiceType)
buildActiveInvoiceMongoClause()
buildInvoiceOrderFilter(query, invoiceType)
partitionInvoiceOrders(orders)
```

Quy tắc phân loại:

| Giá trị `vatInvoiceRequired` | Nhóm |
|---|---|
| `false`, `0`, `"false"`, `"0"`, `"no"`, `"non_vat"`, `"non-vat"`, `"khong"`, `"không"` | `NON_VAT` |
| `true`, `1`, thiếu trường, `null`, `undefined`, giá trị khác | `VAT` |

Quy tắc trạng thái:

- Kiểm tra đồng thời `status`, `lifecycleStatus`, `deliveryStatus`.
- Loại `void`, `cancelled`, `canceled`, `deleted`, `removed`, `duplicate_cancelled`, `reversed`.
- Loại `deleted`, `isDeleted`, `deletedAt` theo quy tắc soft-delete.

### 5.2 Query server-side

Hai workbook đều dùng:

```javascript
buildInvoiceOrderFilter(query, INVOICE_TYPES.VAT)
buildInvoiceOrderFilter(query, INVOICE_TYPES.NON_VAT)
```

Điều kiện được lọc tại MongoDB, không tải toàn bộ đơn về frontend.

Khoảng ngày `createdAt` được đổi theo ngày địa phương Việt Nam:

```text
2026-06-20 00:00:00 +07 → 2026-06-19T17:00:00.000Z
2026-06-20 23:59:59.999 +07 → 2026-06-20T16:59:59.999Z
```

### 5.3 Giao diện

Vị trí mới:

```text
public/fragments/index/05-index-body.html:230-241
```

Hai nút:

```html
<button id="exportVatInvoiceTT78Button" data-invoice-type="VAT">
  Xuất hóa đơn VAT
</button>
<button id="exportVatNonInvoiceOrdersButton" data-invoice-type="NON_VAT">
  Xuất hóa đơn không VAT
</button>
```

- Nằm trực tiếp trong tab Báo cáo, không bị ẩn trong khối đóng.
- Có vùng trạng thái `aria-live`.
- Cùng style Report Center.
- Responsive trên mobile.

### 5.4 Handler tải file

File:

```text
public/js/app/admin/08f-vat-export.js
```

Hành vi:

- Chỉ một request mỗi click.
- Vô hiệu hóa cả hai nút khi một file đang được tạo.
- Dùng `fetch()` và kiểm tra `response.ok`.
- Kiểm tra MIME Excel trước khi tải.
- Đọc lỗi JSON thay vì tải JSON thành `.xlsx`.
- Lấy tên file từ `Content-Disposition`.
- Không reload trang.
- Không xóa các filter khác.
- Giữ `dateFrom/dateTo` hiện tại.
- Không ghi database.

### 5.5 API thống nhất và tương thích ngược

Dispatcher mới:

```javascript
if (['invoice-orders', 'invoiceOrders'].includes(normalizedType)) {
  const invoiceType = normalizeInvoiceType(query.invoiceType);
  if (!invoiceType) {
    return { error: 'invoiceType chỉ nhận VAT hoặc NON_VAT', status: 400 };
  }
  return invoiceType === INVOICE_TYPES.VAT
    ? buildVatInvoiceTT78Workbook(query)
    : buildVatNonInvoiceOrdersWorkbook(query);
}
```

Các alias cũ vẫn giữ:

```text
vatInvoiceTT78
vat-invoice-tt78
hoa-don-vat-tt78
vat-non-invoice-orders
vatNonInvoiceOrders
```

---

## 6. Danh sách file thay đổi

### File sửa

```text
config/source-bundles.json
public/css/95-report-center-popup.css
public/fragments/index/05-index-body.html
public/fragments/index/07-index-body.html
public/index.shell.html
public/js/app/admin/08f-vat-export.js
src/services/importExportLegacy.service.js
src/services/importExportLegacy.service.source/part-01.jsfrag
src/services/importExportLegacy.service.source/part-02.jsfrag
src/services/importExportLegacy.service.source/part-03.jsfrag
test/fixtures/index-page/phase79-assembled.sha256
test/sales-order-vat-invoice-setting-static.test.js
```

### File mới

```text
src/services/invoiceExportClassifier.js
test/invoice-export-classifier.test.js
test/invoice-export-restoration-static.test.js
test/invoice-export-ui-behavior.test.js
test/invoice-export-workbook.test.js
VAT_NON_VAT_INVOICE_EXPORT_RESTORATION_REPORT.md
```

Không sửa:

```text
package.json
package-lock.json
model/schema
route mount chính
cơ chế ghi/cập nhật đơn hàng
công thức giá/khuyến mại/VAT hiện tại
```

---

## 7. Diff quan trọng

### 7.1 Khôi phục vị trí hai nút

**Mã cũ**

```html
<details class="card report-directory-utility-card">
  ...
  <button id="exportVatInvoiceTT78Button">Hóa đơn VAT TT78</button>
  <button id="exportVatNonInvoiceOrdersButton"
          class="secondary report-export-btn"
          data-report-type="vat-non-invoice-orders">
    Đơn không xuất hóa đơn
  </button>
</details>
```

**Mã mới**

```html
<section class="card invoice-export-card">
  <button id="exportVatInvoiceTT78Button" data-invoice-type="VAT">
    Xuất hóa đơn VAT
  </button>
  <button id="exportVatNonInvoiceOrdersButton" data-invoice-type="NON_VAT">
    Xuất hóa đơn không VAT
  </button>
</section>
```

**Lý do:** Hai chức năng nghiệp vụ quan trọng phải hiển thị trực tiếp, rõ tên và không bị che trong utility group.

### 7.2 Không báo thành công giả

**Mã cũ**

```javascript
exportReportExcel('vatInvoiceTT78');
setTimeout(() => {
  summary.textContent = 'Đã gửi yêu cầu xuất Excel TT78...';
}, 800);
```

**Mã mới**

```javascript
const response = await fetch('/api/export/invoice-orders.xlsx?...');
if (!response.ok) throw new Error(await readErrorMessage(response));
if (!contentType.includes(EXCEL_MIME)) {
  throw new Error('Máy chủ không trả về file Excel hợp lệ');
}
const blob = await response.blob();
```

**Lý do:** Chỉ báo thành công sau khi nhận workbook hợp lệ; lỗi JSON không bị tải nhầm thành `.xlsx`.

### 7.3 Chuẩn hóa VAT

**Mã cũ**

```javascript
order.vatInvoiceRequired !== false
order.vatInvoiceRequired === false
```

**Mã mới**

```javascript
resolveInvoiceType(order) === INVOICE_TYPES.VAT
resolveInvoiceType(order) === INVOICE_TYPES.NON_VAT
```

**Lý do:** Hỗ trợ dữ liệu cũ kiểu Boolean, số, chuỗi; thiếu cờ vẫn thuộc VAT theo quy tắc tương thích.

### 7.4 Loại đầy đủ đơn không hợp lệ

**Mã cũ**

```javascript
const status = row.status || row.deliveryStatus || row.lifecycleStatus;
return !inactive.includes(status);
```

**Mã mới**

```javascript
const statuses = [order.status, order.lifecycleStatus, order.deliveryStatus];
if (statuses.some(status => inactive.includes(status))) return false;
if (isTruthyDeleteValue(order.deleted)) return false;
if (isTruthyDeleteValue(order.isDeleted)) return false;
if (hasDeletedAt(order.deletedAt)) return false;
```

**Lý do:** Không để đơn hủy/xóa lọt file do một trạng thái khác có giá trị trước.

---

## 8. API contract

### 8.1 Route khuyến nghị mới

```http
GET /api/export/invoice-orders.xlsx
```

Query parameters:

| Tham số | Bắt buộc | Giá trị |
|---|---:|---|
| `invoiceType` | Có | `VAT` hoặc `NON_VAT` |
| `dateFrom` | Không | `YYYY-MM-DD` |
| `dateTo` | Không | `YYYY-MM-DD` |
| `limit` | Không | UI gửi `100000`; service clamp tối đa 100000 |
| Các filter đã được builder hỗ trợ | Không | Giữ convention cũ, không thay API khác |

Phân quyền:

```text
admin, manager, accountant, warehouse
```

Response thành công:

```http
HTTP 200
Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
Content-Disposition: attachment; filename="...xlsx"
```

Tên file:

```text
Hoa_don_VAT_TT78_<from>_<to>.xlsx
Hoa_don_khong_VAT_<from>_<to>.xlsx
```

Response lỗi `invoiceType`:

```http
HTTP 400
Content-Type: application/json

{
  "ok": false,
  "message": "invoiceType chỉ nhận VAT hoặc NON_VAT"
}
```

Chưa đăng nhập/không đủ quyền:

```text
401/403 theo auth middleware hiện hữu
```

### 8.2 Route tương thích ngược

Các route cũ tiếp tục hoạt động:

```http
GET /api/export/vatInvoiceTT78.xlsx
GET /api/export/vat-invoice-tt78.xlsx
GET /api/export/hoa-don-vat-tt78.xlsx
GET /api/export/vat-non-invoice-orders.xlsx
GET /api/export/vatNonInvoiceOrders.xlsx
```

---

## 9. Quy tắc dữ liệu trong Excel

### File VAT

- Workbook TT78 hiện hữu được giữ nguyên.
- Hàng trả được đối trừ theo `returnOrders` như logic cũ.
- `DoiChieu` có:
  - Mã sản phẩm.
  - Tên sản phẩm.
  - `Quy cách` từ catalog, chỉ số đóng gói.
  - `Giá bán` từ catalog.
- Đơn giá trước VAT vẫn theo công thức nghiệp vụ hiện hữu; bản vá không đổi thuế suất hay công thức.

### File không VAT

Sheet `ChiTietHang` giữ đủ:

```text
Mã đơn
Mã sản phẩm
Tên sản phẩm
Quy cách
Giá bán
Số lượng bán
Số lượng trả
Số lượng còn lại
Đơn giá
Thành tiền
```

- `Quy cách`: lấy từ danh mục sản phẩm bằng `catalogPackingQty()`.
- `Giá bán`: lấy từ danh mục sản phẩm bằng `catalogSalePrice()`.
- Giá/khuyến mại trên dòng đơn vẫn giữ logic cũ.

---

## 10. Kết quả đối chiếu dữ liệu

ZIP không chứa snapshot database production và không có kết nối MongoDB hợp lệ, nên không thể báo số lượng đơn thực tế mà không bịa dữ liệu.

Đối chiếu deterministic fixture dùng trong integration test:

| Chỉ tiêu | Kết quả |
|---|---:|
| Tổng bản ghi fixture | 6 |
| Tổng đơn hợp lệ | 4 |
| Số đơn VAT | 2 |
| Số đơn không VAT | 2 |
| Đơn thiếu trường VAT | 1, được xếp VAT |
| Đơn bị loại do hủy/xóa | 2 |
| Số đơn trùng giữa hai nhóm | **0** |
| Số đơn hợp lệ không thuộc nhóm nào | **0** |

Fixture bao gồm:

- Đơn thiếu cờ VAT.
- Đơn VAT `true` từ DMS.
- Đơn không VAT `false`.
- Đơn không VAT `"false"`.
- Đơn `cancelled`.
- Đơn soft-delete.

Hai workbook được sinh thật, parse lại thành công và không corrupt.

---

## 11. Kết quả kiểm thử

### 11.1 Test riêng tính năng

| Test case | Kết quả | Ghi chú |
|---|---:|---|
| Chuẩn hóa `VAT`/`NON_VAT` | Đạt | Reject enum sai |
| Thiếu cờ VAT thuộc VAT | Đạt | Tương thích dữ liệu cũ |
| `false`, `0`, `"false"`, `"0"` thuộc NON_VAT | Đạt | Không hiểu sai chuỗi Boolean |
| Hai nhóm rời nhau | Đạt | Intersection = 0 |
| Không bỏ sót đơn active | Đạt | Unclassified = 0 |
| Loại mọi trạng thái hủy | Đạt | Kiểm tra cả 3 trường status |
| Loại soft-delete | Đạt | `deleted`, `isDeleted`, `deletedAt` |
| Timezone ngày Việt Nam | Đạt | Boundary +07 đúng |
| Hiển thị đủ hai nút | Đạt | Nút nằm ngoài `<details>` |
| Nút VAT gửi đúng `invoiceType=VAT` | Đạt | Một endpoint thống nhất |
| Nút không VAT gửi đúng `invoiceType=NON_VAT` | Đạt | Không gọi nhầm route |
| Chống double-click/request kép | Đạt | Shared in-flight guard |
| Loading/error/no reload | Đạt | Kiểm tra static + UI behavior |
| Workbook thực tế mở được | Đạt | ZIP/XLSX hợp lệ, parse thành công |

**Tổng test mới:** 14/14 đạt.

### 11.2 Regression toàn dự án

| Mốc | Tổng test | Đạt | Lỗi |
|---|---:|---:|---:|
| ZIP đầu vào | 784 | 780 | 4 |
| Sau bản vá | 798 | 794 | 4 |

Không phát sinh lỗi mới.

Bốn lỗi tồn tại trước patch:

1. `admin UI labels current inventory source and busts the old frontend cache`.
2. `worker không được làm mất chế độ update khi chạy async`.
3. `import session lưu mode và worker truyền mode tới preview`.
4. `sales order script remains cache-busted after later patches`.

Các lỗi này thuộc cache-version/import worker, không liên quan xuất hóa đơn nên không sửa lan phạm vi.

### 11.3 Quality gates

| Gate | Kết quả |
|---|---:|
| Source bundles | 18/18 đạt |
| JavaScript syntax | 833 file đạt |
| Source size | Đạt |
| Path portability | 1003 path, 833 JS đạt |
| Enterprise smoke | modules=10, flags=9, đạt |
| OpenAPI docs check | 306 operations, đồng bộ |
| `npm audit --omit=dev --audit-level=high` | 0 lỗ hổng |

---

## 12. Đánh giá side effect

| Khu vực | Ảnh hưởng |
|---|---|
| Đơn hàng | Read-only; không cập nhật trạng thái/cờ VAT |
| Đơn tổng | Không thay đổi nghiệp vụ gộp; export vẫn dựa trên nguồn đơn hiện hữu |
| VAT | Chỉ chuẩn hóa cách đọc cờ cũ; không ghi ngược database |
| Doanh số | Không thay đổi |
| Khuyến mại | Không thay đổi công thức/giá sau khuyến mại |
| Công nợ | Không thay đổi |
| Quỹ | Không thay đổi |
| Tồn kho | Không thay đổi |
| Báo cáo khác | Generic report export không bị thay API; alias cũ giữ nguyên |
| In đơn con/đơn tổng | Không thay đổi |
| Import đơn hàng | Không thay đổi |
| Quyền truy cập | Giữ middleware hiện tại |
| Hiệu năng | Lọc VAT/trạng thái/ngày tại MongoDB; không phân loại toàn bộ ở frontend |
| Bộ nhớ/file tạm | Workbook trả buffer như trước; không tạo file tạm vĩnh viễn |
| Windows/Linux/Render | Không dùng path tuyệt đối/template; portability gate đạt |

---

## 13. Xác nhận nghiệm thu

- [x] Xác định chính xác nguyên nhân mất chức năng.
- [x] Hiển thị trực tiếp “Xuất hóa đơn VAT”.
- [x] Hiển thị trực tiếp “Xuất hóa đơn không VAT”.
- [x] Hai nút gọi độc lập, không gọi cả hai API.
- [x] Có loading và chống bấm lặp.
- [x] Lỗi HTTP/JSON được hiển thị, không tải nhầm thành `.xlsx`.
- [x] VAT chỉ chứa VAT; NON_VAT chỉ chứa NON_VAT.
- [x] Intersection = 0; active unclassified = 0 trong test đối chiếu.
- [x] Đơn hủy và soft-delete bị loại.
- [x] Dữ liệu cũ thiếu cờ VAT vẫn thuộc VAT.
- [x] Chuỗi `"false"` không bị hiểu thành VAT.
- [x] Workbook mở được, không corrupt.
- [x] Quy cách và giá bán lấy đúng catalog ở các sheet hiện hữu.
- [x] Không ghi database khi tải file.
- [x] Không thay đổi doanh số, công nợ, quỹ, tồn kho.
- [x] Route cũ vẫn tương thích.
- [x] Không có lỗi regression mới.
