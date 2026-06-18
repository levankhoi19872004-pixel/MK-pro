# PHASE79A — BƯỚC 4: TÁCH FRONTEND SOURCE

## Mục tiêu

Giảm kích thước `index.html` và hai stylesheet Critical mà không thay đổi DOM/CSS output thực tế.

## Kết quả kích thước

| File facade/manifest | Trước | Sau |
|---|---:|---:|
| `public/index.html` | khoảng 146 KB | 341 byte |
| `public/css/00-base.css` | 191,6 KB | 357 byte |
| `public/css/10-operational-overrides.css` | 124,7 KB | 309 byte |

## HTML

- `public/index.shell.html`: app shell chứa placeholder.
- `public/fragments/index/`: 7 fragment, file lớn nhất khoảng 24 KB.
- `config/index-page-fragments.json`: manifest thứ tự fragment.
- `src/services/web/indexPageRenderer.js`: lắp ghép server-side, cache trong production.
- `/` và `/index.html` được render trước `express.static`, nên JavaScript chỉ chạy sau khi DOM đầy đủ.

## CSS

- Base CSS được chia thành 6 phần trong `public/css/base/`.
- Operational overrides được chia thành 4 phần trong `public/css/overrides/`.
- Mỗi phần nhỏ hơn 34 KB.
- `index.shell.html` tải trực tiếp từng phần theo đúng thứ tự cũ.
- Hai file cũ còn lại dưới dạng compatibility `@import` manifest.

## Characterization hash

- Base CSS sau ghép: `3241a50ace3f5d18b9ab1f25f9295c3d8606f5b0e80997a781b9e6527d1d5b6e`
- Override CSS sau ghép: `9d3477c5401db927af4b0f23a8e0f0dc5c19f186f0c7cc289510928b3bfa326b`
- HTML lắp ghép: `e0ee4034a2f5f2f7bbf84abef6419c0408eebc4dd12abe0cf5d2ba0cbcaa401c`

Hash xác nhận nội dung và thứ tự output không thay đổi so với bản đầy đủ tương ứng trước khi tách.

## Rủi ro và kiểm soát

| Rủi ro | Kiểm soát |
|---|---|
| Sai thứ tự CSS | Manifest + hash + static test |
| DOM chưa đủ khi bootstrap JS chạy | Server-side assembly |
| Path traversal từ manifest | `resolveProjectFile()` giới hạn trong project root |
| Production đọc disk mỗi request | In-memory production cache |

## Trạng thái

**HOÀN THÀNH** — Frontend source đã chia nhỏ nhưng output trình duyệt được giữ nguyên.
