# BÁO CÁO TRIỂN KHAI BỘ LỌC XUẤT HÓA ĐƠN VÀ SSE NET SALES

## 1. Phạm vi và quyết định triển khai

Đã triển khai **Phương án A — production-grade** trên mã nguồn `MK-pro-sse-invoice-excel-export-patched(1).zip`.

Nguyên tắc áp dụng:

- Một service truy vấn dùng chung cho VAT, không VAT và SSE.
- Lọc ngày và mã NVBH ngay tại MongoDB.
- SSE luôn xuất `ALL`: gồm cả VAT và không VAT.
- Chỉ đọc dữ liệu; không ghi đơn hàng, trả hàng, tồn kho, công nợ hoặc quỹ.
- Chỉ trừ phiếu trả ở lifecycle kế toán:
  - `accounting_confirmed`.
  - `posted_to_ar`.
- Không trừ `draft`, `waiting_receive`, `received` hoặc `cancelled`.

> Golden fixture gốc `Mẫu 2 (01-31.05).xlsx` chưa có trong ZIP hoặc phiên làm việc. Vì vậy cấu trúc SSE được giữ nguyên theo contract generator đã triển khai trước đó: sheet `TỔNG`, 36 cột A:AJ, tiêu đề dòng 5, dữ liệu từ dòng 6, values-only. Chưa thể chứng minh tuyệt đối khả năng import vào SSE thật khi chưa có file mẫu gốc hoặc môi trường SSE để thử upload.

---

## 2. Báo cáo khảo sát cấu trúc dự án

### 2.1 Data flow trước bản vá

```text
UI Xuất hóa đơn
  └─ public/js/app/admin/08f-vat-export.js
       ├─ VAT       → /api/export/invoice-orders.xlsx?invoiceType=VAT
       ├─ NON_VAT   → /api/export/invoice-orders.xlsx?invoiceType=NON_VAT
       └─ SSE       → /api/export/sse-invoice-orders.xlsx?invoiceType=VAT|NON_VAT

Router
  └─ src/routes/importExportRoutes.js
       └─ GET /api/export/:type.xlsx

Controller
  └─ src/controllers/importExportController.js::exportExcel()

Service
  ├─ src/services/importExportLegacy.service.js
  └─ src/services/sseInvoiceExport.service.js
```

Hạn chế:

1. Khu vực xuất hóa đơn không có bộ lọc ngày/NVBH riêng.
2. VAT và không VAT dùng ngày lấy gián tiếp từ toolbar báo cáo.
3. SSE bắt buộc chọn VAT hoặc không VAT, nên không xuất đủ toàn bộ đơn.
4. SSE và hai file hóa đơn chưa dùng một query contract chung.
5. Logic ngày dùng `$or` giữa nhiều trường, có nguy cơ lấy đơn theo `createdAt` dù `orderDate` nằm ngoài kỳ.
6. Chưa lọc NVBH theo mã tại database.
7. Trạng thái trả hàng trước đây chỉ loại hủy/xóa, có nguy cơ trừ cả phiếu chưa được kế toán xác nhận.

### 2.2 Nguồn dữ liệu

| Nghiệp vụ | Model/collection | Trường chính |
|---|---|---|
| Đơn bán | `src/models/SalesOrder.js` / `orders` | `orderDate`, `items`, `vatInvoiceRequired`, `salesStaffCode` |
| Trả hàng | `src/models/ReturnOrder.js` / `returnOrders` | liên kết đơn gốc, `items`, lifecycle trả hàng |
| Khách hàng | `src/models/Customer.js` | mã chuẩn và mã SSE/kế toán |
| Sản phẩm | `src/models/Product.js` | `productCode`, mã SSE, `baseUnit`, giá |
| Lifecycle trả | `src/domain/lifecycle/ReturnStateMachine.js` | `draft → waiting_receive → received → accounting_confirmed → posted_to_ar` |

### 2.3 Chuẩn ngày nghiệp vụ

Thứ tự ưu tiên duy nhất:

```text
orderDate
→ documentDate khi orderDate thiếu
→ date khi hai trường trên thiếu
→ createdDate khi ba trường trên thiếu
→ createdAt chỉ khi toàn bộ ngày nghiệp vụ thiếu
```

Các trường ngày nghiệp vụ trong `SalesOrder` là chuỗi `YYYY-MM-DD`. `createdAt` fallback được chuyển theo biên ngày `Asia/Ho_Chi_Minh`:

```text
00:00:00.000 +07:00
→ 23:59:59.999 +07:00
```

### 2.4 Chuẩn NVBH

Lọc theo mã, không lọc theo tên:

