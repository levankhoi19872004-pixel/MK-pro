# SAFE CLEANUP REPORT — PHASE 02

> **Baseline ZIP:** `MK-pro-master-return-popup-production-grade-patched(1).zip`  
> **Baseline SHA-256:** `a8cf9b3b999a570fc836e9a2d524a2e213cfd91a37e8791f2eed040d2a593689`  
> **Giai đoạn:** `02-safe-cleanup`  
> **Phạm vi:** chỉ loại file/package có bằng chứng không còn tác dụng; không refactor, không đổi business rule, API, schema hoặc package.  
> **Deletion manifest:** `DELETION_MANIFEST.json` được tạo và checksum trước khi xóa.

## 0. Kết luận điều hành

- Đã xóa đúng **7 file** được `CODEBASE_MODERNIZATION_BASELINE.md` xếp `REMOVE` với confidence **High**.
- Không xóa source fragment, generated bundle, migration, reconciliation, audit, backup/restore, rollback hoặc test nghiệp vụ.
- Không gỡ package nào vì toàn bộ **14 dependency trực tiếp** đều có call site hoặc build usage.
- `package.json` và `package-lock.json` giữ nguyên byte-for-byte.
- Không có file mã nguồn nào bị sửa; diff mã nguồn chỉ gồm 7 file bị xóa.
- Full test suite sau dọn: **905 PASS / 0 FAIL / 1 SKIP**.
- Targeted test cho tồn kho, AR, quỹ, khuyến mại và hàng trả: **29 PASS / 0 FAIL**.
- Không có MongoDB integration environment và không có `INTEGRATION_TEST_AND_CI_REPORT.md`; vì vậy full production-like startup/integration DB được ghi **NOT RUN/PARTIAL**, không tuyên bố production release đã được kiểm chứng đầy đủ.

## 1. Đầu vào và giới hạn

| Đầu vào | Trạng thái |
|---|---|
| ZIP mới nhất | Có — `MK-pro-master-return-popup-production-grade-patched(1).zip` |
| `CODEBASE_MODERNIZATION_BASELINE.md` | Có |
| `INTEGRATION_TEST_AND_CI_REPORT.md` | **Không có trong ZIP và không tìm thấy trong tệp đã tải lên** |

Biện pháp thay thế đã chạy trực tiếp trên baseline và bản sau dọn:

- `npm ci --ignore-scripts` với cache tách biệt;
- syntax check;
- source bundle checksum;
- package-lock registry check;
- path portability;
- source-size budget;
- enterprise smoke;
- OpenAPI generation check;
- toàn bộ test suite;
- targeted domain tests;
- npm audit production;
- đo thời gian require app;
- khởi động HTTP đến cổng MongoDB không tồn tại để xác minh startup gate và error path.

## 2. Deletion manifest

Manifest được tạo **trước khi xóa**:

```text
DELETION_MANIFEST.json
Pre-deletion SHA-256:
bf05ad349263dddbb35fd1cdbdd9e88fd8544b17ba23194da4b887c3a540f696
```

Manifest cuối có thêm kết quả thực thi và quality gate, nhưng giữ trường `preDeletionManifestSha256` để truy vết snapshot trước xóa.

## 3. File đã thêm, sửa, xóa

### 3.1 File thêm

| File | Mục đích |
|---|---|
| `DELETION_MANIFEST.json` | Danh mục xóa, bằng chứng, checksum và kết quả xác minh |
| `SAFE_CLEANUP_REPORT.md` | Báo cáo giai đoạn 02 |

### 3.2 File sửa

Không có file mã nguồn, cấu hình, package manifest hoặc lockfile nào bị sửa.

### 3.3 File xóa

