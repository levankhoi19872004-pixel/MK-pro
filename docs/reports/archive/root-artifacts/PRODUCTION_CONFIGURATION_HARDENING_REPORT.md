# PRODUCTION CONFIGURATION HARDENING REPORT

## 1. Phạm vi và baseline

- **Baseline bắt buộc:** `MK-pro-phase09-csp-xss-hardening-patched(1).zip`.
- **Mục tiêu:** chuẩn hóa cấu hình production có rủi ro cao mà không thay đổi business rule, API contract, MongoDB schema, file Excel hoặc hành vi web/mobile.
- **Tech stack xác nhận:** Node.js 20–22, Express 4, Mongoose 8/MongoDB, JWT, Multer, Pino, worker chạy process riêng, frontend JavaScript bundle nội bộ.
- **Quy mô baseline:** 1.092 file; 137 file JavaScript đọc trực tiếp `process.env`; 204 tên biến môi trường được tham chiếu trực tiếp.
- **Baseline test:** 952 test, 951 đạt, 0 lỗi, 1 bỏ qua.
- **Dependency audit baseline/final:** 0 vulnerability ở mức info/low/moderate/high/critical.

Prompt 10 chỉ triển khai lớp cấu hình tối thiểu bằng JavaScript thuần, tận dụng `dotenv` đã có. Không thêm package, config server, remote feature flag, tenant registry hay rule engine.

## 2. Kết quả tổng quan

### Đã chuẩn hóa

1. Parser kiểu dữ liệu và lỗi cấu hình thống nhất.
2. Fail-fast cho MongoDB, JWT, production URL/CORS và secret production.
3. Cấu hình tập trung cho HTTP server, Mongo pool, rate limit, body limit, startup timeout, import và background worker.
4. Hồ sơ doanh nghiệp hiển thị trên mẫu in có một nguồn mặc định thống nhất và cho phép override bằng biến môi trường.
5. `.env.example` và `.env.production.example` được làm sạch, không còn key trùng lặp và không chứa credential thật.
6. Server và worker có profile validation riêng; worker không bị buộc khai báo JWT không cần thiết.
7. Secret không được đưa vào public config summary hoặc log.

### Không thay đổi

- Công thức tồn kho/post/reverse stock.
- Công thức và posting công nợ.
- Ghi quỹ và idempotency nghiệp vụ.
- Cách tính hàng trả, đơn trả một phần/toàn bộ.
- Trạng thái vòng đời đơn hàng.
- Phân quyền dữ liệu NVBH/NVGH.
- Quy đổi thùng/lẻ.
- Công thức VAT/SSE, mapping kế toán và cấu trúc file Excel.
- API request/response, collection và field MongoDB.
- Cơ chế đăng nhập/token contract phía client.
- Tenant/multi-tenant/SaaS/subscription.

## 3. Kiến trúc cấu hình sau bản vá

```text
src/config/
├── env.js                       # parser string/boolean/integer/enum/CSV/URL/Mongo/body limit/proxy
├── app.config.js                # runtime config + validation + profile server/worker
├── company-profile.config.js    # thông tin doanh nghiệp dùng cho mẫu in
└── db.js                        # consumer của app.config.js
```

Luồng khởi động:

```text
server.js
  -> dotenv.config()
  -> validateRuntimeConfig(profile=server)
  -> load src/app.js
  -> startServer()

scripts/background-job-worker.js
  -> dotenv.config()
  -> validateRuntimeConfig(profile=worker)
  -> start worker
```

`buildRuntimeConfig()` chỉ xây object cấu hình và thu thập lỗi. `validateRuntimeConfig()` áp policy theo profile/môi trường. `getRuntimeConfig()` phục vụ consumer nội bộ và không trả public secret summary.

## 4. Bảng phân loại cấu hình

### 4.1 `KEEP_IN_CODE`

