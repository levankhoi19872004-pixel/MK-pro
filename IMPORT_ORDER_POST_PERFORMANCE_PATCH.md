# IMPORT ORDER POST PERFORMANCE PATCH

## Mục tiêu
Tăng tốc thao tác **Nhập kho** cho phiếu nhập lớn. Trường hợp thực tế trên UI ghi nhận:
- `POST /api/import-orders/:id/post`
- khoảng `165.903ms`/hơn 160 giây
- phiếu có tổng số lượng khoảng `159.284`

## Nguyên nhân gốc
Luồng cũ đi qua `InventoryPostingService.postImportIn()` rồi xuống `inventoryService.postStockMovement()`.

Trong `postStockMovement()` hệ thống xử lý từng dòng hàng:
1. `Product.findOne(...)`
2. `StockTransaction.findOne({ idempotencyKey })`
3. `normalizeProductInventoryToMain(...)`
4. `StockTransaction.create(...)`
5. `InventoryLegacy.findOneAndUpdate(...)`
6. `tx.save(...)`

Với phiếu nhập nhiều dòng, số query/write tăng theo N rất lớn.

## Thay đổi chính
### 1. Bulk posting cho nhập kho
File:
- `src/services/inventoryService.js`
- `src/domain/posting/InventoryPostingService.js`

Thêm boundary:
- `postStockMovementBulkImportIn()`

Luồng mới:
1. Gom dòng theo `productCode`.
2. Resolve sản phẩm bằng 1 query batch.
3. Kiểm tra idempotency bằng 1 query batch.
4. `StockTransaction.insertMany(...)`.
5. `InventoryLegacy.bulkWrite(...)`.

### 2. Không rewrite toàn bộ phiếu nhập khi bấm Nhập kho
File:
- `src/repositories/importOrderRepository.js`
- `src/services/importOrderService.js`

Luồng cũ ghi lại cả document phiếu nhập kèm mảng `items` lớn.

Luồng mới chỉ `$set` các field:
- `status`
- `stockPosted`
- `postedAt`
- `postedBy`
- `totalQuantity`
- `totalAmount`
- `updatedAt`

### 3. Hydrate dòng nhập bằng batch
File:
- `src/services/importOrderService.js`

Thay vì `productRepository.findAll({})`, chỉ query các mã sản phẩm có trong phiếu.

### 4. UI không block thêm vì load tồn
File:
- `public/js/app/05-sales-orders.js`

Sau khi nhập kho:
1. Reload lịch sử phiếu nhập trước.
2. Reload tồn kho chạy nền.

### 5. Index bổ sung
File:
- `src/services/mongoIndexService.js`

Thêm index cho `importOrders` theo:
- `status + createdAt`
- `date + status`
- `documentDate + status`
- `importDate + status`

## Kiểm tra đã chạy
```bash
node --check src/services/importOrderService.js
node --check src/services/inventoryService.js
node --check src/domain/posting/InventoryPostingService.js
node --check src/repositories/importOrderRepository.js
node --check src/services/inventoryStock.service.js
node --check src/services/mongoIndexService.js
node --check public/js/app/05-sales-orders.js
node --test test/import-order-bulk-post-static.test.js
```

## Kỳ vọng sau vá
Endpoint `POST /api/import-orders/:id/post` sẽ giảm mạnh vì không còn query/write từng dòng hàng theo kiểu tuần tự.
