# CANONICAL SOURCE PILOT REPORT

## 1. Phạm vi và kết luận

Baseline được sử dụng:

```text
MK-pro-phase02-safe-cleanup-patched.zip
```

Giai đoạn này chỉ thí điểm trên **một bundle**:

```text
public/mobile/js/delivery-mobile-view.js
```

Kết quả:

- Giữ nguyên 18 bundle trong pipeline.
- Baseline có **54 `.jsfrag`** và 5 CSS source part.
- Sau pilot còn **52 `.jsfrag`**, thêm đúng **1 canonical JavaScript source**.
- Hai fragment của bundle thí điểm đã được hợp nhất thành một file chỉnh sửa thủ công duy nhất.
- Runtime vẫn được sinh tự động để không thay đổi deployment/runtime contract.
- Thêm source map deterministic có `sourcesContent` để debug.
- Executable JavaScript sau minify có SHA-256 **giống hoàn toàn baseline**.
- Không thay API, schema, package dependency, business rule, tồn kho, AR, quỹ hoặc hàng trả.

## 2. Baseline trước khi sửa

| Chỉ số | Giá trị |
|---|---:|
| File, không tính `node_modules` | 1.021 |
| Dung lượng | 6.921.361 byte |
| JavaScript `.js` | 864 |
| JavaScript fragment `.jsfrag` | 54 |
| Source bundle | 18 |
| Direct dependency, gồm dev | 14 |
| Package trong lock tree | 156 |
| Candidate canonical source SHA-256 | `2a4b20ad06bccf882a7f3e53a86d4eec9c965c1fba1c5f19e493c84003d9fbe4` |
| Candidate executable SHA-256 | `4eab33181dd0cbe8d98c7ed13dab608c2fb457bbd8fc2e4b39e8b1c60afa2742` |
| Full bundle check | PASS, 18 bundle, 2,03 giây |
| Full test | PASS 905, FAIL 0, SKIP 1; 906 test |
| Full test elapsed | 10,73 giây |
| Syntax | PASS, 864 file JS |
| npm audit production | PASS, 0 vulnerability |
| Startup | HTTP bind thành công; dừng tại `mongodb-connect` vì thiếu `MONGO_URI` |

## 3. Danh mục 18 bundle và nguồn/runtime hiện tại

Mọi bundle dùng cùng builder chính:

```text
scripts/build-source-bundles.js
npm run build:source-bundles
npm run check:source-bundles
```

