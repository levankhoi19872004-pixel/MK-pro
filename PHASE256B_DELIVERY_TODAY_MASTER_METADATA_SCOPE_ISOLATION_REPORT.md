# Phase256B - Delivery Today Master Metadata Scope Isolation

## Executive summary

Phase256B fixes a read-model isolation bug in Delivery Today New where one matched master order could be mapped to every order in the same in-memory result set. The fix keeps `orders` as the primary source, keeps `master_orders` metadata-only, and only applies master metadata after a per-order verified identity binding.

The production symptom for `B0039130` is now blocked by contract: an unmerged order with empty `masterOrderId`, empty `masterOrderCode`, and no canonical child reference cannot receive synthetic `MO1/ghtp` metadata and cannot pass the `delivery=ghtp` filter.

## Root cause

File: `src/services/delivery/deliveryTodayCanonicalOrderReader.js`

Function: `loadMasterOrderMetadata()`

Previous behavior: after one `master_orders` row matched any direct master key in the batch, the code iterated through all `orders` and assigned the same master to every order key. Because the Delivery Today date query intentionally reads broadly before applying metadata-aware delivery filtering, unrelated orders in the same date result could receive synthetic master/delivery fields.

For the fixture:

- `SO-MERGED / B-MERGED` belongs to `MO1 / DT1 / ghtp`.
- `SO1783644686092554 / B0039130` is `unmerged` and has no master or delivery staff.
- The old global-map logic mapped `MO1` to `B0039130`.
- `deliveryMatches()` then saw synthetic `ghtp` and returned `B0039130` under NVGH `ghtp`.

The date `2026-07-08` is valid and is not the cause.

## Call graph before

UI Don giao hom nay
-> `GET /api/new/delivery-today/orders`
-> `newOperationsRoutes`
-> `DeliveryTodayNewService.listOrders`
-> `deliveryTodayCanonicalOrderReader.listSalesOrders`
-> broad `orders` query by date
-> `loadMasterOrderMetadata`
-> global metadata map
-> `enrichOrderWithMasterMetadata`
-> substring/name-capable `deliveryMatches`
-> API response
-> frontend render

Closeout before:

UI selected rows
-> `POST /api/new/delivery-today/closeout`
-> `AccountingCloseoutService`
-> `CloseoutContextLoader`
-> selected orders
-> returnOrders loader
-> writer idempotency preload
-> allocation / AR / Fund / order patch

## Call graph after

UI Don giao hom nay
-> same route/service
-> broad `orders` query by date remains unchanged
-> `loadMasterOrderMetadata`
-> `buildMasterBindingIndexes`
-> `resolveMasterBindingForOrder` per order
-> enrich only verified binding
-> code-only exact `deliveryMatches`
-> API response with assignment diagnostics

Closeout after:

UI selected rows
-> `POST /api/new/delivery-today/closeout`
-> `AccountingCloseoutService`
-> `CloseoutContextLoader`
-> selected orders
-> `assertCloseoutDeliveryScope`
-> returnOrders loader only after scope passes
-> writer idempotency preload only after scope passes
-> allocation / AR / Fund / order patch

## Identity binding contract

Master metadata can bind to an order only by:

- Direct order link: `order.masterOrderId/masterOrderCode/masterId/masterCode` exactly matches `master.id/code/masterOrderCode/_id`.
- Canonical child reference: an order identity appears exactly in `master.childOrderIds/childOrderCodes/orderCodes/salesOrderCodes`.

No fallback by date, NVBH, customer, total amount, row position, regex, or substring is used.

Conflict policy:

- Multiple active masters for one order: fail closed, no enrichment, diagnostic `MASTER_ORDER_METADATA_BINDING_AMBIGUOUS`.
- Direct link to master A but child reference in master B: fail closed, no enrichment, diagnostic `MASTER_ORDER_METADATA_IDENTITY_CONFLICT`.
- Inactive master statuses `cancelled`, `canceled`, `void`, `voided`, `deleted`, `removed`, `duplicate_cancelled`: no enrichment.

## Closeout write guard

`CloseoutContextLoader.assertCloseoutDeliveryScope()` now runs before:

- `findReturnOrdersForDeliveryChildren`
- `preloadWriterIdempotency`
- allocation creation
- AR writer
- Fund writer
- order closeout patch

