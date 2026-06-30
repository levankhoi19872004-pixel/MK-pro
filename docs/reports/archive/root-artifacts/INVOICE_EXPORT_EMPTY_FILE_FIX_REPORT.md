# BÁO CÁO SỬA LỖI FILE XUẤT HÓA ĐƠN TRỐNG

## 1. Hiện tượng

Tại Trung tâm báo cáo, người dùng chọn ngày và bấm **Xuất hóa đơn VAT**. API `/api/export/invoice-orders.xlsx` trả HTTP 200 và trình duyệt tải file, nhưng workbook chỉ có tiêu đề/không có dữ liệu. Giao diện cũng không hiển thị số đơn hoặc số dòng sản phẩm sau tên file.

## 2. Nguyên nhân gốc rễ

### 2.1. Scope tenant bị bật ngoài ý muốn

File: `src/services/invoiceExportQuery.service.js`

Hàm cũ:

```js
function buildTenantClause(currentUser = {}) {
  if (cleanText(process.env.TENANT_MODE).toLowerCase() === 'single') return null;
  const tenantId = cleanText(currentUser.tenantId || currentUser.tenantCode);
  return tenantId ? { tenantId } : null;
}
```

Khi `TENANT_MODE` không được khai báo trên Render, chuỗi rỗng không bằng `single`, nên code tự thêm điều kiện `{ tenantId: ... }` như đang chạy multi-tenant. Các đơn lịch sử chưa có `tenantId` bị lọc hết dù ứng dụng thực tế đang chạy single-tenant.

Đây là nguyên nhân trực tiếp làm query trả `orders=[]`, sau đó service vẫn tạo workbook hợp lệ nhưng không có dòng dữ liệu.

Quy ước của các module khác trong dự án là:

```js
String(process.env.TENANT_MODE || 'single').toLowerCase() === 'multi'
```

Nghĩa là chỉ scope tenant khi biến môi trường được bật rõ thành `multi`.

### 2.2. Backend cho phép tải workbook 0 dòng

Hai builder VAT và không VAT vẫn tạo file khi không có dòng sản phẩm, trả HTTP 200 cùng `X-Export-Row-Count: 0`. Vì vậy lỗi truy vấn bị che dưới dạng một file Excel trống.

### 2.3. Frontend không chặn file 0 dòng

`public/js/app/admin/08f-vat-export.js` chỉ kiểm tra HTTP status và Content-Type. Nếu server trả workbook 200 nhưng `X-Export-Row-Count=0`, trình duyệt vẫn tải file.

## 3. Phương án đã triển khai

### Phương án A — Production-grade

1. Mặc định `TENANT_MODE=single`; chỉ thêm tenant filter khi giá trị là `multi`.
2. VAT/NON_VAT trả HTTP 404 `INVOICE_EXPORT_NO_DATA` nếu không có dòng hợp lệ.
3. Frontend chặn tải nếu response header xác nhận số dòng bằng 0.
4. Giữ nguyên API contract, cấu trúc workbook, công thức giá, VAT, khuyến mại và trả hàng.

Effort: Easy  
Rủi ro: Thấp  
Tương thích dữ liệu cũ: Cao

### Phương án B — Chỉ cấu hình Render

Đặt `TENANT_MODE=single` trên Render mà không sửa code.

Nhược điểm: lỗi có thể tái diễn trên môi trường khác hoặc khi ENV bị thiếu; file 0 dòng vẫn bị tải và che lỗi. Không chọn.

## 4. File thay đổi

```text
src/services/invoiceExportQuery.service.js
src/services/importExportLegacy.service.source/part-02.jsfrag
src/services/importExportLegacy.service.js
public/js/app/admin/08f-vat-export.js
config/source-bundles.json
test/invoice-export-query-service.test.js
test/invoice-export-empty-regression.test.js
INVOICE_EXPORT_EMPTY_FILE_FIX_REPORT.md
```

## 5. Diff quan trọng

### 5.1. Tenant mode

Mã mới:

```js
function buildTenantClause(currentUser = {}) {
  const tenantMode = cleanText(process.env.TENANT_MODE || 'single').toLowerCase();
  if (tenantMode !== 'multi') return null;
  const tenantId = cleanText(currentUser.tenantId || currentUser.tenantCode);
  return tenantId ? { tenantId } : null;
}
```

### 5.2. Không tạo file VAT trống

