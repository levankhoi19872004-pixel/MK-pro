# Phase 2.10.1 - Legacy App Cleanup Report

## Mục tiêu

Dọn sạch các API nghiệp vụ đã được tách sang `routes -> controllers -> services -> repositories`, không xóa `legacyApp.js` ngay mà giữ lại phần helper/bootstrap để fallback có kiểm soát.

## Đã xóa khỏi `src/legacy/legacyApp.js`

Đã xóa toàn bộ handler `app.get/app.post/app.put/app.patch/app.delete` trùng với route mới:

### Products
- `GET /api/products`
- `POST /api/products`
- `PUT /api/products/:id`
- `PATCH /api/products/:id/status`

### Customers
- `GET /api/customers`
- `POST /api/customers`
- `PUT /api/customers/:id`
- `PATCH /api/customers/:id/status`
- `DELETE /api/customers/:id`
- `POST /api/customers/bulk-delete`

### Users / Staffs / Roles / Permissions
- `GET /api/users`
- `POST /api/users`
- `DELETE /api/users/:id`
- `GET /api/staffs`
- `GET /api/roles`
- `GET /api/permissions`

### Import Templates / Import Runtime
- `GET /api/import/custom-templates`
- `POST /api/import/custom-templates`
- `DELETE /api/import/custom-templates/:id`
- `GET /api/import/custom-template/:id/download`
- `GET /api/import/templates`
- `GET /api/import/template/:type`
- `POST /api/import/preview`
- `POST /api/import/commit`
- `GET /api/import/logs`

### Reports
- `GET /api/stock`
- `GET /api/debts`

### Finance Documents
- `GET /api/cashbook`
- `POST /api/cashbook`
- `GET /api/bankbook`
- `GET /api/receipts`
- `POST /api/receipts`
- `DELETE /api/receipts/:id`

### Import Orders
- `GET /api/import-orders`
- `POST /api/import-orders`
- `PUT /api/import-orders/:id`

### Sales Orders
- `GET /api/sales-orders`
- `POST /api/sales-orders`
- `PUT /api/sales-orders/:id`
- `POST /api/sales-orders/:id/cancel`

### Master Orders
- `GET /api/master-orders/unmerged-child-orders`
- `GET /api/master-orders`
- `POST /api/master-orders`
- `POST /api/master-orders/:id/cancel`

### Mobile
- `POST /api/mobile/login`
- `POST /api/mobile/refresh`
- `GET /api/mobile/me`
- `GET /api/mobile/roles`
- `GET /api/mobile/customers`
- `GET /api/mobile/products`
- `GET /api/mobile/stock`
- `POST /api/mobile/sales/orders`
- `GET /api/mobile/sales/orders/:id`
- `PUT /api/mobile/sales/orders/:id`
- `GET /api/mobile/sales/orders`

## Trạng thái sau cleanup

- `legacyApp.js` không còn route handler nghiệp vụ dạng `app.get/app.post/app.put/app.patch/app.delete`.
- `legacyApp.js` vẫn còn helper cũ được các route mobile dùng qua `routeContext`.
- `ENABLE_LEGACY_JSON=true` không còn tự mở fallback nghiệp vụ chính nữa vì `ALLOWED_LEGACY_API_PREFIXES = []`.
- Các route mới vẫn được mount trước legacy guard.
- API chưa tồn tại trả về `404` hoặc `410` có kiểm soát, không tự rơi về JSON cũ.

## Chưa xóa ngay

Chưa xóa các helper dùng chung trong `legacyApp.js`, ví dụ:

- token/auth helper cho mobile
- builder/formatter đơn hàng mobile
- stock/debt helper cũ
- migration/bootstrap helper

Các phần này nên được tách tiếp trong Phase 2.10.2 sang service/helper riêng trước khi xóa hoàn toàn `legacyApp.js`.
