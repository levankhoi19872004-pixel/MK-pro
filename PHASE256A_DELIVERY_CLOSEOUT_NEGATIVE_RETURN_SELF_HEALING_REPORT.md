# Phase256A - Delivery Closeout Negative Returned Amount Self-Healing Report

## Executive summary

Phase256A fixes the production failure where delivery closeout could abort with:

`salesOrders.deliveryCloseout field returnedAmount khong duoc am`

The fix is scoped to delivery closeout/correction accounting. It does not change returnOrders SSoT, AR/Fund/Inventory writers, debt formula, Mongo schema, transaction atomicity, or frontend selection.

Primary outcome:

- New correction snapshots cannot create negative `returnedAmount`.
- Legacy `orders.deliveryCloseout.returnedAmount < 0` no longer throws before rebuild.
- Canonical closeout from `returnOrders` remains strict; negative canonical total return still fails.
- Repair script is dry-run by default and only repairs explicitly passed order codes.

## Impacted area

- UI route: `POST /api/new/delivery-today/closeout`
- Accounting service: `src/services/accounting/AccountingCloseoutService.js`
- Closeout calculator/compare: `src/services/accounting/DeliveryCloseoutService.js`
- Batch transaction: `src/services/accounting/closeout/CloseoutTransactionRunner.js`
- Correction service: `src/services/deliveryCloseoutCorrection.service.js`
- Repair repository boundary: `src/repositories/orderRepository.js`
- Repair script: `scripts/repair-delivery-closeout-negative-returned-amount.js`

## Root cause

1. `validateCorrectionInput()` only checked negative cash/bank/reward final values. It did not check `calculated.finalState.returnAmount`, so a negative `returnAdjustmentAmount` could make final return negative in both open-order and confirmed-order correction flows.

2. `DeliveryCloseoutService.compareCloseout(expected, actual)` used strict `requireMoney()` on `actual`, where `actual` is legacy `orders.deliveryCloseout`. When `actual.returnedAmount < 0`, compare threw before `AccountingCloseoutService.confirmOneOrder()` could enter its existing rebuild branch:

   `scopedComputed.rebuiltFromSsot = true`

3. `returnOrders` is the correct SSoT, but canonical total return needed an explicit guard so bad SSoT data cannot be silently hidden.

## Call graph before

```text
Delivery Today New UI
-> POST /api/new/delivery-today/closeout
-> AccountingCloseoutService.confirmDeliveryAccounting()
-> CloseoutContextLoader.loadCanonicalCloseoutContext()
-> CloseoutCanonicalExecutor.executeCanonicalCloseoutWriters()
-> CloseoutTransactionRunner.runCloseoutTransaction()
-> confirmOneOrder()
-> DeliveryCloseoutService.buildCloseout(returnOrders SSoT)
-> DeliveryCloseoutService.compareCloseout(expected, orders.deliveryCloseout)
-> requireMoney(actual.returnedAmount) throws
-> Mongo transaction rollback
```

## Call graph after

```text
Delivery Today New UI
-> POST /api/new/delivery-today/closeout
-> AccountingCloseoutService.confirmDeliveryAccounting()
-> CloseoutCanonicalExecutor
-> CloseoutTransactionRunner with one Mongo transaction
-> confirmOneOrder()
-> buildCloseout(returnOrders SSoT)
-> validate canonical expected strictly
-> compare legacy actual as controlled mismatch
-> rebuiltFromSsot=true + DELIVERY_CLOSEOUT_REBUILT_FROM_SSOT audit
-> confirmCloseout()
-> orderRepository patch
-> orderPaymentAllocations / AR reconcile existing flow
```

## Correction call graph

```text
Adjustment popup / bulk replay
-> DeliveryAdjustmentCommitService
-> deliveryCloseoutCorrectionService.createCorrection()
-> createOpenOrderAdjustment() or confirmed createCorrection()
-> validateCorrectionInput()
-> shared return invariant guard
-> returnOrders adjustment / version / allocation / AR adjustment existing flow
```

## Why only return orders failed

Orders without returns have `returnedAmount = 0`, so legacy non-negative validation did not throw. Orders with stale negative snapshots failed because `compareCloseout()` treated the old snapshot as strict canonical data instead of legacy data to compare and rebuild.

