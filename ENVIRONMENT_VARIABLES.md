# MK-Pro — Environment Variables

Tài liệu này mô tả các biến môi trường đã được chuẩn hóa trong Prompt 10. Nguồn đọc chuẩn là:

- `src/config/env.js`: parser và validation kiểu dữ liệu.
- `src/config/app.config.js`: cấu hình runtime của server, database, HTTP, auth, import và worker.
- `src/config/company-profile.config.js`: thông tin doanh nghiệp dùng cho mẫu in.
- `.env.example`: mẫu đầy đủ cho development/test.
- `.env.production.example`: mẫu tối thiểu định hướng production.

Không đưa file `.env` thật vào source control. Không ghi secret vào log, báo cáo, frontend bundle hoặc URL.

## 1. Quy tắc bắt buộc

| Quy tắc | Hành vi |
|---|---|
| Thiếu `MONGO_URI` | Mọi process truy cập dữ liệu fail fast. |
| Thiếu `JWT_SECRET` trên HTTP server | Server fail fast. |
| Production thiếu `JWT_REFRESH_SECRET` riêng | Server fail fast. |
| Production dùng secret dưới 32 ký tự, secret mẫu hoặc hai secret giống nhau | Server fail fast. |
| Production thiếu `APP_URL`/`PUBLIC_APP_ORIGIN` hoặc `CORS_ORIGIN` | Server fail fast. |
| Production dùng HTTP, localhost hoặc wildcard CORS | Server fail fast. |
| Boolean khác `true/false`, `1/0`, `yes/no`, `on/off` | Fail fast. |
| Số không phải integer hoặc ngoài giới hạn | Fail fast. |
| `MONGO_MIN_POOL_SIZE > MONGO_MAX_POOL_SIZE` | Fail fast. |
| `IMPORT_MAX_TOTAL_SIZE < IMPORT_MAX_FILE_SIZE` | Fail fast. |

## 2. Cấu hình ứng dụng

| Biến | Mặc định | Giới hạn/giá trị | Bắt buộc | Ghi chú |
|---|---:|---|---|---|
| `NODE_ENV` | `development` | `development`, `test`, `staging`, `production` | Không | Không chấp nhận giá trị tùy ý. |
| `BIND_HOST` | `0.0.0.0` | Chuỗi tối đa 255 ký tự | Không | Host lắng nghe của HTTP server. |
| `PORT` | `3000` | `1..65535` | Không | Render có thể tự cấp. |
| `APP_NAME` | `KHO Minh Khai Pro V45` | Tối đa 160 ký tự | Không | Tên hiển thị/log, không phải business rule. |
| `APP_URL` | rỗng | URL HTTP/HTTPS | Có ở production | URL công khai chuẩn. Có thể fallback từ `PUBLIC_APP_ORIGIN`, sau đó `APP_ORIGIN`. |
| `PUBLIC_APP_ORIGIN` | rỗng | URL HTTP/HTTPS | Thay thế `APP_URL` | Alias tương thích hiện hữu. |
| `APP_ORIGIN` | rỗng | URL HTTP/HTTPS | Không | Alias legacy, giữ để tương thích. |
| `LOG_LEVEL` | `info` | `fatal/error/warn/info/debug/trace/silent` | Không | Không log secret. |
| `GRACEFUL_SHUTDOWN_TIMEOUT_MS` | `15000` | `1000..120000` | Không | Thời gian chờ đóng HTTP server. |

## 3. MongoDB

| Biến | Mặc định | Giới hạn/giá trị | Bắt buộc | Ghi chú |
|---|---:|---|---|---|
| `MONGO_URI` | Không có | `mongodb://` hoặc `mongodb+srv://` | Có | Secret kết nối, không log. |
| `MONGO_MAX_POOL_SIZE` | `50` | `1..500` | Không | Pool tối đa. |
| `MONGO_MIN_POOL_SIZE` | `5` | `0..100`, không lớn hơn max | Không | Pool tối thiểu. |
| `MONGO_SERVER_SELECTION_TIMEOUT_MS` | `5000` | `1000..120000` | Không | Timeout chọn server. |
| `MONGO_SOCKET_TIMEOUT_MS` | `45000` | `1000..600000` | Không | Timeout socket. |
| `MONGO_WRITE_CONCERN` | `majority` | `majority` hoặc `1` | Không | Giữ hành vi baseline. |
| `MONGOOSE_DEBUG` | `true` ở development, ngược lại `false` | Boolean nghiêm ngặt | Không | Không bật ở production nếu log có thể lộ dữ liệu. |
| `MONGOOSE_AUTO_INDEX` | `false` | Boolean nghiêm ngặt | Không | Index vẫn do `mongoIndexService` quản lý. |
| `AUTO_ENSURE_MONGO_INDEXES` | `true` | Boolean nghiêm ngặt | Không | Chạy bước đảm bảo index lúc bootstrap. |

