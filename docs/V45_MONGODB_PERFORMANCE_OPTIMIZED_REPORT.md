# V45 MongoDB Performance Optimized

Đã áp dụng tối ưu hiệu năng MongoDB cho KHO Minh Khai Pro V45.

## Đã sửa

1. Connection MongoDB
- `maxPoolSize`, `minPoolSize`
- `serverSelectionTimeoutMS`, `socketTimeoutMS`
- IPv4 `family: 4`
- `retryWrites`, `w: majority`
- bật debug bằng `MONGOOSE_DEBUG=true` hoặc môi trường development

2. Index quan trọng
- Product: active/category, warehouseCode/code, searchText thường và text index
- Customer: staffCode/route/isActive, searchText thường và text index
- User: staffCode/code/employeeCode, role/isActive/staffCode
- SalesOrder: status/deliveryStatus/date/customerCode/staffCode/mergeStatus
- MasterOrder: list/report compound index
- Journal: customerCode/type/date, refCode/type
- Inventory/InventoryLegacy: productCode/warehouseCode
- ImportSession: sessionId và TTL 1 giờ

3. Import session TTL
- Thêm model `ImportSession` cho collection `import_sessions`.
- TTL mặc định 3600 giây, chỉnh bằng `IMPORT_SESSION_TTL_SECONDS`.

## Cách chạy index

```bash
npm run mongo:indexes
```

## Biến môi trường nên cấu hình

```env
MONGO_MAX_POOL_SIZE=50
MONGO_MIN_POOL_SIZE=5
MONGO_SERVER_SELECTION_TIMEOUT_MS=5000
MONGO_SOCKET_TIMEOUT_MS=45000
MONGO_WRITE_CONCERN=majority
MONGOOSE_DEBUG=false
IMPORT_SESSION_TTL_SECONDS=3600
```

## Lưu ý

- Các query read-only hiện đã dùng `.lean()` nhiều nơi. Khi thêm endpoint mới, bắt buộc dùng `.lean()` cho list/search/report.
- Các list dài phải có `limit`, `sort`, và pagination.
- Import DMS đã tối ưu theo hướng cache dữ liệu Mongo một lần và validate bằng Map.