The UI can show positive return because it reads fresh/canonical return information, while backend `orders.deliveryCloseout` can still contain an older negative snapshot from a prior correction/replay path.

## Important logic diff

- `DeliveryCloseoutService.requireMoney()` now rejects non-numeric money literals that previously collapsed to zero through `toNumber()`.
- `summarizeReturnOrders()` throws `DELIVERY_CLOSEOUT_CANONICAL_RETURN_NEGATIVE` if active returnOrders produce a negative total.
- `compareCloseout()` validates expected/canonical strictly, but converts only known legacy actual snapshot issues into mismatches:
  - `legacy_negative_closeout_value`
  - `invalid_legacy_closeout_money`
  - `missing_required_closeout_field`
- `validateCorrectionInput()` now rejects:
  - `DELIVERY_CLOSEOUT_CORRECTION_NEGATIVE_RETURN`
  - `DELIVERY_CLOSEOUT_CORRECTION_RETURN_EXCEEDS_RECEIVABLE`
- `AccountingCloseoutService` adds safe repair metadata when rebuild reason is legacy negative value.
- Repair script uses `orderRepository.patchDeliveryCloseoutSnapshotById()` with optimistic guard and does not call AR/Fund/Inventory writers.

## Invariants

Before:

- Cash/bank/reward after correction had non-negative guards.
- Legacy snapshot `returnedAmount < 0` caused throw before rebuild.

After:

- `newReturnAmount >= 0`.
- `newReturnAmount <= receivableAmount`.
- Canonical `returnedAmount >= 0`.
- Canonical invalid money throws.
- Legacy actual invalid money becomes mismatch only inside `compareCloseout()`.
- Batch transaction remains all-or-nothing.

## Repair script

Script:

`scripts/repair-delivery-closeout-negative-returned-amount.js`

Default mode is dry-run. It refuses to scan the whole database and requires explicit order codes:

```bash
node scripts/repair-delivery-closeout-negative-returned-amount.js --order-codes=B0039101,B0039100 --json
```

Apply mode:

```bash
node scripts/repair-delivery-closeout-negative-returned-amount.js --order-codes=B0039101,B0039100 --apply --actor="Quan tri he thong"
```

Apply behavior:

- Re-reads order in transaction.
- Recomputes canonical closeout immediately before write.
- Uses optimistic guard on `updatedAt` and existing closeout hashes when present.
- Patches only `deliveryCloseout` snapshot fields through repository boundary.
- Logs `DELIVERY_CLOSEOUT_LEGACY_SNAPSHOT_REPAIRED`.
- Does not create AR-DEBT-OPEN, AR-DEBT-ADJUSTMENT, orderPaymentAllocations, fundLedgers, stockTransactions, or returnOrders.

## Dry-run fixture evidence

File: `PHASE256A_NEGATIVE_RETURN_REPAIR_DRY_RUN.json`

Expected canonical values:

- B0039101: returned `291176`, final debt `7551334`
- B0039100: returned `282279`, final debt `11474379`
- Total returned `573455`
- Total final debt `19025713`
- `applied=false`

## Files changed

- `src/services/accounting/DeliveryCloseoutService.js`
- `src/services/accounting/AccountingCloseoutService.js`
- `src/services/deliveryCloseoutCorrection.service.js`
- `src/repositories/orderRepository.js`
- `scripts/repair-delivery-closeout-negative-returned-amount.js`
- `test/phase256a-negative-return-correction-guard.test.js`
- `test/phase256a-legacy-negative-closeout-self-healing.test.js`
- `test/phase256a-negative-return-repair-script.test.js`
- `PHASE256A_NEGATIVE_RETURN_REPAIR_DRY_RUN.json`
- `RELEASE_MANIFEST.json`

## Intentionally not changed

- No MongoDB schema change.
- No package.json or dependency change.
- No frontend change.
- No returnOrders state machine change.
- No AR/Fund/Inventory writer change.
- No batch transaction split.
- No Math.abs/Math.max clamp for returnedAmount.
- No source bundle rebuild, because Phase256A did not change source-bundle inputs. Existing source-bundle check failure is unrelated to this phase.

## Test results

