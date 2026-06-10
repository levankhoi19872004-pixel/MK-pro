# V46 Inventory Stock Single Source Fixed

## Mục tiêu
Chuẩn hóa toàn bộ luồng đọc tồn kho về một lõi duy nhất:

- Nguồn dữ liệu: `inventories` qua `src/models/InventoryLegacy.js`
- Lõi đọc tồn: `src/services/inventoryStock.service.js`
- Quy tắc đọc tồn: cộng tồn theo `productCode`, không còn lọc cứng `warehouseCode = MAIN` ở các màn đọc/gợi ý/kiểm tra.

## Các thay đổi chính

1. Tạo `src/services/inventoryStock.service.js`
   - `normalizeProductCode()`
   - `quantityOf()`
   - `getAvailableStock(productCode)`
   - `getAvailableStocks(productCodes)`
   - `getInventorySummary(query)`

2. Sửa `src/services/reportService.js`
   - Màn tồn kho hiện tại gọi `inventoryStockService.getInventorySummary()`.

3. Sửa `src/repositories/searchRepository.js`
   - App bán hàng/gợi ý sản phẩm gọi `inventoryStockService.getAvailableStocks()`.
   - Bỏ đọc tồn riêng theo `warehouseCode = MAIN`.

4. Sửa `src/routes/mobileRoutes.js`
   - `getOpenSaleQty()` gọi `inventoryStockService.getAvailableStock()`.
   - Kiểm tra vượt tồn của app bán hàng dùng cùng lõi tồn.

5. Sửa `src/services/mobile/sales.service.js` và `src/services/mobileService.js`
   - Danh sách sản phẩm mobile và kiểm tồn mobile dùng cùng `inventoryStockService`.

6. Sửa `src/services/excelImportService.js`
   - Import DMS kiểm tồn qua `inventoryStockService.getAvailableStocks()`.
   - Không còn tình trạng bảng tồn còn hàng nhưng import/app đọc thành 0 do lệch warehouseCode.

7. Sửa `src/services/inventoryService.js`
   - `assertStockAvailableBeforeOut()` kiểm tồn qua lõi tồn chung.

8. Sửa `src/rules/inventoryRules.js`
   - Rule kiểm tồn dùng `inventoryStockService`.

9. Sửa `src/services/productService.js`
   - Product list enrich tồn qua lõi tồn chung.

10. Sửa `src/services/importExportService.js`
   - Báo cáo Excel tồn kho lấy dữ liệu từ `reportService.stockReport()`.

## Kiểm tra

- Đã chạy `node -c` cho toàn bộ file `.js` trong `src`: OK.
- `npm test` chạy được một phần, nhưng môi trường sandbox thiếu dependency `mongoose`, nên các test cần Mongo/Mongoose bị fail do thiếu module, không phải do lỗi cú pháp code.
