# BÁO CÁO KHẢO SÁT VÀ TRIỂN KHAI XUẤT EXCEL SSE

## 1. Kết luận điều hành

Đã triển khai **Phương án A — service xuất SSE tập trung, values-only** trên bản mã nguồn `MK-pro-vat-non-vat-invoice-export-restored-patched.zip`.

Tính năng mới:

- Nút **Xuất Excel SSE** tại khu vực Xuất hóa đơn.
- Chọn độc lập nhóm `VAT` hoặc `NON_VAT`; không xóa hoặc gộp hai chức năng xuất hóa đơn hiện có.
- Endpoint dùng chung tạo workbook SSE từ dữ liệu đơn hàng đọc-only.
- Sheet đầu tiên tên `TỔNG`, dòng 1–4 trống, dòng 5 chứa đúng 36 tiêu đề A:AJ, dữ liệu từ dòng 6.
- Mỗi dòng sản phẩm hợp lệ tạo một dòng SSE; thông tin hóa đơn được lặp trên từng dòng.
- Mã được ghi dạng text, ngày là Excel Date thực, số lượng/giá/tiền là numeric.
- Không có công thức, sheet phụ hoặc dữ liệu mẫu cũ trong file upload.
- Thiếu mapping thì chặn file upload chính bằng HTTP `422` và cho tải báo cáo lỗi riêng.
- Không ghi trạng thái “đã xuất”, không thay đổi đơn hàng, tồn kho, công nợ, quỹ, doanh số hoặc cờ VAT.

### Giới hạn xác minh bắt buộc phải nêu rõ

File `Mẫu 2 (01-31.05).xlsx` **không có trong ZIP, `/mnt/data` hoặc File Library khả dụng tại thời điểm triển khai**. Vì vậy:

- Chuỗi tiêu đề, vị trí dòng, số cột và các giá trị quan sát được được khóa theo đúng contract người dùng đã cung cấp.
- Chưa thể kiểm chứng độc lập hidden sheet, defined name, style, formula cache hoặc hành vi importer SSE thực tế.
- Không thể khẳng định SSE bắt buộc toàn bộ 10 sheet hay chỉ sheet `TỔNG` nếu chưa thử import trên SSE.
- Bản triển khai chọn workbook tối giản một sheet vì contract upload nằm ở `TỔNG`, dữ liệu values-only và không có bằng chứng mã nguồn/importer yêu cầu sheet phụ.
- Test golden thật đã được chuẩn bị dạng có điều kiện: khi đặt file vào `templates/sse/Mẫu 2 (01-31.05).xlsx`, test sẽ tự đọc và khóa tên sheet + tiêu đề.

Do đó kết quả hiện tại là **tương thích cấu trúc theo contract được cung cấp**, chưa phải chứng nhận từ chính importer SSE.

---

## 2. Tổng quan dự án

| Hạng mục | Kết quả khảo sát |
|---|---|
| Nền tảng | Node.js, Express, MongoDB/Mongoose |
| Kiến trúc | Monolith chia route/controller/service/repository; frontend fragment + JavaScript thuần |
| Nguồn đơn | `orders` qua `src/models/SalesOrder.js` |
| Nguồn trả hàng | `returnOrders` qua `src/models/ReturnOrder.js` |
| Khách hàng | `customers` qua `src/models/Customer.js` |
| Sản phẩm | `products` qua `src/models/Product.js` |
| Cờ VAT | `vatInvoiceRequired`; classifier dùng chung tại `src/services/invoiceExportClassifier.js` |
| Excel writer | `src/utils/excelWriter.util.js`, XLSX ZIP/XML values-only tự sinh |
| Route xuất | Namespace hiện hữu `/api/export/:type.xlsx` |
| Phân quyền | `admin`, `manager`, `accountant`, `warehouse` |
| Source bundle | `src/services/importExportLegacy.service.js` sinh từ 3 `.jsfrag` |

---

## 3. Khảo sát nguồn dữ liệu

### 3.1 Đơn hàng

