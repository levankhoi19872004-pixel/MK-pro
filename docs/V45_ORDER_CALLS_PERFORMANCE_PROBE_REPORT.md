# V45 - Kiểm tra hàm gọi đơn và bổ sung đo tốc độ phản hồi

## Phạm vi đã kiểm tra

1. App bán hàng mobile:
- `GET /api/mobile/sales/orders`
- `GET /api/mobile/sales/orders/:id`
- `POST /api/mobile/sales/orders`
- `PUT /api/mobile/sales/orders/:id`
- `DELETE /api/mobile/sales/orders/:id`

2. Danh sách đơn bán trên phần mềm:
- `GET /api/sales-orders/search`

3. Phần Đơn đi giao hôm nay:
- `GET /api/master-orders/delivery-today-orders`
- `GET /api/master-orders/delivery-today-summary`
- `GET /api/master-orders/delivery-today-summary/:deliveryStaffCode`
- `GET /api/mobile/delivery/orders`
- alias cũ `GET /api/mobile/delivery-orders`

## Phần đã bổ sung đo tốc độ

### Backend toàn cục

File sửa:

- `src/app.js`

Đã thêm `apiPerformanceProbe()` để đo các API trọng điểm:

- `/api/sales-orders/search`
- `/api/mobile/sales/orders`
- `/api/mobile/delivery/orders`
- `/api/mobile/delivery-orders`
- `/api/master-orders/delivery-today`
- `/api/master-orders/delivery-today-orders`
- `/api/master-orders/delivery-today-summary`

Kết quả trả về JSON có thêm:

```json
{
  "serverMs": 123,
  "ms": 123,
  "perf": {
    "serverMs": 123,
    "route": "/api/...",
    "method": "GET"
  }
}
```

Header cũng có:

```text
X-Response-Time-Ms: 123
```

Log backend:

```text
[API_PERF]
[API_PERF_SLOW]
```

Mặc định API quá `800ms` sẽ log dạng chậm. Có thể chỉnh bằng biến môi trường:

```bash
API_PERF_WARN_MS=800
API_PERF_LOG=1
```

### Backend Đơn đi giao hôm nay

File sửa:

- `src/services/masterOrderService.js`

Đã thêm đo chi tiết trong `listDeliveryToday()`:

```json
{
  "perf": {
    "masterQueryMs": 10,
    "childrenQueryMs": 20,
    "returnOrdersQueryMs": 15,
    "buildRowsMs": 40,
    "totalMs": 90,
    "masterCount": 5,
    "childCount": 120,
    "returnOrderCount": 4,
    "rowCount": 120
  }
}
```

Log backend:

```text
[DELIVERY_TODAY_PERF]
```

### Frontend danh sách đơn bán

File sửa:

- `public/js/app/05-sales-orders.js`

Màn danh sách đơn sẽ hiển thị thêm:

```text
API xxxms · Trình duyệt xxxms · Query xxxms · Count xxxms
```

Console log:

```text
[SALES_ORDER_LIST_PERF]
```

### Frontend Đơn đi giao hôm nay

File sửa:

- `public/js/app/06-master-delivery.js`

Đã đo:

```text
[DELIVERY_TODAY_LIST_PERF]
[DELIVERY_TODAY_ORDERS_PERF]
[DELIVERY_TODAY_SUMMARY_PERF]
```

Dòng trạng thái của màn Đơn đi giao hôm nay có thêm:

```text
API xxxms · Trình duyệt xxxms
```

### Mobile app

File sửa:

- `public/mobile/js/api.js`

Mọi request mobile trọng điểm trả thêm:

```js
response.__clientPerf = {
  path,
  clientMs,
  serverMs,
  perf
}
```

Console log:

```text
[MOBILE_API_PERF]
```

## Lỗi cú pháp phát hiện và đã sửa

File:

- `src/services/orderService.js`

Có lỗi khai báo trùng:

```js
const staff = await resolveStaff(body);
const staff = await resolveStaff(body);
```

Đã sửa còn 1 dòng để tránh lỗi khi chạy Node.

## Cách kiểm tra sau khi chạy server

1. Mở phần mềm web.
2. Vào `Lịch sử bán hàng` hoặc `Đơn đi giao hôm nay`.
3. Mở DevTools → Console.
4. Xem các log:

```text
[SALES_ORDER_LIST_PERF]
[DELIVERY_TODAY_LIST_PERF]
[DELIVERY_TODAY_ORDERS_PERF]
[DELIVERY_TODAY_SUMMARY_PERF]
[MOBILE_API_PERF]
```

5. Trên server Render/log local xem:

```text
[API_PERF]
[API_PERF_SLOW]
[DELIVERY_TODAY_PERF]
[ORDER_SEARCH_FAST]
```

## Ý nghĩa chỉ số

- `serverMs`: thời gian backend xử lý API.
- `clientMs`: thời gian trình duyệt nhận phản hồi, gồm network + backend.
- `queryMs`: thời gian Mongo lấy danh sách đơn.
- `countMs`: thời gian Mongo đếm tổng số đơn.
- `mapMs`: thời gian chuyển dữ liệu sang format frontend.
- `returnOrdersQueryMs`: thời gian lấy hàng trả để ghép vào đơn giao.
- `buildRowsMs`: thời gian dựng dữ liệu danh sách đơn giao.

Nếu `serverMs` cao: chậm nằm ở backend/query.
Nếu `clientMs` cao nhưng `serverMs` thấp: chậm nằm ở mạng hoặc render frontend.
Nếu `countMs` cao: cần tối ưu hoặc bỏ count chính xác ở danh sách đơn.
Nếu `returnOrdersQueryMs` cao: cần index/tối ưu source `returnOrders`.
