# Phase 2.9 - Tách route/controller/service khỏi legacyApp

## Mục tiêu

Giảm phụ thuộc vào `src/legacy/legacyApp.js` bằng cách đưa các API còn dùng thường xuyên sang luồng chuẩn:

```text
route -> controller -> service -> repository/model
```

`server.js` vẫn chỉ còn nhiệm vụ khởi động app qua `src/app.js`.

## Đã tách thêm trong Phase 2.9

### System / Health / Data Source

File mới:

```text
src/routes/systemRoutes.js
src/controllers/systemController.js
src/services/systemService.js
src/constants/collectionKeys.js
```

Endpoint được mount trước legacy guard:

```text
GET /api/health
GET /api/health/db
GET /api/data
GET /api/system/data-source
```

### Import Excel runtime

File mới:

```text
src/routes/excelImportRoutes.js
src/controllers/excelImportController.js
src/services/excelImportService.js
```

Endpoint:

```text
POST /api/import/preview
POST /api/import/commit
GET  /api/import/logs
```

Ghi chú:

- `products` và `customers` import ghi trực tiếp MongoDB bằng upsert.
- Các loại import khác vẫn dùng `importService` hiện có nhưng đi qua service riêng, không route trực tiếp trong legacy.

### Print API

File mới:

```text
src/routes/printRoutes.js
src/controllers/printController.js
src/services/printDocumentService.js
```

Endpoint:

```text
POST /api/print/render
GET  /api/print/:type/:id
```

## Đã cập nhật

```text
src/routes/index.js
```

Bổ sung mount route:

```js
app.use('/api', systemRoutes);
app.use('/api/import', excelImportRoutes);
app.use('/api/print', printRoutes);
```

## Trạng thái sau Phase 2.9

- `server.js`: đã sạch, chỉ gọi `startServer()`.
- `src/app.js`: vẫn là entry app duy nhất.
- API chính: đã chạy qua route/controller/service nhiều hơn.
- `src/legacy/legacyApp.js`: vẫn còn giữ fallback và các helper cũ để tránh vỡ luồng mobile/legacy.

## Việc nên làm tiếp

### Phase 2.10

Tách tiếp phần mobile còn nằm trong legacy:

```text
/api/mobile/login
/api/mobile/refresh
/api/mobile/me
/api/mobile/roles
/api/mobile/customers
/api/mobile/products
/api/mobile/stock
/api/mobile/sales/orders
```

Nên tạo:

```text
src/routes/mobile/auth.routes.js
src/routes/mobile/sales.routes.js
src/controllers/mobile/auth.controller.js
src/controllers/mobile/sales.controller.js
src/services/mobile/auth.service.js
src/services/mobile/sales.service.js
src/repositories/mobile/auth.repository.js
src/repositories/mobile/sales.repository.js
```

Sau khi tách xong mobile, mới nên xóa dần các route trùng trong `legacyApp.js`.
