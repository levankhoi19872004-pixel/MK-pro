# Phase 20 — Central Print Domain

## Objective

Standardize single and aggregate printing through one backend domain. Remove business calculations from browser print functions and guarantee that single/batch output uses the same source rules.

## New domain

```text
src/domain/print/
  PrintContract.js
  PrintLineNormalizer.js
  PrintMergeService.js
  LegacyPromotionFallbackService.js
  PrintReadService.js
  builders/
    SalesInvoiceBuilder.js
    MasterPickingBuilder.js
    ImportPickingBuilder.js
    ReturnPickingBuilder.js
```

## Profiles

- `SALES_INVOICE`: single or batch sales invoices.
- `WAREHOUSE_PICKING`: master picking, aggregate imports, master returns.
- `PAYMENT_RECEIPT`: existing receipt profile remains compatible.

## Data correctness changes

- Historical line snapshots win over current product catalog.
- New Web, mobile, legacy mobile, and DMS-import sales lines capture price, pack, warehouse, product, and promotion snapshots.
- Merge key includes warehouse, line type, product code, and unit price.
- Sale, promotion, import, and return lines remain separate.
- Legacy promotion fallback is batch-loaded and does not overwrite snapshots.
- NVBH/NVGH output uses canonical staff fields.

## Backend endpoints

```text
POST /api/print/orders/batch
POST /api/print/master-orders/batch
POST /api/print/import-orders/aggregate
POST /api/print/master-return-orders/batch
GET  /api/print/orders/:id
GET  /api/print/master-orders/:id
GET  /api/print/import-orders/:id
GET  /api/print/master-return-orders/:id
```

The old `/api/master-orders/print-aggregate` endpoint remains as a compatibility alias but delegates to the new Print Domain.

## Frontend boundary

The following browser-side calculations were removed:

- aggregate import warehouse/product/amount calculation;
- sequential sales-order fetch and HTML body extraction;
- legacy master-order aggregate route;
- master-return quantity, price, pack, warehouse, KPI, and page calculation.

Frontend now sends IDs and opens backend-rendered HTML.

## Layout standard

Added `public/print-tokens.css`:

- A4 portrait, 8 mm page margin;
- Arial 9 pt;
- title 15 pt;
- 1.15 line height;
- 1.2 mm / 1 mm cell padding;
- 3 mm section gap;
- 18 mm signature area;
- fixed column contracts totaling 100%.

## Important batch-render fix

The previous HTML body extraction regex could stop at a literal `</body>` contained inside the export JavaScript string and remove all actual print pages. `stripStandaloneHtml()` now extracts from the real opening body tag to the last closing body tag. Regression rendering tests cover both sales and warehouse batches.

## Verification

- Syntax checks: PASS.
- Print-focused tests: 21/21 PASS.
- Static regression suite: 175/175 PASS.
- OpenAPI generate/check: PASS.
- Builder benchmark: 2,000 source lines normalized/merged in about 39 ms in the sandbox.
- Full `npm test`: integration tests requiring `mongoose` cannot run because the ZIP has no `node_modules`; static and pure-domain tests pass.