```text
salesStaffCode
→ salesPersonCode nếu canonical thiếu
→ salesmanCode nếu hai trường trước thiếu
→ nvbhCode nếu ba trường trước thiếu
→ maNVBH nếu toàn bộ trường trên thiếu
```

Không dùng `staffCode/staffName` làm NVBH nghiệp vụ.

---

## 3. Data flow sau bản vá

```text
Bộ lọc chung trên UI
  Từ ngày | Đến ngày | NVBH | Xóa lọc
                    │
                    ▼
public/js/app/admin/08f-vat-export.js
  ├─ VAT     → invoiceType=VAT
  ├─ NON_VAT → invoiceType=NON_VAT
  └─ SSE     → invoiceType=ALL
                    │
                    ▼
src/controllers/importExportController.js
                    │
                    ▼
src/services/invoiceExportQuery.service.js
  ├─ validate dateFrom/dateTo
  ├─ business-date precedence
  ├─ exact salesStaffCode filter
  ├─ active/deleted/VAT filter
  ├─ tenant scope
  ├─ one batch query orders
  ├─ one batch query returnOrders
  ├─ one batch query customers
  └─ one batch query products
                    │
          ┌─────────┴─────────┐
          ▼                   ▼
VAT/NON_VAT workbook     SSE ALL workbook
```

---

## 4. Thuật toán trừ trả hàng

### 4.1 Điều kiện phiếu trả hợp lệ

Một phiếu trả chỉ được trừ khi:

- Không `deleted`, `isDeleted` hoặc `deletedAt`.
- Không ở state `cancelled`.
- Có một trong các dấu hiệu:
  - `accountingConfirmed === true`.
  - Có `accountingConfirmedAt`.
  - `arPosted === true`.
  - Có `arPostedAt`.
  - State chuẩn là `accounting_confirmed` hoặc `posted_to_ar`.

### 4.2 Khóa ghép

Đơn trả được batch-query bằng các khóa liên kết thực tế:

```text
salesOrderId / orderId / sourceOrderId / deliveryOrderId
salesOrderCode / orderCode / sourceOrderCode /
deliveryOrderCode / originalOrderCode
```

Dòng sản phẩm ghép theo:

```text
mã đơn gốc + productCode + lineKey/priceKey khi có
```

Không ghép bằng tên khách hoặc tên sản phẩm.

### 4.3 Công thức

```text
soldQty     = số lượng bán quy về đơn vị cơ sở
returnedQty = tổng số lượng trả hợp lệ cùng khóa dòng
netQty      = max(0, soldQty - returnedQty)
netAmount   = netQty × unitPrice theo contract SSE hiện tại
```

Quy tắc biên:

- Nhiều lần trả: cộng tổng.
- Bản ghi trùng cùng phiếu: chỉ dùng phiên bản phù hợp, không trừ hai lần.
- Trả toàn bộ dòng: bỏ dòng SSE.
- Trả toàn bộ đơn: bỏ đơn SSE.
- Trả vượt: giới hạn về 0 và ghi cảnh báo; không sửa MongoDB.
- Phiếu `draft`, `received`, `cancelled`: không trừ.

---

## 5. Giao diện sau bản vá

Bố cục:

```text
Từ ngày | Đến ngày | Nhân viên bán hàng | Xóa lọc
Xuất hóa đơn VAT | Xuất hóa đơn không VAT | Xuất Excel SSE
```

Hành vi:

- Ba nút sử dụng cùng `dateFrom`, `dateTo`, `salesStaffCode`.
- Frontend chỉ gửi mã NVBH.
- SSE luôn gửi `invoiceType=ALL`.
- Kiểm tra `dateFrom <= dateTo` ở frontend và backend.
- Khóa các control trong lúc xuất.
- Chặn request kép.
- Không reload trang.
- Hiển thị số đơn, số dòng sản phẩm và cảnh báo qua response headers.
- Nút Xóa lọc chỉ xóa ba bộ lọc xuất hóa đơn.

---

## 6. API contract

Router tiếp tục dùng namespace và middleware hiện hữu:

```http
GET /api/export/:type.xlsx
```

### 6.1 VAT

```http
GET /api/export/invoice-orders.xlsx
  ?invoiceType=VAT
  &dateFrom=YYYY-MM-DD
  &dateTo=YYYY-MM-DD
  &salesStaffCode=<CODE>
  &limit=20000
```

### 6.2 Không VAT

```http
GET /api/export/invoice-orders.xlsx
  ?invoiceType=NON_VAT
  &dateFrom=YYYY-MM-DD
  &dateTo=YYYY-MM-DD
  &salesStaffCode=<CODE>
  &limit=20000
```

### 6.3 SSE toàn bộ đơn