| Giá trị/quy tắc | File/hàm đại diện | Nhóm | Hiện trạng | Quyết định | Rủi ro nếu cấu hình hóa |
|---|---|---|---|---|---|
| Công thức số lượng tồn, post/reverse stock | inventory posting/domain services | Business rule | Có test domain | Giữ trong code | Có thể làm sai SSoT tồn kho giữa các process. |
| Công thức AR-SALE/AR-RETURN/AR-RECEIPT | AR/accounting services | Business rule | Có guard/idempotency | Giữ trong code | Có thể làm sai công nợ và đối soát. |
| Quy tắc ghi `fundLedgers` | fund services | Business rule | Có test idempotency | Giữ trong code | Có thể sinh thừa/thiếu dòng quỹ. |
| `returnAmount = qty × salePrice` và net quantity | return/invoice services | Business rule | Được regression bảo vệ | Giữ trong code | Làm sai trả hàng, VAT và SSE. |
| Trạng thái `pending → assigned → delivered → accounting_confirmed` | order/delivery domain | Lifecycle | Contract hiện hữu | Giữ trong code | Tạo state không tương thích dữ liệu cũ. |
| Quy tắc NVBH/NVGH và data scope | auth/query services | Authorization | Có security test | Giữ trong code | Cấu hình sai có thể rò dữ liệu. |
| Công thức thùng/lẻ/conversionRate | product/order utilities | Business rule | Dùng xuyên hệ thống | Giữ trong code | Sai số lượng tồn và file xuất. |
| VAT/SSE mapping và format Excel | export services/config chuyên biệt hiện hữu | Accounting contract | Có test workbook/integration | Giữ nguyên | Thay đổi file upload kế toán. |
| Multer `fields=20`, `fieldSize=64KB` | `importUpload.middleware.js` | Security implementation cap | Ổn định, không có nhu cầu thay đổi theo deploy | Giữ trong code | Tạo thêm bề mặt cấu hình không cần thiết. |

### 4.2 `MOVE_TO_ENV`

| Giá trị | File/hàm trước vá | Nhóm | Hiện trạng trước | Đề xuất/triển khai | Rủi ro |
|---|---|---|---|---|---|
| `MONGO_URI` | `src/config/db.js` và process khác | Secret/kết nối | Đọc trực tiếp, validation phân tán | Đọc/validate qua `app.config.js`; bắt buộc mọi profile dữ liệu | Cao nếu thiếu/sai URI. |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | auth/mobile/routes | Secret | Alias/fallback nằm nhiều file | Một nguồn runtime; production bắt buộc hai secret riêng | Critical nếu dùng secret mẫu/chung. |
| `APP_URL`, `PUBLIC_APP_ORIGIN` | app/CSP/cookie | URL triển khai | Fallback không thống nhất | Production bắt buộc URL hợp lệ HTTPS | Cao nếu tạo link/cookie/CORS sai. |
| `CORS_ORIGIN`, `CORS_ALLOW_*` | `src/app.js` | Security | Parse rải rác | Parse CSV/boolean nghiêm ngặt; cấm wildcard production | Critical nếu mở toàn origin. |
| Mongo pool/timeout/write concern | `src/config/db.js` | Hạ tầng | `Number(x || default)` | Parse integer/enum có min/max | Trung bình–cao. |
| Import size/temp/concurrency/timeout | middleware/queue/job service | Vận hành | Nhiều nguồn parse riêng | Gom vào `config.import` | Cao nếu số âm/0 hoặc vượt tài nguyên. |
| Worker concurrency/poll/memory/timeout/retry | worker/job service | Vận hành | Nhiều file đọc env | Gom vào `config.worker` | Cao nếu worker treo/quá tải. |
| `PRINT_COMPANY_*` | print builders/templates | Hiển thị | Chuỗi fallback lặp lại | Override qua env, mặc định tập trung | Thấp; không liên quan công thức chứng từ. |

### 4.3 `MOVE_TO_CONFIG`