Passed:

```bash
npm run check:syntax
# SYNTAX_OK 1486 JavaScript files

node --test test/phase256a-*.test.js
# pass 12/12

node --test test/delivery-closeout-uses-returnorders.test.js test/delivery-closeout-selected-scope-ssot.test.js test/delivery-closeout-breakdown-consistency.test.js test/delivery-closeout-correction-contract-static.test.js test/delivery-closeout-correction-no-change-optional-reason.test.js test/delivery-adjustment-returnorders-contract-static.test.js test/accounting-confirm-blocks-missing-returnorders.test.js test/delivery-today-closeout-idempotent-fast-skip.test.js test/phase256a-*.test.js
# pass 44/44

npm run release:manifest -- --phase Phase256A
# RELEASE_MANIFEST_WRITTEN Phase256A-1.0.0-20260713085316

npm run check:release-manifest -- --phase Phase256A
# RELEASE_MANIFEST_OK Phase256A-1.0.0-20260713085316

npm run docs:check
# OpenAPI document is up to date. Scanned operations: 368.

npm run test:release-governance
# pass 85/85
```

Failed, unrelated to Phase256A:

```bash
npm run check:source-bundles
# FAILED: src/services/inventoryService.js generated file is stale

npm run test:artifact-clean
# FAILED: existing MK-pro-phase255a-optional-backend-route-lazy-load-fixed.zip nested archive is not allowed

npm run quality
# FAILED at artifact-clean for same existing Phase255A ZIP

npm test
# FAILED in unrelated existing areas:
# - app-trust-proxy-static.test.js createApp static check
# - sales-order delete alias/cancel tests
# - source-artifact-clean-verifier clean ZIP assertion
```

## Transaction and idempotency proof

- `CloseoutCanonicalExecutor` still delegates pending orders to `CloseoutTransactionRunner.runCloseoutTransaction()`.
- `CloseoutTransactionRunner` still wraps all pending orders in `withMongoTransaction()`.
- One thrown error still rolls back the whole batch.
- Self-healing happens before patch/AR allocation within the same per-order writer flow.
- Existing AR/orderPaymentAllocation idempotency keys are not changed.
- Repair script does not invoke accounting writers and therefore cannot create duplicate AR/Fund/Inventory entries.

## Production verification runbook

1. Dry-run:

```bash
node scripts/repair-delivery-closeout-negative-returned-amount.js \
  --order-codes=B0039101,B0039100 \
  --json
```

2. Confirm expected values:

- B0039101 `canonicalReturnedAmount = 291176`, `canonicalFinalDebtAmount = 7551334`
- B0039100 `canonicalReturnedAmount = 282279`, `canonicalFinalDebtAmount = 11474379`

3. Apply only after operator approval:

```bash
node scripts/repair-delivery-closeout-negative-returned-amount.js \
  --order-codes=B0039101,B0039100 \
  --apply \
  --actor="Quan tri he thong"
```

4. Close out the same two orders in UI.

Expected: no `returnedAmount khong duoc am` error.

5. Verify after closeout:

- `orders.deliveryCloseout.returnedAmount` is positive.
- `returnOrderIds` matches canonical returnOrders.
- `finalDebtAmount` matches expected debt.
- AR ledgers are not duplicated.
- returnOrders are not duplicated.
- No unexpected stock transaction is created.
- Audit rebuild/repair events exist.

## Rollback procedure

Code rollback:

- Revert Phase256A code files and redeploy previous release artifact.

Data rollback if repair script was applied:

- Use audit event `DELIVERY_CLOSEOUT_LEGACY_SNAPSHOT_REPAIRED`.
- Restore only the recorded `before.deliveryCloseout` for affected order codes through an approved admin data repair path.
- Do not delete AR/Fund/Inventory ledgers; this script does not create them.

## Remaining risks

- Existing workspace has unrelated release/artifact hygiene failures due stale `inventoryService.js` generated bundle state and an existing Phase255A ZIP in root.
- If production `returnOrders` themselves produce a negative total, Phase256A correctly blocks closeout with `DELIVERY_CLOSEOUT_CANONICAL_RETURN_NEGATIVE`; that requires SSoT data repair, not snapshot self-healing.
