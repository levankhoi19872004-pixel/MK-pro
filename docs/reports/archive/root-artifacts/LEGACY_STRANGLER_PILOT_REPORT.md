# LEGACY STRANGLER PILOT REPORT — PHASE 04

## 1. Phạm vi và baseline

- Baseline: `MK-pro-phase03-canonical-source-pilot-patched.zip`.
- Mục tiêu: thí điểm Strangler Pattern trên đúng một `*Legacy.service.js`.
- Module được chọn: `src/services/importExportLegacy.service.js`.
- Slice được chuyển đổi: quản lý **mẫu import Excel**; không chuyển luồng import commit hoặc export hóa đơn/báo cáo.
- Không đổi API contract, MongoDB schema, package hoặc business rule.
- Không xóa Legacy service trong giai đoạn này.

Baseline trước sửa:

| Gate | Kết quả |
|---|---:|
| Syntax | PASS — 866 JavaScript files |
| Source bundles | PASS — 18 bundles |
| Full test suite | PASS — 907, FAIL 0, SKIP 1 |
| OpenAPI | PASS — 310 operations |
| npm audit production | PASS — 0 vulnerability |
| Test wall time | 10.45 s |
| Node test duration | 7.796 s |
| HTTP startup | PASS — bind port trong 6 ms |
| Full application readiness | NOT RUN — thiếu `MONGO_URI` |

## 2. Bản đồ toàn bộ Legacy service

### 2.1 Danh mục và chấm điểm

Thang điểm 1–5. `Data risk` càng cao nghĩa là thay đổi càng nguy hiểm. `Pilot score` = Frequency + Complexity + Coverage + Maintainability benefit − Data risk; điểm số chỉ là tín hiệu, không thay thế kiểm tra ranh giới nghiệp vụ.

| Legacy service | Kích thước | Export chính | Runtime boundary/call site | Side effect | Transaction/audit | Frequency | Data risk | Complexity | Coverage | Benefit | Pilot score |
|---|---:|---|---|---|---|---:|---:|---:|---:|---:|---:|
| `src/services/importExportLegacy.service.js` | 39,829 B / 235 dòng | import preview/commit/log; template CRUD/download; export Excel | `ImportFacade`, `ExportFacade`; trước pilot có thêm `TemplateFacade` | Import có thể ghi dữ liệu; export đọc; template chỉ ghi collection `import_templates` | Import transaction nằm ở `excelImportService`; template CRUD là single-document operation | 4 | 3 | 5 | 4 | 5 | 15 |
| `src/services/master-order/masterOrderLegacy.service.js` | 2,503 B / 44 dòng | query, delivery, accounting, print, command | Không còn direct runtime require; còn compatibility/static-test role | Gộp đơn, giao hàng, kế toán, hủy/xóa | Nhiều transaction nằm trong các `*.impl.js` | 1 | 5 | 2 | 5 | 2 | 5 |
| `src/services/orderLegacy.service.js` | 30,064 B / 174 dòng | sales-order query/command/posting | `SalesOrderQueryService`, `SalesOrderCommandService`, `SalesOrderPostingCoordinator` | Ghi đơn, post/reverse tồn, đồng bộ trả hàng | Có transaction và inventory posting | 5 | 5 | 5 | 4 | 5 | 14 |
| `src/services/reportLegacy.service.js` | 35,351 B / 217 dòng | stock, debt, dashboard, sales, finance, delivery report | `DebtReportService`, `DashboardReportService` | Read-only nhưng đọc inventory/AR/fund | Không ghi dữ liệu; nhiều aggregate query | 5 | 3 | 5 | 4 | 5 | 16 |
| `src/services/returnOrderLegacy.service.js` | 37,876 B / 230 dòng | return query/command/receive/accounting/draft sync | 5 service adapter trong `src/services/return-order/` | Ghi returnOrders, post tồn, AR, audit | Có transaction, audit, posting | 5 | 5 | 5 | 4 | 5 | 14 |

### 2.2 Call site, repository/model và side effect

#### `importExportLegacy.service.js`

