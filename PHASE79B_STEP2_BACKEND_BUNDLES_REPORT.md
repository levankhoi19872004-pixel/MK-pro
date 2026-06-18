# PHASE79B — BƯỚC 2: BACKEND VÀ PRINT TEMPLATE

## File đã xử lý

1. `src/services/returnOrderLegacy.service.js`
2. `src/services/importExportLegacy.service.js`
3. `src/services/reportLegacy.service.js`
4. `src/services/orderLegacy.service.js`
5. `src/services/mobile/sales.service.js`
6. `src/engines/delivery.legacy.engine.js`
7. `services/printDataBuilder.legacy.js`
8. `src/services/fundService.js`
9. `src/services/inventoryService.js`
10. `templates/printTemplates.js`

## Cách thực hiện

- Nguồn chuẩn được chia thành các `.jsfrag`, tối đa 24 KiB/file.
- File runtime CommonJS được sinh bằng Terser, giữ nguyên `module.exports`.
- Runtime target được giữ nguyên đường dẫn để route/controller không phải đổi.
- SHA-256 của nguồn ghép lại phải bằng checksum trước refactor.

## Kết quả

- Cả 10 runtime file đều dưới 40 KiB.
- Module load và export contract được kiểm thử tự động.
- Không thay đổi transaction boundary và dependency runtime.

## Rủi ro và kiểm soát

- Không sửa trực tiếp file runtime đã sinh.
- Mọi thay đổi nguồn phải chạy `npm run source-bundles:refresh` sau review.
- CI chạy `npm run check:source-bundles` để chặn artifact cũ hoặc sai checksum.
