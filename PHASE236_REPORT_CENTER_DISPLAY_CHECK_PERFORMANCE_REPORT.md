# PHASE236 Report Center & Display Check Performance Report

## A. Executive summary

Phase236 optimized two read-only hot paths without changing SSoT, formulas, writers, schemas, migrations, indexes, package.json, or data:

- Report Center pilot: `info-products` now uses a bounded Mongo read path for normal UI pagination while keeping export/full behavior on the existing path.
- Display Check preview: active display group product resolution now shares request-scoped source data instead of reloading product/promotion sources per group.

All required validation commands passed.

## B. Baseline

| Endpoint/report | Query count | Duration | Rows read | Payload |
|---|---:|---:|---:|---:|
| `GET /api/reports/catalog` | 0 business queries | semantic fixture | 0 | static catalog |
| Report Center `info-products`, 100 products | 1 Product find | semantic fixture | 100 | ~24.31 KB response page |
| Report Center `info-products`, 1,000 products | 1 Product find | semantic fixture | 1,000 | ~24.32 KB response page |
| Report Center `info-products`, 10,000 products | 1 Product find | semantic fixture | 10,000 | ~24.32 KB response page |
| Display Check preview, 10 active groups | 12 Product finds | semantic fixture | 2,400 product rows | preview JSON |
| Display Check preview, 50 active groups | 52 Product finds | semantic fixture | 10,400 product rows | preview JSON |

Live Mongo explain was not run against production data in this phase. Evidence is from code trace plus deterministic Node test fixtures.

## C. Root cause

- Report Center `info-products` called `InformationReportService.productInformationReport()`, which loaded up to `MAX_ROWS = 10000` products, mapped everything in memory, then `ReportCenterService.reportResult()` sliced the requested page.
- Display Check `generatePreview()` loaded selected groups with a catalog read, then resolved every active display group one by one. `product_group` groups re-ran `Product.find(...)`; promotion groups re-ran `PromotionGroupItem.find(...)` and `Promotion.find(...)`.

## D. Report catalog

Traced route chain:

`src/routes/reportRoutes.js` -> `src/controllers/reportController.js` -> `src/services/reportService/ReportServiceFacade.js` -> `src/services/reports/ReportCenterService.js`.

Active Report Center definitions include sales, inventory, debt, reward, delivery, finance, return, information and data-quality reports. Phase236 only changed `info-products` normal UI read path.

## E. SSoT

| Area | SSoT | Phase236 status |
|---|---|---|
| Product information report | `products` | Preserved |
| Display Check preview catalog | `products`, DMS gap read service, display-check setup collections | Preserved |
| AR/debt | `arLedgers` | Not changed |
| Inventory | `inventories`, `stockTransactions` | Not changed |
| Fund | `fundLedgers` | Not changed |
| Returns | `returnOrders` | Not changed |

## F. Query inventory

| Flow | Before | After |
|---|---:|---:|
| Report Center `info-products` catalog | 0 business queries | 0 business queries |
| Report Center `info-products` page 2 limit 50, 10k products | 1 Product find reading 10,000 rows | 1 Product find reading 50 rows + 2 count queries |
| Display Check preview, 10 active groups | 12 Product finds, product rows grow with group count | 2 Product finds, fixed by request |
| Display Check preview, 50 active groups | 52 Product finds, product rows grow with group count | 2 Product finds, fixed by request |
| Display Check promotion sources | could re-read per promotion group | 1 `PromotionGroupItem` find + 1 `Promotion` find per preview |

## G. Architecture decomposition

Added a small pagination helper in `src/services/reports/report-center/ReportPagination.js`:

- `parsePagination(query, options)`
- `buildPageMeta(totalRows, pagination)`

`InformationReportService.productInformationReportPage()` owns the bounded product read for UI pagination. `ReportCenterService.reportResult()` now accepts pre-paged metadata so already-bounded rows are not sliced a second time.

## H. Display Check pipeline

`generatePreview()` now loads a request-scoped source context once:

- active product catalog projection
- active promotion group items projection
- active promotions projection

That context is passed to:

- `loadSelectedGroups(...)`
- `resolveDisplayGroupProducts(...)`
- active display group resolution for half-baked display checks

No confirm/save writer path was changed.

## I. Index audit

| Collection | Index | Key | Evidence | Risk | Recommendation |
|---|---|---|---|---|---|
| `products` | `idx_products_active_code` | `{ isActive: 1, code: 1 }` | Managed in `mongoIndexService`; supports active product sorted reads | Low | Keep |
| `products` | `idx_products_active_product_code` | `{ isActive: 1, productCode: 1 }` | Managed; supports DMS product lookup variants | Low | Keep |
| `products` | `idx_products_active_sku` | `{ isActive: 1, sku: 1 }` | Managed; supports DMS product lookup variants | Low | Keep |
| `promotionGroupItems` | `idx_promotion_group_items_program_active` | `{ programCode: 1, isActive: 1 }` | Managed; Phase236 reads active rows once | Low | Keep |
| `promotions` | `idx_promotions_active_dates` | `{ isActive: 1, startDate: 1, endDate: 1 }` | Managed; Phase236 reads active rows once and filters date in service | Low | Keep |
| `displayCheckGroups` | none found in managed registry | N/A | Existing code reads active/all groups | Need runtime evidence | Do not add/drop in Phase236 |