| # | File | Kích thước | SHA-256 trước xóa | Confidence |
|---:|---|---:|---|---|
| 1 | `src/config/serverConfig.js` | 137 B | `bdae4f7a3eb5ede657f953f4e91fb9a5a8a695857a174edf4c91483e6d3c4bf6` | High |
| 2 | `config/printConfig.js` | 410 B | `8c4d18d70eb013864f213b8a98420581539c010f4e7526044e58c816837ca692` | High |
| 3 | `src/utils/html.util.js` | 238 B | `510f9015ea955964a9456175f2d56727cf0d1e26d43d37224933fa6e5b35643c` | High |
| 4 | `src/utils/orderKey.util.js` | 460 B | `0cb507f3ea1a727f71b7d635c13a0c42fda5797f06950b468da3f70bf1f0e149` | High |
| 5 | `src/engines/debt.engine.js` | 123 B | `af550615f709a3b8eac89717b83d1f4128f876880c82d772584065c52774deb6` | High |
| 6 | `src/engines/inventory.engine.js` | 119 B | `5fa9e449f8a242a090c7c58bf2204d97b14c80fafe1ce7bbf47c648126692706` | High |
| 7 | `src/engines/promotion.engine.js` | 101 B | `73d53b4c6ec51f0b99b5a9086285a5d4c97df3a2dff1327d2f446fceaefdf748` | High |

> Tổng: **7 file / 1.588 byte / 75 dòng**.

## 4. Bằng chứng xóa an toàn

Mỗi file đã được đối chiếu qua:

- reference graph import/require;
- exact path và basename reference;
- dynamic require/import inventory;
- `package.json` scripts;
- route registration;
- model registration;
- source bundle manifest;
- build/deploy/test scripts;
- tài liệu vận hành.

| File | Static ref | Dynamic ref | Script/build/test | Route/model | Bundle | Docs vận hành | Kết luận |
|---|---:|---:|---:|---:|---:|---:|---|
| `src/config/serverConfig.js` | 0 | 0 | 0 | 0 | 0 | 0 | `src/app.js` đọc `process.env` trực tiếp |
| `config/printConfig.js` | 0 | 0 | 0 | 0 | 0 | 0 | Print runtime dùng domain/service khác |
| `src/utils/html.util.js` | 0 | 0 | 0 | 0 | 0 | 0 | Các `escapeHtml` khác là implementation độc lập, không import file này |
| `src/utils/orderKey.util.js` | 0 | 0 | 0 | 0 | 0 | 0 | Các hàm `orderKey` khác là implementation riêng |
| `src/engines/debt.engine.js` | 0 | 0 | 0 | 0 | 0 | 0 | Placeholder; AR ledger/posting không dùng |
| `src/engines/inventory.engine.js` | 0 | 0 | 0 | 0 | 0 | 0 | Placeholder; inventory ledger/posting không dùng |
| `src/engines/promotion.engine.js` | 0 | 0 | 0 | 0 | 0 | 0 | Placeholder; promotion service/rules không dùng |

Post-delete graph comparison:

```json
{
  "addedSourceFiles": [],
  "deletedSourceFiles": 7,
  "modifiedSourceFiles": [],
  "unchangedSourceFiles": 1019
}
```

## 5. Dependency audit

### 5.1 Package bị gỡ

Không có.

### 5.2 Lý do

Tất cả dependency trực tiếp đều có usage:

```text
bcryptjs, cors, dotenv, express, express-rate-limit,
express-validator, helmet, jsonwebtoken, mongoose, multer,
pino, pino-http, read-excel-file, terser
```

`terser` là devDependency nhưng được pipeline source bundle sử dụng, do đó phải giữ.

### 5.3 Integrity package manifest

```text
package.json SHA-256 trước/sau:
676bc88aa6c8ace19a3b592c446063379bb294235dcdfad69d99615897ae2e2b

package-lock.json SHA-256 trước/sau:
0ee29e9f7858dd144d9ba6fa6e5b51b4ee4e9fa9024a2f6d9c56ca354d0b2d23
```

Installed top-level package: **14 trước / 14 sau**.  
Audit dependency tree: **156 trước / 156 sau**.

Không cần sửa `.gitignore`, package manifest hoặc tài liệu đóng gói vì không thay dependency và không tạo loại artifact runtime mới.