- Canonical source: 3 file `src/services/importExportLegacy.service.source/*.jsfrag`.
- Generated output: `src/services/importExportLegacy.service.js`.
- Runtime callers trước pilot:
  - `src/services/import-export/ImportFacade.js`.
  - `src/services/import-export/ExportFacade.js`.
  - `src/services/import-export/TemplateFacade.js`.
- Route/controller:
  - `src/controllers/importExportController.js` → `/api/import/*`, `/api/export/*`.
  - `src/controllers/importTemplateController.js` → template routes riêng.
- Repository/model liên quan slice template:
  - `src/services/importTemplateService.js`.
  - `src/repositories/importTemplateRepository.js`.
  - `src/models/ImportTemplate.js` / collection `import_templates`.
- Side effect của slice template:
  - `list/get/download`: read-only.
  - `save`: `findOne` + `save` hoặc `create` một document.
  - `delete`: `deleteOne` một document.
  - Không ghi inventory, AR, fund, returnOrders.
- Audit/event: chưa có audit event riêng cho template trong code hiện tại; pilot không thay đổi điều này.

#### `masterOrderLegacy.service.js`

- Đây đã là compatibility facade mỏng, delegate sang các module `masterOrderQuery.impl`, `delivery*.impl`, `masterOrderCommand.impl`, `masterOrderReturn.impl`.
- Không phát hiện direct runtime `require()` vào file legacy; reference còn lại chủ yếu là static compatibility tests và tài liệu/comment anchor.
- Không chọn làm pilot vì nghiệp vụ gộp đơn/giao hàng/kế toán có rủi ro dữ liệu cao và cần integration DB trước khi retirement.

#### `orderLegacy.service.js`

- 3 adapter gọi trực tiếp legacy: query, command, posting coordinator.
- Phụ thuộc repository đơn, khách, sản phẩm, user, master order; promotion; return order; inventory posting; transaction util.
- Có side effect tồn kho và đồng bộ return draft.
- Không chọn do vượt ranh giới an toàn của pilot.

#### `reportLegacy.service.js`

- 2 call site trực tiếp:
  - `DashboardReportService` cho rollback `mode=legacy`.
  - `DebtReportService` cho các API current/open-debt còn dùng optimized legacy implementation.
- Read-only nhưng semantics liên quan inventory/AR/fund/VAT; cần bộ contract parity dữ liệu production-like trước khi cắt tiếp.
- Là ứng viên kế tiếp sau pilot này, ưu tiên từng report read-only riêng biệt.

#### `returnOrderLegacy.service.js`

- 5 adapter trực tiếp: query, command, receiving, accounting, draft sync.
- Có transaction, audit, inventory posting và financial service.
- Không chọn do rủi ro business-critical.

## 3. Lý do chọn `importExportLegacy.service.js` — slice template

Mặc dù `reportLegacy.service.js` có pilot score cao hơn, slice template được chọn vì:

1. Ranh giới chức năng đã tồn tại rõ trong `importTemplateService`.
2. Có 7 method contract ổn định, dễ kiểm tra parity.
3. Không ghi inventory, AR, fund hoặc returnOrders.
4. Không cần thay schema hoặc route.
5. Rollback chỉ là khôi phục một require path/facade.
6. Có thể chuyển call site thật mà vẫn giữ adapter legacy cho phần chưa migration.
7. Không copy God function sang file mới; application service tái sử dụng domain service hiện có.

## 4. Kiến trúc trước và sau

### Trước

```text
importExportController (template handlers)
        │
        ▼
importExportService
        │
        ▼
TemplateFacade
        │
        ▼
importExportLegacy.service.js
        │
        ▼
importTemplateService
        │
        ▼
importTemplateRepository → ImportTemplate

importTemplateController ───────────────→ importTemplateService
```

### Sau

```text
importExportController (template handlers) ─┐
importTemplateController                   ├─→ ImportTemplateApplicationService
TemplateFacade                             ┘          │
                                                       ▼
                                               ImportTemplateContract
                                                       │
                                                       ▼
                                               importTemplateService
                                                       │
                                                       ▼
                                     importTemplateRepository → ImportTemplate

ImportFacade / ExportFacade ─→ importExportLegacy.service.js
                                      │
                                      └─ template compatibility exports
                                           → LegacyImportTemplateAdapter
                                           → ImportTemplateApplicationService
```

