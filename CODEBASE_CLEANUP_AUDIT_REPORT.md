# CODEBASE CLEANUP AUDIT REPORT

Ngay audit: 2026-07-09

Pham vi: Node.js/Express/MongoDB/Mongoose, frontend thuần trong `public/`, source-bundle/generated files, report/artifact folders. Phase này chi doc va phan tich; khong sua code, khong xoa file, khong drop index, khong refactor.

## 1. Executive summary

Codebase MK-Pro da co governance cleanup tu cac phase truoc: `config/retired-flows.json`, `config/retired-files.json`, `scripts/audit-dead-code.js`, `scripts/audit-flow-usage.js`, `scripts/verify-runtime-flows.js`, `config/source-bundles.json`, va index cleanup policy. Ket qua static hien tai cho thay flow/API frontend tuong doi sach: report san co `reports/runtime-flow-verification.json` ghi `unmatchedFetches=0`, `retiredFrontendHits=0`, `retiredMasterReturnWriteFetches=0`.

Ket luan cleanup: khong nen xoa truc tiep business runtime. Ung vien cleanup an toan nhat nam o nhom artifact/report/root loose test/compatibility manifest. Cac nhom lien quan `orders`, `returnOrders`, `arLedgers`, `fundLedgers`, `stockTransactions`, `inventories`, mobile va report/export production phai giu hoac can runtime evidence truoc khi go bo.

Da kiem tra bat buoc:

| Hang muc | Ket qua |
|---|---|
| `package.json` scripts | Co `audit:dead-code`, `cleanup:retired`, source-bundle, index-audit, reconcile/test/quality scripts. `pretest` co cleanup retired destructive neu file cu ton tai. |
| `src/routes` va route mounting | `src/routes/index.js` mount core routes, retired guards, tool routes, mobile modular routes. |
| `src/models` | Nhieu model flex; SSoT nghiep vu nam trong collection can bao ve. |
| `src/services` | Co legacy/generated facades, print/import/report/inventory/fund bundles. |
| `public/js` | Runtime JS duoc load tu fragments; co mot so compatibility manifest khong loaded. |
| `public/fragments` | 10 fragments duoc render qua `config/index-page-fragments.json`. |
| Frontend menu/tab loader | Menu trong `01-index-body.html`, loader trong `public/js/bootstrap/03-tab-loader.js`, mot so tab tu load bang module event handler. |
| Mongo index registry | `src/services/mongoIndexService.js`, `src/services/mongoIndexAuditService.js`, `scripts/lib/mongoIndexCleanupPolicy.js`. |
| source-bundles/generated/archive/report | 19 bundles trong manifest; root reports/artifacts con nhieu ung vien archive. |

Read-only checks da chay:

| Check | Ket qua |
|---|---|
| `node scripts/audit-dead-code.js --json` | OK, `failures=[]`, `retired=[]`, khong nested phase dirs. |
| Doc/report static evidence | `runtime-flow-verification.json`: static gate OK, nhung can Network/runtime logs de ket luan production clean. |

## 2. Tong so ung vien theo nhom

| Nhom | So ung vien/group | Ghi chu |
|---|---:|---|
| SAFE_DELETE | 4 | Chu yeu artifact/source package hygiene, khong phai business runtime. |
| PROBABLY_UNUSED | 11 | Co bang chung khong mounted/khong loaded/khong require truc tiep, nhung can test va runtime evidence. |
| LEGACY_KEEP | 9 | Cu/compatibility/rollback/runbook/test guard, nen giu. |
| DANGEROUS_DO_NOT_DELETE | 10 | Dinh nghiep vu ke toan/ton kho/cong no/mobile/report/export. |
| NEED_RUNTIME_EVIDENCE | 9 | Can production access log, Mongo `$indexStats`, browser Network, hoac old client telemetry. |

## 3. SAFE_DELETE candidates

| Candidate | Bang chung | Muc tu tin | Rui ro | Khuyen nghi |
|---|---|---:|---|---|
| `node_modules/` trong source ZIP/deploy artifact | `test/source-zip-clean-static.test.js` assert `node_modules must not be shipped`; npm test phase truoc fail vi root co `node_modules`. | Cao | Thap voi release artifact; khong xoa trong dev workspace neu can chay test. | Loai khoi goi ban giao/deploy ZIP; dung `npm ci` tai moi truong target. |
| `reports/flow-usage-audit.json`, `reports/runtime-flow-verification.json`, `reports/runtime-smoke-flows.json` | Generated reports trong `reports/`, khong runtime source. | Cao | Thap neu da archive/regen duoc. | Archive theo ngay hoac regenerate trong CI; khong ship production source neu khong can. |
| `artifacts/prompt11-after/**` | Generated validation/restore/benchmark evidence, khong route/import runtime. | Cao | Thap, nhung la audit evidence. | Archive ngoai source deploy sau khi retention duoc chap thuan. |
| Old retired physical files neu xuat hien lai: `src/routes/mobileRoutes.js`, `public/mobile/js/delivery-mobile-view.source/part-01.jsfrag`, `part-02.jsfrag` | `scripts/cleanup-retired-files.js` va tests assert chung phai vang mat. | Cao | Thap, da duoc retired. | Neu unzip/deploy lam chung quay lai, xoa khoi artifact. |