## 6. So sánh trước và sau

### 6.1 Source payload — không tính hai báo cáo mới

| Chỉ số | Trước | Sau | Chênh lệch |
|---|---:|---:|---:|
| File | 1.026 | 1.019 | -7 (-0,68%) |
| Dung lượng | 6.900.251 B | 6.898.663 B | -1.588 B (-0,023%) |
| Dòng văn bản | 160.689 | 160.614 | -75 |
| JavaScript | 871 | 864 | -7 |
| Direct dependency | 14 | 14 | 0 |
| Installed dependency tree | 156 | 156 | 0 |

Giảm dung lượng nhỏ vì chính sách chỉ xóa file đã chứng minh confidence High; không xóa report, migration, source fragment hoặc generated bundle để tạo con số lớn giả tạo.

### 6.2 Hiệu năng quality gate

| Đo | Trước | Sau | Nhận xét |
|---|---:|---:|---|
| `npm ci --ignore-scripts` | 2,69 s | 2,82 s | +4,8%; nhiễu cache/network, package không đổi |
| Full test wall time | 10,30 s | 10,47 s | +1,7%; không có suy giảm có ý nghĩa |
| Node test internal duration | 7,722 s | 7,752 s | +0,4% |
| Syntax check | 1,70 s | 1,69 s | tương đương |
| Bundle check | 2,00 s | 2,05 s | tương đương |
| OpenAPI check | 0,28 s | 0,27 s | tương đương |
| App require median, 7 mẫu | 857,51 ms | 895,27 ms | +4,4%; nhiễu process/cold filesystem, file xóa vốn không được require |
| Startup đến lỗi DB dự kiến | 1,58 s | 1,45 s | -8,2%; cả hai dừng ở `mongodb-connect` |

**Kết luận hiệu năng:** giai đoạn này giảm bề mặt bảo trì, không phải optimization runtime. Không có bằng chứng latency production thay đổi; không tuyên bố tăng tốc.

## 7. Quality gates thực tế

| Gate | Kết quả | Bằng chứng |
|---|---|---|
| npm install | PASS | 156 package, exit 0 |
| package-lock registry | PASS | mọi tarball dùng `registry.npmjs.org` |
| path portability | PASS | 1.051 path, 864 JS |
| syntax | PASS | 864 JavaScript file |
| source bundles | PASS | 18 bundle |
| source-size budget | PASS | OK |
| enterprise smoke | PASS | 10 module / 11 flag |
| OpenAPI | PASS | 310 operation, up-to-date |
| Full test suite | PASS | 905 pass / 0 fail / 1 skip |
| Targeted business tests | PASS | 29 pass / 0 fail |
| npm audit production | PASS | 0 vulnerability |
| HTTP bind/startup gate | PASS đến bước HTTP bind | HTTP listen thành công |
| MongoDB production-like startup | **NOT RUN** | Không có MongoDB test/prod-like |
| Integration suite theo `INTEGRATION_TEST_AND_CI_REPORT.md` | **NOT RUN** | Report/suite không có trong đầu vào |
| Browser E2E/canary deploy | **NOT RUN** | Không có môi trường deploy |

### Targeted test đã chạy

- inventory posting atomic/idempotency/single-source;
- AR ledger guard và AR return accounting flow;
- fund ledger idempotency;
- promotion duplicate guard và legacy print fallback;
- master return receive atomic.

Kết quả: **29/29 PASS**.

## 8. Old/New diff quan trọng

### 8.1 `src/config/serverConfig.js`

```diff
-deleted file mode 100644
-const PORT = process.env.PORT || 3000;
-const NODE_ENV = process.env.NODE_ENV || 'development';
-
-module.exports = { PORT, NODE_ENV };
```

Runtime hiện dùng trực tiếp `process.env` trong `src/app.js`; không có call site đến module này.

### 8.2 `config/printConfig.js`

