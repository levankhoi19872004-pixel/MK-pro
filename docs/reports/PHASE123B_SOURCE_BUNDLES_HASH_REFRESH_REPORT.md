# PHASE123B — Source Bundles Hash Refresh

## Mục tiêu

Sửa lỗi `npm run check:source-bundles` sau Phase123:

```text
src/services/orderLegacy.service.js: canonical source hash changed. Run npm run source-bundles:refresh after reviewing behavior changes.
```

## Nguyên nhân

Phase123 có thay đổi hợp lệ ở các canonical source để truyền ngữ cảnh khách hàng/ngày vào promotion engine và refresh lại promotion tab sau import 2 rule mới, nhưng `config/source-bundles.json` chưa được refresh `sourceSha256` tương ứng.

Do cơ chế source-bundles đang khóa hash nguồn canonical, lệnh `--check` sẽ fail ngay khi phát hiện source part thay đổi dù JavaScript syntax vẫn đúng.

## Hash đã refresh

| Bundle target | Source hash mới |
|---|---|
| `src/services/orderLegacy.service.js` | `42bad792220bb6597cd37960392f9817e075a3120d918fd4e565658034200494` |
| `src/services/mobile/sales.service.js` | `d74e646135670d31cbe086398e5440949f83667ba8c4efea562aed1edb0ad5d8` |
| `public/js/app/admin/08d-import-excel.js` | `e935f226b2f4d3662da9eed51538409379777d9cf7901012dc75919c5ce0d412` |

## File đã sửa

```text
config/source-bundles.json
```

## Ghi chú hành vi

Các thay đổi nguồn là có chủ đích từ Phase123:

- `orderLegacy.service.js`: truyền `customerCode/date` vào `promotionService.calculatePromotions()` để rule CK thêm theo doanh số khách hàng có đủ ngữ cảnh.
- `mobile/sales.service.js`: truyền `customerCode/date` vào promotion engine khi tạo/sửa đơn mobile.
- `08d-import-excel.js`: refresh promotion rules sau khi import 2 loại rule mới.

Không thay đổi thêm nghiệp vụ, API, UI hoặc công thức khuyến mãi trong bản PHASE123B.

## Cách kiểm tra trên máy dev

```bash
npm run check:syntax
npm run check:source-bundles
npm test
```

Nếu generated bundle vẫn bị stale, chạy:

```bash
npm run build:source-bundles
npm run check:source-bundles
```

Không dùng `source-bundles:refresh` thêm nếu chưa review thay đổi source mới.