## 4. JWT và xác thực

| Biến | Mặc định | Giới hạn/giá trị | Bắt buộc | Ghi chú |
|---|---:|---|---|---|
| `JWT_SECRET` | Không có | Production tối thiểu 32 ký tự, không dùng placeholder | Có cho server | Access-token secret. Alias đọc legacy: `MOBILE_JWT_SECRET`. |
| `JWT_REFRESH_SECRET` | fallback access secret ngoài production | Production tối thiểu 32 ký tự, phải khác access secret | Có ở production | Alias đọc legacy: `MOBILE_REFRESH_TOKEN_SECRET`. |
| `ACCESS_TOKEN_EXPIRES_IN` | `15m` | Dạng `15m`, `12h`, `7d` | Không | Alias legacy: `MOBILE_ACCESS_TOKEN_EXPIRES_IN`. |
| `REFRESH_TOKEN_EXPIRES_IN` | `30d` | Dạng `15m`, `12h`, `30d` | Không | Alias legacy: `MOBILE_REFRESH_TOKEN_EXPIRES_IN`. |
| `ALLOW_LEGACY_UNTYPED_TOKENS` | `false` | Boolean nghiêm ngặt | Không | Chỉ bật tạm khi rollback/di trú token cũ. |
| `ALLOW_REFRESH_TOKEN_IN_BODY` | `false` | Boolean nghiêm ngặt | Không | Mặc định refresh token chỉ qua cookie HttpOnly. |
| `AUTH_RATE_LIMIT_WINDOW_MS` | `900000` | `1000..86400000` | Không | Cửa sổ rate limit đăng nhập. |
| `AUTH_RATE_LIMIT_MAX` | `20` | `1..10000` | Không | Giới hạn đăng nhập. |
| `AUTH_REFRESH_RATE_LIMIT_MAX` | `60` | `1..10000` | Không | Giới hạn refresh token. |

Các biến cookie hiện hữu như `ACCESS_TOKEN_COOKIE_*` và `REFRESH_TOKEN_COOKIE_*` vẫn được giữ nguyên để tránh mở rộng phạm vi Prompt 10. Chúng được liệt kê trong `.env.example` và là hạng mục có thể gom tiếp sau khi có test cookie đầy đủ.

## 5. HTTP, CORS, proxy và body limit

| Biến | Mặc định | Giới hạn/giá trị | Bắt buộc | Ghi chú |
|---|---:|---|---|---|
| `CORS_ORIGIN` | rỗng | Danh sách origin phân cách dấu phẩy | Có ở production | Chỉ origin, không path/query/hash. Production bắt buộc HTTPS và không localhost. |
| `CORS_ALLOW_ALL` | `false` | Boolean nghiêm ngặt | Không | Production cấm `true`. |
| `CORS_ALLOW_CREDENTIALS` | `false` | Boolean nghiêm ngặt | Không | Không dùng cùng wildcard. |
| `TRUST_PROXY` | `1` | `true`, `false` hoặc `0..20` | Không | Số proxy hop hoặc boolean. |
| `API_RATE_LIMIT_WINDOW_MS` | `900000` | `1000..86400000` | Không | Cửa sổ API limiter. |
| `API_RATE_LIMIT_MAX` | `1200` | `1..100000` | Không | Số request/cửa sổ. |
| `CSP_REPORT_RATE_LIMIT_WINDOW_MS` | `60000` | `1000..3600000` | Không | Limiter endpoint CSP report. |
| `CSP_REPORT_RATE_LIMIT_MAX` | `120` | `1..10000` | Không | Số CSP report/cửa sổ. |
| `JSON_BODY_LIMIT` | `5mb` | Số byte hoặc `kb/mb/gb` | Không | Giới hạn JSON body. |
| `URLENCODED_BODY_LIMIT` | `1mb` | Số byte hoặc `kb/mb/gb` | Không | Giới hạn form body. |

## 6. OpenAPI/API docs