```http
GET /api/export/sse-invoice-orders.xlsx
  ?invoiceType=ALL
  &dateFrom=YYYY-MM-DD
  &dateTo=YYYY-MM-DD
  &salesStaffCode=<CODE>
  &limit=20000
```

### 6.4 Báo cáo lỗi/cảnh báo SSE

```http
GET /api/export/sse-invoice-errors.xlsx
  ?invoiceType=ALL
  &dateFrom=YYYY-MM-DD
  &dateTo=YYYY-MM-DD
  &salesStaffCode=<CODE>
```

### 6.5 Phân quyền

Giữ nguyên middleware export hiện hữu:

```text
admin
manager
accountant
warehouse
```

### 6.6 Response

Thành công:

```http
200 OK
Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
Content-Disposition: attachment; filename="...xlsx"
X-Export-Order-Count: <n>
X-Export-Row-Count: <n>
X-Export-Warning-Count: <n>
```

Lỗi:

- `400`: ngày hoặc `invoiceType` không hợp lệ.
- `404`: không có dữ liệu hợp lệ.
- `422`: thiếu mapping/cấu hình SSE; có `errorReportUrl`.
- `401/403`: theo middleware xác thực/phân quyền hiện tại.

---

## 7. Danh sách file thay đổi

### Production code

```text
public/css/95-report-center-popup.css
public/fragments/index/05-index-body.html
public/fragments/index/07-index-body.html
public/index.shell.html
public/js/app/admin/08f-vat-export.js
src/controllers/importExportController.js
src/services/invoiceExportQuery.service.js                  (mới)
src/services/importExportLegacy.service.source/part-01.jsfrag
src/services/importExportLegacy.service.source/part-02.jsfrag
src/services/importExportLegacy.service.source/part-03.jsfrag
src/services/importExportLegacy.service.js                  (generated bundle)
src/services/sseInvoiceExport.service.js
config/source-bundles.json
```

### Tests/snapshots

```text
test/fixtures/index-page/phase79-assembled.sha256
test/invoice-export-query-service.test.js                   (mới)
test/sse-invoice-export-all-return.test.js                  (mới)
test/invoice-export-restoration-static.test.js
test/invoice-export-ui-behavior.test.js
test/invoice-export-workbook.test.js
test/sales-order-vat-invoice-setting-static.test.js
test/sse-invoice-export-integration.test.js
test/sse-invoice-export.test.js
```

Không thay đổi schema MongoDB, package hoặc migration.

---

## 8. Diff quan trọng

### 8.1 SSE trước

```javascript
const invoiceType = sseTypeSelect?.value === 'NON_VAT'
  ? 'NON_VAT'
  : 'VAT';
```

### SSE sau

```javascript
const params = exportParams('ALL');
return download(
  `/api/export/sse-invoice-orders.xlsx?${params.toString()}`,
  sseButton,
  'Excel SSE tất cả đơn',
  'SSE_Hoa_don_tat_ca.xlsx'
);
```

**Lý do:** SSE phải chứa cả VAT và không VAT.

### 8.2 Lọc ngày trước

```javascript
$or: [
  { orderDate: range },
  { date: range },
  { documentDate: range },
  { createdAt: createdAtRange }
]
```

### Lọc ngày sau

```javascript
$or: [
  orderDateInRange,
  orderDateMissing + documentDateInRange,
  orderDate/documentDateMissing + dateInRange,
  allBusinessDatesMissing + createdAtInVietnamRange
]
```

**Lý do:** không lấy nhầm đơn theo `createdAt` khi đã có ngày nghiệp vụ ngoài kỳ.

### 8.3 Lọc NVBH sau

```javascript
$or: [
  { salesStaffCode: code },
  canonicalMissing + { salesPersonCode: code },
  higherAliasesMissing + { salesmanCode: code },
  higherAliasesMissing + { nvbhCode: code },
  higherAliasesMissing + { maNVBH: code }
]
```

**Lý do:** có mã thì chỉ lọc theo mã, không OR tên và không dùng `staffCode`.

### 8.4 Trạng thái trả trước

```javascript
return !cancelledStatuses.includes(status);
```

### Trạng thái trả sau

```javascript
return state === ACCOUNTING_CONFIRMED
  || state === POSTED_TO_AR
  || row.accountingConfirmed
  || row.arPosted;
```

**Lý do:** không giảm doanh số SSE bằng phiếu nháp/chờ nhận/đã nhận nhưng chưa được kế toán xác nhận.

---

## 9. Kết quả file Excel kiểm thử

File:

```text
SSE_Hoa_don_tat_ca_sau_tra_hang_mau_kiem_thu.xlsx
```

Fixture:

