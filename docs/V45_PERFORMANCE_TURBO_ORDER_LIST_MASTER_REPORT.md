# V45 Performance Turbo - Order List / Save Order / Master Order

## Mục tiêu

Tăng tốc các luồng nặng:

- Load danh sách đơn bán lên lịch sử bán hàng.
- Lưu đơn bán.
- Sửa đơn bán pending.
- Tạo đơn tổng từ danh sách đơn con đã tick.
- Cập nhật thông tin đơn tổng.
- Đồng bộ returnOrders khi gộp/cập nhật đơn tổng.

## Các chỉnh sửa chính

### 1. Danh sách đơn dùng API search nhẹ

Frontend dùng:

```txt
GET /api/sales-orders/search
```

API trả dữ liệu summary, phân trang 50 dòng/lần, không load `items` trong danh sách.

### 2. Projection nhẹ cho danh sách đơn

Backend chỉ select các trường cần hiển thị:

- id/code/orderCode/salesOrderCode
- date/orderDate/deliveryDate
- customerCode/customerName
- staffCode/salesStaffCode/deliveryStaffCode
- status/deliveryStatus/mergeStatus
- source/orderSource
- totalAmount/paidAmount/debtAmount

### 3. Click đơn mới load chi tiết

Frontend chỉ gọi:

```txt
GET /api/sales-orders/:id
```

khi bấm sửa/in đơn. Có cache chi tiết để tránh gọi lại nhiều lần.

### 4. Lưu đơn không quét toàn bộ orders

`createOrder()` không dùng `findAll()` để sinh mã đơn nữa. Mã được sinh bằng `makeId('SO')` và dùng thống nhất cho `id`, `code`, `orderCode`, `salesOrderCode` nếu người dùng không truyền mã.

### 5. Lưu/sửa đơn không post tồn kho/AR khi đơn còn pending

- Tạo đơn chỉ lưu đơn và tạo return draft.
- Không gọi xuất kho/AR ở bước tạo đơn.
- Sửa đơn pending không reverse/post lại tồn kho.
- Chỉ post lại khi đơn đã có trạng thái kế toán/post trước đó hoặc khi truyền `postImmediately: true`.

### 6. Gộp đơn tổng không load toàn bộ orders

`createMasterOrder()` chỉ query đúng các đơn được tick bằng `findManyByIdentity(childIds)`.

### 7. Cập nhật đơn con bằng bulkWrite

Khi tạo/cập nhật đơn tổng, đơn con được update bằng `MongoStore.salesOrders.bulkWrite()` thay vì vòng lặp `await orderRepository.upsert()` từng đơn.

### 8. Đồng bộ returnOrders bằng updateMany

Không gọi `attachMasterOrderToReturnDrafts()` từng đơn trong vòng lặp nữa. Thay bằng `MongoStore.returnOrders.updateMany()` theo danh sách mã đơn/id đơn.

### 9. Bổ sung performance indexes

Đã bổ sung index cho:

- `salesOrders`: orderDate/date/salesStaffCode/customerCode/deliveryStaffCode/deliveryStatus/masterOrderCode/source.
- `masterOrders`: deliveryDate/deliveryStaffCode/status/date.
- `returnOrders`: masterOrderCode/deliveryDate/deliveryStaffCode/deliveryOrderId/deliveryOrderCode.

Các index được tạo tự động qua `mongoIndexService` khi server khởi động.

### 10. Log benchmark

Đã thêm log:

```txt
[ORDER_SEARCH]
[CREATE_ORDER_DONE]
[CREATE_MASTER_ORDER_DONE]
```

để đo tốc độ thực tế.

## Test đã chạy

Đã kiểm tra cú pháp:

```txt
node --check src/services/orderService.js
node --check src/services/masterOrderService.js
node --check src/services/mongoIndexService.js
node --check public/js/app/05-sales-orders.js
```

Đã chạy:

```txt
npm run docs:generate
```

Đã chạy `npm test`; một phần test bị dừng do môi trường chưa có `node_modules/mongoose`, không phải lỗi cú pháp sửa đổi. OpenAPI stale đã được cập nhật bằng `docs:generate`.