```js
if (!rows.length) {
  return {
    error: 'Không có đơn VAT hoặc dòng sản phẩm hợp lệ trong phạm vi bộ lọc đã chọn',
    status: 404,
    code: 'INVOICE_EXPORT_NO_DATA'
  };
}
```

### 5.3. Không tạo file không VAT trống

```js
const exportableDetailRows = detailRows.filter(
  (row) => Number(row['Số lượng còn lại']) > 0
);

if (!orderRows.length || !exportableDetailRows.length) {
  return {
    error: 'Không có đơn không VAT hoặc dòng sản phẩm hợp lệ trong phạm vi bộ lọc đã chọn',
    status: 404,
    code: 'INVOICE_EXPORT_NO_DATA'
  };
}
```

### 5.4. Frontend chặn tải file 0 dòng

```js
const rowCountHeader = response.headers.get('x-export-row-count');
if (
  rowCountHeader !== null
  && rowCountHeader !== ''
  && Number(rowCountHeader) === 0
) {
  throw new Error(
    'Không có dữ liệu phù hợp với bộ lọc đã chọn. File trống đã được chặn tải xuống.'
  );
}
```

## 6. API sau bản vá

Route không thay đổi:

```http
GET /api/export/invoice-orders.xlsx
```

Query:

```text
invoiceType=VAT|NON_VAT
dateFrom=YYYY-MM-DD
dateTo=YYYY-MM-DD
salesStaffCode=<mã NVBH>
limit=<số đơn tối đa>
```

Khi có dữ liệu:

```http
200 application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
X-Export-Order-Count: <n>
X-Export-Row-Count: <n>
```

Khi không có dữ liệu:

```http
404 application/json
```

```json
{
  "ok": false,
  "message": "Không có đơn VAT hoặc dòng sản phẩm hợp lệ trong phạm vi bộ lọc đã chọn",
  "code": "INVOICE_EXPORT_NO_DATA"
}
```

## 7. Kết quả kiểm thử

| Test | Kết quả | Ghi chú |
|---|---:|---|
| TENANT_MODE thiếu mặc định single-tenant | Đạt | Không gắn `tenantId` vào query |
| TENANT_MODE=multi | Đạt | Có scope theo `tenantId` |
| VAT không dữ liệu | Đạt | Trả 404, không có buffer |
| NON_VAT không dữ liệu | Đạt | Trả 404, không có buffer |
| Frontend chặn response 0 dòng | Đạt | Không tạo link download |
| VAT/NON_VAT workbook regression | Đạt | Phân nhóm và workbook không đổi |
| SSE regression | Đạt | VAT + NON_VAT và trừ trả hàng không đổi |
| Test mục tiêu | 30 đạt, 1 skip | Skip golden SSE thật chưa có |
| Full suite | 821/826 đạt | 4 lỗi baseline, 1 golden skip |
| JavaScript syntax | 840 file đạt | |
| Source bundles | 18/18 đạt | |
| Path portability | 1.016 đường dẫn đạt | Linux/Render |
| OpenAPI | 306 operations đạt | |
| npm audit high | 0 | |

Bốn lỗi baseline không liên quan bản vá:

1. Cache-version DMS inventory.
2. Hai assertion cũ của import worker về `importMode`.
3. Cache-version sales-order source shard.

## 8. Side effect

| Khu vực | Ảnh hưởng |
|---|---|
| Đơn hàng | Không ghi/chỉnh sửa |
| VAT | Không thay đổi classifier |
| Khuyến mại và giá | Không thay đổi |
| Hàng trả | Không thay đổi |
| Tồn kho | Không ảnh hưởng |
| Công nợ | Không ảnh hưởng |
| Quỹ | Không ảnh hưởng |
| SSE | Không thay đổi contract/workbook |
| Multi-tenant | Vẫn scope tenant khi `TENANT_MODE=multi` |
| Single-tenant/dữ liệu cũ | Khôi phục đọc đơn thiếu `tenantId` |

## 9. Kết quả mong đợi sau deploy

- Nếu có đơn đúng bộ lọc: file tải xuống có số đơn và số dòng sản phẩm trên giao diện.
- Nếu thực sự không có dữ liệu: giao diện hiển thị thông báo rõ ràng và không tải file trống.
- Không cần migration hoặc cập nhật hàng loạt `tenantId` cho dữ liệu cũ trong chế độ single-tenant.
