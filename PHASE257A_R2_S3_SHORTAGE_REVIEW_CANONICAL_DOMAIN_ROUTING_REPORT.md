# Phase257A-R2 - S3 Import Shortage Review Canonical Domain Routing

## Executive summary

Phase257A-R2 fixes the frontend routing regression where raw import type `salesOrdersS3` skipped the sales-order shortage-review workflow. The fix keeps raw request type `salesOrdersS3` for template/parser/API input, while normalizing the frontend business domain to `salesOrders` for review gates, commit guards, recovery, and post-import refresh.

Backend shortage calculation, ImportShortageReviewService, inventory writers, AR/Fund writers, parser S3, and MongoDB schema were intentionally not changed.

## Reproduction before fix

Read-only reproduction with raw S3 type and one selected shortage row produced:

```json
{
  "rawType": "salesOrdersS3",
  "shortageRows": 1,
  "bannerDisplay": "none",
  "reviewApiCalled": false,
  "modalExists": false,
  "modalVisible": false
}
```

## Root cause

The UI has two raw input types:

- `salesOrders`
- `salesOrdersS3`

Backend preview/commit already canonicalizes `salesOrdersS3` to `salesOrders`, so shortage calculation and ImportSession domain were correct. Frontend review gates still compared `importDataType.value` directly with `salesOrders`, causing S3 preview rows with shortages to bypass:

- banner render
- review API GET
- auto-open modal
- pre-commit review gate
- review-error recovery
- sales-order post-import refresh

## Call graph

Before:

```text
Click "Xem trước"
-> handleImportExcelAction()
-> previewImportExcel()
-> renderImportPreview()
-> renderImportShortageActions()
-> raw type check salesOrders only
-> S3 exits, no review
```

After:

```text
Click "Xem trước"
-> handleImportExcelAction()
-> previewImportExcel()
-> renderImportPreview()
-> renderImportShortageActions()
-> isSalesOrderImportType()
-> salesOrdersS3 canonicalizes to salesOrders
-> GET /api/import/sessions/:sessionId/shortage-review
-> modal show
```

## Strict gates changed

- `part-01.jsfrag`: added the single canonical frontend helper:
  - `normalizeImportBusinessType()`
  - `isSalesOrderImportType()`
  - exact recoverable review-code helper
- `part-02.jsfrag`: banner gate now uses `isSalesOrderImportType()`.
- `part-02b.jsfrag`: review modal gate now uses `isSalesOrderImportType()`.
- `part-03.jsfrag`: pre-commit guard, review-error recovery, and post-import report reload now use canonical business domain.

## Post-import refresh

`refreshAfterImport(type)` computes `businessType = normalizeImportBusinessType(type)` and uses that for sales-order reload decisions. S3 successful commit now reloads sales orders and stock, and the commit success path reloads shortage reports for both `salesOrders` and `salesOrdersS3`.

Raw commit payload remains:

```js
type: importDataType.value
```

## Error recovery

Frontend now checks exact recoverable codes:

- `IMPORT_SHORTAGE_REVIEW_REQUIRED`
- `IMPORT_SHORTAGE_REVIEW_INCOMPLETE`
- `IMPORT_SHORTAGE_REVIEW_STALE`
- `IMPORT_SHORTAGE_REVIEW_INVALID_MODE`

For S3, these codes reopen the shortage-review modal instead of leaving the user at a dead error message.

## Source-size budget

No source-size budget was increased. `part-02b.jsfrag` initially exceeded the budget after the first patch, so the patch was tightened and non-runtime comments in that same fragment were removed. Final result:

- `npm run check:source-size`: pass
- `node scripts/build-source-bundles.js --check --target=public/js/app/admin/08d-import-excel.js`: pass
- `npm run check:source-bundles`: global fail after restoring unrelated `src/services/inventoryService.js` to avoid changing Inventory writer. Failure: `src/services/inventoryService.js: generated file is stale`.

## Cache-busting

Import asset marker changed from:

```text
phase257a-import-shortage-review-v1
```

to:

```text
phase257a-r2-s3-shortage-review-routing-v1
```

Updated assets:

- `/js/app/admin/08d-import-excel.js`
- `/js/app/admin/08d-import-excel.part04.js`
- `/js/app/admin/08d-import-excel.part02.js`
- `/js/app/admin/08d-import-excel.part05.js`
- `/js/app/admin/08d-import-excel.part03.js`
- `/css/40-import-sales.css`

## Runtime evidence

Evidence file:

- `PHASE257A_R2_S3_SHORTAGE_REVIEW_RUNTIME_EVIDENCE.json`

Key result:

```json
{
  "rawImportType": "salesOrdersS3",
  "canonicalBusinessType": "salesOrders",
  "previewButtonClicked": true,
  "previewApiCalled": true,
  "previewRequestType": "salesOrdersS3",
  "previewReturnedShortage": true,
  "reviewBannerVisible": true,
  "reviewApiCalled": true,
  "modalVisible": true,
  "shortageRowsRendered": 1,
  "commitCalledBeforeReview": false,
  "consoleErrors": []
}
```

