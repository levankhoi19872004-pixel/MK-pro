# PHASE80A - Render case-path startup fix

Phase80A sửa lỗi startup Render do tồn tại hai audit service chỉ khác chữ hoa/thường.

## File chính thay đổi

- `src/application/CommandPipeline.js`
- `src/services/auditService.js`
- Xóa `src/services/AuditService.js`
- `scripts/check-path-portability.js`
- `test/audit-service-case-portability.test.js`
- `package.json`

## Kết quả

- Runtime app import: PASS.
- Path portability: PASS.
- Regression: 659/659 PASS.
- OpenAPI: 303 operation.
- Production audit: 0 vulnerability.
- Không thay đổi schema, API hoặc dữ liệu.