| # | Bundle target | Canonical source | Generated output | Script | Runtime load/call site | Checksum, budget và coverage |
|---:|---|---|---|---|---|---|
| 1 | `src/services/returnOrderLegacy.service.js` | `src/services/returnOrderLegacy.service.source/part-01.jsfrag`<br>`src/services/returnOrderLegacy.service.source/part-02.jsfrag`<br>`src/services/returnOrderLegacy.service.source/part-03.jsfrag`<br>`src/services/returnOrderLegacy.service.source/part-04.jsfrag` | `src/services/returnOrderLegacy.service.js` | `scripts/build-source-bundles.js` | `src/services/return-order/{ReturnOrderCommandService,ReturnOrderQueryService,ReturnReceivingService,ReturnDraftSyncService,ReturnAccountingService}.js` | `phase79b-source-bundles.test.js`; budget 40960 B; return state, atomic receive, no-direct-return-write, staff identity |
| 2 | `src/services/importExportLegacy.service.js` | `src/services/importExportLegacy.service.source/part-01.jsfrag`<br>`src/services/importExportLegacy.service.source/part-02.jsfrag`<br>`src/services/importExportLegacy.service.source/part-03.jsfrag` | `src/services/importExportLegacy.service.js` | `scripts/build-source-bundles.js` | `src/services/import-export/{ImportFacade,ExportFacade,TemplateFacade}.js` | `phase79b-source-bundles.test.js`; budget 40960 B; invoice export restoration, VAT profile, product catalog, pagination |
| 3 | `src/services/reportLegacy.service.js` | `src/services/reportLegacy.service.source/part-01.jsfrag`<br>`src/services/reportLegacy.service.source/part-02.jsfrag`<br>`src/services/reportLegacy.service.source/part-03.jsfrag` | `src/services/reportLegacy.service.js` | `scripts/build-source-bundles.js` | `src/services/reports/{DebtReportService,DashboardReportService}.js` | `phase79b-source-bundles.test.js`; budget 40960 B; report pagination/date pushdown, AR-only debt, dashboard, inventory boundary |
| 4 | `src/services/orderLegacy.service.js` | `src/services/orderLegacy.service.source/part-01.jsfrag`<br>`src/services/orderLegacy.service.source/part-02.jsfrag`<br>`src/services/orderLegacy.service.source/part-03.jsfrag` | `src/services/orderLegacy.service.js` | `scripts/build-source-bundles.js` | `src/services/sales-order/{SalesOrderQueryService,SalesOrderPostingCoordinator,SalesOrderCommandService}.js` | `phase79b-source-bundles.test.js`; budget 40960 B; stock posting, delete visibility, VAT, staff filter, print snapshot |
| 5 | `src/services/mobile/sales.service.js` | `src/services/mobile/sales.service.source/part-01.jsfrag`<br>`src/services/mobile/sales.service.source/part-01b.jsfrag`<br>`src/services/mobile/sales.service.source/part-02.jsfrag`<br>`src/services/mobile/sales.service.source/part-03.jsfrag` | `src/services/mobile/sales.service.js` | `scripts/build-source-bundles.js` | `src/controllers/mobile/sales.controller.js`; `src/services/mobile/MobileSyncService.js` | `phase79b-source-bundles.test.js`; budget 40960 B; mobile phase 1/2, idempotency, ledger boundary, delete visibility |
| 6 | `src/engines/delivery.legacy.engine.js` | `src/engines/delivery.legacy.engine.source/part-01.jsfrag`<br>`src/engines/delivery.legacy.engine.source/part-02.jsfrag`<br>`src/engines/delivery.legacy.engine.source/part-03.jsfrag` | `src/engines/delivery.legacy.engine.js` | `scripts/build-source-bundles.js` | `src/engines/delivery/DeliveryEngineFacade.js` | `phase79b-source-bundles.test.js`; budget 40960 B; delivery dedup, lifecycle boundary, staff identity, direct-return guard |
| 7 | `services/printDataBuilder.legacy.js` | `services/printDataBuilder.legacy.source/part-01.jsfrag`<br>`services/printDataBuilder.legacy.source/part-02.jsfrag`<br>`services/printDataBuilder.legacy.source/part-03.jsfrag` | `services/printDataBuilder.legacy.js` | `scripts/build-source-bundles.js` | `services/print/{PrintFormatService,PrintDocumentBuilder}.js` | `phase79b-source-bundles.test.js`; budget 40960 B; print staff canonical contract |
| 8 | `src/services/fundService.js` | `src/services/fundService.source/part-01.jsfrag`<br>`src/services/fundService.source/part-02.jsfrag`<br>`src/services/fundService.source/part-03.jsfrag` | `src/services/fundService.js` | `scripts/build-source-bundles.js` | `src/controllers/fundController.js`; `src/domain/posting/FundPostingService.js`; `src/domain/settlement/DeliverySettlementService.js` | `phase79b-source-bundles.test.js`; budget 40960 B; fund posting/write guards, voucher UI, shortage repayment, summary |
| 9 | `src/services/inventoryService.js` | `src/services/inventoryService.source/part-01.jsfrag`<br>`src/services/inventoryService.source/part-02.jsfrag`<br>`src/services/inventoryService.source/part-03.jsfrag` | `src/services/inventoryService.js` | `scripts/build-source-bundles.js` | `src/controllers/reportController.js`; `src/domain/posting/InventoryPostingService.js` | `phase79b-source-bundles.test.js`; budget 40960 B; inventory read/write boundaries, shadow rebuild, import posting |
| 10 | `templates/printTemplates.js` | `templates/printTemplates.source/part-01.jsfrag`<br>`templates/printTemplates.source/part-02.jsfrag`<br>`templates/printTemplates.source/part-03.jsfrag` | `templates/printTemplates.js` | `scripts/build-source-bundles.js` | `services/printService.js` | `phase79b-source-bundles.test.js`; budget 40960 B; print layout tokens, DMS invoice, Excel product fields |
| 11 | `public/js/app/05-sales-orders.js` | `public/js/app/05-sales-orders.source/part-01.jsfrag`<br>`public/js/app/05-sales-orders.source/part-02.jsfrag`<br>`public/js/app/05-sales-orders.source/part-03.jsfrag`<br>`public/js/app/05-sales-orders.source/part-04.jsfrag` | `public/js/app/05-sales-orders.js`<br>`public/js/app/05-sales-orders.part02.js`<br>`public/js/app/05-sales-orders.part03.js`<br>`public/js/app/05-sales-orders.part04.js` | `scripts/build-source-bundles.js` | `public/fragments/index/07-index-body.html:296-299` tải 4 shard theo thứ tự | `phase79b-source-bundles.test.js`; budget 24576, 40960, 40960, 40960 B; sales UI, encoding, print domain, VAT, inventory display |
| 12 | `public/mobile/js/sales.js` | `public/mobile/js/sales.source/part-01.jsfrag`<br>`public/mobile/js/sales.source/part-01c.jsfrag`<br>`public/mobile/js/sales.source/part-01b.jsfrag`<br>`public/mobile/js/sales.source/part-02.jsfrag`<br>`public/mobile/js/sales.source/part-02b.jsfrag`<br>`public/mobile/js/sales.source/part-03.jsfrag`<br>`public/mobile/js/sales.source/part-03b.jsfrag` | `public/mobile/js/sales.js` | `scripts/build-source-bundles.js` | `public/mobile/sales.html:210` (`type="module"`) | `phase79b-source-bundles.test.js`; budget 40960 B; mobile phase 1-5, debt tabs, report edit, delete visibility |
| 13 | `public/js/app/admin/08d-import-excel.js` | `public/js/app/admin/08d-import-excel.source/part-01.jsfrag`<br>`public/js/app/admin/08d-import-excel.source/part-02.jsfrag`<br>`public/js/app/admin/08d-import-excel.source/part-03.jsfrag` | `public/js/app/admin/08d-import-excel.js`<br>`public/js/app/admin/08d-import-excel.part02.js`<br>`public/js/app/admin/08d-import-excel.part03.js` | `scripts/build-source-bundles.js` | `public/fragments/index/07-index-body.html:318-320` tải 3 shard | `phase79b-source-bundles.test.js`; budget 24576, 40960, 40960 B; two-phase import, preview, selective update, allocation trace |
| 14 | `public/js/delivery/delivery-web-view.js` | `public/js/delivery/delivery-web-view.source/part-01.jsfrag`<br>`public/js/delivery/delivery-web-view.source/part-02.jsfrag`<br>`public/js/delivery/delivery-web-view.source/part-03.jsfrag` | `public/js/delivery/delivery-web-view.js` | `scripts/build-source-bundles.js` | `public/fragments/index/07-index-body.html:302` | `phase79b-source-bundles.test.js`; budget 40960 B; delivery branch filter, toolbar, unified search, staff fallback |
| 15 | `public/js/app/debt/07f-fund-ledger.js` | `public/js/app/debt/07f-fund-ledger.source/part-01.jsfrag`<br>`public/js/app/debt/07f-fund-ledger.source/part-02.jsfrag`<br>`public/js/app/debt/07f-fund-ledger.source/part-03.jsfrag` | `public/js/app/debt/07f-fund-ledger.js`<br>`public/js/app/debt/07f-fund-ledger.part02.js`<br>`public/js/app/debt/07f-fund-ledger.part03.js` | `scripts/build-source-bundles.js` | `public/fragments/index/07-index-body.html:311-313` tải 3 shard | `phase79b-source-bundles.test.js`; budget 24576, 40960, 40960 B; fund summary/voucher/counterparty/submission tabs |
| 16 | `public/mobile/js/delivery-mobile-view.js` | `public/mobile/js/delivery-mobile-view.source.js` (1 canonical JS) | `public/mobile/js/delivery-mobile-view.js`<br>`public/mobile/js/delivery-mobile-view.js.map` | `scripts/build-source-bundles.js` | `public/mobile/delivery.html:16` | `phase79b-source-bundles.test.js`; budget 40960 B; delivery debt tab/subtabs/checkbox, staff fallback + pilot equivalence |
| 17 | `public/mobile/mobile.css` | `public/mobile/mobile.source/mobile-01.css`<br>`public/mobile/mobile.source/mobile-02.css`<br>`public/mobile/mobile.source/mobile-03.css` | `public/mobile/mobile.css` | `scripts/build-source-bundles.js` | `public/mobile/{login,sales,delivery}.html` | `phase79b-source-bundles.test.js`; budget 2048 B; mobile viewport/UX/debt tabs/checkbox |
| 18 | `public/print.css` | `public/print.source/print-01.css`<br>`public/print.source/print-02.css` | `public/print.css` | `scripts/build-source-bundles.js` | `templates/printTemplates*`, `services/printService.js`, preview bán hàng | `phase79b-source-bundles.test.js`; budget 2048 B; print contract/layout tests through templates and print services |