**File:** `src/models/SalesOrder.js`

Các trường được dùng:

- Nhận diện: `_id`, `id`, `code`, `documentCode`, `invoiceCode`, `orderCode`, `salesOrderCode`.
- Ngày: `documentDate`, `orderDate`, `date`, `createdDate`, `createdAt`.
- Khách hàng: `customerId`, `customerCode`, `customerName` và các field mapping động do model `strict:false`.
- NVBH: `salesStaffCode`, alias lịch sử và các field mapping SSE/kế toán động.
- VAT: `vatInvoiceRequired`.
- Trạng thái: `status`, `lifecycleStatus`, `deliveryStatus`, `deleted`, `isDeleted`, `deletedAt`.
- Dòng hàng: `items[]`.

### 3.2 Logic VAT/không VAT

**File:** `src/services/invoiceExportClassifier.js`

- `resolveInvoiceType(order)` là nguồn phân loại duy nhất.
- `false`, `0`, `"false"`, `"0"`, `"no"`, `"non_vat"`, `"khong"`, `"không"` → `NON_VAT`.
- Giá trị thiếu/null/true → `VAT`, tương thích dữ liệu cũ.
- `buildInvoiceOrderFilter()` lọc VAT, trạng thái hủy/xóa và khoảng ngày theo `Asia/Ho_Chi_Minh` ngay tại database.

### 3.3 Trả hàng

**File:** `src/models/ReturnOrder.js` và `src/services/sseInvoiceExport.service.js`

- Query theo batch từ danh sách ID/mã đơn đã chọn.
- Chỉ dùng phiếu còn hiệu lực.
- Khử bản ghi trùng của cùng phiếu trả theo mã phiếu + đơn + sản phẩm + line/price, ưu tiên bản cập nhật mới hơn.
- `Số lượng SSE = Số lượng bán - Số lượng trả hợp lệ`.
- Dòng còn `<= 0` không xuất.

### 3.4 Mapping khách hàng SSE

Thứ tự ưu tiên:

1. Snapshot trên đơn: `sseCustomerCode`, `customerSseCode`, `accountingCustomerCode`, `customerAccountingCode`, `customerErpCode`.
2. Danh mục khách: `sseCustomerCode`, `customerSseCode`, `accountingCode`, `accountingCustomerCode`, `erpCode`.
3. Mã chuẩn hiện tại `customerCode`/`Customer.code` chỉ được dùng khi `allowCanonicalCustomerCodeFallback=true`.

Không dùng tên khách hàng làm mã hoặc khóa ghép khi đã có mã.

### 3.5 Mapping sản phẩm SSE

Thứ tự ưu tiên:

1. Snapshot dòng đơn: `sseProductCode`, `productSseCode`, `accountingProductCode`, `productAccountingCode`, `erpProductCode`.
2. Danh mục sản phẩm: các field SSE/kế toán/ERP tương ứng.
3. `Product.code`/`productCode`/`sku` chỉ được fallback khi cấu hình cho phép.

Tên và đơn vị ưu tiên danh mục sản phẩm; không lấy tên làm mã.

### 3.6 Quy tắc số lượng, đơn vị và giá

| Thuộc tính | Quy tắc triển khai |
|---|---|
| Số lượng | Tổng đơn vị cơ sở còn lại sau khi trừ trả hàng |
| Đvt | `baseUnitAtOrder` → `item.baseUnit` → `Product.baseUnit` → đơn vị lịch sử |
| VAT | Giá sau khuyến mại trên dòng đơn chia `(1 + SSE_VAT_RATE)`; mặc định cấu hình 8%, cùng quy tắc xuất VAT hiện hữu |
| NON_VAT | Giữ giá sau khuyến mại trên dòng đơn |
| Tiền hàng | Backend tính `quantity × unitPrice`, làm tròn 2 chữ số |
| Giá danh mục | Không thay thế giá chứng từ; chỉ dữ liệu catalog phục vụ mapping tên/đơn vị/mã |

