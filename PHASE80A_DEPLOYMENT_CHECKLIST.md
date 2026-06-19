# PHASE80A - Checklist triển khai Render

## Trước deploy

1. Dùng toàn bộ artifact Phase80A, không chép riêng một file.
2. Xác nhận repository chỉ còn một audit service:

```bash
git ls-files | grep -i 'src/services/auditservice.js'
```

Kết quả phải chỉ có:

```text
src/services/auditService.js
```

3. Không được còn file:

```text
src/services/AuditService.js
```

## Render

Build Command:

```bash
npm ci --omit=dev --no-audit --no-fund --registry=https://registry.npmjs.org/
```

Start Command:

```bash
npm start
```

Thực hiện:

```text
Manual Deploy -> Clear build cache & deploy
```

## Dấu hiệu deploy đúng

Không còn log:

```text
Cannot find module '../services/AuditService'
```

Startup phải đi tiếp tới:

```text
MongoDB connected
Mongo indexes ready
Server ... đang chạy
```

## Rollback

Không có migration dữ liệu. Có thể rollback artifact Phase80 nếu cần, nhưng Phase80 cũ vẫn chứa lỗi case-collision nên không nên sử dụng lại trên Render.