### Nhận xét inventory

- 10 CommonJS bundle được `require` qua facade/service rõ ràng.
- 6 JavaScript browser bundle được tải bằng `<script>` hoặc module tag.
- 2 CSS bundle là generated manifest dùng `@import` theo thứ tự cascade.
- 17 bundle chưa migrate vẫn dùng `parts[]` và checksum hiện hữu, không bị thay đổi trong pilot.
- Bundle pilot dùng `canonicalSource`, `executableSha256` và source map.

## 4. Lý do chọn bundle thí điểm

### Bundle được chọn

```text
public/mobile/js/delivery-mobile-view.js
```

| Tiêu chí | Bằng chứng |
|---|---|
| Ít fragment | Chỉ 2 `.jsfrag`, thấp nhất trong các JavaScript bundle |
| Nhỏ nhất trong nhóm JS | Canonical source 41.682 byte |
| Không phải backend posting | Là lớp render/interaction của mobile delivery; không trực tiếp ghi inventory ledger, AR ledger hoặc fund ledger |
| Runtime load đơn giản | Một `<script>` tại `public/mobile/delivery.html:16` |
| Coverage tốt | Test debt tab, debt subtabs, compact checkbox, staff fallback và full suite |
| Rollback dễ | Có thể phục hồi hai fragment và manifest cũ; runtime URL không đổi |
| Behavior dễ chứng minh | Terser output trước/sau có cùng executable SHA-256 |

