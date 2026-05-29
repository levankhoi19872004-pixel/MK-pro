# Phase 3.6 - Server-side Search + Lazy Cache

Mục tiêu: tránh phần mềm bị đơ do preload toàn bộ sản phẩm/khách hàng.

## Nguyên tắc mới

- Không preload toàn bộ catalog khi đăng nhập/mở app.
- Gõ đến đâu server tìm đến đó.
- Mỗi lần tìm chỉ trả tối đa 50 kết quả.
- Frontend cache theo từ khóa trong 5 phút.
- Danh sách quản trị sản phẩm/khách hàng chỉ tải trang nhẹ 100 dòng.

## API mới

```text
GET /api/catalog/products/search?q=omo&limit=50
GET /api/catalog/customers/search?q=lan&limit=50
```

## File chính đã chỉnh

```text
src/routes/catalogRoutes.js
src/routes/index.js
public/js/search/catalogCacheService.js
public/js/search/autocompleteEngine.js
public/js/search/productSearchBox.js
public/js/app/02-products.js
public/js/app/03-customers-autocomplete.js
public/js/app/05-sales-orders.js
public/mobile/sales.html
public/mobile/js/sales.js
```

## Luồng mới

```text
Ô gợi ý
  ↓
CatalogCache.searchProducts/searchCustomers
  ↓
/api/catalog/*/search
  ↓
MongoDB tìm kiếm + limit 50
  ↓
Cache theo từ khóa
  ↓
Hiển thị gợi ý
```