Dòng thiếu giá thực, đơn vị, mã hoặc ngày bị chặn và đưa vào báo cáo lỗi.

### 3.7 Điều kiện đơn được xuất

Giữ đúng contract của hai chức năng hóa đơn hiện hành:

- Lọc nhóm VAT/không VAT bằng classifier hiện tại.
- Loại đơn hủy, reversed, deleted và soft-delete.
- Lọc ngày tại database.
- Không tự thêm điều kiện “đã xác nhận kế toán” vì hai export hóa đơn hiện hữu chưa áp dụng điều kiện này; thêm mới sẽ thay đổi nghiệp vụ ngoài phạm vi.
- Không xuất dòng số lượng 0 hoặc đã trả hết.
- Một document đơn chỉ được xử lý một lần.
- Không đọc hoặc xuất `master_orders`; nguồn thống nhất là đơn con `orders`, tránh vừa xuất đơn tổng vừa xuất lại đơn con.

---

## 4. Hợp đồng workbook SSE

### 4.1 Kết luận triển khai

| Thuộc tính | Contract được cung cấp | Kết luận áp dụng |
|---|---|---|
| Sheet nhập | `TỔNG` | Có |
| Vị trí sheet | Đầu tiên | Có, index 0 |
| Dòng tiêu đề | 5 | Có |
| Dòng dữ liệu đầu | 6 | Có |
| Số cột | 36 | Có |
| Vùng | A:AJ | Có |
| Dòng 1–4 | Trống | Có, cell blank thật |
| Công thức | File mẫu có thể có | File upload values-only, không `<f>` |
| Ngày | Excel Date/serial | Có, format `dd/mm/yyyy` |
| Mã | Text | Có, bảo toàn số 0 đầu |
| Sheet phụ | Chưa xác minh | Không tạo trong bản tối giản |
| Template | Không có trong đầu vào | Không phụ thuộc file template/deploy path |

### 4.2 Danh sách 36 cột và mapping

| Cột | Tiêu đề chính xác | Nguồn |
|---|---|---|
| A | Mã khách | Mapping SSE/kế toán; fallback mã chuẩn khi cấu hình cho phép |
| B | Tên khách hàng | Danh mục khách hàng, fallback snapshot đơn |
| C | Ngày | Ngày chứng từ/đơn, Excel Date thật |
| D | Số hóa đơn | `invoiceCode` → `documentCode` → mã đơn |
| E | Loại hóa đơn | Cấu hình SSE theo nhóm |
| F | Ký hiệu | Cấu hình SSE theo nhóm |
| G | Diễn giải | Cell trống |
| H | Mã hàng | Mapping SSE/kế toán sản phẩm |
| I | Tên mặt hàng | Danh mục sản phẩm |
| J | Đvt | Đơn vị cơ sở tương ứng số lượng |
| K | Mã kho | Cấu hình SSE |
| L | Mã vị trí | Trống |
| M | Mã lô | Trống |
| N | tl_ck | Trống |
| O | Số lượng | Đơn vị cơ sở sau trừ trả |
| P | Giá bán | Giá theo quy tắc VAT/NON_VAT |
| Q | Tiền hàng | `O × P` tính tại backend |
| R | Tỉ lệ CK | Trống, không tự suy đoán |
| S | Tổng CK | Trống, không tự suy đoán |
| T | Mã nt | Cấu hình SSE |
| U | Tỷ giá | Numeric từ cấu hình |
| V | Mã thuế | Cấu hình theo nhóm |
| W | Tk nợ | Cấu hình SSE |
| X | Tk doanh thu | Cấu hình SSE |
| Y | Tk giá vốn | Cấu hình SSE |
| Z | Tk thuế có | Cấu hình SSE |
| AA | Khách hàng | Trống theo mẫu quan sát |
| AB | Tk chiết khấu | Cấu hình SSE |
| AC | Vụ việc | Trống |
| AD | Bộ phận | Trống |
| AE | Lsx | Trống |
| AF | Sản phẩm | Trống |
| AG | Hợp đồng | Trống |
| AH | Phí | Trống |
| AI | Khế ước | Trống |
| AJ | Mã NVBH | Mapping SSE trên đơn; fallback cấu hình |