| Biến | Mặc định | Giới hạn/giá trị | Ghi chú |
|---|---:|---|---|
| `OPENAPI_JSON_PATH` | `docs/openapi.json` | Tối đa 1024 ký tự | Đường dẫn tài liệu OpenAPI. |
| `DOCS_RATE_LIMIT_WINDOW_MS` | `900000` | `1000..86400000` | Cửa sổ limiter. |
| `DOCS_RATE_LIMIT_MAX` | `60` | `1..10000` | Số request/cửa sổ. |
| `API_DOCS_PUBLIC` | `false` | Boolean nghiêm ngặt | Chỉ bật có chủ đích. |
| `API_DOCS_REQUIRE_AUTH` | `false` | Boolean nghiêm ngặt | Giữ contract hiện hữu. |

## 7. Bootstrap/startup

| Biến | Mặc định | Giới hạn | Ghi chú |
|---|---:|---:|---|
| `STARTUP_DB_TIMEOUT_MS` | `30000` | `1000..600000` | Timeout kết nối DB khi bootstrap. |
| `STARTUP_INDEX_TIMEOUT_MS` | `180000` | `1000..1800000` | Timeout bước index. |
| `STARTUP_BACKFILL_TIMEOUT_MS` | `180000` | `1000..1800000` | Timeout backfill startup. |
| `STARTUP_IMPORT_RECOVERY_TIMEOUT_MS` | `60000` | `1000..600000` | Timeout recovery import. |
| `AUTO_BACKFILL_ARLEDGERS` | `false` | Boolean | Không thay đổi công thức AR; chỉ điều khiển chạy job startup. |
| `AUTO_RECOVER_STALE_IMPORTS` | `true` | Boolean | Điều khiển recovery session import. |

## 8. Import Excel

| Biến | Mặc định | Giới hạn | Ghi chú |
|---|---:|---:|---|
| `IMPORT_MAX_FILE_SIZE` | `10485760` | `65536..209715200` | Byte/file. |
| `IMPORT_MAX_FILES` | `2` | `1..20` | File/lần import. |
| `IMPORT_MAX_TOTAL_SIZE` | `fileSize × files` | `>= fileSize`, tối đa `524288000` | Tổng byte/lần import. |
| `IMPORT_MAX_ROWS` | `10000` | `1..1000000` | Dòng/sheet import. |
| `IMPORT_MAX_COLUMNS` | `100` | `1..1000` | Cột/sheet. |
| `IMPORT_MAX_SHEETS` | `5` | `1..100` | Sheet/file. |
| `IMPORT_PARSE_TIMEOUT_MS` | `15000` | `1000..600000` | Timeout parser. |
| `IMPORT_PARSE_MAX_OLD_SPACE_MB` | `128` | `64..4096` | Heap parser process. |
| `IMPORT_JOB_TIMEOUT_MS` | `120000` | `1000..3600000` | Timeout job preview/import. |
| `IMPORT_JOB_MAX_OLD_SPACE_MB` | `256` | `64..4096` | Heap job import. |
| `IMPORT_JOB_MAX_ATTEMPTS` | `2` | `1..10` | Retry tối đa. |
| `IMPORT_COMMIT_JOB_TIMEOUT_MS` | `900000` | `1000..7200000` | Timeout commit import. |
| `IMPORT_PREVIEW_MAX_CONCURRENCY` | `2` | `1..32` | Concurrency preview. |
| `IMPORT_PREVIEW_MAX_QUEUE` | `50` | `1..10000` | Queue preview. |
| `IMPORT_WORKER_LOG_LIMIT` | `4000` | `500..100000` | Giới hạn log trả về. |
| `SALES_IMPORT_TX_CHUNK_SIZE` | `25` | `1..1000` | Chunk transaction. Không đổi quy tắc tồn/công nợ. |
| `IMPORT_SESSION_ROW_BATCH_SIZE` | `500` | `1..10000` | Batch ghi session. |
| `IMPORT_TMP_DIR` | rỗng | Tối đa 1024 ký tự | Thư mục temp tùy môi trường. |

## 9. Background worker/export/reconciliation

