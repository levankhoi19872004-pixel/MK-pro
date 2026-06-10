# V45 - Sửa màn Đơn đi giao hôm nay: Danh sách hàng trả gọi đúng nguồn returnOrders

## Vấn đề
Mục **Danh sách hàng trả** ở khung phải của màn **Đơn đi giao hôm nay** đang lấy `row.items`/snapshot đơn giao. Với luồng mới, đơn chờ trả hàng được sinh từ đơn con và lưu ở collection `returnOrders`, nên nhiều đơn không có `row.items` sẽ hiển thị sai: “Đơn này chưa có danh sách sản phẩm...”.

## Hướng sửa
Nguồn đúng của danh sách hàng trả trên phần mềm là:

```text
GET /api/return-orders?salesOrderId=...&salesOrderCode=...
```

Khi chọn một đơn giao ở bên trái:

```text
Chọn đơn giao
→ fill thông tin thu tiền tạm thời
→ gọi /api/return-orders theo salesOrderId/salesOrderCode
→ lấy returnOrder.items
→ render danh sách hàng trả từ returnOrders
```

## File đã sửa

```text
public/js/app/06-master-delivery.js
src/services/returnOrderService.js
```

## Chi tiết sửa frontend

### 1. Thêm helper đọc items từ returnOrders

```text
deliveryReturnDraftItems(row)
deliveryReturnLineSoldQty(item)
deliveryReturnLineReturnQty(item)
```

### 2. Sửa renderDeliveryReturnItems

Ưu tiên nguồn:

```text
row.returnOrderItems
row.returnDraftItems
row.returnOrder.items
row.returnDraft.items
```

Sau đó mới fallback về:

```text
row.items
```

### 3. Thêm hàm tải returnOrders khi chọn đơn

```text
loadReturnDraftForDeliveryRow(row)
```

Hàm này gọi:

```text
/api/return-orders?salesOrderId=<id>&salesOrderCode=<code>
```

và gắn lại vào row:

```text
row.returnOrder
row.returnOrderItems
row.deliveryReturnItems
row.returnItems
row.returnAmount
```

### 4. Sửa selectDeliveryOrder thành async

Luồng mới:

```text
selectDeliveryOrder(id)
→ render panel trạng thái đang tải
→ gọi returnOrders
→ render lại panel bằng đúng returnOrders.items
```

### 5. Payload trả hàng gửi ngược về backend

Mỗi dòng trả hàng giờ gửi thêm:

```text
lineKey
returnQty
qtyReturn
returnQuantity
returnAmount
```

để backend cập nhật đúng dòng trong returnOrders.

## Chi tiết sửa backend

### 1. API list returnOrders lọc thêm deliveryDate

Trước đây date filter chỉ dò:

```text
date
documentDate
```

Đã bổ sung:

```text
deliveryDate
```

### 2. API list returnOrders hỗ trợ alias

Bổ sung lọc theo:

```text
salesOrderId / orderId
salesOrderCode / orderCode
deliveryStaffCode / staffCode / delivery
salesStaffCode / salesman
```

### 3. Không làm sai logic filter

Các điều kiện OR như ngày và mã đơn được đưa vào `$and` để tránh lỗi:

```text
ngày đúng OR mã đơn đúng
```

Phải là:

```text
ngày đúng AND mã đơn đúng
```

## Test đã chạy

```text
node -c public/js/app/06-master-delivery.js
node -c src/services/returnOrderService.js
node -c src/controllers/returnOrderController.js
npm run docs:generate
```

Kết quả: OK.

## Case cần kiểm tra trên giao diện

1. Chọn NVGH.
2. Chọn một đơn giao bên trái.
3. Khung phải gọi đúng `/api/return-orders`.
4. `Danh sách hàng trả` hiển thị sản phẩm từ `returnOrders.items`.
5. Nhập số lượng trả.
6. Bấm lưu chỉnh sửa.
7. Mở lại đúng đơn, số lượng trả vẫn còn.
8. Mục TH/Hàng trả tính theo `returnOrders`, không lấy snapshot đơn giao.