---

## 5. Hai phương án đã đánh giá

### Phương án A — Service tập trung, values-only — Đã chọn

**File chính:** `src/services/sseInvoiceExport.service.js`

**Lợi ích**

- Không phụ thuộc template hoặc đường dẫn filesystem.
- Hoạt động giống nhau trên Windows và Linux/Render.
- Một nguồn logic cho VAT/NON_VAT.
- Dễ test cấu trúc, kiểu dữ liệu, mapping và chống trùng.
- Không giữ công thức/cached value hoặc dữ liệu kỳ cũ.

**Nhược điểm**

- Chưa thể sao chép style/defined name của golden workbook thật.
- Nếu SSE thực tế phụ thuộc hidden sheet, cần chuyển sang chế độ template sau khi có bằng chứng.

**Effort:** Medium  
**Rủi ro:** Low–Medium, tập trung ở độ chính xác contract SSE chưa được importer xác nhận.  
**Tương thích dữ liệu cũ:** Có, qua classifier VAT và fallback mã có cấu hình.

### Phương án B — Dùng nguyên template — Không chọn ở bản này

**File dự kiến:** `templates/sse/Mẫu 2 (01-31.05).xlsx` và service copy/clear/write.

**Lợi ích**

- Giữ nguyên 10 sheet, hidden state, style và defined name.
- Phù hợp nếu SSE phụ thuộc workbook nguyên bản.

**Nhược điểm**

- Golden fixture thực tế chưa được cung cấp.
- Rủi ro sót dữ liệu/công thức kỳ cũ.
- Phụ thuộc đúng tên file và deploy artifact trên Linux.
- Writer hiện tại không phải engine bảo toàn toàn bộ workbook template.

**Effort:** Medium  
**Rủi ro:** Medium khi thiếu file mẫu thật.  
**Tương thích:** Chưa xác minh.

---

## 6. Danh sách file thay đổi

```text
.env.example
.env.production.example
config/sse-export.json
config/source-bundles.json
public/css/95-report-center-popup.css
public/fragments/index/05-index-body.html
public/fragments/index/07-index-body.html
public/js/app/admin/08f-vat-export.js
src/controllers/importExportController.js
src/services/importExportLegacy.service.js
src/services/importExportLegacy.service.source/part-01.jsfrag
src/services/importExportLegacy.service.source/part-03.jsfrag
src/services/sseInvoiceExport.service.js
src/utils/excelWriter.util.js
test/fixtures/index-page/phase79-assembled.sha256
test/fixtures/sse/sse-contract.json
test/sse-invoice-export.test.js
test/sse-invoice-export-integration.test.js
SSE_INVOICE_EXPORT_IMPLEMENTATION_REPORT.md
```

`src/services/importExportLegacy.service.js` và `config/source-bundles.json` được cập nhật bằng source-bundle generator chính thức, không sửa tay lệch source.

---

## 7. Diff quan trọng

### 7.1 Excel writer hỗ trợ ngày thật

**Mã cũ**

```javascript
if (typeof value === 'number') return '<c ...><v>...</v></c>';
return '<c ... t="inlineStr">...</c>';
```

**Mã mới**

```javascript
excelDate('2026-05-15')
// -> Excel serial numeric + style dd/mm/yyyy

excelText('0000456')
// -> inline string, không mất số 0 đầu
```

**Lý do:** SSE cần date cell thực và mã dạng text.

### 7.2 API export SSE

**Mã cũ**

```javascript
exportToExcel(type, query)
```

**Mã mới**

```javascript
exportToExcel(type, query, currentUser)

sseInvoiceExportService.buildSseInvoiceWorkbook(query, currentUser)
sseInvoiceExportService.buildSseErrorReportWorkbook(query, currentUser)
```

