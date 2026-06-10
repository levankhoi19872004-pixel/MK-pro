# V45 Import Excel speed optimized

Đã tối ưu luồng đọc đơn và import nhiều file Excel:

1. Preview chỉ parse Excel, gom đơn, validate bằng dữ liệu preload/cached Map; không insert đơn, không trừ tồn, không ghi AR Ledger.
2. Rule Engine validate lại mã khách hàng, mã NVBH và mã sản phẩm bằng batch preload từ Mongo một lần, tránh query từng đơn/từng dòng.
3. Commit vẫn lấy dữ liệu từ import session và ghi bằng bulk: `insertManyInBatches`, `bulkWriteInBatches`, `applyInventoryMovementsBulk`.
4. Tồn kho khi commit gom theo `productCode|warehouseCode` trong `inventoryDeltas`, mỗi sản phẩm/kho chỉ tạo một bulk update.
5. Frontend preview chỉ render tối đa `IMPORT_PREVIEW_RENDER_LIMIT` dòng đầu, ưu tiên dòng lỗi; các dòng còn lại vẫn được chọn/import theo session để tránh lag DOM.
6. Bổ sung index cho `orders.documentCode`, `orders.invoiceCode`, `users.code`, `users.employeeCode`, `users.salesStaffCode`, `users.deliveryStaffCode`, `import_logs.batchCode`.
7. Import DMS giữ trạng thái pending/assigned flow hiện có và không post AR Ledger tại bước import.

Các file chính đã sửa:

- `src/rules/importRules.js`
- `public/js/app/08-reports-users-promotions-import-excel.js`
- `src/services/mongoIndexService.js`
