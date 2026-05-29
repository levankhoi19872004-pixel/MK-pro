# Render Port Binding Fix

## Vấn đề
Render build thành công, MongoDB connected, nhưng deploy fail với lỗi:

```text
Port scan timeout reached, no open ports detected.
Bind your service to at least one port.
```

Nguyên nhân là `startServer()` chờ các tác vụ bootstrap Mongo/cache/migration/index hoàn tất rồi mới gọi `app.listen()`. Nếu bootstrap chậm hoặc bị treo, Render không phát hiện cổng mở.

## Cách sửa
Đã chỉnh `src/legacy/legacyApp.js`:

- Tách bootstrap dữ liệu sang `bootstrapDataLayer()`.
- Gọi `app.listen(PORT, '0.0.0.0', ...)` ngay khi start.
- Chạy Mongo/index/migration/cache sau khi port đã mở bằng `setImmediate()`.
- Nếu bootstrap lỗi, ghi log nhưng không làm Render mất port.

## Log mong đợi trên Render

```text
Server V45 đang chạy tại http://0.0.0.0:<PORT>
MongoDB connected
```

