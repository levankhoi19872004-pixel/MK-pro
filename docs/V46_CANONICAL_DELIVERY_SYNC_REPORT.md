# V46 Canonical Delivery Sync Report

## Mục tiêu
Đồng bộ lại luồng App giao hàng và phần mềm "Đơn đi giao hôm nay" theo 1 nguồn chuẩn.

## Quy tắc đã áp dụng

### 1. Nguồn dữ liệu chuẩn
- Đơn gốc: `salesOrders`
- Hàng trả: `returnOrders`
- Frontend không được tự đọc hàng trả từ snapshot/cache cũ.

### 2. Object chuẩn cho một đơn giao
Backend tạo thêm object chuẩn qua `deliveryFinance.buildCanonicalDeliveryOrder()`:

```js
{
  orderId,
  orderCode,
  salesOrderId,
  salesOrderCode,
  customerCode,
  customerName,
  deliveryDate,
  salesStaffCode,
  deliveryStaffCode,
  items: [
    { productCode, productName, deliveredQty, returnQty, price, returnAmount }
  ],
  amounts: {
    receivable,
    cash,
    bank,
    reward,
    returnAmount,
    processed,
    debt
  },
  statusInfo: {
    delivered,
    paymentStatus,
    returnStatus
  }
}
```

### 3. API đọc danh sách
- `GET /api/mobile/delivery/orders` trả object chuẩn cho app.
- `GET /api/master-orders/delivery-today-orders` cũng trả object chuẩn cùng cấu trúc để web render giống app.

### 4. API ghi hàng trả
- `POST /api/mobile/delivery/return`
- Backend lọc toàn bộ dòng có `returnQty <= 0`.
- Nếu sau lọc không còn dòng nào, backend clear `returnOrders` về 0.

### 5. API ghi tiền
- Bổ sung alias `POST /api/mobile/delivery/payment` dùng cùng logic với xác nhận giao hàng.
- Công thức chuẩn: `debt = receivable - cash - bank - reward - returnAmount`.

### 6. Hàm tính tiền chung
Đã mở rộng `src/utils/deliveryFinance.util.js`:
- `buildCanonicalDeliveryItems()`
- `buildCanonicalDeliveryAmounts()`
- `buildCanonicalDeliveryOrder()`

### 7. Frontend app giao hàng
- Ưu tiên đọc `order.amounts.*` do backend trả về.
- Không tự đoán hàng trả từ `order.returnAmount` khi không có `returnOrders/items` chuẩn.

### 8. Frontend web Đơn đi giao hôm nay
- Ưu tiên đọc `row.amounts.*`.
- Danh sách sản phẩm/hàng trả đọc từ `items` chuẩn.

## Test kỹ thuật đã chạy
- `node --check` toàn bộ JS trong `src`, `public/mobile/js`, `public/js/app`, `public/js/utils`: OK.
- Test nhanh `deliveryFinance.buildCanonicalDeliveryOrder()`: OK.

## Test nghiệp vụ cần chạy sau deploy
1. Không có hàng trả → app và web đều hiện hàng trả = 0.
2. Có hàng trả → app và web cùng hiện đúng.
3. Sửa hàng trả về 0 trên app → web reload về 0.
4. Sửa hàng trả trên web qua endpoint returnOrders hiện có → app reload đúng cùng `items/amounts`.
