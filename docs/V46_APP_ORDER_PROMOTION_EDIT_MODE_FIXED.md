# V46 - Sửa quy tắc phương thức bán khi sửa đơn APP

## Mục tiêu

Khi mở sửa đơn bán hàng:

- Đơn tạo từ APP / mobile / NVBH mặc định tích **Bán theo khuyến mại**.
- Đơn import DMS / Excel mặc định tích **Bán thẳng giá mặc định**.
- Radio **không bị khóa**, Admin/Kế toán vẫn đổi linh hoạt trước khi lưu.

## File đã sửa

- `public/js/app/05-sales-orders.js`

## Nội dung sửa

### 1. Thêm nhận diện nguồn đơn

Thêm các hàm:

- `getSalesOrderSourceText(order)`
- `isAppSalesOrder(order)`
- `isImportSalesOrder(order)`

Các hàm này đọc nguồn từ nhiều field khác nhau:

- `source`
- `orderSource`
- `orderSourceName`
- `sourceType`
- `origin`
- `channel`
- `createdFrom`
- `importSource`

### 2. Thêm hàm xác định mode khi mở sửa

Thêm:

- `getExplicitPricingModeForEdit(order)`
- `resolveSalesOrderEditMode(order)`

Quy tắc:

1. Nếu đơn có `saleMode`, `pricingMode`, `orderPricingMode` rõ ràng thì ưu tiên giá trị đã lưu.
2. Nếu là đơn APP/mobile/NVBH legacy, mặc định `PROMOTION`.
3. Nếu là đơn DMS/import/Excel, mặc định `DIRECT_PRICE`.
4. Các trường hợp còn lại mặc định `PROMOTION`.

Lưu ý: `saleMethod` cũ có thể đã bị backend mặc định sai thành `DIRECT_PRICE` cho đơn APP, nên với đơn APP legacy không dùng `saleMethod` một mình để tránh tích nhầm bán thẳng.

### 3. Sửa `openSalesOrderEdit(idx)`

Thay logic cũ:

```js
const editMode=normalizePricingModeClient(order.saleMethod||order.saleMode||order.pricingMode||order.orderPricingMode);
setSalesMode(editMode);
```

Bằng:

```js
const editMode=resolveSalesOrderEditMode(order);
setSalesMode(editMode);
```

## Kiểm tra

- `node --check public/js/app/05-sales-orders.js`: OK.
- `public/index.html` không thêm `disabled` vào radio `saleMode`.
- Backend `src/services/orderService.js` vẫn giữ quy tắc tôn trọng `saleMode` khi frontend gửi lên lúc update.