| Biến | Mặc định | Giới hạn | Ghi chú |
|---|---:|---:|---|
| `BACKGROUND_JOB_CONCURRENCY` | `2` | `1..64` | Số job song song. |
| `BACKGROUND_JOB_POLL_MS` | `1000` | `250..60000` | Chu kỳ poll. |
| `BACKGROUND_JOB_MAX_OLD_SPACE_MB` | `512` | `128..8192` | Heap worker. |
| `BACKGROUND_WORKER_ID` | tự sinh `hostname:pid` | Tối đa 240 ký tự | Chỉ đặt khi cần định danh vận hành ổn định. |
| `EXPORT_JOB_TIMEOUT_MS` | `600000` | `1000..7200000` | Timeout export. |
| `EXPORT_JOB_MAX_ATTEMPTS` | `3` | `1..10` | Retry export. |
| `EXPORT_IDEMPOTENCY_WINDOW_MS` | `300000` | `60000..86400000` | Cửa sổ vận hành; không đổi khóa idempotency nghiệp vụ. |
| `RECONCILIATION_JOB_TIMEOUT_MS` | `1800000` | `1000..14400000` | Timeout reconciliation. |
| `RECONCILIATION_IDEMPOTENCY_WINDOW_MS` | `300000` | `60000..86400000` | Cửa sổ submit job. |

Các biến lease, retention, retry backoff và artifact TTL hiện hữu vẫn nằm trong `.env.example`. Prompt 10 không gom toàn bộ chúng vì chưa có đủ test runtime cho mọi nhánh worker; không xóa và không đổi mặc định.


## 10. Mobile online-first/offline queue

| Biến | Mặc định | Production | Ghi chú |
|---|---:|---|---|
| `ENABLE_MOBILE_OFFLINE_SYNC` | `false` | Phải `false` | Cờ legacy; không dùng để tự queue giao dịch giao hàng. |
| `ENABLE_MOBILE_OFFLINE_QUEUE` | `false` | Phải `false` | Không bật trên Render Web Service khi chưa có đối soát/idempotency offline production-grade. |
| `ENABLE_MOBILE_LEGACY_SYNC_DRAIN` | `true` | Chỉ bật tạm thời | Chỉ dùng để xử lý operation cũ. Giao dịch tiền/trả hàng/xác nhận giao hàng vẫn bị backend từ chối khi đi qua queue. |
| `MOBILE_LEGACY_SYNC_DRAIN_UNTIL` | rỗng | Nên đặt hạn đóng | Dùng ISO datetime, ví dụ `2026-07-31T23:59:59+07:00`. |

Chính sách production: app giao hàng là online-first. Khi mất mạng ở luồng trả hàng/thu tiền/xác nhận, hệ thống phải báo lỗi rõ: “Mất kết nối. Vui lòng thử lại khi có mạng. Giao dịch chưa được ghi nhận.” Không được tự động post từ offline queue vì có thể lệch tiền, tồn kho và công nợ nếu chưa có quy trình reconciliation đầy đủ.

## 11. Thông tin doanh nghiệp dùng cho mẫu in

| Biến | Mặc định | Ghi chú |
|---|---|---|
| `PRINT_COMPANY_CODE` | `3293` | Mã hiển thị. |
| `PRINT_COMPANY_NAME` | `Công Ty TNHH MTV Minh Khai` | Tên hiển thị. |
| `PRINT_COMPANY_ADDRESS` | `Cầu Cánh Sẻ, Quang Bình, Kiến Xương, Thái Bình` | Địa chỉ hiển thị. |
| `PRINT_COMPANY_PHONE` | rỗng | Điện thoại hiển thị. |
| `PRINT_COMPANY_TAX` | rỗng | Mã số thuế hiển thị. |

Thứ tự ưu tiên dữ liệu in vẫn giữ nguyên: dữ liệu chứng từ/context được ưu tiên trước, sau đó mới đến company profile mặc định. Không thay đổi giá bán, khuyến mại, VAT, SSE hoặc công thức chứng từ.

## 12. Cách khởi động theo môi trường

### Development

```bash
cp .env.example .env
# Điền MONGO_URI và JWT_SECRET bằng giá trị development riêng.
npm start
```

### Test

Test có thể truyền object môi trường giả trực tiếp vào `validateRuntimeConfig()`; không dùng credential production.

### Staging

Dùng cấu hình gần production, secret staging riêng, URL HTTPS và CORS allowlist staging.

### Production

```bash
cp .env.production.example .env
# Thay toàn bộ placeholder, tuyệt đối không commit .env.
npm start
```

Worker riêng:

```bash
npm run worker:background
```

Worker profile yêu cầu `MONGO_URI` nhưng không yêu cầu JWT vì không phục vụ HTTP.

## 13. Kiểm tra cấu hình trước triển khai

```bash
npm run check:syntax
npm run check:source-bundles
npm test
npm audit --omit=dev --audit-level=high
```

Cấu hình lỗi sẽ ném `ConfigurationError` với tên biến và lý do; thông báo không chứa giá trị secret.