**Lý do:** áp dụng tenant scope hiện hữu và trả báo cáo lỗi mapping riêng.

### 7.3 Workbook

```javascript
appendAoaSheet(workbook, 'TỔNG', [
  [], [], [], [],
  SSE_HEADERS,
  ...rows
]);
```

**Lý do:** khóa chính xác header row 5/data row 6; không dùng công thức hoặc sheet phụ chưa xác minh.

### 7.4 Frontend

```html
<select id="sseInvoiceTypeSelect">
  <option value="VAT">VAT</option>
  <option value="NON_VAT">Không VAT</option>
</select>
<button id="exportSseInvoiceButton">Xuất Excel SSE</button>
```

**Lý do:** giữ bộ lọc ngày, chọn nhóm rõ ràng, một request, loading/disable và báo lỗi chi tiết.

---

## 8. API contract

### 8.1 Xuất file upload SSE

```http
GET /api/export/sse-invoice-orders.xlsx
```

Query:

```text
invoiceType=VAT|NON_VAT      bắt buộc
dateFrom=YYYY-MM-DD          tùy chọn
dateTo=YYYY-MM-DD            tùy chọn
limit=1..SSE_MAX_ORDERS      tùy chọn, bị clamp phía server
```

Phân quyền:

```text
admin | manager | accountant | warehouse
```

Thành công:

```http
200
Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
Content-Disposition: attachment; filename="SSE_Hoa_don_...xlsx"
```

Lỗi:

- `400 INVALID_INVOICE_TYPE`.
- `404 SSE_NO_DATA`.
- `422 SSE_CONFIG_INVALID`.
- `422 SSE_MAPPING_INVALID`, kèm `errors`, `totalErrors`, `errorReportUrl`.
- `401/403` từ middleware xác thực/phân quyền hiện hữu.

### 8.2 Tải báo cáo lỗi mapping

```http
GET /api/export/sse-invoice-errors.xlsx
```

Dùng cùng query/filter với file chính. Sheet `Loi_mapping` gồm:

```text
Mã đơn | Khách hàng | Mã sản phẩm | Tên sản phẩm |
Trường bị thiếu | Nguyên nhân | Hướng xử lý
```

---

## 9. Cấu hình

Nguồn mặc định deploy-safe:

```text
config/sse-export.json
```

Có thể override bằng ENV:

```text
SSE_SHEET_NAME
SSE_INVOICE_TYPE
SSE_INVOICE_SYMBOL
SSE_WAREHOUSE_CODE
SSE_CURRENCY_CODE
SSE_EXCHANGE_RATE
SSE_TAX_CODE
SSE_DEBIT_ACCOUNT
SSE_REVENUE_ACCOUNT
SSE_COGS_ACCOUNT
SSE_OUTPUT_TAX_ACCOUNT
SSE_DISCOUNT_ACCOUNT
SSE_SALESMAN_CODE
SSE_VAT_RATE
SSE_ALLOW_CANONICAL_CUSTOMER_CODE_FALLBACK
SSE_ALLOW_CANONICAL_PRODUCT_CODE_FALLBACK
SSE_MAX_ORDERS
SSE_MAX_ROWS
```

Override riêng nhóm:

```text
SSE_VAT_INVOICE_TYPE / SSE_NON_VAT_INVOICE_TYPE
SSE_VAT_INVOICE_SYMBOL / SSE_NON_VAT_INVOICE_SYMBOL
SSE_VAT_TAX_CODE / SSE_NON_VAT_TAX_CODE
```

---

## 10. Kết quả kiểm thử

### 10.1 Test riêng tính năng

