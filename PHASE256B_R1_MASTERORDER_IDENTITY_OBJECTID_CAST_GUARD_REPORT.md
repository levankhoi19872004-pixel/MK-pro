# Phase256B-R1 - MasterOrder Identity ObjectId Cast Guard

## Executive summary

Phase256B fixed master metadata scope isolation correctly, but its direct master lookup added `_id: { $in: directMasterKeys }` without separating Mongo ObjectId values from business IDs. When an order has `masterOrderId = MO1783758703356530`, Mongoose tries to cast that business ID as `MasterOrder._id` and throws before the Delivery Today read model can finish.

Phase256B-R1 keeps the Phase256B per-order binding resolver intact and fixes only query construction. Business IDs still query string identity fields, while `_id` is queried only for valid 24-hex ObjectId keys.

## Runtime error

Production symptom:

```text
Cast to ObjectId failed for value "MO1783758703356530"
(type string) at path "_id" for model "MasterOrder"
```

Affected flows:

- `GET /api/new/delivery-today/orders?...delivery=ghth`
- closeout preflight through `CloseoutContextLoader.assertCloseoutDeliveryScope()`, because it reuses `loadMasterOrderMetadata()`

## Root cause

File: `src/services/delivery/deliveryTodayCanonicalOrderReader.js`

Function: `loadMasterOrderMetadata()`

Phase256B added this regression:

```js
filter.$or.push(
  { id: { $in: directMasterKeys } },
  { code: { $in: directMasterKeys } },
  { masterOrderCode: { $in: directMasterKeys } },
  { _id: { $in: directMasterKeys } }
);
```

`directMasterKeys` contains business identities such as `MO1783758703356530` and `DT1783758703356530`. `MasterOrder` is built through `_flexModel`, which keeps MongoDB `_id` as the default ObjectId. Mongoose casts the query before execution and rejects non-ObjectId business strings.

## Why Phase256B tests missed it

The Phase256B mock model returned rows directly:

```js
MasterOrder: {
  find() {
    return chain(masters);
  }
}
```

That mock did not run Mongoose query casting. Phase256B-R1 adds a test that calls:

```js
MasterOrder.find(filter).cast(MasterOrder)
```

This reproduces the CastError without needing a database connection.

## Fix

New helper:

```js
buildMasterMetadataLookupFilter(orders)
```

Contract:

- returns `filter`, `childKeys`, `directMasterKeys`, `directMasterObjectIds`
- uses existing `isMongoObjectId()` from `src/utils/identity.util.js`
- places all direct master keys on string fields `id`, `code`, `masterOrderCode`
- places only valid ObjectId keys on `_id`

Before:

```js
{ _id: { $in: ['MO1783758703356530'] } }
```

After:

```js
{ id: { $in: ['MO1783758703356530', 'DT1783758703356530'] } }
{ code: { $in: ['MO1783758703356530', 'DT1783758703356530'] } }
{ masterOrderCode: { $in: ['MO1783758703356530', 'DT1783758703356530'] } }
```

For valid legacy ObjectId:

```js
{ _id: { $in: ['6a50420e4f5d7fbf8b8142d2'] } }
```

## Preserved Phase256B behavior

Unchanged:

- `buildMasterBindingIndexes()`
- `resolveMasterBindingForOrder()`
- `orderDirectlyReferencesMaster()`
- `masterReferencesOrderChild()`
- `enrichOrderWithMasterMetadata()`
- `deliveryMatches()`
- closeout scope guard

No retry, catch-and-ignore, `$expr`, `$toString`, schema change, data migration, or per-order query was added.

## Files changed

- `src/services/delivery/deliveryTodayCanonicalOrderReader.js`
- `test/phase256b-r1-masterorder-objectid-cast-guard.test.js`
- `PHASE256B_R1_MASTERORDER_IDENTITY_FILTER_EVIDENCE.json`
- `PHASE256B_R1_MASTERORDER_IDENTITY_OBJECTID_CAST_GUARD_REPORT.md`
- `RELEASE_MANIFEST.json`

## Evidence

File: `PHASE256B_R1_MASTERORDER_IDENTITY_FILTER_EVIDENCE.json`

Highlights:

- old unsafe filter throws `CastError` on `_id = MO1783758703356530`
- business identity case has no `_id` clause and Mongoose cast passes
- ObjectId case has `_id` clause and Mongoose cast passes
- mixed case sends only `6a50420e4f5d7fbf8b8142d2` to `_id`
- reader succeeds for `date=2026-07-13`, `delivery=ghth`, query count `2`
- B0039130 remains excluded from `ghtp`
- closeout scope guard verifies via `masterOrder.direct-order-link`

## Test results

Passed:

- `node --test test/phase256b-r1-masterorder-objectid-cast-guard.test.js` -> 7/7 passed
- `node --test test/phase256b-delivery-master-metadata-scope-isolation.test.js` -> 12/12 passed
- `npm run check:syntax` -> `SYNTAX_OK 1489 JavaScript files`
- `npm run docs:check` -> OpenAPI up to date
- `npm run test:release-governance` -> 85/85 passed

Required targeted regression command:

- 41/42 passed
- Existing/out-of-scope failure: `test/phase246-delivery-today-closeout-state-consistency.test.js` still expects frontend `getCloseoutSelectionSummary(visible)` while the current frontend file has `getCloseoutSelectionSummary()`. Phase256B-R1 does not edit frontend selection governance.

Failed with existing workspace issues:

- `npm run check:source-bundles`
  - `src/services/inventoryService.js: generated file is stale`
- `npm run test:artifact-clean`
  - existing root archives are flagged as nested archive inputs
- `npm run quality`
  - syntax and release governance passed internally
  - failed at artifact-clean for existing root archives
- `npm test`
  - failed in unrelated tests: trust proxy static, sales-order delete/cancel tests, source artifact verifier

## Query-count evidence

R1 reader integration:

- orders query: `1`
- master metadata query: `1`
- reader diagnostic query count: `2`
- no retry query
- no N+1

## Production verification

After deploy:

1. Open Don giao hom nay (New).
2. Choose date `2026-07-13`.
3. Choose NVGH `ghth`.
4. Confirm no CastError appears.
5. Confirm rows and KPI load normally.
6. Call:

```text
GET /api/new/delivery-today/orders?date=2026-07-13&delivery=ghth&deliveryStaffCode=ghth&deliveryDateChangedByUser=1
```

Expected: HTTP 200.

Then verify Phase256B isolation:

```text
GET /api/new/delivery-today/orders?date=2026-07-08&deliveryStaffCode=ghtp&q=B0039130
```

Expected: `B0039130` is not returned in `ghtp` scope and no synthetic `masterOrderId` or `deliveryStaffCode` is applied.

## Rollback

Rollback only the R1 files listed above. No MongoDB schema change or production data mutation is involved.