## 4. PROBABLY_UNUSED candidates

| File/function | Bang chung khong dung | Muc tu tin | Rui ro | Khuyen nghi |
|---|---|---:|---|---|
| `src/services/appData.service.js` | `rg appData.service` khong co call site; chi file tu export `createAppDataService`. | Trung binh-cao | Trung binh: data migration/reset legacy. | Dua vao retired candidate, chay test va confirm khong external script require. |
| `src/services/dataSourceService.js` | Khong thay require; `systemController.dataSource` dung `systemService.getDataSourceStatus()` rieng. | Trung binh-cao | Trung binh-cao: doc snapshot nhieu collection. | Archive sau khi confirm khong duoc goi boi script/ops ngoai repo. |
| `services/importService.js` | Khong thay runtime require; chi `config/canonical-flows.json`/docs nhac `src/services/importService.js` co the stale. | Trung binh | Cao vi import Excel/DMS la production. | Sua docs/config truoc, sau do retired candidate; khong xoa ngay. |
| `src/controllers/mobileController.js` | Khong thay route modular hien tai mount controller nay; mobile routes dung `src/routes/mobile/*.routes.js`. | Trung binh | Cao: mobile/order/debt. | Candidate archive sau 30-90 ngay log xac nhan khong duoc mount/call va tests legacy duoc di chuyen. |
| `src/services/mobileService.js` | Chi controller legacy va tests/audit doc dung; route modular khong require `createMobileService`. | Trung binh | Cao: mobile/debt/order legacy guard. | Khong xoa phase nay; lap parity/runtime audit rieng. |
| `public/js/app/07-debt-cashbook.js` | File tu ghi "Compatibility manifest only... intentionally not loaded"; shell khong load file nay. | Cao | Thap-trung binh: external direct URL/cache. | Archive sau khi browser Network va access log 0. |
| `public/js/app/08-reports-users-promotions-import-excel.js` | Compatibility manifest, khong loaded boi `07-index-body.html`. | Cao | Thap-trung binh. | Archive sau runtime log 0. |
| `public/css/style.css` | Khong thay shell/login/mobile link; khac voi `public/style.css` dang duoc `login.html` load. | Trung binh | Thap-trung binh: CSS cu co the direct URL/cache. | Candidate archive sau visual smoke. |
| `public/css/00-base.css` | Compatibility manifest; shell load `css/base/00-base-01..06.css`; tests va budget van doc. | Trung binh | Trung binh do tests/source-size compat. | Chi archive sau khi update test/budget compat. |
| `public/css/10-operational-overrides.css` | Compatibility manifest; shell load `overrides/10-operational-01..04.css`; tests van doc. | Trung binh | Trung binh do tests/source-size compat. | Chi archive sau khi tests chuyen sang split files. |
| Root loose JS tests: `test_dms_invoice_typography_layout.js`, `test_print_promotion_fallback.js`, `test-delivery-6-metrics-static.js`, `test-return-draft-flow.js` | `scripts/run-tests.js` chi chay `test/*.test.js`; root files khong nam trong npm test suite. | Cao | Thap-trung binh: co the la manual regression scripts. | Chuyen vao `test/` voi ten `.test.js` neu con gia tri, hoac archive. |

## 5. LEGACY_KEEP candidates

