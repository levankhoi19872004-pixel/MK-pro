# Render startup forensic — 2026-09-13

Mục tiêu: phân biệt sự cố trước Express/listen với sự cố Mongo/bootstrap và sự cố nghiệp vụ.

## Health endpoints

- `GET /api/health/live`: dependency-free, được mount trước rate limiter/auth/tenant. Nếu process đã bind HTTP thì endpoint này phải trả `200` ngay cả khi Mongo chưa sẵn sàng.
- `GET /api/health/ready`: trả `200` chỉ khi bootstrap + Mongo + model/temp-storage sẵn sàng; nếu chưa thì trả `503` kèm `startup.currentStep` và `boot.stage`.
- `GET /api/health/db`: trạng thái kết nối Mongoose.

## BOOT_TRACE

Startup ghi log một dòng JSON với prefix `[BOOT_TRACE]` cho các mốc chính:

1. `process_start`
2. `dotenv_loaded`
3. `runtime_config_validated`
4. `app_module_load_start`
5. `app_module_evaluation_start`
6. `app_dependencies_loaded`
7. `create_app_start` / `create_app_complete`
8. `app_module_loaded`
9. `start_server_invoked` / `start_server_enter`
10. `http_listen_start` / `http_listening`
11. `startup_step_start` / `startup_step_complete` / `startup_step_failed`
12. `application_ready` hoặc `application_bootstrap_failed`

Nếu chưa đạt `http_listening` sau 15 giây, tracer ghi `prelisten_watchdog_timeout` cùng `stalledAtStage`. Có thể đổi ngưỡng bằng `BOOT_PRELISTEN_WATCHDOG_MS`; tắt tracer bằng `BOOT_TRACE_ENABLED=false`.

Tracer loại bỏ các key có tên liên quan URI/token/cookie/authorization/password/secret và không được dùng để log dữ liệu khách hàng.

## Cách đọc nhanh

- Log dừng ở `runtime_config_load_start` / có `prelisten_failure`: lỗi cấu hình trước Express.
- Log có `app_module_load_start` nhưng không có `app_module_loaded`: treo khi require/evaluate application module.
- Có `http_listening`, `/api/health/live` trả 200, nhưng `/ready` 503: HTTP đã sống; đọc `startup.currentStep` để biết Mongo/index/backfill/import recovery/job nào chưa xong.
- `startup_step_failed` với `step=mongodb-connect`: tập trung DNS/network/MONGO_URI/Atlas/connection pool, không tối ưu debt query.
- `application_ready` nhưng `/api/mobile/debts` chậm: lúc đó mới trace pipeline debt/Mongo query/index.

## Test

Sau `npm ci`:

```bash
npm run test:startup-forensics
npm run qa:quick
```

`test:startup-forensics` bao gồm static forensic contract, kiểm tra Render bind-port-before-Mongo và health HTTP contract.
