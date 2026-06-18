# PHASE79C — Render Deployment Checklist

## 1. Runtime
Render có thể tiếp tục dùng:

```text
NODE_VERSION=20.20.2
```

Package hỗ trợ Node `>=20.20 <23`.

## 2. Build command

```bash
npm ci --omit=dev --no-audit --no-fund --registry=https://registry.npmjs.org/
```

Không dùng `npm install`. Không xóa `package-lock.json`.

## 3. Start command

```bash
npm start
```

## 4. Trước khi deploy
- Upload toàn bộ nội dung ZIP mới.
- Không tái sử dụng `package-lock.json` từ Phase79B.
- Clear build cache một lần nếu Render vẫn hiển thị URL registry cũ.

## 5. Dấu hiệu build đúng
Log phải tải tarball từ `registry.npmjs.org`, không xuất hiện:

```text
packages.applied-caas-gateway1.internal.api.openai.org
```

## 6. Smoke test sau deploy
- `/health` hoặc health endpoint hiện tại trả 200.
- Đăng nhập web hoạt động.
- Mở danh sách sản phẩm, khách hàng và đơn bán.
- Upload thử một file Excel nhỏ ở chế độ preview.

## 7. Rollback
Không có migration dữ liệu. Có thể rollback artifact về Phase79B, nhưng Phase79B sẽ tái phát lỗi registry khi build sạch. Khuyến nghị rollback ứng dụng bằng artifact đã build sẵn hoặc giữ Phase79C.
