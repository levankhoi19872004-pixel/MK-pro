# Phase256C - Master Order Edit Working Set Persistence

## Impact overview

Scope is limited to master order edit flow:

- Frontend state in `public/js/app/state/00c-admin-system-state.js`.
- Master order modal behavior in `public/js/app/06-master-delivery.js`.
- Master delivery bundle cache busting in `public/js/app/core/desktop-feature-facades.js`.
- Master order update guard in `src/services/master-order/masterOrderCommand.impl.js`.
- Focused regression tests for edit working-set persistence and removal intent guard.

No MongoDB schema, package.json, dependency, Inventory, AR, Fund, Return, delivery closeout, or Phase256B/R1 canonical reader changes were made.

## Root cause

The edit modal mixed two different state domains:

- `unmergedOrdersCache` was a left-pane candidate result cache.
- The right-pane grouped list was derived from that cache through `masterOrderGroupedRows()`.
- `loadUnmergedChildOrders()` replaced the cache whenever the user changed left-pane filters.
- `syncVisibleGroupedChildOrderIds()` then collapsed `selectedGroupedChildOrderIds` to only rows still visible in the current cache.
- `submitMasterOrder()` submitted that collapsed list as replacement `childOrderIds`.
- Backend `updateMasterOrder()` correctly treated `childOrderIds` as the full replacement set, so lost frontend state could detach old children.

For production case `DT1783758798503103`, changing left-pane date filters after opening edit could therefore drop the initial four children `B0039412`, `B0039414`, `B0039413`, `B0039415` and summary `16,925,906` from the right pane.

## Phuong an A implemented

Frontend now separates candidate results from the edit working set:

- `masterOrderChildRowsById`: stable row registry.
- `unmergedOrderResultIds`: left-pane candidate result ids only.
- `selectedGroupedChildOrderIds`: final grouped working set.
- `explicitlyRemovedGroupedChildOrderIds`: explicit remove intent.
- `originalGroupedChildOrderIds`: edit baseline loaded from master detail.

Candidate reload now calls `replaceUnmergedCandidateResults(rows)` and does not prune the grouped working set. The right pane reads `getGroupedWorkingRows()`. Submit reads the full grouped set through `getGroupedChildOrderIdsForSubmit()` and, in edit mode, sends:

- `childOrderIds`
- `expectedChildOrderIds`
- `removedChildOrderIds`

Backend now guards destructive replacement before transaction:

- `MASTER_ORDER_EDIT_STALE_CHILD_SET` when client baseline does not match current children.
- `MASTER_ORDER_CHILD_REMOVAL_INTENT_MISMATCH` when actual removed children do not exactly match explicit removed ids.

Existing operational guard `hasDeliveryOperationalData()` remains in place after the explicit-intent guard.

## Tests

Passed:

- `npm run check:syntax` - `SYNTAX_OK 1491 JavaScript files`
- `node --test test/master-order-popup-selection-ui-static.test.js test/master-order-unmerged-refresh-ui-static.test.js test/master-order-unmerged-query-behavior.test.js test/master-order-remove-child-flow.test.js test/master-order-detach-delivery-invariant.test.js test/master-order-concurrent-merge.test.js test/phase256c-master-order-edit-working-set-persistence.test.js test/phase256c-master-order-removal-intent-guard.test.js` - 20/20 passed
- `npm run docs:check` - OpenAPI up to date, 368 operations scanned
- `npm run test:release-governance` - 85/85 passed
- `npm run release:manifest:check` - `RELEASE_MANIFEST_OK Phase256C-1.0.0-20260713141139`

Known unrelated failures retained:

- `npm run check:source-bundles` fails because `src/services/inventoryService.js` generated file is stale.
- `npm run test:artifact-clean` fails because existing root ZIP artifacts are reported as nested archives.
- `npm run quality` passes syntax and release governance but fails at artifact-clean for the same root ZIP artifacts.
- `npm test` still has existing unrelated failures in app trust proxy static, sales-order delete/cancel, and artifact verifier areas.

## Files changed

- `public/js/app/state/00c-admin-system-state.js`
- `public/js/app/06-master-delivery.js`
- `public/js/app/core/desktop-feature-facades.js`
- `src/services/master-order/masterOrderCommand.impl.js`
- `test/master-order-popup-selection-ui-static.test.js`
- `test/master-order-remove-child-flow.test.js`
- `test/phase256c-master-order-edit-working-set-persistence.test.js`
- `test/phase256c-master-order-removal-intent-guard.test.js`
- `RELEASE_MANIFEST.json`
- `PHASE256C_MASTER_ORDER_EDIT_STATE_EVIDENCE.json`
- `PHASE256C_MASTER_ORDER_EDIT_WORKING_SET_PERSISTENCE_REPORT.md`

## Risk

Low to medium. Frontend state now keeps edit children stable across candidate reloads, but this path is central to master order editing. Backend guard intentionally blocks legacy destructive shrink requests unless explicit removal intent is supplied.

## Recommended verification

Manual smoke:

1. Open edit for `DT1783758798503103`.
2. Confirm right pane shows four children and total `16,925,906`.
3. Change left-pane date/source/NVBH filters.
4. Confirm right pane and total remain unchanged.
5. Add one candidate, remove one original child, save.
6. Confirm payload includes full `childOrderIds`, `expectedChildOrderIds`, and `removedChildOrderIds`.
