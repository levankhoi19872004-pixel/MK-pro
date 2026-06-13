# PHASE 27 — DELIVERY FILTER COOKIE AUTH FIX

## Hiện tượng

Tại màn **Đơn giao hôm nay**, khi chọn NVGH/NVBH hoặc thay đổi bộ lọc, trình duyệt gọi:

```text
GET /api/delivery/orders?...filters...
```

API trả `401 Bạn chưa đăng nhập`, frontend xóa phiên cục bộ và chuyển về `/login.html`.

## Nguyên nhân gốc rễ

Sau production hardening, web browser dùng access token trong cookie `HttpOnly`; `auth-guard.js` chủ động xóa Bearer token cũ khỏi `localStorage` và không gửi header `Authorization`.

Tuy nhiên `src/routes/deliveryRoutes.js` vẫn định nghĩa middleware legacy riêng:

```js
function requireLogin(req, res, next) {
  const header = String(req.headers.authorization || '');
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) return res.status(401).json({ message: 'Bạn chưa đăng nhập' });
  // ...
}
```

Middleware này không đọc `mk_access_token` từ cookie. Vì vậy toàn bộ `/api/delivery/*` từ web cookie-auth bị từ chối, dù `/api/auth/me` và các API dùng middleware chuẩn vẫn hoạt động.

## Bản vá

File:

```text
src/routes/deliveryRoutes.js
```

- Xóa middleware Bearer-only cục bộ.
- Xóa dependency `jsonwebtoken` không còn cần thiết tại route.
- Dùng trực tiếp `requireAuth` chuẩn cho 6 endpoint:
  - `GET /orders`
  - `GET /returns`
  - `POST /return`
  - `POST /payment`
  - `POST /confirm`
  - `GET /reconciliation`
- Giữ nguyên role guard và ownership logic hiện tại.
- Giữ tương thích API client gửi Bearer vì `requireAuth` hỗ trợ cả Bearer và cookie.

## Test hồi quy mới

File:

```text
test/delivery-cookie-auth-regression.test.js
```

Kiểm tra:

1. Delivery routes không được tự khai báo middleware Bearer-only.
2. Cả 6 endpoint phải mount `requireAuth` làm middleware đầu tiên.
3. Cookie `mk_access_token` hợp lệ phải xác thực thành công khi không có `Authorization` header.

## Kết quả nghiệm thu

```text
364/364 tests pass
490 JavaScript files syntax OK
OpenAPI 270 operations synchronized
npm audit: 0 vulnerabilities
```

## Phạm vi tác động

Không thay đổi:

- Dữ liệu MongoDB.
- Logic lọc NVBH/NVGH.
- DeliveryEngine.
- Tồn kho, công nợ, quỹ, trả hàng.
- Cookie name hoặc thời hạn token.
- Role/ownership policy.

Sau deploy cần đăng nhập lại một lần để nhận cookie mới, sau đó thử các bộ lọc tại **Đơn giao hôm nay**.