| Giá trị | File/hàm | Nhóm | Hiện trạng trước | Đã triển khai | Rủi ro |
|---|---|---|---|---|---|
| Default/range/type cho port, timeout, pool, limit | nhiều file | Runtime config | Default nằm cạnh consumer | `src/config/app.config.js` | Thấp sau regression; tăng coupling nếu gom quá mức. |
| Parser boolean/integer/URL/proxy/body limit | nhiều file | Validation | So sánh chuỗi/`Number()` không đồng nhất | `src/config/env.js` | Thấp; không thêm dependency. |
| Default company code/name/address/phone/tax | nhiều print source/bundle | Display config | Chuỗi lặp lại | `company-profile.config.js` | Thấp; precedence dữ liệu chứng từ giữ nguyên. |
| Public config summary | Chưa có | Observability an toàn | Có nguy cơ log cả object env | Chỉ trả environment/port/count/pool/limit | Thấp; loại secret khỏi summary. |

### 4.4 `DEDUPLICATE`

| Giá trị | File/hàm | Hiện trạng trước | Kết quả | Rủi ro |
|---|---|---|---|---|
| JWT secret và legacy token flag | auth middleware, auth route, mobile context, swagger | Đọc/fallback lặp lại | Consumer dùng `config.security` | Thấp; alias legacy vẫn được hỗ trợ. |
| Mongo settings | app/db/tests | Parse trực tiếp | `config.database` là nguồn chuẩn | Thấp. |
| Import limits | upload middleware, preview queue, job service | Mỗi file có default riêng | `config.import` là nguồn chuẩn | Trung bình; đã test boundary. |
| Worker timeout/concurrency | worker và submission service | Default lặp lại | `config.worker` là nguồn chuẩn | Trung bình; đã test worker. |
| Company profile | print builder/template và source bundle | 3 chuỗi lặp ở nhiều bundle | Một profile chuẩn | Thấp; bundle được rebuild/hash lại. |
| Key `.env.example` trùng | `BCRYPT_ROUNDS`, `RECONCILIATION_INTERVAL_MS`, `IMPORT_JOB_TIMEOUT_MS` | Khai báo hai lần | Giữ một khai báo duy nhất | Thấp. |

### 4.5 `REMOVE`

| Giá trị | Vị trí | Lý do | Hành động | Rủi ro |
|---|---|---|---|---|
| Khai báo key lặp trong `.env.example` | file mẫu môi trường | Nguồn sau có thể âm thầm ghi đè nguồn trước | Xóa dòng trùng, không xóa runtime feature | Không có thay đổi runtime. |
| Fallback company string lặp trong consumer | print source/template | Một giá trị có nhiều nguồn mặc định | Thay bằng company profile chuẩn | Thấp; giữ fallback mặc định tương đương. |

Không xóa biến runtime legacy, file migration, script hoặc feature flag nào chỉ vì tên cũ.

### 4.6 `UNKNOWN` — chủ động giữ nguyên

| Giá trị | File/hàm đại diện | Lý do chưa sửa | Quyết định hiện tại | Rủi ro |
|---|---|---|---|---|
| Alias `MONGODB_URI`, `DATABASE_URL` trong một số script maintenance | scripts migration/audit | Chưa có bằng chứng tất cả môi trường script dùng cùng contract | Giữ nguyên | Trung bình nếu gom nhầm làm hỏng runbook cũ. |
| Toàn bộ `ACCESS_TOKEN_COOKIE_*`, `REFRESH_TOKEN_COOKIE_*` | cookie helpers/app | Cần thêm ma trận test secure/sameSite/domain/proxy | Giữ nguyên, đã tài liệu hóa | Trung bình. |
| Enterprise/tenant flags hiện hữu | enterprise modules | Ngoài mục tiêu, Prompt 10 cấm mở rộng multi-tenant | Không thay đổi | Cao nếu can thiệp. |
| Mobile telemetry/offline/legacy drain flags | mobile services | Có vòng đời rollout riêng | Không thay đổi | Trung bình. |
| Outbox/integration/webhook config | integration modules | Chức năng đang bị feature flag và cần audit riêng | Không thay đổi | Cao nếu validate bắt buộc nhầm. |
| SSE accounting constants hiện hữu | SSE export | Là accounting/export contract, không chỉ runtime config | Không đổi giá trị/format | Critical nếu thay đổi. |
| Các interval/retention còn lại của job cũ | jobs/scripts | Chưa có runtime test cho mọi nhánh | Không gom hàng loạt | Trung bình. |

