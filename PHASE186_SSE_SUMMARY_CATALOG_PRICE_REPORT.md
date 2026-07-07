# Phase186 - SSE TONG_THEO_NVBH dùng giá bán danh mục sản phẩm

## Phạm vi

Chức năng: Báo cáo → Xuất hóa đơn → Xuất Excel SSE.

Mục tiêu: giữ nguyên sheet upload SSE `TỔNG`, đồng thời thêm/cập nhật sheet nội bộ `TONG_THEO_NVBH` theo quy chuẩn đơn tổng NVBH.

## Nguyên tắc đã chốt

- Sheet `TỔNG` giữ nguyên mẫu SSE: 36 cột A:AJ, header dòng 5, dữ liệu từ dòng 6.
- Sheet `TONG_THEO_NVBH` lấy số lượng từ chính các dòng đã xuất ra sheet `TỔNG`.
- Sheet `TONG_THEO_NVBH` không dùng giá bán thực tế trên từng dòng đơn con.
- Giá bán sheet tổng lấy từ danh mục sản phẩm, ưu tiên `product.salePrice`, sau đó `price`, `unitPrice`, `basePrice`.
- Group key mới chỉ còn `Mã NVBH + Mã hàng`.
- Cùng NVBH, cùng mã hàng dù khác giá đơn con vẫn gộp thành 1 dòng.
- Thành tiền sheet tổng = tổng số lượng net × giá bán danh mục sản phẩm.

## File đã sửa

- `src/services/sseInvoiceExport.service.js`
  - Thêm `SALESMAN_SUMMARY_SHEET_NAME` và `SALESMAN_SUMMARY_HEADERS`.
  - Thêm metadata `summarySourceRows` sinh song song với từng dòng `TỔNG`.
  - Thêm `catalogSalePriceInfo(...)` để lấy giá bán danh mục sản phẩm.
  - Thêm `buildSseSalesmanSummaryRows(...)` và `buildSseSalesmanSummaryAoa(...)`.
  - `buildSseInvoiceWorkbook(...)` truyền `built.summarySourceRows` để file export thực tế có sheet `TONG_THEO_NVBH`.
- `test/sse-invoice-export-salesman-summary.test.js`
  - Thêm test cho sheet tổng theo NVBH dùng giá danh mục.

## Cách đảm bảo sheet tổng khớp sheet chính

`summarySourceRows` chỉ được push sau khi một dòng SSE hợp lệ đã được push vào `rows` của sheet `TỔNG`.

Vì vậy:

- Dòng nào lỗi mapping thì không vào sheet `TỔNG` và không vào sheet tổng.
- Dòng nào bị trả hết còn netQty = 0 thì không vào sheet `TỔNG` và không vào sheet tổng.
- Bộ lọc VAT/NON_VAT/ALL/NVBH/KH được áp trước khi build `rows`, nên sheet tổng luôn theo đúng dataset đã xuất.

## Test đã chạy

```bash
node --check src/services/sseInvoiceExport.service.js
node --check src/services/invoiceExportQuery.service.js
npm run check:source-bundles
node --test test/sse-invoice-export.test.js test/sse-invoice-export-salesman-summary.test.js test/sse-invoice-export-integration.test.js test/sse-invoice-export-all-return.test.js
```

Kết quả targeted SSE tests:

- 25 tests
- 24 pass
- 1 skip optional golden fixture
- 0 fail

## Rủi ro còn lại

Nếu danh mục sản phẩm thiếu `salePrice`/`price`/`unitPrice`/`basePrice`, export SSE vẫn không fail. Sheet tổng vẫn có dòng sản phẩm nhưng `Giá bán = 0`, `Tiền hàng = 0`, và cột ghi chú hiển thị `Thiếu giá bán trong danh mục sản phẩm`.