Kết quả reference graph sau pilot:

```text
Direct require('../importExportLegacy.service') còn đúng 2:
- src/services/import-export/ImportFacade.js
- src/services/import-export/ExportFacade.js
```

`TemplateFacade` và hai controller không còn đi qua legacy cho template operations.

## 5. Contract trước và sau

Public contract không đổi:

| Method | Sync/Async | Contract |
|---|---|---|
| `getBuiltInTemplates()` | Sync | `Array<{type,title,fileName}>` |
| `buildBuiltInTemplateFile(type)` | Async | `{buffer,fileName}` hoặc throw validation error |
| `getFields(type)` | Sync | `Array<{field,label}>` |
| `listCustomTemplates()` | Async | Array template documents |
| `saveCustomTemplate(payload)` | Async | `{template}` hoặc `{error,status}` |
| `deleteCustomTemplate(id)` | Async | `{deleted:true}` hoặc `{error,status}` |
| `buildCustomTemplateFile(id)` | Async | `{buffer,fileName}` hoặc `{error,status}` |

Contract được khai báo tại:

```text
src/services/import-template/ImportTemplateContract.js
```

Contract validator fail-fast khi implementation thiếu method. Adapter và application service đều export object frozen để tránh runtime mutation ngoài ý muốn.

## 6. Call site đã chuyển

### Chuyển sang application service

1. `src/services/import-export/TemplateFacade.js`.
2. `src/controllers/importTemplateController.js` — 7 template operations.
3. `src/controllers/importExportController.js` — 7 template handlers.
4. Canonical fragment của `importExportLegacy.service.js` đổi dependency template sang `LegacyImportTemplateAdapter`.

### Chưa chuyển trong giai đoạn này

- `src/services/import-export/ImportFacade.js`.
- `src/services/import-export/ExportFacade.js`.
- Import commit, preview, logs.
- VAT/NON_VAT/SSE và các export report.

## 7. Danh sách file thay đổi

### Thêm

- `src/services/import-template/ImportTemplateContract.js`.
- `src/services/import-template/ImportTemplateApplicationService.js`.
- `src/services/import-template/LegacyImportTemplateAdapter.js`.
- `test/import-template-strangler-pilot.test.js`.
- `LEGACY_STRANGLER_PILOT_REPORT.md`.

### Sửa

- `src/services/import-export/TemplateFacade.js`.
- `src/controllers/importTemplateController.js`.
- `src/controllers/importExportController.js`.
- `src/services/importExportLegacy.service.source/part-01.jsfrag`.
- `src/services/importExportLegacy.service.js` — generated output.
- `config/source-bundles.json` — refresh canonical source checksum cho đúng một bundle.

### Xóa

- Không có.

### Package/schema/API

- `package.json`: không đổi.
- `package-lock.json`: không đổi.
- MongoDB schema/index: không đổi.
- Route và HTTP payload/response: không đổi.

## 8. Diff quan trọng

### 8.1 Template facade

```diff
-'use strict';
-const legacy = require('../importExportLegacy.service');
-module.exports = {
-  getBuiltInTemplates: legacy.getBuiltInTemplates,
-  ...
-};
+'use strict';
+module.exports = require('../import-template/ImportTemplateApplicationService');
```

### 8.2 Controller template route

```diff
-const importTemplateService = require('../services/importTemplateService');
+const importTemplateService = require('../services/import-template/ImportTemplateApplicationService');
```

```diff
-const result = await importExportService.saveCustomTemplate(req.body || {});
+const result = await importTemplateService.saveCustomTemplate(req.body || {});
```

### 8.3 Legacy canonical source

```diff
-const importTemplateService = require('./importTemplateService');
+const importTemplateService = require('./import-template/LegacyImportTemplateAdapter');
```

Legacy export names và response shape giữ nguyên.