| Candidate | Ly do giu |
|---|---|
| `src/routes/index.js` retired guards cho `/api/delivery-today`, `/api/mobile-legacy` | Can tra 410 va dem old client hits; xoa guard se mat observability va co the tao 404 kho debug. |
| `src/routes/masterReturnOrderRoutes.js` GET read-only | Write da retired, nhung GET/print/history compatibility con duoc tests va docs bao ve. |
| `public/js/app/debt/07d-master-return-orders.js` | UI section/menu da bo, nhung JS con print/read-only compatibility va tests dam bao khong call write retired. |
| `public/css/70-master-return-orders.css` | CSS inert cho legacy master-return; tests kiem tra selector va shell van load. |
| Generated bundle targets trong `config/source-bundles.json` | Runtime build governed by hash; khong xoa vi trung voi source fragments. |
| `.source/*.jsfrag`, `.source/*.css` cua bundle manifest | Canonical source de rebuild generated target. |
| `docs/reports/archive/**` | Historical evidence/rollback, khong runtime. Co the tach khoi release package nhung khong nen xoa kho tri thuc. |
| `CSP_XSS_SINK_INVENTORY.json` | `check:csp-xss` dung; khong phai rác du khong runtime. |
| `RELEASE_MANIFEST.json` | Release metadata/check; khong archive neu release process con dung. |

## 6. DANGEROUS_DO_NOT_DELETE candidates

| Candidate | Ly do cam xoa thang |
|---|---|
| `src/models/SalesOrder.js`, `MasterOrder.js`, `ReturnOrder.js`, `ArLedger.js`, `FundLedger.js`, `StockTransaction.js`, `InventoryLegacy.js`, `OrderPaymentAllocation.js`, `DeliveryCloseoutVersion.js` | SSoT/ledger/lifecycle nghiep vu. |
| `src/services/inventoryService.js`, `inventoryStock.service.js`, `domain/posting/InventoryPostingService.js` | Ton kho va reverse posting. |
| `src/services/arPosting.service.js`, `services/accounting/*`, `DebtReadService.js`, `DebtCollectionService.js` | Cong no/ke toan/read model. |
| `src/services/fundService.js`, `fundSummary.service.js` | Fund SSoT va quy tien. |
| `src/services/returnOrderLegacy.service.js`, `return-order/*` | Return lifecycle/stock-in/accounting gate. |
| `src/services/importExportLegacy.service.js`, `excelImportService.js`, `src/services/import/**` | Import DMS/Excel production. |
| `src/services/reportLegacy.service.js`, `reports/*`, `sseInvoiceExport.service.js` | Report/export production. |
| `public/mobile/**` va `src/routes/mobile/**` | Mobile sales/delivery/warehouse APIs. |
| Mongo indexes unique/TTL/SSoT collections | Khong drop neu chua co `$indexStats`, backup, replacement, duplicate audit. |
| `services/printDataBuilder*`, `services/printService.js`, print templates | Print/export hoa don/phieu; runtime referenced. |

## 7. NEED_RUNTIME_EVIDENCE candidates

| Candidate | Can bang chung gi |
|---|---|
| `/api/delivery-today/*` retired namespace | Access logs 30-90 ngay khong con client cu; retired route metrics = 0. |
| `/api/mobile-legacy/*` retired namespace | Old APK/client telemetry; access logs; co thong bao migration cho user. |
| `/api/mobile-sales/products` alias | Xac minh mobile cũ co con goi alias hay khong. |
| Master-return GET/print compatibility | Browser Network va audit user/print logs xac nhan khong con nhu cau. |
| `public/js/app/debt/07d-master-return-orders.js` va CSS lien quan | Browser Network, UI smoke, print logs. |
| `src/services/mobileService.js` legacy service | Route graph + require graph + production log; parity tests modular mobile. |
| Mongo retired/unmanaged indexes | `$indexStats` >=168h, profiler, backup, dry-run `mongo:index-audit`. |
| Root reports/artifacts | Retention policy va compliance/audit owner approve. |
| Tool routes `/api/tools/*` | Access logs/RBAC policy; khong phai rác neu user dang dung. |

## 8. API cleanup map

