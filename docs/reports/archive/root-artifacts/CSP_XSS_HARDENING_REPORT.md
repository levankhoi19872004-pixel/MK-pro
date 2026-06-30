# CSP/XSS HARDENING REPORT — PHASE 09

## 1. Phạm vi và baseline

Baseline sử dụng:

```text
MK-pro-phase08-frontend-professionalization-patched.zip
```

Mục tiêu của giai đoạn này chỉ gồm:

- kiểm kê và phân loại XSS sink;
- loại inline JavaScript/inline event handler có thể thực thi;
- gia cố các luồng khách hàng, đơn hàng, hàng trả, công nợ, quỹ, ghi chú, báo cáo và mobile;
- triển khai CSP theo chế độ report-only mặc định, có enforcement mode;
- giữ nguyên API nghiệp vụ, schema, dependency, tồn kho, AR, quỹ và `returnOrders`.

Không thêm sanitizer package và không dùng CSP để che các sink chưa an toàn.

### Baseline chất lượng

| Gate | Baseline |
|---|---:|
| Full test | 942 PASS, 0 FAIL, 1 SKIP |
| Syntax | 900 JavaScript |
| Source bundle | 19 bundle |
| npm audit production | 0 vulnerability |
| Test wall time | 11,13 giây |

## 2. Sink inventory trước và sau

Inventory quét các thư mục `public`, `templates`, `services`, `src/routes`, gồm cả canonical source và generated output. Vì vậy một sink có thể xuất hiện hai lần nếu output generated được tính riêng; trường `generated` trong JSON cho phép phân biệt.

| Loại sink | Trước | Sau | Thay đổi |
|---|---:|---:|---:|
| `innerHTML` | 328 | 320 | −8 |
| `insertAdjacentHTML` | 5 | 5 | 0 |
| `document.write` | 8 | 8 | 0 |
| Inline event handler | 68 | **0** | **−68** |
| Inline script finding | 10 | 1 | −9 |
| Tổng finding | 419 | 334 | −85 |
| Blocking high-risk, không phải generated | 58 | **0** | **−58** |

Finding `inline-script` còn lại là chuỗi tạo thẻ `<script src="...">` tĩnh trong template generated, không phải inline executable block trong file HTML runtime. Kiểm tra riêng toàn bộ HTML runtime xác nhận không còn `<script>` không có `src`.

### Phân loại sau sửa

| Classification | Số lượng | Ý nghĩa |
|---|---:|---|
| Static trusted template | 123 | Markup literal hoặc external script source rõ ràng |
| Dynamic escaped | 132 | Dữ liệu đi qua helper escaping đã xác định |
| Dynamic unverified | 67 | Cần tiếp tục data-flow review ở giai đoạn sau |
| Unknown | 12 | Chưa đủ bằng chứng tĩnh, chưa được coi là an toàn để xóa/sửa hàng loạt |
| Blocking high risk | **0** | Gate Phase 09 không còn lỗi chặn |

Tệp bằng chứng:

- `CSP_XSS_SINK_BASELINE.json`;
- `CSP_XSS_SINK_INVENTORY.json`.

## 3. Root cause

### 3.1 Inline executable code phân tán

Nhiều bảng và popup tạo button bằng template string kèm:

```html
<button onclick="someGlobalFunction(...)" onchange="...">
```

Hệ quả:

- bắt buộc CSP phải nới `script-src-attr`;
- phụ thuộc global function và thứ tự tải script;
- dữ liệu ID/index có thể đi vào executable attribute;
- lifecycle listener khó kiểm soát.

### 3.2 Inline bootstrap script

Mobile catalog cache, Swagger UI và cửa sổ in dùng inline script hoặc inline `window.onload`. Đây là nguyên nhân khiến CSP nghiêm ngặt có thể làm hỏng frontend.

### 3.3 Dữ liệu động đi qua HTML parser

Customer/product summary mobile và một số thông báo lỗi đưa dữ liệu động vào `innerHTML`. Dù nhiều nơi đã escape, pattern này làm review bảo mật khó và dễ phát sinh regression.

### 3.4 CSP cũ chỉ áp dụng cục bộ

CSP mobile cũ không bao phủ toàn ứng dụng và còn phụ thuộc inline bootstrap. Không có report endpoint chuẩn hóa và không có lộ trình report-only/enforcement toàn cục.

