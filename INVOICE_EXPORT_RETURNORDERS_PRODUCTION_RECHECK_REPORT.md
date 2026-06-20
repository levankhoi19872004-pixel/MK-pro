# INVOICE EXPORT RETURNORDERS — PRODUCTION RECHECK REPORT

## 1. Kết luận từ hai file người dùng cung cấp

Đơn `B0037855` vẫn xuất nguyên vẹn trong cả hai file ngày 19/06/2026.

### VAT

- Khách hàng: `4501594 — Chị Thái An`
- 4 dòng sản phẩm, tổng số lượng cơ sở: `14`
- Tiền bán trước thuế: `557.533,34`
- Thuế 8%: `44.602,67`
- Tổng cộng: `602.136`

Sheet `DoiChieu` của file VAT cho cả 4 dòng:

- `SoLuongTra = 0`
- `SoLuongTraAnToan = 0`
- `ReturnOrderCode = null`
- `ReturnOrderId = null`
- `ReturnQtySource = null`

Điều này chứng minh lỗi xảy ra trước bước ghi workbook: dataset export không nạp/không nhận diện được `returnOrders` của đơn, không phải dữ liệu bị ghi đè ở Excel.

### SSE

Đơn `B0037855` vẫn có đủ 4 dòng và tổng tiền `602.136`, trùng đúng số “Hàng trả” trên màn hình Đơn giao hôm nay. Vì vậy đây là đơn trả hết nhưng chưa bị loại khỏi dataset SSE.

## 2. Nguyên nhân gốc rễ

Bản vá trước chưa bao phủ đúng hình dạng dữ liệu `returnOrders` production.

### Lỗi 1 — Query export chỉ lấy phiếu đã qua kế toán

File: `src/services/invoiceExportQuery.service.js`

`buildReturnLinkFilter()` cũ bắt buộc một trong các điều kiện:

- `accountingConfirmed`
- `arPosted`
- `accounting_confirmed`
- `posted_to_ar`

Trong khi luồng Đơn giao hôm nay ghi rõ `returnOrders` thực tế của app giao hàng thường có:

- `returnStatus = active` hoặc `waiting_receive`
- `accountingStatus = pending`

Màn hình giao hàng vẫn tính đây là hàng khách đã trả, nhưng export đã loại các document này ngay từ MongoDB query.

### Lỗi 2 — Parser số lượng trả bỏ qua `quantity` và `qty`

File: `src/services/invoiceNetSales.service.js`

`returnedQtyOf()` cũ chỉ đọc:

- `returnQty`
- `qtyReturn`
- `returnQuantity`
- `returnedQty`
- `baseReturnQty`

Trong khi return item production/legacy có thể lưu trực tiếp ở `quantity` hoặc `qty`. Khi đó phiếu có được load thì số lượng trả vẫn bị hiểu bằng 0.

### Lỗi 3 — Export thiếu khóa liên kết đơn tổng

Query và allocator cũ chưa đọc đầy đủ:

- `masterOrderId`
- `masterOrderCode`
- các alias master cũ

Trong khi Đơn giao hôm nay có fallback theo đơn tổng khi chỉ có một đơn con. Export vì thế có thể không bắt được document cũ chỉ lưu khóa master.

## 3. Bản sửa

### `invoiceExportQuery.service.js`

- Query tất cả `returnOrders` liên kết theo đơn bán hoặc đơn tổng trong một batch.
- Không còn yêu cầu accounting confirmation ngay ở Mongo query.
- Sau query, áp dụng rule operational giống màn Đơn giao hôm nay:
  - nhận `waiting_receive`, `active`, `received`, `accounting_confirmed`, `posted_to_ar`;
  - loại `draft`, `cancelled`, `void`, `deleted`, `cleared`, `rejected`, `inactive`.
- Bổ sung projection các khóa master.

### `invoiceNetSales.service.js`

- Đọc thêm `quantity`, `qty`, `totalQuantity`, `totalQty` cho return item.
- Ưu tiên ghép trực tiếp bằng ID/code đơn bán.
- Chỉ fallback qua master khi có đúng một đơn bán phù hợp trong dataset; nếu nhiều đơn con thì cảnh báo và không tự trừ.
- Vẫn cộng tổng theo `đơn bán gốc + productCode`, không ghép bằng tên.
- Loại dòng `netQty = 0`; loại toàn bộ đơn khi mọi dòng bằng 0.

## 4. Side effect

Bản sửa chỉ thay đổi truy vấn đọc và tính dataset export.

Không:

- sửa/xóa SalesOrder;
- sửa/xóa ReturnOrder;
- post/reverse tồn kho;
- ghi công nợ hoặc quỹ;
- thay trạng thái giao hàng/kế toán;
- đổi cấu trúc VAT/SSE;
- đổi API contract.

## 5. Kiểm thử

- Targeted tests: `22/22 PASS`
- Full suite: `887 PASS`, `0 FAIL`, `1 SKIP` (golden fixture SSE gốc)
- Source bundles: `18/18 PASS`
- JavaScript syntax: `868 files PASS`
- Path portability: `1053 paths PASS`
- OpenAPI: `310 operations PASS`
- Enterprise smoke: PASS
- npm audit high+: `0 vulnerabilities`

Test production-shaped mới mô phỏng chính xác `B0037855`:

- `returnStatus = active`
- `accountingStatus = pending`
- return item dùng `quantity`
- 4 product codes và số lượng `1, 6, 6, 1`

Kết quả: `fullyReturned = true`, `exportableLines = 0`.

## 6. Kiểm chứng sau deploy

Xuất lại ngày 19/06/2026 và kiểm tra:

1. `B0037855` không còn trong `Sheet1`, `DoiChieu` và `TỔNG`.
2. VAT giảm từ 4 xuống 3 hóa đơn và từ 26 xuống 22 dòng sản phẩm nếu không có thay đổi dữ liệu khác.
3. SSE giảm 4 dòng của `B0037855` nếu không có thay đổi dữ liệu khác.
4. Các đơn trả một phần vẫn còn với số lượng thực còn lại.