No index was added, removed, or dropped.

## J. Performance result

| Flow | Before | After | Result |
|---|---:|---:|---|
| Report Center `info-products`, 10k products, page 2 limit 50 | Product rows returned to service: 10,000 | Product rows returned to service: 50 | Bounded page read |
| Report Center `info-products` active count | In-memory over loaded report rows | Count over matching product filter | Summary meaning preserved |
| Display Check preview, 10 groups | Product finds: 12 | Product finds: 2 | Fixed request reads |
| Display Check preview, 50 groups | Product finds: 52 | Product finds: 2 | N+1 removed |
| Display Check promotion reads | Can grow by promotion group count | 1 item read + 1 promotion read | Fixed request reads |

## K. Golden response

Regression tests assert:

- Report Center catalog still returns `info-products` without querying products.
- `info-products` result keeps `rows`, `items`, `meta`, `summary`, `sourceContract`, and `sourceNote`.
- `info-products` page 2 limit 50 returns exactly 50 rows, `meta.page = 2`, `meta.limit = 50`, `meta.total = 10000`.
- Display Check preview remains `ok: true` in fixtures for 10 and 50 active groups.

## L. Test evidence

| Command | Result |
|---|---|
| `node --test test/phase236-report-center-display-check-performance.test.js` | PASS, 3/3 |
| `node --test test/phase236-report-center-display-check-performance.test.js test/information-reports-phase32-static.test.js test/report-center-v2-unit.test.js test/report-source-note-contract.test.js test/report-source-registry-coverage.test.js` | PASS, 13/13 |
| `npm run check:syntax` | PASS, `SYNTAX_OK 1410 JavaScript files` |
| `npm run check:source-size` | PASS |
| `npm run check:source-bundles` | PASS, 19 bundles |
| `npm test` | PASS; full repository test runner completed, one optional golden fixture skipped |
| `git diff --check` | PASS; only line-ending warnings from existing workspace settings |

## M. File changes

| File | Change |
|---|---|
| `src/services/reports/report-center/ReportPagination.js` | New bounded pagination helper |
| `src/services/reports/InformationReportService.js` | Added `productInformationReportPage()` with projection, skip/limit, total and active counts |
| `src/services/reports/ReportCenterService.js` | Added pre-paged result support; routed non-export `info-products` to bounded read path |
| `src/services/tools/displayCheck/displayCheck.service.js` | Added request-scoped preview source context and passed it to group resolution |
| `test/phase236-report-center-display-check-performance.test.js` | Added Report Center and Display Check performance regression fixtures |
| `PHASE236_REPORT_CENTER_DISPLAY_CHECK_PERFORMANCE_REPORT.md` | This report |

## N. Files explicitly not changed

- `package.json`
- Mongo schemas/models
- Mongo migrations
- Mongo index scripts/registry
- AR/debt/fund/inventory/return writers
- Display Check `confirmPlan()` writer
- Report formulas for debt, inventory, fund, returns, delivery, sales
- Source bundle/generated frontend files

Existing uncommitted Phase235 files were left untouched by Phase236.

## O. Runtime smoke checklist

Before production rollout:

- Open Report Center catalog and verify Information reports appear for management/admin roles.
- Run `info-products` page 1, page 2, search by code/name, active and inactive filters.
- Export `info-products` and verify export still uses the full report path.
- Open Display Check manager, generate preview for a customer with selected product group.
- Generate preview with promotion group/program display groups.
- Confirm a generated Display Check plan in staging and verify only display-check collections are written.

## P. Known limitations

- `info-customers` and `info-staffs` remain on existing full-read paths. They were intentionally not optimized until the `info-products` pilot passes.
- Display Check still reads the full active product catalog once per preview. This removes N+1 but is not yet cursor/page streaming.
- No live production Mongo explain or access-log evidence was collected in this phase.

## Q. Rollback plan

Rollback is code-only:

1. Revert `src/services/reports/report-center/ReportPagination.js`.
2. Revert the `productInformationReportPage()` addition and export.
3. Revert the `info-products` branch in `ReportCenterService.run()` and pre-paged result support.
4. Revert `loadPreviewSourceContext()` and source-context arguments in Display Check preview.
5. Re-run required validation commands.

No data rollback, index rollback, or migration rollback is needed.

## R. Next phase recommendation

Recommended next phase:

- Extend Report Center bounded reads to `info-customers` and `info-staffs`.
- Add live staging explain plans for `products`, `customers`, `staffs`, `displayCheckGroups`, `promotionGroupItems`, and `promotions`.
- Consider a managed index audit for `displayCheckGroups` only after runtime evidence shows active group scans are material.
- Defer debt/fund/inventory report decomposition until separate accounting-safe golden fixtures are prepared.

