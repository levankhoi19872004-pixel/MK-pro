# GIAI ĐOẠN 2 — Chuẩn hóa toàn bộ điểm đọc tồn

## Mục tiêu
Chuẩn hóa các luồng Import DMS, Preview DMS, kiểm tra vượt tồn, App bán hàng, mobile routes, báo cáo tồn kho và inventory service chỉ đọc tồn hiện tại từ collection `inventories` thông qua model `InventoryLegacy`.

## Đã xử lý

1. `src/services/excelImportService.js`
   - Bỏ import `../models/Inventory` đang map sang `inventorySnapshots`.
   - Import DMS / preview / kiểm tra vượt tồn chỉ đọc `InventoryLegacy.find(...)`.
   - Ghi tồn bulk chỉ ghi vào `InventoryLegacy`, không ghi song song sang snapshot.

2. `src/services/mobile/sales.service.js`
   - Bỏ đọc song song snapshot + legacy.
   - Tồn mở bán app bán hàng chỉ lấy từ `InventoryLegacy`.

3. `src/routes/mobileRoutes.js`
   - Đã kiểm tra `/api/mobile/products` và `/api/mobile/catalog`.
   - Luồng tính tồn đang dùng `InventoryLegacy.find(...)`, không sửa thêm vì đã đúng nguồn `inventories`.

4. `src/services/reportService.js`
   - Đã kiểm tra báo cáo tồn kho hiện tại.
   - Luồng báo cáo tồn đang dùng `InventoryLegacy.find(...)`, không sửa thêm vì đã đúng nguồn `inventories`.

5. `src/services/inventoryService.js`
   - Đổi alias nội bộ từ `Inventory` sang `InventoryLegacy` để tránh nhầm model.
   - Toàn bộ `findOne/find/insertMany/deleteMany` thao tác trên collection `inventories`.

## Chuẩn hóa bổ sung

- `src/models/index.js`: đổi alias `stock`, `inventories`, `inventorySnapshots` về `InventoryLegacy` để các service dùng `models.inventories` không bị đọc nhầm snapshot.
- `src/services/mobileService.js`: đổi tồn mobile cũ sang `InventoryLegacy`.
- `src/services/productService.js`: danh sách sản phẩm lấy tồn từ `InventoryLegacy`.
- `src/repositories/searchRepository.js`: gợi ý/tìm sản phẩm lấy tồn từ `InventoryLegacy`.
- `src/services/importExportService.js`: báo cáo export tồn kho dùng `models.inventories`, nay đã map đúng `InventoryLegacy`.

## Kiểm tra

- Đã chạy `node --check` cho các file chính: không lỗi cú pháp.
- Đã grep toàn bộ `src/services`, `src/routes`, `src/repositories`, `src/models/index.js`: không còn đường đọc tồn trực tiếp qua `../models/Inventory`, `Inventory.find(...)`, `InventorySnapshot`, hoặc comment/alias đọc `inventorySnapshots` nguy hiểm.
- `npm test` chưa chạy trọn vẹn do môi trường thiếu dependency `mongoose` trong `node_modules`; các test không cần Mongo vẫn pass/skip bình thường.
