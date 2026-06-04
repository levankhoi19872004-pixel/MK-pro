# V45 Index Standardized Report

## Mục tiêu

Chuẩn hoá index để tránh khai báo trùng giữa model và `src/services/mongoIndexService.js`, giảm chi phí ghi dữ liệu khi tạo đơn/import/lưu tiền, đồng thời giữ các index chính phục vụ luồng tìm kiếm xuyên suốt phần mềm.

## Đã chỉnh sửa

### 1. Bỏ khai báo index trùng tại model

Đã bỏ index trực tiếp trong các file:

- `src/models/SalesOrder.js`
- `src/models/Customer.js`
- `src/models/Product.js`
- `src/models/User.js`
- `src/models/_flexModel.js`

Các model chỉ giữ schema dữ liệu. Index nghiệp vụ được quản lý tập trung tại:

- `src/services/mongoIndexService.js`

Một số index đặc biệt vẫn giữ trong model vì liên quan ràng buộc/TTL riêng:

- `Staff`: unique `code`, unique `username`
- `Permission`: unique `roleCode + module`
- `ImportSession`: unique `sessionId`, TTL `createdAt`

### 2. Rút gọn index sản phẩm

Giữ các index chính:

- `code`
- `barcode`
- `isActive + code`
- `isActive + category`
- `brand`
- `warehouseCode + code`
- text index `searchText`

Bỏ nhóm dễ trùng/chậm ghi:

- `name`
- `category`
- `salePrice`
- `warehouseCode`
- `searchText: 1`

### 3. Rút gọn index khách hàng

Giữ các index chính:

- `code`
- `customerCode`
- `phone`
- `staffCode + route + isActive`
- `isActive + code`
- `routeName`
- text index `searchText`

Bỏ nhóm dễ trùng/chậm ghi:

- `name`
- `customerName`
- `staffCode`
- `route`
- `searchText: 1`

### 4. Chuẩn hoá index đơn bán `orders`

Giữ các nhóm index chính phục vụ:

- tìm theo mã đơn / mã hoá đơn
- lọc theo khách hàng
- lọc theo NVBH
- lọc đơn giao theo ngày giao + NVGH + trạng thái giao
- lọc theo trạng thái + ngày đơn
- gắn đơn con với đơn tổng
- lọc theo nguồn đơn

Bỏ nhóm gần trùng:

- `date + status`
- `hot_list_report` quá rộng
- `mergeStatus + date + staffCode`
- `customerName`, `staffName`, `routeName`
- `source + orderDate` bản cũ
- các index đảo thứ tự `orderDate + salesStaffCode + status`
- các index dùng `date` song song với `orderDate` nếu không cần thiết cho màn danh sách mới

### 5. Chuẩn hoá index đơn tổng `master_orders`

Giữ các nhóm index chính phục vụ:

- mã đơn tổng
- lọc ngày giao + NVGH
- lọc app giao hàng
- xác nhận kế toán
- tìm đơn con nằm trong đơn tổng

Bỏ nhóm gần trùng:

- `deliveryDate: 1 + deliveryStaffCode + status`
- `deliveryStaffName`
- `routeName`
- `hot_list_report` quá rộng
- `date` đơn lẻ

### 6. Tối ưu hàm ensureMongoIndexes

File:

- `src/services/mongoIndexService.js`

Đã sửa để mỗi collection chỉ gọi:

```js
Model.collection.indexes()
```

một lần, thay vì gọi lại trong từng vòng lặp index. Điều này giảm thời gian khởi động server khi collection có nhiều index.

### 7. Thêm script xoá index dư trên MongoDB thật

Đã thêm:

- `scripts/drop-redundant-indexes.js`

Thêm lệnh npm:

```bash
npm run mongo:drop-redundant-indexes:dry
npm run mongo:drop-redundant-indexes
```

Nên chạy dry-run trước để xem index nào sẽ bị xoá.

## Lưu ý quan trọng

Việc xoá index khỏi source code chỉ ngăn server tạo lại index đó. Những index đã tồn tại trong MongoDB Atlas sẽ vẫn còn cho đến khi chạy script xoá index hoặc xoá thủ công trong Atlas.

Quy trình khuyến nghị:

```bash
npm run mongo:drop-redundant-indexes:dry
npm run mongo:drop-redundant-indexes
npm run mongo:indexes
```

Sau đó kiểm tra lại tốc độ bằng API danh sách đơn và MongoDB `explain()`.