If requested `deliveryStaffCode` does not match canonical order delivery staff, or a verified active master binding for that exact order, the loader returns 409 through `AccountingCloseoutService` with code `DELIVERY_CLOSEOUT_ORDER_SCOPE_MISMATCH`.

## Files changed

- `src/services/delivery/deliveryTodayCanonicalOrderReader.js`
- `src/services/v2/deliveryTodayNew.service.js`
- `src/services/accounting/closeout/CloseoutContextLoader.js`
- `src/services/accounting/AccountingCloseoutService.js`
- `scripts/audit-delivery-today-master-metadata-binding.js`
- `test/phase256b-delivery-master-metadata-scope-isolation.test.js`
- `PHASE256B_MASTER_METADATA_BINDING_REPRO.json`

## Files intentionally not changed

- `src/services/master-order/masterOrderCommand.impl.js`
- AR ledger writers
- Fund ledger writers
- Inventory writers
- Return order state machine
- delivery closeout calculation
- frontend selection governance
- Report Center, SSE export, scheduler, enterprise routes
- Production document `B0039130`

## Evidence

File: `PHASE256B_MASTER_METADATA_BINDING_REPRO.json`

Before fixture result:

- returned order codes: `B-MERGED`, `B0039130`
- `B0039130` synthetic master: `MO1 / DT1`
- `B0039130` synthetic delivery staff: `ghtp`
- metadata applied count: `2`

After fixture result:

- returned order codes: `B-MERGED`
- `B0039130` returned for `ghtp`: `false`
- `B0039130` metadata applied: `false`
- valid merged order returned: `true`
- orders query count: `1`
- master metadata query count: `1`

## Query count

The reader remains bounded:

- `orders` query: `1`
- `master_orders` metadata query: `0 or 1`
- no per-order master query

Closeout guard also uses the same batch resolver and does not introduce N+1.

## Test results

Passed:

- `npm run check:syntax` -> `SYNTAX_OK 1488 JavaScript files`
- `node --test test/phase256b-delivery-master-metadata-scope-isolation.test.js` -> 12/12 passed
- `npm run docs:check` -> OpenAPI up to date
- `npm run release:manifest -- --phase Phase256B` -> `RELEASE_MANIFEST_WRITTEN`
- `npm run check:release-manifest -- --phase Phase256B` -> `RELEASE_MANIFEST_OK`
- `npm run test:release-governance` -> 85/85 passed

Targeted required regression command:

- 34/35 passed
- Existing/out-of-scope failure: `test/phase246-delivery-today-closeout-state-consistency.test.js` expects frontend `getCloseoutSelectionSummary(visible)`, while current `public/js/app/new/91-delivery-today-new.js` has `getCloseoutSelectionSummary()`. This belongs to frontend selection governance, which Phase256B was instructed not to modify.

Failed with known out-of-scope workspace policy issues:

- `npm run check:source-bundles`
  - `src/services/inventoryService.js: generated file is stale`
- `npm run test:artifact-clean`
  - existing root archives `MK-pro-phase255a-optional-backend-route-lazy-load-fixed.zip`
  - existing root archive `MK-pro-phase256a-delivery-closeout-negative-return-self-healing-fixed.zip`
- `npm run quality`
  - syntax and release governance passed inside quality
  - failed at artifact-clean for the same existing root archives

Production audit command attempted:

`node scripts/audit-delivery-today-master-metadata-binding.js --date=2026-07-08 --delivery=ghtp --order-codes=B0039130 --json`

Result: blocked by MongoDB Atlas IP whitelist in this environment. No production data was read or written.

## Risk

Low to medium. The read endpoint remains broad at DB level for compatibility, but delivery filtering is now stricter: when a delivery code is supplied, matching is code-only and requires a verified assignment. Orders that previously appeared because of name substring or unverified synthetic metadata will no longer appear.

## Production verification

After deploy:

1. Call `GET /api/new/delivery-today/orders?date=2026-07-08&delivery=ghtp&deliveryStaffCode=ghtp&deliveryDateChangedByUser=1`.
2. Confirm `B0039130` is not in rows.
3. Search `date=2026-07-08&q=B0039130`.
4. Confirm `mergeStatus=unmerged`, `masterOrderId=""`, `masterOrderCode=""`, `deliveryStaffCode=""`, `deliveryAssignmentVerified=false`.
5. Confirm no MongoDB repair/update was performed.

## Rollback

Rollback only the Phase256B files listed above. No database migration or data mutation is required because the fix is read-model isolation plus closeout preflight validation.
