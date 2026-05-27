# Bộ khung Mobile App V43

## 1. Cấu trúc

```txt
public/mobile/
  login.html
  sales.html
  delivery.html
  mobile.css
  js/
    config.js
    api.js
    ui.js
    auth.js
    sales.js
    delivery.js

src/routes/
  mobileAuthRoutes.js
  mobileSalesRoutes.js
  mobileDeliveryRoutes.js

src/services/
  mobileAuthMiddleware.js
```

## 2. Gắn vào server.js

Thêm vào server.js chính:

```js
const mobileAuthRoutes = require('./src/routes/mobileAuthRoutes');
const mobileSalesRoutes = require('./src/routes/mobileSalesRoutes');
const mobileDeliveryRoutes = require('./src/routes/mobileDeliveryRoutes');
const mobileAuthMiddleware = require('./src/services/mobileAuthMiddleware');

app.use(express.static('public'));

app.use(mobileAuthRoutes);
app.use(mobileAuthMiddleware);
app.use(mobileSalesRoutes);
app.use(mobileDeliveryRoutes);
```

## 3. Link truy cập

```txt
/mobile/login.html
/mobile/sales.html
/mobile/delivery.html
```

## 4. Tài khoản demo

```txt
sales / 123456
delivery / 123456
```

## 5. Việc cần nối tiếp

- Thay demoUsers bằng user thật trong database.
- Thay dữ liệu khách hàng/sản phẩm demo bằng data thật.
- Khi tạo đơn mobile, ghi vào documents/salesOrders.
- Cho posting engine xử lý tồn kho, công nợ, quỹ tiền.


## Step 10 - Mobile nối lõi thật

Đã nâng cấp mobile app theo hướng dùng dữ liệu thật:

- Login mobile qua `/api/mobile/login`
- Tải khách hàng thật qua `/api/mobile/customers`
- Tải sản phẩm + tồn mở bán qua `/api/mobile/products`
- Tạo đơn mobile vào `salesOrders`
- Tự trừ tồn kho qua `reduceStock`
- Ghi công nợ vào `payments`
- Ghi tiền thu vào `cashbook`
- App giao hàng xác nhận giao thành công/thất bại
- Giao hàng thu tiền sẽ cập nhật công nợ + quỹ tiền
- Có API nộp tiền về quỹ `/api/mobile/cash/submit`
- Có `mobileLogs` để ghi lại thao tác mobile

Các màn chính:

- `/mobile/login.html`
- `/mobile/sales.html`
- `/mobile/delivery.html`

Tài khoản test khi chưa có nhân viên:

- user: `admin`
- password: `admin`
