# Phase 2.10.4 - Rate limit + auth guard cho API Docs

## Mục tiêu

Bảo vệ Swagger UI/OpenAPI JSON khi chạy production:

- `/api/docs`
- `/api/docs/openapi.json`

## Thay đổi chính

- Thêm `docsRateLimiter` riêng cho `/api/docs*`.
- Thêm `docsAuthGuard`:
  - Development/test: mặc định mở để test nhanh.
  - Production: mặc định yêu cầu `Authorization: Bearer <accessToken>`.
  - Có thể ép bật auth ở mọi môi trường bằng `API_DOCS_REQUIRE_AUTH=true`.
  - Có thể mở docs tạm thời bằng `API_DOCS_PUBLIC=true`.
- Chuẩn hóa `.env.example` cho docs security.
- Thêm unit test cho guard.

## Biến môi trường mới

```env
API_DOCS_REQUIRE_AUTH=false
API_DOCS_PUBLIC=false
DOCS_RATE_LIMIT_WINDOW_MS=900000
DOCS_RATE_LIMIT_MAX=60
```

## Khuyến nghị Production

```env
NODE_ENV=production
API_DOCS_REQUIRE_AUTH=true
API_DOCS_PUBLIC=false
JWT_SECRET=<secret thật, mạnh>
```

## Cách gọi docs trong production

```http
GET /api/docs
Authorization: Bearer <access_token>
```
