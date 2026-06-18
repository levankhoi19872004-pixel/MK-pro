# PHASE79B — BƯỚC 5: TRIỂN KHAI VÀ ROLLBACK

## Triển khai

1. Cài dependency bằng `npm ci --omit=dev` trên production.
2. Không chạy build trên production vì runtime bundle đã được commit trong artifact.
3. Chạy smoke test đăng nhập, bán hàng, import, giao hàng, công nợ, quỹ, trả hàng và in.
4. Theo dõi HTTP 5xx, lỗi JavaScript frontend và lỗi load asset trong 30–60 phút đầu.

## Rollback

- Không có database migration nên rollback bằng cách redeploy artifact Phase79A.
- Không cần reverse migration hoặc sửa dữ liệu.
- Nếu frontend cache giữ asset cũ, purge CDN/browser cache hoặc tăng query version.

## Chỉ số giám sát

- Tỷ lệ 404 của các file `.part02.js`, `.part03.js`, `.part04.js`.
- Lỗi `Identifier has already been declared` trên frontend.
- Lỗi module load/`module.exports` ở backend.
- HTTP 5xx của order, return, report, import, fund và inventory.
