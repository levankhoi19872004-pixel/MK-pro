# V45 Delivery Today Orders Filter + Error Log Fixed

## File đã sửa

1. `src/services/masterOrderService.js`
2. `src/controllers/masterOrderController.js`

## Nội dung sửa

### 1. Sửa lọc nhân viên giao hàng trong `listDeliveryTodayOrdersCompact()`

Trước đây hàm chỉ lọc theo:

```js
row.deliveryStaffCode
```

Nên khi frontend gửi mã/từ khóa như `ghtp`, trong khi dữ liệu có thể nằm ở tên nhân viên giao hàng, danh sách có thể lọc sai.

Đã bổ sung `deliveryStaffName` vào row và lọc đồng thời theo:

```js
row.deliveryStaffCode
row.deliveryStaffName
master.deliveryStaffCode
master.deliveryStaffName
```

### 2. Thêm log lỗi thật ở controller

Trong `listDeliveryTodayOrdersCompact()`, đã thêm:

```js
console.error('[DELIVERY_TODAY_ORDERS]', err.stack || err);
```

Khi API còn trả 500, Render Log sẽ hiện stack trace thật để biết chính xác dòng lỗi.

## Kiểm tra

Đã chạy kiểm tra cú pháp:

```bash
node --check src/services/masterOrderService.js
node --check src/controllers/masterOrderController.js
```

Không phát hiện lỗi cú pháp.

Lưu ý: Không chạy được test require model `ReturnOrder` trong sandbox vì thư mục chưa cài `node_modules`/`mongoose`.