```diff
-deleted file mode 100644
-const PRINT_TYPES = { ... };
-const PRINT_TITLES = { ... };
-module.exports = { PRINT_TYPES, PRINT_TITLES };
```

Không có import và không tham gia print runtime hiện hành.

### 8.3 `src/utils/html.util.js`

```diff
-deleted file mode 100644
-function escapeHtml(value = '') { ... }
-module.exports = { escapeHtml };
```

Không có consumer. Các helper cùng tên ở frontend/template là code độc lập.

### 8.4 `src/utils/orderKey.util.js`

```diff
-deleted file mode 100644
-function normalizeOrderCode(value) { ... }
-function normalizeOrderCodes(values = []) { ... }
-module.exports = { normalizeOrderCode, normalizeOrderCodes };
```

Không có import/require hoặc dynamic path đến file.

### 8.5 Placeholder engines

```diff
-deleted: src/engines/debt.engine.js
-deleted: src/engines/inventory.engine.js
-deleted: src/engines/promotion.engine.js
```

Ba file chỉ trả lại input, không được đăng ký hoặc gọi. Nguồn chuẩn AR/inventory/promotion không thay đổi.

### 8.6 Package files

```diff
 package.json      | 0 changes
 package-lock.json | 0 changes
```

## 9. Kiểm tra không phát sinh file/dependency thừa

- `node_modules` bị loại khỏi ZIP phát hành.
- Không có package mới.
- Không có package bị gỡ.
- Không có source file mới ngoài hai artifact báo cáo bắt buộc.
- Không có source file nào bị sửa ngoài deletion.
- Không thay bundle checksum/config.
- Không thay OpenAPI.
- Không thay `.gitignore`.

## 10. Rủi ro còn lại

1. **Consumer ngoài repository:** một hệ thống bên ngoài có thể import trực tiếp file bằng path dù repository không có reference. Confidence High chỉ áp dụng cho repository/deploy scripts đã khảo sát.
2. **Thiếu DB integration environment:** chưa chứng minh startup hoàn chỉnh và transaction với MongoDB thật sau cleanup.
3. **Thiếu `INTEGRATION_TEST_AND_CI_REPORT.md`:** không thể chạy đúng safety net dự kiến của Prompt 01.
4. **Dynamic loading tương lai:** nếu deployment inject module path ngoài repo thì static graph không phát hiện; không có bằng chứng cơ chế đó đang dùng bảy file này.
5. **Giảm dung lượng nhỏ:** đây là kết quả chủ ý của chính sách xóa bảo thủ, không phải thất bại cleanup.

## 11. Hướng rollback

### Rollback toàn giai đoạn

Deploy lại ZIP baseline:

```text
MK-pro-master-return-popup-production-grade-patched(1).zip
SHA-256:
a8cf9b3b999a570fc836e9a2d524a2e213cfd91a37e8791f2eed040d2a593689
```

### Rollback từng file

1. Lấy file từ baseline ZIP.
2. Xác minh SHA-256 theo `DELETION_MANIFEST.json`.
3. Phục hồi đúng đường dẫn.
4. Chạy:

```bash
npm ci
npm run check:syntax
npm run check:source-bundles
npm run docs:check
npm test
npm audit --omit=dev --audit-level=high
```

Không có database migration, schema change hoặc data mutation nên rollback không cần thao tác MongoDB.

## 12. Trạng thái nghiệm thu

| Hạng mục | Trạng thái |
|---|---|
| Cleanup repository có bằng chứng | PASS |
| Full static/unit/regression gates | PASS |
| Targeted domain regression | PASS |
| Dependency/security gate | PASS |
| Source bundle/OpenAPI | PASS |
| Production-like Mongo integration | NOT RUN |
| Browser/deploy canary | NOT RUN |

**Kết luận:** bản ZIP đã được dọn an toàn trong phạm vi repository và quality gate hiện có. Chưa được phép diễn giải báo cáo này thành xác nhận production end-to-end cho đến khi có MongoDB integration environment/CI report và canary deploy.