| Nhóm | Kết quả |
|---|---:|
| Contract 36 cột/Unicode | Đạt |
| VAT và NON_VAT rời nhau | Đạt |
| Quy tắc giá VAT/NON_VAT | Đạt |
| Trừ trả hàng | Đạt |
| Hủy/xóa/qty=0 | Đạt |
| Thiếu mapping không tạo mã giả | Đạt |
| Thiếu đơn vị/giá | Đạt |
| Sheet/dòng/header/date/text/numeric | Đạt |
| Không công thức/#N/A/null/NaN | Đạt |
| Một item → một dòng | Đạt |
| Không trùng order | Đạt |
| Frontend/route/RBAC static | Đạt |
| Batch query và zero write integration | Đạt |
| Query injection qua invoiceType | Đạt, chặn trước DB |
| Mapping error 422 + report URL | Đạt |
| Golden fixture thật | Skip có điều kiện vì file không tồn tại |

Test thực thi riêng: **15/15 đạt**, cộng **1 test golden thật skip có điều kiện**.

### 10.2 Regression toàn dự án

| Phiên bản | Tổng | Đạt | Lỗi | Skip |
|---|---:|---:|---:|---:|
| ZIP gốc | 798 | 794 | 4 | 0 |
| Sau patch | 814 | 809 | 4 | 1 |

Bốn lỗi nền giống hệt ZIP gốc:

1. Cache-version DMS inventory.
2. Import worker làm mất `importMode` khi async.
3. Import session/worker assertion `importMode`.
4. Cache-version sales order script.

Không có lỗi mới do SSE.

### 10.3 Quality gate

| Kiểm tra | Kết quả |
|---|---|
| JavaScript syntax | 835 file đạt |
| Source bundles | 18/18 đạt |
| Path portability | 1.009 path đạt |
| Source size budget | Đạt |
| Enterprise smoke | Đạt |
| OpenAPI | 306 operations, đồng bộ |
| npm audit high | 0 lỗ hổng |
| Artifact-tool workbook inspection | A1:AJ7 đúng, không formula error |

---

## 11. File Excel mẫu kết quả

Đã tạo:

```text
SSE_Hoa_don_VAT_mau_kiem_thu.xlsx
```

- 1 sheet `TỔNG`.
- 4 dòng trống đầu.
- 36 tiêu đề đúng ở dòng 5.
- 2 dòng sản phẩm fixture từ dòng 6.
- Mã có số 0 đầu được giữ dạng text.
- Ngày là date serial `15/05/2026`.
- Không có công thức hoặc lỗi cell.

ZIP không chứa database hoặc dữ liệu đơn hàng production; vì vậy file mẫu dùng fixture kiểm thử rõ ràng, **không được mô tả là dữ liệu thật hiện có**.

---

## 12. Side effect

| Vùng | Ảnh hưởng |
|---|---|
| Đơn hàng | Read-only; không update trạng thái |
| Đơn tổng | Không đọc/ghi; tránh trùng đơn tổng + đơn con |
| VAT | Dùng classifier hiện tại; không đổi cờ |
| Doanh số | Không thay đổi |
| Khuyến mại | Đọc snapshot giá sau KM; không ghi |
| Công nợ | Không đọc/ghi ledger |
| Quỹ | Không ảnh hưởng |
| Tồn kho | Không ảnh hưởng |
| Trả hàng | Chỉ đọc để trừ số lượng |
| Báo cáo khác | Giữ nguyên route và export hiện có |
| Quyền | Dùng middleware export hiện hữu |
| Hiệu năng | 1 query/orders + 1 returnOrders + 1 customers + 1 products, không N+1 |
| Deployment | Không template path tuyệt đối; tương thích Linux/Render |

---

## 13. Điều kiện nghiệm thu còn mở

Để xác nhận câu “tải trực tiếp lên SSE” ở mức tuyệt đối, cần một trong hai bằng chứng:

1. Cung cấp file golden thật `Mẫu 2 (01-31.05).xlsx` để chạy đối chiếu toàn workbook; và
2. Import file kết quả vào môi trường SSE thử nghiệm, xác nhận importer không phụ thuộc 9 sheet phụ/defined name/style/formula.

Nếu SSE từ chối workbook một sheet vì phụ thuộc template, chuyển sang Phương án B mà không đổi mapping/service dữ liệu; chỉ thay lớp renderer workbook.
