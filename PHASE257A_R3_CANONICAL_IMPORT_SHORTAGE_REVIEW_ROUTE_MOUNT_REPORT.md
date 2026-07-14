# Phase257A-R3 - Canonical Import Shortage Review Route Mount

## Executive summary

Phase257A-R3 mounts the import shortage-review GET/PUT endpoints on the canonical production `/api/import` router. The frontend R2 URL remains unchanged:

```text
/api/import/sessions/:sessionId/shortage-review
```

The fix is intentionally scoped to route ownership and tests. It does not change the S3 frontend alias normalization, ImportShortageReviewService, shortage calculation, Inventory/AR/Fund writers, parser S3, or import transaction behavior.

## Runtime 404

Before R3, the frontend correctly called:

```text
GET /api/import/sessions/:sessionId/shortage-review
PUT /api/import/sessions/:sessionId/shortage-review
```

But the canonical runtime router mounted at `/api/import` did not define those routes, so requests fell through to the global API fallback and returned:

```json
{ "message": "API không tồn tại" }
```

## Canonical route graph

Runtime ownership:

```text
src/routes/index.js
-> const { importRouter, exportRouter } = require('./importExportRoutes')
-> app.use('/api/import', importRouter)
```

Canonical router:

```text
src/routes/importExportRoutes.js
```

Route ownership status:

- `src/routes/importExportRoutes.js`: canonical mounted router.
- `src/routes/excelImportRoutes.js`: unmounted legacy/compatibility source; not runtime evidence.
- `src/routes/importRuntimeRoutes.js`: unmounted legacy/compatibility source; not runtime evidence.

## False-positive test

The previous static test read `excelImportRoutes.js` and `importRuntimeRoutes.js`, saw `shortage-review` route declarations, and treated that as proof of runtime availability. That was false confidence because neither router is mounted by `src/routes/index.js`.

R3 updates the test to verify:

- `src/routes/index.js` mounts `importRouter` at `/api/import`.
- `src/routes/importExportRoutes.js` owns GET `shortage-review`.
- `src/routes/importExportRoutes.js` owns PUT `shortage-review`.
- Review routes are declared before generic `/sessions/:sessionId`.

## Route before and after

Before:

```text
GET  /sessions/:sessionId/rows
GET  /sessions/:sessionId
POST /sessions/:sessionId/commit
```

After:

```text
GET  /sessions/:sessionId/rows
GET  /sessions/:sessionId/shortage-review
PUT  /sessions/:sessionId/shortage-review
GET  /sessions/:sessionId
POST /sessions/:sessionId/commit
```

The new routes inherit `importRouter.use(manageImports)` and do not add duplicate auth middleware.

## Controller choice

R3 uses `excelImportController.shortageReview` and `excelImportController.confirmShortageReview`.

Reason:

- `importExportRoutes.js` already imports `excelImportController`.
- The same controller already owns shortage reports in the canonical `/api/import` namespace.
- The controller already delegates to `ImportShortageReviewService`.
- This is the smallest route-graph change without introducing a duplicate router.

## Runtime evidence

Evidence file:

```text
PHASE257A_R3_IMPORT_SHORTAGE_REVIEW_ROUTE_EVIDENCE.json
```

Key evidence:

```json
{
  "canonicalRoute": {
    "mountPrefix": "/api/import",
    "routerModule": "src/routes/importExportRoutes.js",
    "getShortageReviewMounted": true,
    "putShortageReviewMounted": true
  },
  "deadRouteDefinitions": {
    "excelImportRoutesMounted": false,
    "importRuntimeRoutesMounted": false
  },
  "getRequest": {
    "globalApi404": false,
    "controllerReached": true
  },
  "putRequest": {
    "globalApi404": false,
    "controllerReached": true
  },
  "workflow": {
    "previewReturnedShortage": true,
    "reviewGetSucceeded": true,
    "modalVisible": true,
    "reviewPutSucceeded": true,
    "commitCalledAfterReview": true
  }
}
```

## End-to-end preview to commit evidence

The R3 workflow test uses the existing frontend runtime harness and an Express app mounted with the real canonical `importRouter`.

Flow verified:

```text
salesOrdersS3 preview
-> shortage detected
-> frontend GET shortage-review
-> GET reaches canonical importRouter/controller
-> modal shows
-> user confirms exclude_shortage_quantity
-> frontend PUT shortage-review
-> PUT reaches canonical importRouter/controller
-> frontend commit is called after review confirmation
```

The review GET/PUT are not mocked as frontend-only success responses; they are served through the mounted Express route graph.

## Files changed

- `src/routes/importExportRoutes.js`
- `test/phase257a-import-shortage-review-popup-static.test.js`
- `test/phase257a-r3-import-shortage-review-route-mount.test.js`
- `PHASE257A_R3_IMPORT_SHORTAGE_REVIEW_ROUTE_EVIDENCE.json`
- `PHASE257A_R3_CANONICAL_IMPORT_SHORTAGE_REVIEW_ROUTE_MOUNT_REPORT.md`
- `RELEASE_MANIFEST.json`

No frontend source bundle was changed or rebuilt for R3.

## Test commands and real results

Pass:

- `npm run check:syntax`
- `node --test test/phase257a-import-shortage-review-popup-static.test.js test/phase257a-r1-import-shortage-popup-runtime.test.js test/phase257a-r2-s3-shortage-review-routing.test.js test/phase257a-r3-import-shortage-review-route-mount.test.js`
- `node --test test/phase257a-import-shortage-review-behavior.test.js test/phase257a-import-shortage-mode-quantity.test.js test/phase257a-import-shortage-mode-order.test.js test/phase257a-import-shortage-review-stale.test.js`
- `npm run docs:check`
- `npm run test:release-governance`
- `$env:RELEASE_PHASE='Phase257A-R3'; npm run release:manifest`
- `$env:RELEASE_PHASE='Phase257A-R3'; npm run check:release-manifest`

ZIP verification after artifact creation:

- `node scripts/verify-source-artifact-clean.js --zip MK-pro-phase257a-r3-canonical-import-shortage-review-route-mounted-fixed.zip`: pass

## Intentionally not changed

- Frontend S3 alias normalization from R2
- Frontend shortage-review URL
- ImportShortageReviewService
- Shortage calculation
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

1. Hard reload app.
2. Import data -> select "Đơn S3 rút gọn".
3. Select Excel with shortage rows.
4. Click preview.
5. Confirm banner appears.
6. Auto-open or click "Mở review".
7. Confirm GET `/api/import/sessions/:sessionId/shortage-review` returns controller response, not global "API không tồn tại".
8. Confirm one of the two import modes.
9. Confirm PUT `/api/import/sessions/:sessionId/shortage-review` returns success.
10. Confirm commit starts only after review confirmation.

## Rollback procedure

1. Remove the two R3 routes from `src/routes/importExportRoutes.js`.
2. Revert R3 tests/report/evidence.
3. Regenerate release manifest for the rollback phase.
4. Hard reload clients if route behavior is cached by a running process.
