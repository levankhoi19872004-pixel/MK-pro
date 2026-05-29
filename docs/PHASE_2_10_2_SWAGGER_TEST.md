# Phase 2.10.2 - Swagger + Test

## Đã thêm

- `docs/openapi.json`: tài liệu OpenAPI 3.0.3 cho các API chính.
- `src/routes/swaggerRoutes.js`: phục vụ Swagger UI và OpenAPI JSON.
- Mount route docs trước legacy guard:
  - `GET /api/docs`
  - `GET /api/docs/openapi.json`
- Test bằng Node.js built-in test runner:
  - `test/openapi.test.js`
  - `test/app-docs-route.test.js`

## Lệnh chạy

```bash
npm test
```

Chạy riêng OpenAPI:

```bash
npm run test:openapi
```

## Ghi chú

Swagger UI dùng CDN `swagger-ui-dist`, nên không cần thêm dependency mới vào production. Nếu môi trường không có internet, vẫn có thể xem JSON tại `/api/docs/openapi.json`.