| API | Route file | Co frontend call? | Co service call? | Rui ro | Muc tu tin | Khuyen nghi |
|---|---|---|---|---|---:|---|
| `/api/delivery-today/*` | `src/routes/index.js` retired guard | Khong thay frontend runtime call; retired static gate 0 hits | Khong route service, guard 410 | External legacy client | Cao | LEGACY_KEEP den khi access log 0; sau do co the remove guard trong phase rieng. |
| `/api/mobile-legacy/*` | `src/routes/index.js` retired guard | Khong thay frontend runtime call | Khong mount legacy route file; `src/routes/mobileRoutes.js` absent | Old mobile app/APK | Cao | LEGACY_KEEP + monitor retired metrics. |
| `POST/PUT/PATCH /api/master-return-orders`, `POST /:id/receive`, `POST /:id/cancel` | `src/routes/masterReturnOrderRoutes.js` | Tests xac nhan khong co frontend write fetch | Controller write funcs ton tai nhung route bi retiredRoute chan | Return/stock duplicate path neu mo lai | Cao | Giu retired 410; cleanup code write funcs chi sau khi GET/print compatibility duoc tach. |
| `GET /api/master-return-orders*` | `src/routes/masterReturnOrderRoutes.js` | `07d-master-return-orders.js` co fetch GET/list/detail | Service read/list con goi | Read-only history/print | Cao | LEGACY_KEEP, khong delete khi chua co runtime evidence. |
| `/api/master-orders/delivery-today*` | `src/routes/masterOrderRoutes.js` retired guard | Khong thay frontend call; New UI dung `/api/new/delivery-today/*` | Guard 410 | External legacy web | Cao | LEGACY_KEEP + log 0 truoc khi remove. |
| `/api/tools/order-split/*` | `src/routes/tools/orderSplit.routes.js` | Co call tu `public/js/app/tools/order-split-tool.js` | Tool services in-memory/export | Thap business write; co upload | Cao | KHONG cleanup; chi review RBAC/access policy. |
| `/api/tools/dms-gap-simulator/*` | `src/routes/tools/dmsGapSimulator.routes.js` | Co call tu `dms-gap-simulator.js` | Tool service doc noi preview/export | Can log vi tool moi | Cao | KHONG cleanup; can runtime usage/RBAC evidence. |
| `/api/tools/display-check/*` | `src/routes/tools/displayCheck.routes.js` | Co call tu `display-check-manager.js` | Writes display-check planning collections | Medium vi co write planning | Cao | KHONG cleanup; monitor va role-gate neu can. |
| `/api/mobile-sales/products` | `src/routes/index.js` alias to productRoutes | Canonical config noi compatibility | Product service | Old mobile compatibility | Trung binh | NEED_RUNTIME_EVIDENCE truoc khi retire. |

## 9. UI cleanup map

| UI/Tab | Fragment | JS | API | Trang thai | Khuyen nghi |
|---|---|---|---|---|---|
| Master return aggregate UI | Section/menu da removed; comment trong `03-index-body.html` | `07d-master-return-orders.js`, `70-master-return-orders.css` van loaded | GET/print master-return; writes retired | LEGACY_KEEP/PROBABLY_UNUSED | Tach print/read-only neu con can; sau runtime log 0 moi archive JS/CSS. |
| Debt old compatibility manifest | Khong fragment/tab rieng | `public/js/app/07-debt-cashbook.js` | None direct | PROBABLY_UNUSED | Archive after access log/Network 0. |
| Admin/report/import old manifest | Khong loaded | `public/js/app/08-reports-users-promotions-import-excel.js` | None direct | PROBABLY_UNUSED | Archive after access log/Network 0. |
| `fundsTab` | `04-index-body.html`, `05-index-body.html` | `07f-fund-ledger*`, `07g-fund-summary.js` | `/api/funds`, fund summary | ACTIVE | Khong cleanup; dù tab-loader khong co case rieng, module tu bind/load. |
| `importDataTab` | `06-index-body.html` | `08d-import-excel*` | `/api/import`, `/api/excel` | ACTIVE | Khong cleanup; import production. |
| `adminCorrectionsTab` | `06-index-body.html` | `08g-data-corrections.js` | `/api/admin/*` | ACTIVE | Khong cleanup. |
| Tool tabs | `06-index-body`, `06b`, `06d` | `order-split`, `dms-gap`, `display-check` | `/api/tools/*` | ACTIVE | Khong cleanup; can RBAC/log audit. |
| `notificationCenterTab` | Dynamic inserted by JS | `notification-center.js` | `/api/notifications` | ACTIVE dynamic | Khong cleanup. |
| CSS compat manifests | None direct | `public/css/00-base.css`, `10-operational-overrides.css`, `public/css/style.css` | N/A | PROBABLY_UNUSED/compat | Archive only after tests and visual smoke updated. |

## 10. Service/model cleanup map

| File/function | Bang chung khong dung | Muc tu tin | Rui ro | Khuyen nghi |
|---|---|---:|---|---|
| `src/services/appData.service.js` | No refs ngoai chinh file. | Trung binh-cao | Trung binh | Retired candidate. |
| `src/services/dataSourceService.js` | No refs; system route dung `systemService`. | Trung binh-cao | Cao neu co ops script ngoai repo. | Candidate sau ops confirmation. |
| `services/importService.js` | No code refs; docs/config nhac stale. | Trung binh | Cao | Correct canonical flow docs, then candidate. |
| `src/controllers/mobileController.js` | No modular route mount; only legacy `mobileService`. | Trung binh | Cao | Candidate with mobile parity audit. |
| `src/services/mobileService.js` | Legacy tests only + old controller. | Trung binh | Cao | Do not delete; collect runtime evidence. |
| `src/services/masterReturnOrderService.js` write funcs | Routes write bi retired 410. | Trung binh | Cao | Split read-only/print vs write in later cleanup. |
| `src/models/Inventory.js` | Legacy `inventorySnapshots`; comments say not true stock. | Thap | Rat cao | DANGEROUS_DO_NOT_DELETE unless all tests/scripts/ops prove no use. |
| `src/models/MasterReturnOrder.js` | Operational UI retired, GET/print compatibility con. | Trung binh | Cao | LEGACY_KEEP until read/print decommission. |

