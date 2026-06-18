# PHASE79C — Bước 2: Bản vá

- Chuyển toàn bộ 11 tarball URL sang `https://registry.npmjs.org/`.
- Giữ nguyên version và integrity của từng dependency.
- Thêm `.npmrc` công khai cùng retry/timeout phù hợp CI.
- Thêm `scripts/check-package-lock-registry.js` để chặn registry nội bộ quay lại.
- Bổ sung `npm run check:lock-registry` vào quality gate.
- Điều chỉnh Node engine thành `>=20.20 <23`, tương thích Render Node 20 và CI Node 22.
- CI chạy matrix Node 20/22.