Không chọn các bundle `inventoryService`, `fundService`, `orderLegacy`, `returnOrderLegacy`, VAT/SSE export hoặc sales mobile trong pilot vì mức độ ảnh hưởng dữ liệu/nghiệp vụ cao hơn.

## 5. Sơ đồ trước và sau

### Trước

```text
part-01.jsfrag ─┐
                 ├─ nối chuỗi ─ Terser ─> delivery-mobile-view.js ─> browser
part-02.jsfrag ─┘

Nguồn chỉnh tay: 2 fragment
Debug runtime: file minified, không source map
Gate: sourceSha256 + so sánh generated output
```

### Sau

```text
delivery-mobile-view.source.js   <── nguồn duy nhất được chỉnh tay
                 │
                 ├─ sourceSha256
                 ├─ Terser deterministic
                 ├─ executableSha256
                 │
                 ├──> delivery-mobile-view.js       GENERATED FILE - DO NOT EDIT
                 └──> delivery-mobile-view.js.map   generated, có sourcesContent

check:canonical-source-pilot
  └─ fail nếu runtime hoặc map lệch canonical source
```

URL runtime không đổi:

```text
/mobile/js/delivery-mobile-view.js?v=delivery-debt-subtabs-v2
```

## 6. Thiết kế build/verify

### Manifest mới của pilot

```json
{
  "target": "public/mobile/js/delivery-mobile-view.js",
  "mode": "classic-single",
  "sourceSha256": "2a4b20ad06bccf882a7f3e53a86d4eec9c965c1fba1c5f19e493c84003d9fbe4",
  "canonicalSource": "public/mobile/js/delivery-mobile-view.source.js",
  "sourceMap": true,
  "sourceMapTarget": "public/mobile/js/delivery-mobile-view.js.map",
  "executableSha256": "4eab33181dd0cbe8d98c7ed13dab608c2fb457bbd8fc2e4b39e8b1c60afa2742"
}
```

### Lệnh build/verify riêng

```bash
npm run build:canonical-source-pilot
npm run check:canonical-source-pilot
```

Lệnh toàn pipeline vẫn giữ nguyên:

```bash
npm run build:source-bundles
npm run check:source-bundles
npm run source-bundles:refresh
```

### Bảo vệ mới

1. Một entry không được đồng thời có `canonicalSource` và `parts`.
2. Canonical source hash phải khớp manifest.
3. Executable hash phải khớp manifest.
4. `--check` so sánh byte-for-byte runtime và source map.
5. Runtime có banner:

```text
GENERATED FILE - DO NOT EDIT
```

6. Source map chứa:

```json
{
  "file": "delivery-mobile-view.js",
  "sources": ["delivery-mobile-view.source.js"],
  "sourcesContent": ["<canonical source đầy đủ>"]
}
```

7. Builder hỗ trợ `--target=` để build/verify riêng pilot mà không chạm 17 bundle khác.

## 7. Danh sách file thay đổi

### Thêm

| File | Mục đích |
|---|---|
| `public/mobile/js/delivery-mobile-view.source.js` | Canonical source duy nhất của pilot |
| `public/mobile/js/delivery-mobile-view.js.map` | Source map deterministic |
| `test/canonical-source-pilot.test.js` | Khóa cấu trúc, checksum, behavior hash và source map |
| `CANONICAL_SOURCE_PILOT_REPORT.md` | Báo cáo giai đoạn |

### Sửa

| File | Thay đổi |
|---|---|
| `config/source-bundles.json` | Chuyển đúng một entry từ `parts` sang `canonicalSource` |
| `config/source-size-budget.json` | Thêm budget đã review cho canonical source và map |
| `scripts/build-source-bundles.js` | Hỗ trợ canonical source, source map, executable hash và `--target` |
| `package.json` | Thêm 2 npm script build/check pilot; dependency không đổi |
| `SOURCE_BUNDLE_MAINTENANCE.md` | Quy trình chỉnh sửa canonical source |
| `test/helpers/sourceBundle.util.js` | Đọc được cả legacy `parts` và pilot `canonicalSource` |
| `test/phase79b-source-bundles.test.js` | Giữ gate 18 bundle, hỗ trợ schema pilot |
| `public/mobile/js/delivery-mobile-view.js` | Generated banner và sourceMappingURL; executable code không đổi |

### Xóa

| File | Lý do |
|---|---|
| `public/mobile/js/delivery-mobile-view.source/part-01.jsfrag` | Đã hợp nhất byte-exact vào canonical source |
| `public/mobile/js/delivery-mobile-view.source/part-02.jsfrag` | Đã hợp nhất byte-exact vào canonical source |

Thư mục rỗng `delivery-mobile-view.source/` cũng được loại. Không xóa fragment của bundle khác.

## 8. Diff quan trọng

### Manifest

```diff
-"parts": [
-  "public/mobile/js/delivery-mobile-view.source/part-01.jsfrag",
-  "public/mobile/js/delivery-mobile-view.source/part-02.jsfrag"
-],
-"sourceSha256": "2a4b..."
+"sourceSha256": "2a4b...",
+"canonicalSource": "public/mobile/js/delivery-mobile-view.source.js",
+"sourceMap": true,
+"sourceMapTarget": "public/mobile/js/delivery-mobile-view.js.map",
+"executableSha256": "4eab..."
```

### Builder

```diff
+function canonicalPaths(entry) {
+  if (entry.canonicalSource && entry.parts?.length) throw new Error(...);
+  if (entry.canonicalSource) return [entry.canonicalSource];
+  return entry.parts;
+}
+
+const TARGET_ARG = process.argv.find(arg => arg.startsWith('--target='));
+
+if (entry.sourceMap) {
+  sourceMap = { filename, url, includeSources: true };
+}
+
+if (actual !== generated) failures.push(`${output.target}: generated file is stale`);
```

### Runtime banner

```diff
-/* GENERATED FILE — edit part-01.jsfrag, part-02.jsfrag ... */
+/* GENERATED FILE - DO NOT EDIT.
+ * Canonical source: public/mobile/js/delivery-mobile-view.source.js
+ * Build: npm run build:source-bundles
+ */
```

## 9. Chứng minh behavior tương đương

| Bằng chứng | Trước | Sau | Kết luận |
|---|---|---|---|
| Canonical source SHA-256 | `2a4b20ad...d9fbe4` | `2a4b20ad...d9fbe4` | Hai fragment được nối byte-exact |
| Executable JS SHA-256 | `4eab3318...fa2742` | `4eab3318...fa2742` | Mã thực thi minified giống hoàn toàn |
| Runtime URL | `/mobile/js/delivery-mobile-view.js` | Không đổi | Không đổi HTML/API |
| Export/global contract | `window.DeliveryMobileView`, `window.loadDeliveryOrders` | Không đổi | Test hiện hữu pass |
| Full regression | 905 pass trước | 907 pass sau | Không phát hiện regression |

