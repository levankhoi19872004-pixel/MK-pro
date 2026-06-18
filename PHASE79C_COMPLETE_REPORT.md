# PHASE79C — Render Lockfile Registry Fix

## Kết luận
Lỗi deploy không do source code. `package-lock.json` Phase79B chứa 11 URL tarball tuyệt đối trỏ tới registry nội bộ chỉ dùng trong môi trường tạo artifact. Render không thể kết nối nên `npm ci` kết thúc bằng `ETIMEDOUT`.

## Bản vá
1. Chuyển 11 URL sang `https://registry.npmjs.org/`.
2. Giữ nguyên dependency version và integrity.
3. Thêm `.npmrc` với public registry, retry và timeout.
4. Thêm quality gate `check:lock-registry` ngăn URL nội bộ quay lại.
5. Đồng bộ engine Node với Render 20.20.2 và CI Node 22.
6. CI kiểm tra cả Node 20 và 22.

## File thay đổi
- `package-lock.json`
- `package.json`
- `.npmrc`
- `.github/workflows/ci.yml`
- `scripts/check-package-lock-registry.js`

## Kết quả
- Production install sạch: PASS.
- Regression: 642/642 PASS.
- Audit production: 0 vulnerability.
- Không đổi schema/API/nghiệp vụ.
