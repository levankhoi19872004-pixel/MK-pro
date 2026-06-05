# Phase 2.9.3 - System Split

## Mục tiêu

Tách nhóm API hệ thống khỏi `src/legacy/legacyApp.js`, đưa về cấu trúc:

```text
src/routes/systemRoutes.js
src/controllers/systemController.js
src/services/systemService.js
src/repositories/settingRepository.js
```

`legacyApp.js` vẫn được giữ làm fallback, nhưng không còn xử lý trực tiếp các endpoint hệ thống.

## Endpoint đã tách

### Tương thích API cũ

```text
GET /api/health
GET /api/data
GET /api/system/data-source
```

### Endpoint hệ thống mới

```text
GET  /api/system/status
GET  /api/system/health
GET  /api/system/health/db
GET  /api/system/settings
GET  /api/system/settings/:key
PUT  /api/system/settings/:key
POST /api/system/backup
POST /api/system/reset
```

## Nguyên tắc an toàn

- `/api/system/backup` tạo file backup từ Mongo vào thư mục `backups/`.
- `/api/system/reset` bị khóa mặc định.
- Muốn reset phải bật biến môi trường:

```text
ALLOW_SYSTEM_RESET=true
```

và gửi body:

```json
{
  "confirm": "RESET_MONGO_DATA"
}
```

Trước khi reset, hệ thống tự tạo backup Mongo.

## Trạng thái legacy

Các route sau đã không còn nằm trực tiếp trong `legacyApp.js`:

```text
/api/health
/api/data
/api/system/data-source
/api/system/*
```
