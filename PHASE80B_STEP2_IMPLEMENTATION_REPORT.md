# PHASE80B — BƯỚC 2: TRIỂN KHAI QUY TẮC EXCEL

Ngày thực hiện: 19/06/2026

## Thành phần dùng chung

### `src/domain/catalog/ProductCatalogExportPolicy.js`

Quy định duy nhất cho dữ liệu catalog dùng trong Excel:

- `packingQty(product)` trả về số lượng đóng gói dạng số.
- `salePrice(product)` trả về giá bán danh mục.
- Không fallback sang dữ liệu giao dịch.

### `src/services/excel/ProductExcelEnrichmentService.js`

- Thu thập mã sản phẩm duy nhất.
- Tải danh mục theo batch qua `productRepository.findByCodes()`.
- Tạo product map dùng chung.
- Bổ sung `catalogPackingQty` và `catalogSalePrice` vào dòng Excel.
- Tránh N+1 query khi file có nhiều dòng.

## Luồng ExcelInteraction

Đã cập nhật `src/services/excel/ExcelInteractionService.js`:

- Đơn con: thêm Quy cách, Giá bán; giữ Giá sau KM.
- Đơn tổng: thêm Quy cách, Giá bán trong sheet sản phẩm.
- Phiếu nhập: thêm Quy cách, Giá bán; giữ Giá nhập.
- Import preview: tự nhận biết dòng sản phẩm và thêm hai cột chuẩn.
- Report Center: tự thêm/thay thế hai cột chuẩn khi báo cáo có mã sản phẩm.
- Dữ liệu thiếu sản phẩm không bị thay bằng giá chứng từ.

## Luồng export legacy/report/VAT

Đã cập nhật source bundle `importExportLegacy.service`:

- Báo cáo sản phẩm, tồn kho, thẻ kho và report workbook được enrichment tập trung.
- VAT TT78 và đối chiếu VAT có Quy cách/Giá bán từ danh mục.
- Danh sách đơn không xuất VAT có hai cột chuẩn.
- Export collection có sheet chi tiết sản phẩm khi chứng từ chứa `items`.

## Luồng xuất Excel từ cửa sổ in

Đã cập nhật:

- `DmsExactSalesInvoiceBuilder`
- `MasterPickingBuilder`
- `ImportPickingBuilder`
- `ReturnPickingBuilder`
- `dmsExactSalesInvoice.template.js`
- `printTemplates`
- CSS in

Các cột Quy cách/Giá bán được đánh dấu `excel-only-column`:

- Ẩn hoàn toàn khi in giấy.
- Hiện khi bấm Xuất Excel.
- Bố cục in giấy vẫn giữ nguyên.

Riêng đơn con giữ đồng thời:

- Giá bán danh mục.
- Đơn giá sau thuế/trước KM hiện có.
- Giá sau KM hiện có.

## Hiệu năng

- Một lần export chỉ tải danh mục theo tập mã sản phẩm duy nhất.
- Không bổ sung query trong vòng lặp dòng.
- Không thay đổi database schema hoặc index.