Sau vá, số file JavaScript đọc trực tiếp `process.env` giảm từ **137 xuống 127**, số tên biến trực tiếp giảm từ **204 xuống 154**. Phần còn lại không bị thay hàng loạt vì nhiều giá trị thuộc feature rollout, script maintenance hoặc chưa đủ bằng chứng.

## 5. Chi tiết triển khai

### 5.1 Validation fail-fast

`ConfigurationError` chứa danh sách `{ variable, message }`, không chứa giá trị biến. Parser hỗ trợ:

- String có required/min/max/pattern.
- Boolean nghiêm ngặt.
- Integer an toàn có min/max.
- Enum.
- CSV allowlist.
- URL HTTP/HTTPS.
- Mongo URI.
- Body limit.
- Trust proxy boolean/hop count.
- Phát hiện placeholder secret.

### 5.2 Chính sách production

HTTP server production chỉ khởi động khi:

- Có `MONGO_URI`.
- Có `JWT_SECRET` và `JWT_REFRESH_SECRET` riêng, tối thiểu 32 ký tự.
- Secret không chứa dấu hiệu placeholder.
- Có `APP_URL` hoặc `PUBLIC_APP_ORIGIN`, dùng HTTPS.
- Có `CORS_ORIGIN` allowlist, không wildcard, không localhost/HTTP.
- Giá trị số/boolean hợp lệ và nằm trong giới hạn.

Worker chỉ yêu cầu MongoDB và cấu hình worker. Đây là separation of concern; worker không cần JWT/CORS vì không phục vụ HTTP.

### 5.3 Backward compatibility

- Default runtime giữ tương đương baseline đối với development/test.
- Alias mobile JWT/expiry vẫn được đọc để không làm hỏng deployment cũ.
- Company profile default giữ đúng `3293`, `Công Ty TNHH MTV Minh Khai`, địa chỉ hiện hữu.
- Dữ liệu company có sẵn trên order/document/context vẫn được ưu tiên trước default.
- Không thêm field response hoặc env object vào frontend.

## 6. Old/New diff đại diện

### 6.1 Fail-fast trước khi load ứng dụng

**Old — `server.js`**

```js
require('dotenv').config();
const { startServer } = require('./src/app');
```

**New**

```js
require('dotenv').config();
const { validateRuntimeConfig } = require('./src/config/app.config');
validateRuntimeConfig(process.env, { profile: 'server' });
const { startServer } = require('./src/app');
```

Lợi ích: production không load app bằng secret mẫu hoặc cấu hình CORS/timeout sai.

### 6.2 MongoDB

**Old — `src/config/db.js`**

```js
const mongoUri = process.env.MONGO_URI;
const autoIndex = process.env.MONGOOSE_AUTO_INDEX === 'true';
await mongoose.connect(mongoUri, {
  maxPoolSize: Number(process.env.MONGO_MAX_POOL_SIZE || 50),
  minPoolSize: Number(process.env.MONGO_MIN_POOL_SIZE || 5)
});
```

**New**

```js
const { getRuntimeConfig } = require('./app.config');
const { app, database } = getRuntimeConfig();
const mongoUri = database.mongoUri;
const autoIndex = database.autoIndex;
await mongoose.connect(mongoUri, {
  maxPoolSize: database.maxPoolSize,
  minPoolSize: database.minPoolSize
});
```

Lợi ích: không còn `Number('abc') => NaN`, không cho min pool lớn hơn max pool.

### 6.3 Import limits

**Old — `src/middlewares/importUpload.middleware.js`**

```js
const IMPORT_MAX_FILE_SIZE = Number(process.env.IMPORT_MAX_FILE_SIZE || 10 * 1024 * 1024);
const IMPORT_MAX_FILES = Number(process.env.IMPORT_MAX_FILES || 2);
```

**New**

