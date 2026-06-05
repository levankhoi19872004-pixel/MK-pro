# V45 - Sửa báo cáo hàng trả màn Đơn đi giao hôm nay lấy đúng returnOrders

## Vấn đề
Khung Danh sách hàng trả bên phải đã gọi được `/api/return-orders` và hiển thị đúng dòng hàng trả, nhưng KPI/list bên trái vẫn hiển thị `Hàng trả = 0`.

Nguyên nhân là service `listDeliveryToday()` đang cộng tiền trả hàng từ `returnOrders` nhưng chỉ đọc các trường cũ:

- `totalAmount`
- `amount`
- `debtReduction`

Trong luồng return draft mới sinh từ đơn con, dữ liệu chuẩn lại nằm ở:

- `totalReturnAmount`
- hoặc từng dòng `items[].returnAmount`
- hoặc `items[].returnQty * price`

Vì vậy phần bên phải đúng, còn báo cáo/KPI bên trái sai.

## Đã sửa
File sửa chính:

```text
src/services/masterOrderService.js
```

Thêm hàm chuẩn hóa tiền hàng trả:

```js
returnOrderTotalAmount(row)
```

Thứ tự lấy tiền hàng trả hiện tại:

```text
1. totalReturnAmount
2. totalAmount
3. amount
4. debtReduction
5. returnAmount / returnedAmount
6. Nếu các tổng trên không có, tự cộng từ items:
   returnAmount hoặc amount hoặc returnQty × price
```

Sửa `returnAmountForSalesOrder()` để cộng đúng từ `returnOrders`.

Sửa luồng đơn bị khóa/gộp đơn tổng trả hàng để cũng lấy đúng `totalReturnAmount`.

## Kết quả mong đợi
Khi sửa số lượng trả trong Danh sách hàng trả:

```text
returnOrders.items[].returnQty = 3
returnOrders.items[].returnAmount = 35.748
returnOrders.totalReturnAmount = 35.748
```

Màn Đơn đi giao hôm nay phải hiển thị đồng bộ:

```text
KPI Hàng trả = 35.748
Dòng đơn TH = 35.748
Tổng kết bên phải Hàng trả = 35.748
Còn nợ = Phải thu - TM - CK - Trả thưởng - Hàng trả
```

Với ví dụ ảnh:

```text
Phải thu: 307.408
Tiền mặt: 100.000
Chuyển khoản: 100.000
Trả thưởng: 50.000
Hàng trả: 35.748
Còn nợ đúng: 21.660
```

## Test đã chạy

```text
node -c src/services/masterOrderService.js
node -c public/js/app/06-master-delivery.js
npm run docs:generate
```