## 4. Thiết kế sau sửa

### 4.1 CSP middleware toàn cục

Thêm:

```text
src/middlewares/csp.middleware.js
```

Mode:

```text
CSP_MODE=report-only   # mặc định
CSP_MODE=enforce
CSP_MODE=off           # rollback khẩn cấp
```

Policy chính:

```text
default-src 'self';
script-src 'self';
script-src-attr 'none';
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:;
font-src 'self' data:;
connect-src 'self';
worker-src 'self' blob:;
media-src 'self' blob:;
object-src 'none';
base-uri 'self';
form-action 'self';
frame-ancestors 'none';
manifest-src 'self';
report-uri /csp-report
```

Không có:

- `unsafe-eval`;
- wildcard origin;
- `unsafe-inline` trong `script-src`;
- quyền chạy inline event handler.

Swagger chỉ allowlist cụ thể `https://unpkg.com` trên `/api/docs`.

### 4.2 CSP report endpoint

```text
POST /csp-report
```

Bảo vệ:

- body limit `64kb`;
- rate limit mặc định 120 request/phút/IP;
- log payload được chuẩn hóa và giới hạn chiều dài;
- route đặt trước authentication để browser có thể gửi violation report.

### 4.3 Event delegation

Inline handler được thay bằng data action:

```html
<button data-sales-order-action="edit" data-order-index="...">Sửa</button>
```

và listener tập trung:

```js
container.addEventListener('click', (event) => {
  const button = event.target.closest('[data-sales-order-action]');
  if (!button) return;
  // dispatch action
});
```

Áp dụng cho customer, import order, sales order, return order, master return, debt collection, fund ledger, users và promotions.

### 4.4 Externalized scripts

| Trước | Sau |
|---|---|
| Inline catalog cache bootstrap | `public/mobile/js/catalog-cache-config.js` |
| Inline Swagger init | `public/js/swagger-init.js` |
| Inline print/close script | `public/js/print-preview-actions.js` |

### 4.5 Safe DOM helper

Thêm:

```text
public/js/security/safe-dom.js
```

Các helper tạo node và gán dữ liệu bằng `textContent`, `createTextNode`, `replaceChildren`, không dùng `innerHTML`.

Đã áp dụng cho:

- thông tin khách hàng mobile;
- customer context trong giỏ hàng;
- product group options;
- selected product metric card.

### 4.6 Build gate

Thêm script:

```bash
npm run audit:frontend-sinks
npm run check:csp-xss
```

`check:csp-xss` được đưa vào `npm run quality`. Build fail nếu xuất hiện blocking high-risk sink không thuộc generated output.

## 5. Old/New diff quan trọng

### 5.1 CSP

**Old**

```js
app.use(helmet({ contentSecurityPolicy: false }));
// CSP chỉ được đặt cục bộ cho mobile và phải nới inline script.
```

**New**

```js
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cspHeaders);
app.post('/csp-report',
  createCspReportLimiter(),
  express.json({
    type: ['application/csp-report', 'application/reports+json', 'application/json'],
    limit: '64kb'
  }),
  createCspReportHandler(logger)
);
```

### 5.2 Inline handler

**Old**

```html
<button onclick="editCustomer(${rowIndex})">Sửa</button>
```

**New**

```html
<button data-customer-action="edit" data-row-index="${rowIndex}">Sửa</button>
```

### 5.3 Dynamic mobile DOM

**Old**

```js
selectedCustomerBox.innerHTML = `<strong>${customer.name}</strong>`;
```

**New**

```js
window.SafeDom.renderSummary(selectedCustomerBox, {
  heading: customer.name,
  lines: summaryLines
});
```

### 5.4 Dynamic error text

**Old**

```js
container.innerHTML = `<div>${error.message}</div>`;
```

**New**

```js
container.innerHTML = `<div>${masterOrderEscapeHtml(error.message)}</div>`;
```

## 6. CSP HTTP smoke

Đã khởi tạo Express app không cần MongoDB và gọi HTTP thật:

| Mode | Route | Status | Header |
|---|---|---:|---|
| report-only | `/mobile/login.html` | 200 | `Content-Security-Policy-Report-Only` |
| report-only | `/api/docs` | 200 | Report-only + allowlist `unpkg.com` |
| enforce | `/mobile/login.html` | 200 | `Content-Security-Policy` |
| enforce | `/api/docs` | 200 | Enforce + allowlist `unpkg.com` |
| report endpoint | `/csp-report` | 204 | Payload được ghi log chuẩn hóa |