```js
const { getRuntimeConfig } = require('../config/app.config');
const IMPORT_CONFIG = getRuntimeConfig().import;
const IMPORT_MAX_FILE_SIZE = IMPORT_CONFIG.maxFileSize;
const IMPORT_MAX_FILES = IMPORT_CONFIG.maxFiles;
```

Lợi ích: upload, preview queue và background job dùng cùng default/range.

### 6.4 Company profile

**Old**

```js
process.env.PRINT_COMPANY_NAME || 'Công Ty TNHH MTV Minh Khai'
```

**New**

```js
const companyProfile = getCompanyProfile();
companyProfile.name
```

Lợi ích: không còn fallback mặc định khác nhau giữa builder và template; dữ liệu order/context vẫn ưu tiên trước.

## 7. Danh sách file

### Thêm mới

- `src/config/env.js`
- `src/config/app.config.js`
- `src/config/company-profile.config.js`
- `test/production-configuration-hardening.test.js`
- `ENVIRONMENT_VARIABLES.md`
- `PRODUCTION_CONFIGURATION_HARDENING_REPORT.md`
- `PRODUCTION_CONFIGURATION_HARDENING_DIFF.patch`
- `PHASE10_FILE_CHANGES.json`

### Sửa

- `.env.example`
- `.env.production.example`
- `config/source-bundles.json`
- `server.js`
- `scripts/background-job-worker.js`
- `src/app.js`
- `src/config/db.js`
- `src/middlewares/auth.middleware.js`
- `src/middlewares/importUpload.middleware.js`
- `src/routes/authRoutes.js`
- `src/routes/swaggerRoutes.js`
- `src/security/refreshTokenCookie.js`
- `src/mobile/mobileContext.js`
- `src/jobs/backgroundJobWorker.js`
- `src/jobs/importPreviewQueue.js`
- `src/services/background-jobs/JobSubmissionService.js`
- `src/domain/print/builders/DmsExactSalesInvoiceBuilder.js`
- `services/printDataBuilder.legacy.source/part-01.jsfrag`
- `services/printDataBuilder.legacy.source/part-02.jsfrag`
- `services/printDataBuilder.legacy.source/part-03.jsfrag`
- `services/printDataBuilder.legacy.js`
- `templates/printTemplates.source/part-01.jsfrag`
- `templates/printTemplates.js`
- `templates/print/dmsExactSalesInvoice.template.js`
- `test/mongo-index-cleanup-policy.test.js`
- `test/render-startup-port-binding.test.js`

### Xóa

- Không xóa file.
- Không xóa runtime env key legacy.
- Chỉ loại các dòng khai báo trùng trong `.env.example`.

## 8. Kết quả kiểm thử thực tế

### 8.1 Baseline và full regression

| Bộ kiểm tra | Baseline Prompt 09 | Sau Prompt 10 | Kết quả |
|---|---:|---:|---|
| Full test | 952 total / 951 pass / 1 skip | 962 total / 961 pass / 1 skip | PASS, thêm 10 test config |
| Syntax | PASS | 911 JavaScript files | PASS |
| Source bundle | PASS | 19 bundles | PASS |
| Source size budget | PASS | PASS | PASS |
| OpenAPI | PASS | 313 operations | PASS, contract không đổi |
| Path portability | PASS | 1.148 paths, 911 JS files | PASS |
| Package-lock registry | PASS | toàn bộ tarball từ npm registry | PASS |
| CSP/XSS audit | PASS | 334 findings, blocking=0 | PASS |
| Enterprise smoke | PASS | 10 modules, 11 flags | PASS |
| `npm audit --omit=dev` | 0 vulnerability | 0 vulnerability | PASS |

Full test sau vá:

```text
# tests 962
# pass 961
# fail 0
# skipped 1
# duration_ms 7491.033242
```

### 8.2 Configuration validation

10 test mới đều đạt, bao phủ:

- Thiếu Mongo/JWT bắt buộc.
- Integer không hợp lệ.
- Batch/concurrency bằng 0 hoặc âm.
- Boolean không hợp lệ.
- Secret placeholder, secret quá ngắn hoặc access/refresh giống nhau.
- Production CORS wildcard/HTTP/localhost.
- Timeout ngoài giới hạn.
- Development, test, staging và production-like config.
- Worker profile không yêu cầu JWT.
- Public summary không lộ secret/Mongo URI.
- Company profile default và override.

### 8.3 Regression nghiệp vụ mục tiêu

Chạy 17 test file theo đúng preload/options của test runner chính thức:

```text
# tests 65
# pass 64
# fail 0
# skipped 1
# duration_ms 1262.587774
```

Bao phủ:

| Nghiệp vụ | Test evidence | Kết quả |
|---|---|---|
| Một đơn bán và stock posting boundary | `sales-order-flow`, `sales-order-stock-posting-boundary` | PASS |
| Tồn kho atomic/idempotency | `inventory-posting-atomic`, `inventory-posting-idempotency` | PASS |
| Trả hàng/công nợ trả | `mobile-delivery-return-flow`, `ar-return-accounting-flow` | PASS |
| Quỹ/idempotency | `fund-ledger-idempotency` | PASS |
| VAT/workbook, trả toàn bộ | `invoice-export-workbook`, `invoice-export-full-return-workbook`, `invoice-net-sales-full-return` | PASS |
| SSE, trả toàn bộ, integration | 3 nhóm `sse-invoice-export*` | PASS |
| Import Excel/transaction/trace | `dms-import-sales-atomic-transaction`, `excel-import-two-phase-static`, `import-stock-allocation-trace` | PASS |
| Sửa đơn mobile/delta | `mobile-sales-edit-delta` | PASS |

Một golden fixture production thật là test tùy chọn và vẫn `SKIP` do baseline không chứa sample. Không dùng credential/database production trong kiểm thử. Vì vậy, kết luận dựa trên regression tự động và production-like configuration, không tuyên bố đã smoke-test trực tiếp trên production live.

### 8.4 Startup

- Development config: PASS.
- Test config: PASS.
- Staging config: PASS.
- Production-like config với secret giả an toàn/HTTPS/CORS allowlist: PASS.
- Render startup port-binding test: PASS sau khi fixture cung cấp đủ cấu hình production mới.
- Worker profile: PASS chỉ với Mongo/config worker.

## 9. Đánh giá tác động và rủi ro còn lại

### Điểm mạnh

- Fail-fast thay cho silent fallback nguy hiểm.
- Không thêm dependency.
- Kiểu dữ liệu/range được kiểm soát tại một nơi.
- Không truyền secret sang frontend.
- Giảm 50 tên biến được đọc trực tiếp rải rác.
- Tách profile server/worker tránh bắt process khai báo biến không cần thiết.

### Rủi ro còn lại

1. Production hiện tại phải khai báo `JWT_REFRESH_SECRET`, `APP_URL`/`PUBLIC_APP_ORIGIN` và `CORS_ORIGIN` rõ ràng; deployment thiếu sẽ dừng sớm. Đây là thay đổi an toàn có chủ đích nhưng cần cập nhật Render trước rollout.
2. Một số module cookie, integration, enterprise và script maintenance vẫn đọc env trực tiếp; giữ nguyên vì chưa đủ test để gom an toàn.
3. `getRuntimeConfig()` xây object từ `process.env` theo lần gọi, không cache. Chi phí rất nhỏ so với I/O và tránh stale config trong test; chưa cần abstraction/cache phức tạp.
4. Chưa chạy với MongoDB/credential production thật; cần smoke test staging sau khi điền secret thực tế.

## 10. Hai phương án tiếp theo

### Phương án A — Production-grade dài hạn, khuyến nghị sau Prompt 12

- Gom nốt cookie policy, maintenance scripts và integration config theo từng module có test riêng.
- Thêm lệnh `config:check` đọc env deployment nhưng không kết nối DB.
- Thêm schema tài liệu máy đọc được để Render/staging kiểm tra trước deploy.
- **Lợi ích:** giảm nguồn cấu hình phân tán, rollout/rollback rõ hơn.
- **Nhược điểm:** phạm vi rộng, có thể ảnh hưởng script vận hành cũ.
- **Effort:** Medium–Hard.
- **Rủi ro:** Medium; phải chia từng prompt/module.