| Chỉ tiêu | Số lượng |
|---|---:|
| Đơn đầu vào | 3 |
| Đơn xuất SSE | 2 |
| Dòng sản phẩm xuất | 4 |
| Đơn trả toàn bộ bị loại | 1 |
| Cảnh báo | 0 |

Tình huống kiểm chứng:

- Đơn VAT có 2 sản phẩm.
- Đơn không VAT có 2 sản phẩm.
- Trả một phần 2 đơn vị và 3 đơn vị được trừ đúng.
- Một phiếu `draft` không bị trừ.
- Một đơn trả toàn bộ bị loại.

Đọc lại bằng `artifact_tool` xác nhận:

- Chỉ có sheet `TỔNG`, đứng đầu.
- Vùng sử dụng `A1:AJ9`.
- Dòng 1–4 trống.
- Dòng 5 có đúng 36 tiêu đề.
- 4 dòng dữ liệu từ dòng 6.
- Ngày là Excel serial với number format `dd/mm/yyyy`.
- Mã `000001`, `000101` giữ số 0 đầu.
- Không có công thức.
- Không có `#REF!`, `#DIV/0!`, `#VALUE!`, `#NAME?`, `#N/A`, `null`, `undefined` hoặc `NaN`.

---

## 10. Kết quả kiểm thử

### 10.1 Test mục tiêu

```text
36 test
35 đạt
0 lỗi
1 skip có điều kiện: so sánh golden fixture SSE thật
```

Các nhóm đã kiểm tra:

- Date validation và khoảng ngày một phía/hai phía.
- Ưu tiên `orderDate` và fallback có điều kiện.
- NVBH canonical và alias lịch sử theo mã.
- Lifecycle trả hàng kế toán.
- Server-side query VAT/NON_VAT/ALL.
- UI một click/một request/loading/reset.
- VAT và không VAT rời nhau.
- SSE ALL có cả hai nhóm.
- Nhiều sản phẩm/multiple returns/full return/over-return.
- Batch query và zero writes.
- Mapping error `422` và error report.
- Workbook 36 cột, values-only, Excel Date.
- Không tạo mã giả.

### 10.2 Toàn bộ dự án

| Bản | Tổng | Đạt | Lỗi | Skip |
|---|---:|---:|---:|---:|
| ZIP gốc | 814 | 809 | 4 | 1 |
| Bản vá | 823 | 818 | 4 | 1 |

Bốn lỗi tồn tại trước patch và trùng hoàn toàn:

1. Cache-version giao diện tồn kho.
2. Import worker không giữ `update` mode.
3. Import session/worker assertion về `importMode`.
4. Cache-version sales-order script.

Không có lỗi regression mới.

### 10.3 Quality gates

| Kiểm tra | Kết quả |
|---|---|
| JavaScript syntax | 839 file đạt |
| Source bundles | 18/18 đạt |
| Source size budget | Đạt |
| Path portability | 1.014 path đạt |
| Enterprise smoke | 10 modules/9 flags đạt |
| OpenAPI | 306 operations, đồng bộ |
| Package-lock registry | Đạt |
| `npm audit --omit=dev --audit-level=high` | 0 lỗ hổng |

---

## 11. Side effect

| Khu vực | Ảnh hưởng |
|---|---|
| Đơn bán | Chỉ đọc, không sửa |
| Đơn trả | Chỉ đọc, không sửa lifecycle/số lượng |
| VAT | Không thay đổi cờ `vatInvoiceRequired` |
| Tồn kho | Không post/reverse stock |
| Công nợ | Không ghi AR |
| Quỹ | Không ghi fund ledger |
| Doanh số | Không thay đổi dữ liệu nguồn |
| Giá/khuyến mại | Giữ contract hiện tại |
| Phân quyền | Giữ middleware cũ |
| Hiệu năng | 4 batch query, không N+1 |
| Linux/Render | Không dùng đường dẫn tuyệt đối/template platform-specific |

---

## 12. Rủi ro còn lại

1. **Chưa có golden fixture SSE thật** nên chưa thể đối chiếu hidden sheet, defined name, formula cache hoặc xác nhận SSE có chấp nhận workbook một sheet.
2. **Chưa upload vào phần mềm SSE thật** nên không thể tuyên bố đã nghiệm thu import end-to-end.
3. Quy tắc chỉ trừ từ `accounting_confirmed`/`posted_to_ar` là lựa chọn kế toán thận trọng đã công bố khi triển khai Phương án A. Nếu nghiệp vụ muốn trừ ngay từ `received`, cần thay một policy duy nhất trong shared query service và cập nhật test.
4. Dữ liệu production có thể còn thiếu mã SSE/mã kế toán; hệ thống sẽ chặn file upload và trả báo cáo lỗi, không tự tạo mã giả.