## 9. Source bundle integrity

Chỉ source hash của bundle mục tiêu thay đổi:

```text
Target: src/services/importExportLegacy.service.js
Before source SHA-256: 4e1cd56cc4f70849a7152d977d6b439b74315dfc31e3da209152ab59cf66f3c8
After source SHA-256:  9b511e970d1d9c3077f85220a881e120e22b2d161659f06e8889121a4e644395
```

Quy trình:

```text
Edit canonical fragment
→ targeted refresh hash
→ deterministic build generated output
→ check toàn bộ 18 bundle
```

Không chỉnh tay generated output.

## 10. Behavior-equivalence proof

### Built-in templates

- 13/13 loại template được sinh ở baseline và sau pilot.
- Tên file và kích thước giống nhau.
- Toàn bộ ZIP entries bên trong workbook có nội dung byte-for-byte giống nhau.
- Hash toàn file `.xlsx` giữa hai process có thể khác do ZIP metadata timestamp; semantic entry content giống hoàn toàn.

### Legacy compatibility

Các contract sau trả cùng dữ liệu:

```text
importTemplateService
ImportTemplateApplicationService
LegacyImportTemplateAdapter
TemplateFacade
importExportLegacy.service.js
```

Async custom-template methods được test bằng delegation spy, xác nhận argument và result shape không đổi.

## 11. Benchmark trước/sau

### 11.1 Isolated `TemplateFacade` cold require — 30 process runs

| Chỉ số median | Trước | Sau | Chênh lệch |
|---|---:|---:|---:|
| Cold require | 527.09 ms | 370.51 ms | **−29.71%** |
| RSS | 187.42 MB | 162.56 MB | **−13.27%** |
| Heap used | 29.76 MB | 23.27 MB | **−21.81%** |
| 20,000 sync contract calls | 16.66 ms | 16.88 ms | +1.31%, trong vùng noise |

Nguyên nhân: `TemplateFacade` không còn nạp God bundle import/export và toàn bộ model/report/export dependency chỉ để sử dụng template methods.

### 11.2 Full `importExportService` cold require — 20 process runs

| Chỉ số median | Trước | Sau | Chênh lệch |
|---|---:|---:|---:|
| Cold require | 534.30 ms | 544.69 ms | +1.94%, không có cải thiện đáng kể |
| RSS | 188.97 MB | 188.10 MB | −0.46% |
| 20,000 template calls | 17.21 ms | 17.31 ms | +0.59% |

Giải thích: `importExportService` vẫn phải nạp `ImportFacade` và `ExportFacade`, nên legacy bundle vẫn được load. Pilot không tuyên bố cải thiện startup toàn ứng dụng.

### 11.3 Test timing

| Chỉ số | Trước | Sau |
|---|---:|---:|
| Full test wall time | 10.45 s | 10.83 s |
| Node test duration | 7.796 s | 7.985 s |
| Test count | 908 | 915 |

Thời gian tăng nhẹ do thêm 7 test pilot; không phát hiện regression hiệu năng runtime nghiệp vụ.

## 12. Kết quả test và quality gate

| Gate | Kết quả |
|---|---:|
| Pilot test | PASS — 7/7 |
| Full test suite | PASS — 914, FAIL 0, SKIP 1 |
| Syntax | PASS — 870 JavaScript files |
| Source bundles | PASS — 18 bundles |
| Source-size budget | PASS |
| Path portability | PASS — 1,061 paths |
| Enterprise smoke | PASS — 10 modules / 11 flags |
| OpenAPI | PASS — 310 operations |
| npm audit production | PASS — 0 vulnerability |
| Aggregate `npm run quality` | PASS — 17.72 s |
| HTTP listen/startup gate | PASS — port bind 6 ms |
| MongoDB integration | NOT RUN — thiếu `MONGO_URI` |
| Production browser/deploy canary | NOT RUN |

Test pilot bao phủ:

1. Stable seven-method contract.
2. Static proof call site không còn load legacy cho template path.
3. Built-in catalog/field parity.
4. Workbook equivalence cho 13 template.
5. Async custom-template delegation parity.
6. Controller response contract parity.
7. Fail-fast khi implementation thiếu method.

