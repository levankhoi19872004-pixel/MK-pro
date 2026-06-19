# Render Port Binding Fix — Active Entrypoint

## Phạm vi

Entrypoint production hiện tại:

```text
npm start
→ node server.js
→ src/app.js:startServer()
```

File legacy `src/legacy/legacyApp.js` không còn là entrypoint và không được dùng để sửa lỗi Render.

## Nguyên nhân đã sửa

Trước bản vá, `src/app.js` chỉ gọi `app.listen()` sau khi hoàn tất:

1. Kết nối MongoDB.
2. Kiểm tra/tạo index.
3. Backfill AR tùy cấu hình.
4. Phục hồi import session bị gián đoạn.
5. Khởi tạo background jobs.

Khi một bước chậm hoặc lỗi, process Node.js tồn tại nhưng chưa mở socket HTTP, khiến Render báo `No open ports detected`.

## Luồng startup mới

```text
startServer()
→ bind PORT trên 0.0.0.0
→ health/liveness phản hồi 200
→ bootstrap Mongo/index/recovery
→ khởi tạo jobs
→ đánh dấu application ready
```

Trong lúc bootstrap:

- `/api/health` trả `200` để Render phát hiện process và port.
- `/api/health/readiness` trả `503` với bước startup hiện tại.
- API nghiệp vụ trả `503 APP_STARTING` và `Retry-After: 5`.
- Static UI vẫn có thể được tải, nhưng không thể ghi/đọc nghiệp vụ cho tới khi ready.

Nếu bootstrap lỗi hoặc vượt timeout:

1. Ghi log bước lỗi và startup state.
2. Dừng các background job đã khởi tạo.
3. Đóng HTTP server.
4. Ngắt Mongo nếu cần.
5. Trả lỗi cho `server.js` để process thoát code 1 và Render restart.

## Cấu hình

```env
BIND_HOST=0.0.0.0
PORT=10000
STARTUP_DB_TIMEOUT_MS=30000
STARTUP_INDEX_TIMEOUT_MS=180000
STARTUP_BACKFILL_TIMEOUT_MS=180000
STARTUP_IMPORT_RECOVERY_TIMEOUT_MS=60000
```

Không hard-code `PORT=10000` trong mã nguồn. Render cấp `PORT`; ứng dụng chỉ dùng fallback `3000` khi biến này không tồn tại.

## Log mong đợi

```text
✅ HTTP server listening on http://0.0.0.0:<PORT>; application bootstrap is starting
✅ MongoDB connected
✅ Mongo indexes ready: ...
✅ Application ready on http://0.0.0.0:<PORT>
```

## Health check đề xuất trên Render

- Liveness/port detection: `/api/health`
- Readiness khi cần kiểm tra đầy đủ: `/api/health/readiness`