Browser verification was attempted with the Browser tool at 1600 x 900. The tool blocked both `data:` and `file://` local harness URLs by URL policy. No raw CDP or alternate browser workaround was used. Node runtime harness verification passed using generated import bundles and the real preview click path.

## Test commands and real results

Pass:

- `npm run check:syntax`
- `node --test test/phase257a-r2-s3-shortage-review-routing.test.js`
- `node --test test/phase257a-import-shortage-review-popup-static.test.js test/phase257a-import-shortage-review-behavior.test.js test/phase257a-import-shortage-mode-quantity.test.js test/phase257a-import-shortage-mode-order.test.js test/phase257a-import-shortage-review-stale.test.js test/phase257a-r1-import-shortage-popup-runtime.test.js test/phase257a-r2-s3-shortage-review-routing.test.js`
- `npm run source-bundles:refresh`
- `npm run build:source-bundles`
- `npm run check:source-size`
- `node scripts/build-source-bundles.js --check --target=public/js/app/admin/08d-import-excel.js`
- `npm run docs:check`
- `npm run test:release-governance`
- `$env:RELEASE_PHASE='Phase257A-R2'; npm run release:manifest`
- `$env:RELEASE_PHASE='Phase257A-R2'; npm run check:release-manifest`
- `node scripts/verify-source-artifact-clean.js --zip MK-pro-phase257a-r2-s3-shortage-review-canonical-domain-routing-fixed.zip`

Expected environmental/artifact failure:

- `npm run test:artifact-clean` failed because root contains release ZIP artifacts and the policy rejects nested archives. The failure predates R2 for prior ZIPs such as `MK-pro-phase257a-r1-import-shortage-review-popup-runtime-fixed.zip`; after creating the requested R2 ZIP, the output ZIP is also reported by the root-directory check. A failed local server attempt also left `phase257a-r2-server.err.log` and `phase257a-r2-server.out.log`; sandbox policy rejected cleanup. The R2 ZIP itself was verified separately and passed: `node scripts/verify-source-artifact-clean.js --zip MK-pro-phase257a-r2-s3-shortage-review-canonical-domain-routing-fixed.zip`.
- `npm run check:source-bundles` fails globally only if unrelated Inventory generated output is kept unchanged. The import Excel bundle targeted check passes; Inventory writer was intentionally not changed.

Initial command behavior:

- Plain `npm run release:manifest` failed because the script requires `RELEASE_PHASE`; rerun with `RELEASE_PHASE=Phase257A-R2` passed.

## Files changed

- `public/js/app/admin/08d-import-excel.source/part-01.jsfrag`
- `public/js/app/admin/08d-import-excel.source/part-02.jsfrag`
- `public/js/app/admin/08d-import-excel.source/part-02b.jsfrag`
- `public/js/app/admin/08d-import-excel.source/part-03.jsfrag`
- `public/js/app/admin/08d-import-excel.js`
- `public/js/app/admin/08d-import-excel.part02.js`
- `public/js/app/admin/08d-import-excel.part03.js`
- `public/js/app/admin/08d-import-excel.part05.js`
- `config/source-bundles.json`
- `public/index.shell.html`
- `public/fragments/index/07-index-body.html`
- `test/helpers/importShortageRuntimeHarness.js`
- `test/phase257a-r2-s3-shortage-review-routing.test.js`
- `RELEASE_MANIFEST.json`
- `PHASE257A_R2_S3_SHORTAGE_REVIEW_RUNTIME_EVIDENCE.json`
- `PHASE257A_R2_S3_SHORTAGE_REVIEW_CANONICAL_DOMAIN_ROUTING_REPORT.md`

## Intentionally not changed

- ImportShortageReviewService
- backend shortage algorithm
- Inventory writer
- AR writer
- Fund writer
- returnOrders
- master orders
- delivery closeout
- Report Center
- SSE export
- S3 parser/template
- MongoDB schema
- `package.json`

## Production verification

Production verification should confirm:

1. Hard reload imports the R2 cache marker.
2. Import data -> S3 shortened order type -> choose shortage Excel -> click preview.
3. Banner "Mở review" appears.
4. Review modal auto-opens with one or more shortage rows.
5. The modal has exactly three business buttons.
6. Commit is not called before review confirmation.
7. Confirming either shortage mode commits with raw type `salesOrdersS3`.

## Rollback procedure

1. Revert the R2 commit or restore the R1 source bundle and marker.
2. Run `npm run source-bundles:refresh`.
3. Run `npm run build:source-bundles`.
4. Run `npm run check:source-bundles`.
5. Hard reload clients to clear the R2 marker.
