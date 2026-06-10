# V45 Mobile Delivery Query Key Standardized

## Mục tiêu
Tối ưu API app giao hàng sau khi Query Trace chỉ ra:
- `GET /api/mobile/delivery/orders` chậm do `SalesOrder.find` dùng nhiều nhánh `$or`.
- `POST /api/mobile/delivery/confirm` chậm do `ReturnOrder.find` có `$in` chứa giá trị sai kiểu như `[object Object]`.

## File đã sửa

### `src/routes/mobileRoutes.js`
- Thêm helper chuẩn hóa khóa:
  - `toCleanDocKey()`
  - `compactKeys()`
  - `orderIdKeys()`
  - `orderCodeKeys()`
  - `buildSalesOrderLookupKeys()`
  - `buildReturnOrderFilter()`
- Sửa `masterChildIds()` để không biến object thành chuỗi `[object Object]`.
- Sửa `orderIdentityKeys()` để chỉ lấy field định danh thật, không đưa nguyên object vào `$in`.
- Sửa `GET /api/mobile/delivery/orders`:
  - Bỏ query `SalesOrder.find({ $or: [...] })` 5 nhánh.
  - Chuyển sang query tuần tự theo khóa có index: `id` → `code` → `orderCode` → `orderNo` → `_id` fallback.
  - Sửa `ReturnOrder.find` từ 9 nhánh `$or` còn 2 khóa chuẩn: `salesOrderId`, `salesOrderCode`.
- Sửa `buildArDebtMapForOrders()`:
  - Bỏ 6 nhánh `$or`.
  - Chỉ query AR Ledger theo `salesOrderId` và `salesOrderCode`.

### `src/services/mongoIndexService.js`
- Bổ sung index fallback:
  - `orders.orderNo`
  - `arLedgers.salesOrderId`
  - `arLedgers.salesOrderCode`
  - `returnOrders.salesOrderId + status`
  - `returnOrders.salesOrderCode + status`

## Kỳ vọng sau sửa
- Query Trace không còn xuất hiện `$in: ["[object Object]"]`.
- `GET /api/mobile/delivery/orders` giảm mạnh Mongo Time vì không còn `$or` 5 nhánh.
- `POST /api/mobile/delivery/confirm` giảm mạnh Mongo Time vì `ReturnOrder.find` chỉ còn khóa chuẩn.
- API Monitor sẽ chỉ ra query cụ thể nếu còn field nào thiếu index.
