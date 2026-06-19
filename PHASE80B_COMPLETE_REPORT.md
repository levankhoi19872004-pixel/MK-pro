# PHASE80B — EXCEL PRODUCT CATALOG RULE

## Mục tiêu

Chuẩn hóa toàn hệ thống: mọi Excel có sản phẩm phải kèm Quy cách dạng số và Giá bán từ danh mục sản phẩm; đơn con vẫn giữ Giá sau KM.

## Kết quả

- Tạo policy catalog dùng chung.
- Tạo service enrichment batch, không N+1 query.
- Áp dụng cho ExcelInteraction, report/VAT/export legacy và Excel từ cửa sổ in.
- Bổ sung cột Excel-only để không thay đổi mẫu in giấy.
- Đơn con có ba lớp giá rõ ràng khi cần: giá trước thuế, Giá bán danh mục và Giá sau KM.
- 665/665 test đạt; 0 lỗ hổng production.

## File chính

- `src/domain/catalog/ProductCatalogExportPolicy.js`
- `src/services/excel/ProductExcelEnrichmentService.js`
- `src/services/excel/ExcelInteractionService.js`
- `src/services/importExportLegacy.service.source/*`
- `src/domain/print/builders/*PickingBuilder.js`
- `src/domain/print/builders/DmsExactSalesInvoiceBuilder.js`
- `templates/print/dmsExactSalesInvoice.template.js`
- `templates/printTemplates.source/*`
- `test/excel-product-catalog-rule.test.js`

## Rủi ro còn lại

Không có thay đổi write path. Rủi ro chủ yếu là một mã sản phẩm trong chứng từ không còn tồn tại trong danh mục; khi đó catalog field được để trống thay vì dùng nhầm giá giao dịch.
