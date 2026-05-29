# Phase 3.4 - Chuẩn hóa tồn kho V45

Nguyên tắc mới:

```text
stockTransactions  = nguồn gốc tồn kho / sổ kho phát sinh
inventorySnapshots = tồn hiện tại để hiển thị nhanh
products           = chỉ lưu danh mục sản phẩm, không lưu tồn
```

## Thay đổi chính

- `src/models/Product.js`: bỏ field tồn thực tế khỏi schema sản phẩm.
- `src/models/Inventory.js`: chuyển collection từ `inventories` sang `inventorySnapshots`.
- `src/services/inventoryService.js`:
  - Mọi nhập/bán/trả hàng ghi vào `stockTransactions`.
  - Sau đó cập nhật `inventorySnapshots`.
  - Không ghi ngược tồn về `products`.
  - Khi rebuild, các field tồn legacy trong `products` chỉ được dùng để tạo giao dịch `OPENING`, sau đó bị `$unset` khỏi `products`.
- `src/services/searchService.js` và `src/services/productService.js`:
  - Tồn hiển thị lấy từ `inventorySnapshots`.
  - Nếu chưa có snapshot, tồn hiển thị = 0 và cần rebuild.

## Sau khi deploy

Chạy API rebuild tồn kho một lần:

```text
POST /api/mobile/inventory/rebuild?resetTransactions=1
```

Hoặc dùng route rebuild tồn kho hiện có trong phần quản trị nếu UI đã có nút.

Sau khi rebuild:

- `stockTransactions` có các phát sinh nhập/bán/trả hàng/tồn đầu.
- `inventorySnapshots` có tồn hiện tại.
- `products` không còn lưu tồn thực tế.
