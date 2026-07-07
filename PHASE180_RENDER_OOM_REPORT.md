# PHASE180 - Render heap out of memory fix

## Lỗi production

Render crash với:

```txt
FATAL ERROR: CALL_AND_RETRY_LAST Allocation failed - JavaScript heap out of memory
Mark-Compact (reduce) ~247 MB / ~255 MB
Exited with status 134
```

App đã `Application ready`, vì vậy đây không phải startup gate/Mongo/PORT. Request gần nhất trong log là `/api/reports/catalog?module=Báo cáo`.

## Nguyên nhân kỹ thuật

- Bản phase179 đưa `exceljs` và VNPT template service vào luồng export VAT nhưng còn `require('exceljs')` ở top-level của `src/services/invoice/VnptTt78TemplateExportService.js`.
- `src/services/importExportLegacy.service.source/part-01.jsfrag` require VNPT service ở top-level, làm import/export legacy kéo ExcelJS ngay cả khi chưa xuất VAT.
- `reportService` và `ReportCenterService` require nhiều report domain service ngay khi mở catalog, làm heap nền cao trên Render plan nhỏ.
- ExcelJS copy style còn clone deep bằng `JSON.stringify` cho từng cell/từng dòng, dễ khuếch đại heap khi export lớn.

## Sửa chính

1. Lazy-load ExcelJS trong `VnptTt78TemplateExportService`.
2. Lazy-require VNPT template service ngay trong nhánh build VAT TT78, không require ở top-level importExportLegacy.
3. Thêm guard `MAX_VNPT_EXPORT_ROWS` mặc định `3000`, lỗi quá lớn trả `VNPT_EXPORT_TOO_LARGE` status `413`.
4. Tối ưu copy style ExcelJS: capture style một lần, reuse style object khi fill dòng.
5. Lazy facade cho `reportService`, chỉ load domain service khi method thật sự được gọi.
6. Lazy service trong `ReportCenterService`, catalog chỉ dựng metadata nhẹ, không load sales/debt/inventory/export domain.
7. Lazy `inventoryService` trong `reportController` cho 2 route rebuild/normalize tồn kho.
8. Sửa pino auto logging để bỏ qua `/api/health`, giảm log health check nhiễu `statusCode:null`.
9. Cập nhật source bundle generated `src/services/importExportLegacy.service.js` từ source fragments.

## Kiểm tra đã chạy

```bash
npm ci --ignore-scripts
npm run source-bundles:refresh
npm run check:source-bundles
npm run check:syntax
node --test test/invoice-export-workbook.test.js test/invoice-export-restoration-static.test.js
NODE_OPTIONS='--max-old-space-size=256' node <memory smoke script>
npm test
```

Kết quả:

- `[source-bundles] OK 19 bundles`
- `SYNTAX_OK 1292 JavaScript files`
- Targeted invoice tests: `7/7 PASS`
- Memory smoke với heap 256MB:
  - after createApp: heapUsed ~53MB
  - after report catalog: heapUsed ~53MB
  - `exceljsLoadedBeforeCatalog=false`
  - `exceljsLoadedAfterCatalog=false`
- `npm test` in ra `141/141 PASS, 0 fail`; sandbox timeout trước khi process trả exit code cuối, nhưng log test đã hoàn tất toàn bộ subtests.

## Gợi ý Render

Nếu Render plan nhỏ vẫn có đỉnh heap cao khi thao tác export Excel lớn, có thể thêm tạm:

```txt
NODE_OPTIONS=--max-old-space-size=384
```

Không đặt quá cao nếu plan RAM chỉ 512MB. Code hiện đã giảm heap nền và chặn export VAT quá lớn để tránh process abort.