## 11. Mongo index cleanup map

Audit nay khong ket noi Mongo va khong drop index. Ket luan dua tren managed registry va cleanup policy.

| Collection | Index | Key | Bang chung trung/rac | Rui ro | Khuyen nghi |
|---|---|---|---|---|---|
| `products` | retired names in `RETIRED_INDEX_NAMES.products` | various | Policy da liet ke old search/category/name indexes. | Medium | Chi drop qua dry-run + `$indexStats`. |
| `customers` | retired names in `RETIRED_INDEX_NAMES.customers` | various | Old name/route/search aliases. | Medium | NEED_RUNTIME_EVIDENCE. |
| `orders` | many retired names in policy | date/status/staff/search aliases | Co replacement managed indexes, nhung orders la SSoT. | High | Khong drop manual; run `mongo:index-audit`, observe >=168h. |
| `master_orders` | retired names in policy | delivery/date/staff aliases | Legacy performance indexes co the con external report dung. | High | Dry-run only; require profiler evidence. |
| `returnOrders` | retired names in policy | source/order/status aliases | Return SSoT protected. | High | Need `$indexStats`; khong drop unique/TTL. |
| `inventories` | inventory snapshot/legacy names | product/warehouse aliases | Current stock SSoT. | Critical | Chi drop after dry-run + stock query benchmark. |
| `journals` | payment/ar legacy names | payment/ar aliases | Legacy ledger/payment collection. | High | Need prod stats; do not drop blindly. |
| `inventorySnapshots`, `salesSnapshots`, `staffs` | all non-primary if empty retired collection | any | Policy `EMPTY_RETIRED_COLLECTIONS`. | Medium | Only if `documentCount=0` and dry-run says safe. |
| Any unmanaged non-unique index | any | any | Audit service marks `unused_candidate` only if ops=0 long enough. | Varies | `mongo:index-cleanup:unused` only after full business cycle. |

## 12. De xuat cleanup phase tiep theo

1. Phase A - artifact hygiene: exclude `node_modules`, archive `reports/`, archive `artifacts/`, move loose root PHASE reports into `docs/reports/archive/root-artifacts`.
2. Phase B - compatibility manifest cleanup: target `07-debt-cashbook.js`, `08-reports-users-promotions-import-excel.js`, `public/css/style.css`, CSS compat manifests; require browser Network 0 and visual smoke.
3. Phase C - legacy mobile service quarantine: prove `src/controllers/mobileController.js` and `src/services/mobileService.js` are unmounted; move tests to modular services; then retire.
4. Phase D - master-return read-only split: keep print/read API if needed, remove retired write code paths only after tests guarantee no second stock-in path.
5. Phase E - Mongo index cleanup: run `npm run mongo:index-audit` in production/staging with `$indexStats`, review dry-run, backup, then drop only policy-approved candidates.

## 13. Danh sach test bat buoc truoc/sau khi xoa

Truoc cleanup:

- `npm run check:source-bundles`
- `npm run check:source-size`
- `npm run check:syntax`
- `node scripts/audit-dead-code.js --json`
- `node scripts/verify-runtime-flows.js` only in planned phase because script writes reports
- Browser Network smoke for all main tabs and mobile pages
- Production/staging access log query for retired/compatibility URLs
- Mongo `npm run mongo:index-audit` dry-run before any index action

Sau cleanup:

- `npm test`
- `npm run quality` if network/audit availability permits
- `npm run docs:check`
- `npm run check:csp-xss`
- `npm run check:release-manifest`
- Mobile browser smoke: sales, delivery, warehouse
- Reconciliation smoke: stock, AR, fund, return AR
- Manual print/export smoke: sales order, master order, return order, SSE/VAT, Excel import/export

## Final note

Khong co ung vien business runtime nao duoc xep SAFE_DELETE. Neu cleanup production, nen bat dau bang artifact/report/source package hygiene truoc; sau do moi dung runtime evidence de cat legacy API/UI.
