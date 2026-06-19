# PHASE80A - Bước 2: Nội dung bản vá

## Thay đổi

1. Hợp nhất hai audit service thành một module chuẩn:

```text
src/services/auditService.js
```

2. Xóa file gây xung đột:

```text
src/services/AuditService.js
```

3. Sửa `src/application/CommandPipeline.js` tham chiếu đúng casing.

4. Giữ hai contract tương thích:

- `log(action, payload)`: best-effort cho luồng legacy.
- `record(input, { session })`: transaction-aware cho command pipeline.

5. Bổ sung `scripts/check-path-portability.js` để chặn:

- File/thư mục trùng nhau khi bỏ qua hoa-thường.
- Local `require()` không tồn tại đúng casing.

6. Bổ sung quality gate và test hồi quy:

```text
npm run check:path-portability
test/audit-service-case-portability.test.js
```

## Ảnh hưởng hệ thống

- Không đổi schema.
- Không đổi API.
- Không đổi route.
- Không migration dữ liệu.
- Không thay đổi nghiệp vụ bán hàng, tồn kho, AR hoặc quỹ.