### Phương án B — Cân bằng effort, phù hợp hiện tại

- Dừng tại phạm vi Prompt 10.
- Chỉ cấu hình Render theo `ENVIRONMENT_VARIABLES.md` và chạy staging smoke.
- Giữ các mục `UNKNOWN` cho audit chuyên biệt sau.
- **Lợi ích:** ít thay đổi, rủi ro thấp, đủ hardening lõi.
- **Nhược điểm:** vẫn còn một số `process.env` phân tán.
- **Effort:** Easy.
- **Rủi ro:** Low.

**Khuyến nghị hiện tại:** chọn Phương án B để chuyển sang Prompt 11; không tiếp tục cấu hình hóa hàng loạt magic number/domain rule.

## 11. Rollback

Không cần rollback database vì không đổi schema hoặc dữ liệu.

1. Dừng deploy Prompt 10.
2. Khôi phục các file trong `PHASE10_FILE_CHANGES.json` từ ZIP Prompt 09.
3. Xóa ba module config mới và test mới.
4. Khôi phục `.env.example`, `.env.production.example`, source parts/bundles và `config/source-bundles.json` từ baseline.
5. Giữ nguyên biến môi trường cũ; không xóa secret khi rollback cho tới khi Prompt 09 chạy ổn định.
6. Chạy:

```bash
npm ci
npm run check:source-bundles
npm run check:syntax
npm test
npm audit --omit=dev --audit-level=high
```

7. Kỳ vọng rollback: 952 test, 951 pass, 1 skip như baseline.

## 12. Cấu hình hard-code chủ động giữ lại

- Business rule và accounting/export contract nêu tại `KEEP_IN_CODE`.
- Security caps ít thay đổi như Multer field count/field size.
- Một số interval nội bộ rất nhỏ dùng cho cancellation/polling implementation khi chưa có nhu cầu deploy-specific.
- Các feature flag enterprise/mobile/integration có lifecycle riêng.
- Legacy alias trong scripts để bảo toàn runbook.
- SSE constants/account mapping vì thay đổi có thể làm sai file kế toán; Prompt 10 không biến chúng thành dynamic rule engine.

## 13. Kết luận bắt buộc

1. **Những cấu hình nào đã được chuẩn hóa?** Mongo/JWT, URL/CORS/proxy, port/log/body/rate limit, startup timeout, import limit/timeout/concurrency/temp, worker concurrency/timeout/retry window, OpenAPI limit và thông tin doanh nghiệp dùng cho mẫu in.
2. **Những business rule nào được giữ nguyên trong code?** Toàn bộ tồn kho, công nợ, quỹ, return, VAT/SSE, idempotency nghiệp vụ, lifecycle, data scope NVBH/NVGH và quy đổi thùng/lẻ.
3. **Có thay đổi hành vi nghiệp vụ không?** Không phát hiện thay đổi; full regression và 65 test nghiệp vụ mục tiêu đều không có lỗi. Thay đổi duy nhất có chủ đích là fail-fast khi cấu hình production không an toàn.
4. **Có tăng độ phức tạp hệ thống không?** Tăng nhẹ ba module nhỏ, nhưng giảm parsing/fallback trùng lặp; không thêm framework/package/process ngoài.
5. **Có cần tiếp tục chỉnh sửa hay nên dừng?** Nên dừng ở phạm vi này, cấu hình staging/Render và smoke test; không gom tiếp các mục `UNKNOWN` trong cùng prompt.
6. **Bản vá có đủ điều kiện chuyển sang Prompt 11 không?** **Có, với điều kiện deployment staging khai báo đủ biến bắt buộc và chạy smoke test bằng credential staging.** Bản vá đạt toàn bộ test tự động, giữ API/schema/nghiệp vụ và không cần migration DB.
