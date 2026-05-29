# Phase 3.5 - Catalog Cache Service

Đã chỉnh theo mô hình:

```text
CatalogCacheService
├── productCache
├── customerCache
├── preload khi mở hệ thống / app bán hàng
└── autocompleteEngine dùng cache chung
```

## Điểm đã sửa

- Thêm `public/js/search/catalogCacheService.js`.
- Web chính preload `/api/products?all=true` và `/api/customers?all=true`.
- App bán hàng mobile preload `/api/mobile/products?all=1&limit=10000` và `/api/mobile/customers?all=1&limit=10000`.
- `productSearchBox.js` lấy sản phẩm từ `CatalogCache`, không tự gọi API riêng nếu cache đã có.
- Danh mục sản phẩm/khách hàng không còn `limit=100` ở frontend.
- Bảng sản phẩm/khách hàng tìm trên cache cục bộ.
- Autocomplete sản phẩm và khách hàng tìm trên cache cục bộ.
- Khi thêm/sửa/xóa sản phẩm hoặc khách hàng, cache được invalidate để tải lại dữ liệu mới.

## Luồng mới

```text
MongoDB
  ↓
/api/products?all=true + /api/customers?all=true
  ↓
CatalogCache
  ↓
autocompleteEngine / productSearchBox / bảng danh mục
```

## App bán hàng mobile

```text
Đăng nhập mobile
  ↓
preload catalog khách hàng + sản phẩm
  ↓
tìm khách / tìm sản phẩm trong cache
```