Bằng chứng: `CSP_HTTP_SMOKE.json`.

## 7. Đo hiệu năng

Microbenchmark chạy Node.js v22.16.0, warm-up trước đo, 120 batch × 5.000 request giả lập/batch. Số liệu không gồm Express/network/TLS/MongoDB.

| Workload | p50 | p95 | p99 |
|---|---:|---:|---:|
| Build policy main page | 1,17 µs | 1,47 µs | 1,56 µs |
| Build policy Swagger | 1,28 µs | 1,51 µs | 1,65 µs |
| CSP report-only middleware | 1,72 µs | 1,91 µs | 2,08 µs |

Overhead middleware ở mức microsecond và không thêm query/database call.

Bundle mobile sales:

```text
Trước: public/mobile/js/sales.js = 40.847 byte
Sau:   public/mobile/js/sales.js = 40.590 byte
Mới:   public/js/security/safe-dom.js = 2.719 byte, dùng chung/cache được
```

Không tuyên bố tổng tải trang nhỏ hơn vì có thêm shared helper. `sales.js` vẫn dưới budget 40.960 byte.

Bằng chứng:

- `CSP_MIDDLEWARE_BENCHMARK.json`;
- `CSP_MIDDLEWARE_BENCHMARK.csv`.

## 8. Kết quả kiểm thử

| Quality gate | Kết quả |
|---|---:|
| Test CSP/XSS trực tiếp | PASS — 9/9 |
| Full test suite | PASS — 951, FAIL 0, SKIP 1 |
| Syntax | PASS — 907 JavaScript |
| Source bundle | PASS — 19 bundle |
| Source-size budget | PASS |
| CSP/XSS sink gate | PASS — blocking 0 |
| Path portability | PASS — 1.129 path |
| Enterprise smoke | PASS — 10 module / 11 flag |
| OpenAPI | PASS — 313 operation |
| npm audit production | PASS — 0 vulnerability |
| `npm run quality` | PASS — 18,28 giây |
| HTTP CSP smoke | PASS |
| HTTP bind | PASS — 6 ms |
| MongoDB readiness | NOT RUN — thiếu `MONGO_URI` |
| Browser production/staging CSP report collection | NOT RUN |
| Android/device E2E | NOT RUN |

Sau lần cập nhật cuối cùng, toàn bộ gate được chạy lại trước khi đóng gói. Kết quả cuối cùng phải được đối chiếu với log bàn giao; không coi enforcement production đã hoàn tất khi chưa có staging/browser telemetry.

## 9. Ngoại lệ còn lại

### 9.1 `style-src 'unsafe-inline'`

Frontend còn inline style và cập nhật `element.style`. Loại bỏ toàn bộ thuộc phạm vi CSS modernization riêng. Giai đoạn này không nới quyền JavaScript.

### 9.2 `innerHTML` còn lại

320 finding còn tồn tại vì không được phép rewrite hàng loạt trong một giai đoạn bảo mật:

- 123 static trusted template;
- 132 dynamic escaped;
- 67 dynamic unverified;
- 12 unknown.

Các sink `dynamic-unverified` và `unknown` đã được ghi đầy đủ file/dòng/sample trong inventory. Chúng là backlog bắt buộc trước khi cân nhắc bỏ hoàn toàn `style-src 'unsafe-inline'` hoặc siết thêm Trusted Types.

### 9.3 `document.write`

8 finding nằm trong luồng tạo tài liệu in riêng. Không xóa vì có thể làm thay đổi mẫu in. Cần audit riêng nguồn HTML/escaping và có golden test trước khi thay bằng Blob/iframe document writer.

### 9.4 Enforcement production

Code path enforcement và HTTP header đã test, nhưng mặc định vẫn `report-only`. Chỉ chuyển production sang enforcement sau khi:

1. staging không còn violation `script-src`/`script-src-attr`;
2. browser E2E các màn hình chính đạt;
3. canary production không phát sinh lỗi UI.

## 10. Ảnh hưởng chéo

Không thay đổi:

- công thức tồn kho;
- AR ledger;
- fund ledger;
- `returnOrders`;
- VAT/SSE output;
- API nghiệp vụ hiện hữu;
- MongoDB schema/index;
- dependency package.

