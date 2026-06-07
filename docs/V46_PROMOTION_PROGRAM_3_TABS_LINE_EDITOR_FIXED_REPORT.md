# V46 - Promotion Program 3 Tabs Line Editor Fixed

## Mục tiêu

Giữ nguyên 3 tab khuyến mại, không đổi mẫu import Excel, nhưng bổ sung quản lý chi tiết bên phải theo đúng nghiệp vụ:

- Tab 1: quản lý sản phẩm áp dụng CTKM và mức CK%.
- Tab 2: chỉ quản lý nhóm sản phẩm KM để Tab 3 sử dụng.
- Tab 3: quản lý điều kiện khuyến mại bậc thang theo nhóm sản phẩm.

## File đã sửa

- `public/index.html`
- `public/js/app/08-reports-users-promotions-import-excel.js`
- `src/services/promotionService.js`
- `src/controllers/promotionController.js`
- `src/routes/promotionRoutes.js`
- `docs/openapi.json`

## API mới

- `POST /api/promotions/programs/:programCode/products`
- `PUT /api/promotions/programs/:programCode/products/:id`
- `DELETE /api/promotions/programs/:programCode/products/:id`
- `POST /api/promotions/programs/:programCode/group-products`
- `PUT /api/promotions/programs/:programCode/group-products/:id`
- `DELETE /api/promotions/programs/:programCode/group-products/:id`
- `POST /api/promotions/programs/:programCode/tiers`
- `PUT /api/promotions/programs/:programCode/tiers/:id`
- `DELETE /api/promotions/programs/:programCode/tiers/:id`

## Kiểm tra

- `node -c` các file JS chính: OK.
- `npm run docs:check`: OK.
- `npm test`: còn lỗi do môi trường thiếu dependency `mongoose`, không phải lỗi phần sửa mới.