## 13. Cycle/dependency check

Static relative-require graph:

| Chỉ số | Trước | Sau |
|---|---:|---:|
| JS nodes trong `src` | 448 | 451 |
| Relative require edges | 1,485 | 1,490 |
| Cycle | 1 | 1 |

Không phát sinh cycle mới. Cycle tồn tại trước và sau không thuộc phạm vi pilot:

```text
services/internalSaleAllocation.service.js
↔ services/mobile/catalog.service.js
```

## 14. Legacy deletion proof / lý do giữ adapter

`src/services/importExportLegacy.service.js` **không được xóa** vì reference graph chưa bằng 0:

```text
src/services/import-export/ImportFacade.js
src/services/import-export/ExportFacade.js
```

Ngoài ra legacy bundle vẫn chứa:

- import preview/commit/log;
- VAT/NON_VAT/SSE export;
- business report export;
- compatibility exports cho template.

`LegacyImportTemplateAdapter` được giữ để:

1. Bảo toàn contract cho caller cũ.
2. Cho phép rollback riêng slice template.
3. Tránh big-bang migration.
4. Cho test so sánh legacy/new implementation trong giai đoạn chuyển tiếp.

Điều kiện để xóa adapter/template exports khỏi legacy ở giai đoạn sau:

- zero direct/dynamic call site tới legacy template methods;
- controller/service integration với MongoDB test đạt;
- release canary không có caller ngoài repository;
- contract deprecation window được chốt.

## 15. Rủi ro còn lại

1. `importExportController.js` vẫn tải full `importExportService`, vì cùng controller chứa import/export handlers; chưa có startup benefit toàn controller.
2. Custom-template CRUD chưa có audit event riêng; đây là hiện trạng cũ, không được tự thêm trong pilot.
3. `importTemplateRepository.upsert()` là find-then-save/create, có thể race nếu hai request tạo cùng business key; unique index hiện có ở `type+name` sẽ bảo vệ DB nhưng error mapping chưa được chuẩn hóa. Không sửa vì ngoài phạm vi.
4. MongoDB integration và production E2E chưa chạy do thiếu môi trường.
5. Legacy import/export God bundle vẫn lớn; chỉ một slice được strangler.

## 16. Thứ tự tiếp theo đề xuất

1. `reportLegacy.service.js`: chuyển từng report read-only có fixture/production-like parity; ưu tiên delivery hoặc dashboard non-legacy path, không bắt đầu bằng debt.
2. `importExportLegacy.service.js`: tách `ImportFacade` khỏi legacy bằng application contract quanh `excelImportService`.
3. `importExportLegacy.service.js`: tách export registry/classifier, giữ VAT/SSE test nghiêm ngặt.
4. `masterOrderLegacy.service.js`: xác minh zero runtime reference và chuẩn bị retirement proof; không xóa trước integration DB.
5. `orderLegacy.service.js`: query slice trước, command/posting sau.
6. `returnOrderLegacy.service.js`: query trước; receiving/accounting/posting cuối cùng.

## 17. Rollback plan

### Rollback nhanh

Triển khai lại ZIP Phase 03:

```text
MK-pro-phase03-canonical-source-pilot-patched.zip
```

### Rollback theo file

1. Khôi phục:
   - `src/services/import-export/TemplateFacade.js`.
   - `src/controllers/importTemplateController.js`.
   - `src/controllers/importExportController.js`.
   - `src/services/importExportLegacy.service.source/part-01.jsfrag`.
   - `config/source-bundles.json`.
2. Xóa:
   - `src/services/import-template/ImportTemplateContract.js`.
   - `src/services/import-template/ImportTemplateApplicationService.js`.
   - `src/services/import-template/LegacyImportTemplateAdapter.js`.
   - `test/import-template-strangler-pilot.test.js`.
3. Chạy lại:

```bash
npm run build:source-bundles
npm run quality
```

Không cần rollback database vì pilot không migration hoặc thay schema/data.