Runtime file SHA thay đổi từ `7f6ba05f...` thành `e7bfba68...` chỉ vì banner mới và `sourceMappingURL`; executable body không đổi.

### Deterministic build

Build pilot được chạy liên tiếp hai lần. Cả hai lần tạo cùng checksum:

```text
e7bfba681b2793eed0dc439a03acc85207c6ec6f65781a3873572e2ada2737b4  delivery-mobile-view.js
ab033738dfa7a79401fba0e3599a4a40be2da459b468db5be4e91010f40ae5e6  delivery-mobile-view.js.map
```

### Negative gate test

Runtime được cố ý thêm một dòng stale. Kết quả verify:

```text
[source-bundles] FAILED
- public/mobile/js/delivery-mobile-view.js: generated file is stale
```

Sau rebuild, `check:canonical-source-pilot` PASS.

## 10. Quality gate thực tế

| Gate | Kết quả |
|---|---:|
| `check:canonical-source-pilot` | **PASS — 1 bundle** |
| Cố ý làm stale output | **PASS — verify đã fail đúng kỳ vọng** |
| Rebuild deterministic 2 lần | **PASS — checksum giống nhau** |
| `check:source-bundles` | **PASS — 18 bundle** |
| Pilot + source-bundle targeted tests | **PASS — 13/13** |
| Full test suite | **PASS — 907, FAIL 0, SKIP 1; tổng 908** |
| Syntax | **PASS — 866 file JavaScript** |
| Source size budget | **PASS** |
| Path portability | **PASS — 1.056 path, 866 JS** |
| Enterprise smoke | **PASS — 10 module, 11 flag** |
| OpenAPI | **PASS — 310 operation** |
| Lock registry | **PASS** |
| npm audit production | **PASS — 0 vulnerability** |
| `npm run quality` | **PASS** |
| HTTP bind/startup gate | **PASS phần HTTP; 7 ms** |
| MongoDB startup/integration | **NOT RUN — thiếu `MONGO_URI`** |
| Browser E2E/thiết bị mobile | **NOT RUN** |

Không tuyên bố production E2E verified vì không có MongoDB test/prod-like và không chạy browser thật.

## 11. So sánh trước/sau

### Cấu trúc

| Chỉ số | Trước | Sau code, chưa tính báo cáo | Chênh lệch |
|---|---:|---:|---:|
| File | 1.021 | 1.022 | +1 |
| Dung lượng | 6.921.361 B | 6.994.816 B | +73.455 B |
| `.jsfrag` | 54 | 52 | -2 |
| Canonical `.source.js` | 0 | 1 | +1 |
| Source map | 0 | 1 | +1 |
| JS được syntax-check | 864 | 866 | +2, gồm source và test |
| Dependency trực tiếp | 14 | 14 | 0 |
| Lock tree | 156 | 156 | 0 |

Dung lượng tăng chủ yếu do source map 66.145 byte và test mới. Đây là trade-off có chủ đích để debug; runtime executable chỉ tăng 5 byte tổng file do thay banner/comment.

### Thời gian

| Gate | Trước | Sau | Nhận xét |
|---|---:|---:|---|
| Full bundle check | 2,03 s | 2,09 s | +0,06 s; trong nhiễu đo |
| Pilot-only verify | Chưa có | 0,53 s | Dùng khi làm việc đúng bundle |
| Full test elapsed | 10,73 s | 11,03 s | +0,30 s; thêm 2 test mới |
| Node test duration | 8,035 s | 8,137 s | +1,3% |
| Startup đến DB gate | 1,14 s | 1,13 s | Không đổi đáng kể |
| HTTP listen step | 8 ms | 7 ms | Không kết luận tối ưu |
| `npm ci` | 2,71 s | 1,75 s | Cache sau ấm hơn; không dùng làm bằng chứng cải thiện |

Mục tiêu giai đoạn là loại dual manual source, không phải tối ưu runtime. Không có tuyên bố tăng hiệu năng.

## 12. Rủi ro còn lại