Thay đổi vận hành duy nhất là endpoint nhận CSP report và hai biến môi trường:

```env
CSP_MODE=report-only
CSP_REPORT_RATE_LIMIT_MAX=120
```

`package-lock.json` giữ nguyên SHA-256 so với baseline.

## 11. Rollback

### Rollback cấu hình nhanh

```env
CSP_MODE=report-only
```

Nếu sự cố khẩn cấp:

```env
CSP_MODE=off
```

### Rollback mã nguồn

Deploy lại:

```text
MK-pro-phase08-frontend-professionalization-patched.zip
```

Không cần rollback database vì Phase 09 không migration, không thay schema và không ghi lại dữ liệu nghiệp vụ.

## 12. Khuyến nghị tiếp theo

1. Chạy `report-only` trên staging tối thiểu qua toàn bộ luồng nghiệp vụ.
2. Xử lý 67 dynamic-unverified và 12 unknown theo thứ tự: nhập Excel, master return, quỹ, sales, delivery.
3. Thêm browser E2E kiểm tra console/CSP violation.
4. Chuyển staging sang enforcement.
5. Sau canary ổn định mới bật enforcement production.
6. Tách inline styles sang class/CSS để bỏ `style-src 'unsafe-inline'` trong giai đoạn riêng.

## 13. Danh sách file thêm/sửa/xóa

### Thêm — 14 file

```text
CSP_HTTP_SMOKE.json
CSP_MIDDLEWARE_BENCHMARK.csv
CSP_MIDDLEWARE_BENCHMARK.json
CSP_POLICY.md
CSP_XSS_HARDENING_REPORT.md
CSP_XSS_SINK_BASELINE.json
CSP_XSS_SINK_INVENTORY.json
public/js/print-preview-actions.js
public/js/security/safe-dom.js
public/js/swagger-init.js
public/mobile/js/catalog-cache-config.js
scripts/security/audit-frontend-sinks.js
src/middlewares/csp.middleware.js
test/csp-xss-hardening.test.js
```

### Sửa — 43 file

```text
.env.example
.env.production.example
config/source-bundles.json
package.json
public/fragments/index/07-index-body.html
public/js/app/03-customers-autocomplete.js
public/js/app/04-import-orders.js
public/js/app/05-sales-orders.js
public/js/app/05-sales-orders.part02.js
public/js/app/05-sales-orders.part03.js
public/js/app/05-sales-orders.source/part-01.jsfrag
public/js/app/05-sales-orders.source/part-02.jsfrag
public/js/app/05-sales-orders.source/part-03.jsfrag
public/js/app/06-master-delivery.js
public/js/app/admin/08b-users.js
public/js/app/admin/08c-promotions-legacy.js
public/js/app/admin/08e-promotion-programs.js
public/js/app/debt/07a-debt-core.js
public/js/app/debt/07b-return-orders.js
public/js/app/debt/07d-master-return-orders.js
public/js/app/debt/07e-debt-collections.js
public/js/app/debt/07f-fund-ledger.js
public/js/app/debt/07f-fund-ledger.part02.js
public/js/app/debt/07f-fund-ledger.part03.js
public/js/app/debt/07f-fund-ledger.source/part-01.jsfrag
public/js/app/debt/07f-fund-ledger.source/part-02.jsfrag
public/js/app/debt/07f-fund-ledger.source/part-03.jsfrag
public/mobile/delivery.html
public/mobile/js/sales.js
public/mobile/js/sales.source/part-01b.jsfrag
public/mobile/js/sales.source/part-02.jsfrag
public/mobile/login.html
public/mobile/sales.html
services/printService.js
src/app.js
src/routes/swaggerRoutes.js
templates/print/dmsExactSalesInvoice.template.js
templates/printTemplates.js
templates/printTemplates.source/part-01.jsfrag
test/app-docs-route.test.js
test/excel-product-catalog-rule.test.js
test/fixtures/index-page/phase79-assembled.sha256
test/mobile-sales-phase5-production-hardening.test.js
```

### Xóa — 0 file

```text
Không có
```

Các generated bundle trong danh sách sửa được sinh lại từ canonical source và đã qua checksum gate; không chỉnh tay output generated. `PHASE09_FILE_MANIFEST.json` là manifest bàn giao tự mô tả nên không tự liệt kê chính nó.
