# PERFORMANCE_TURBO_PATCH_REPORT

## Mục tiêu
Tăng tốc các endpoint nóng trong mobile sales, delivery, promotion, stock và debts bằng cách bỏ full snapshot không cần thiết, dùng query trực tiếp có projection, cache TTL ngắn và bổ sung index.

## File đã sửa

- `src/services/mobile/sales.service.js`
  - Bỏ `getPrimaryDataSnapshot()` khỏi các luồng nóng: tạo đơn, xoá đơn, xem chi tiết, danh sách đơn, công nợ.
  - Chuyển sang query trực tiếp `SalesOrder`, `Customer`, `Product`, `ReturnOrder`, `ArLedger`.
  - Xoá đơn mobile có reverse tồn nếu đơn đã post stock.
  - Công nợ app bán hàng dùng fast aggregate theo NVBH trước, fallback service cũ nếu thiếu điều kiện.

- `src/repositories/mongoCollection.repository.js`
  - Thêm `patchByIdentity()` để update một phần document bằng `$set`.

- `src/repositories/orderRepository.js`
  - Thêm `patchByIdentity()` cho `salesOrders`.

- `src/services/orderService.js`
  - Tối ưu `cancelOrder()` bằng patch `$set`, tránh upsert/replace toàn bộ document.

- `src/engines/delivery.engine.js`
  - Thêm fast path cho danh sách đơn giao theo `deliveryStaffCode`.
  - Thêm projection để giảm payload.
  - Tối ưu `/api/delivery/returns` đọc trực tiếp `returnOrders`, tránh đi vòng qua `SalesOrder.find`.

- `src/services/mobile/catalog.service.js`
  - Thêm cache TTL ngắn cho `/api/mobile/catalog/products`.
  - Thêm projection trường cần dùng.

- `src/services/promotionService.js`
  - Thêm cache TTL cho `/api/promotions/programs`.
  - Clear cache khi có thay đổi promotion rule/program/tier.

- `src/services/inventoryStock.service.js`
  - Thêm cache TTL ngắn cho `/api/stock` / inventory summary.

- `src/services/mongoIndexService.js`
  - Bổ sung index cho mobile sales list và mobile debts AR fast path.

## ENV khuyến nghị

```env
MOBILE_CATALOG_PRODUCTS_CACHE_TTL_MS=5000
INVENTORY_SUMMARY_CACHE_TTL_MS=5000
PROMOTION_PROGRAM_CACHE_TTL_MS=30000
```

## Kiểm tra đã chạy

Đã chạy `node --check` cho các file sửa chính: PASS.

`npm test` trong sandbox chưa pass trọn bộ vì môi trường thiếu dependency `mongoose`. Ngoài ra có một static test liên quan pattern trong `orderService.js` cần kiểm tra/cập nhật lại theo patch mới.

## Lưu ý triển khai

- Cache catalog/stock chỉ ảnh hưởng hiển thị, không dùng để quyết định trừ tồn khi tạo đơn.
- Xoá đơn mobile giờ reverse tồn nếu `stockPosted=true`, đúng hơn nhưng cần regression test luồng xoá/hủy đơn.
- Fast path `/api/delivery/returns` giả định `returnOrders` đã có `deliveryStaffCode`/`deliveryDate`. Nếu dữ liệu cũ thiếu field này, cần chạy script normalize hoặc bật fallback cũ.