1. 17 bundle vẫn đang dùng fragment legacy; pipeline tạm thời hỗ trợ hai schema manifest.
2. Source map làm artifact tăng khoảng 66 KB.
3. Canonical source 41,7 KB lớn hơn budget fragment cũ 24 KB; đã đặt budget riêng 64 KB và chỉ áp dụng pilot.
4. Không có browser E2E để xác nhận DevTools source map trên trình duyệt thật.
5. Không có MongoDB test/prod-like nên startup và integration nghiệp vụ chỉ được kiểm chứng bởi test suite hiện hữu.
6. `source-bundles:refresh` vẫn là thao tác có quyền cập nhật checksum; bắt buộc review diff trước khi commit.

## 13. Rollback plan

### Rollback nhanh nhất

Deploy lại:

```text
MK-pro-phase02-safe-cleanup-patched.zip
```

### Rollback theo file

1. Khôi phục:
   - `public/mobile/js/delivery-mobile-view.source/part-01.jsfrag`
   - `public/mobile/js/delivery-mobile-view.source/part-02.jsfrag`
2. Đổi entry manifest về `parts[]` và bỏ `canonicalSource/sourceMap/sourceMapTarget/executableSha256`.
3. Xóa:
   - `public/mobile/js/delivery-mobile-view.source.js`
   - `public/mobile/js/delivery-mobile-view.js.map`
   - `test/canonical-source-pilot.test.js`
4. Revert builder/helper/test/package scripts/maintenance doc/source budget.
5. Chạy:

```bash
npm ci
npm run build:source-bundles
npm run quality
```

6. Chỉ deploy khi full quality PASS.

Không có rollback dữ liệu vì giai đoạn này không ghi database và không thay schema.

## 14. Thứ tự migrate 17 bundle còn lại

| Thứ tự | Bundle | Rủi ro | Lý do thứ tự |
|---:|---|---|---|
| 1 | `public/js/delivery/delivery-web-view.js` | Low–Medium | UI browser, coverage rõ, không trực tiếp posting |
| 2 | `public/mobile/mobile.css` | Low | Generated CSS manifest, rollback đơn giản |
| 3 | `public/print.css` | Low–Medium | CSS only nhưng cần visual regression in ấn |
| 4 | `templates/printTemplates.js` | Medium | Read/render only; cần snapshot mẫu in |
| 5 | `services/printDataBuilder.legacy.js` | Medium | Builder in, không ghi ledger |
| 6 | `src/services/reportLegacy.service.js` | Medium | Chủ yếu read/query; cần regression số liệu |
| 7 | `public/js/app/admin/08d-import-excel.js` | Medium | UI import; cần browser/static test đầy đủ |
| 8 | `public/js/app/05-sales-orders.js` | Medium–High | UI bán hàng lớn, nhiều call site |
| 9 | `public/mobile/js/sales.js` | Medium–High | Mobile sales module, nhiều workflow |
| 10 | `src/engines/delivery.legacy.engine.js` | High | Điều phối giao/trả, cần integration transaction |
| 11 | `src/services/importExportLegacy.service.js` | High | VAT/SSE/import-export chính xác dữ liệu |
| 12 | `src/services/mobile/sales.service.js` | High | API mobile, idempotency và stock boundary |
| 13 | `src/services/orderLegacy.service.js` | High | Đơn bán và posting tồn kho |
| 14 | `src/services/returnOrderLegacy.service.js` | High | SSoT hàng trả và AR-RETURN liên quan |
| 15 | `public/js/app/debt/07f-fund-ledger.js` | High | UI quỹ, cần kiểm soát nghiệp vụ tài chính |
| 16 | `src/services/fundService.js` | Critical | Fund ledger/posting, không migrate thiếu DB integration |
| 17 | `src/services/inventoryService.js` | Critical | Inventory ledger/posting, migrate cuối cùng |

Mỗi bundle phải là một giai đoạn độc lập: baseline hash → merge canonical → deterministic build → behavior equivalence → full quality → rollback artifact.

## 15. Kết luận nghiệm thu

Pilot đạt mục tiêu kỹ thuật trong phạm vi một bundle:

- Một nguồn duy nhất được chỉnh sửa thủ công.
- Generated runtime có banner cấm sửa trực tiếp.
- Build/verify deterministic.
- Output lệch canonical bị chặn.
- Có source map đủ debug.
- Không thay public API hoặc behavior.
- Checksum gate không bị bỏ.
- 17 bundle còn lại chưa bị chạm.

Trạng thái: **Hoàn thành ở mức source/build/test hiện hữu; production startup và browser E2E chưa chạy do giới hạn môi trường.**
