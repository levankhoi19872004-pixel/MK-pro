# Phase258A - Delivery Fund Remittance Canonical Payment State Alignment

## Executive summary

Phase258A fixes the cross-module payment-state divergence between Delivery Today New and Fund remittance preview/create/edit.

Production case B0039325 was reproduced with a stale legacy cash alias of 7,587,000 while the canonical payment state is cash 0, bank 0, reward 8,300,000. Fund now resolves delivery order payment state through the shared read-only canonical resolver before computing `reportCurrentOrderCashAmount` and `reportCurrentOrderBankAmount`.

No AR writer, FundLedger writer, Inventory writer, returnOrders lifecycle, DeliveryCloseoutCorrection writer, orderPaymentAllocation writer, MongoDB schema, package dependency, or production data was changed manually.

## Production case B0039325

Order: B0039325
Delivery date: 2026-07-11
Delivery staff: ghtp

Before Phase258A:

- Delivery Today New: cash 0, bank 0, reward 8,300,000, debt 3,657,117.
- Fund remittance popup: cash 7,587,000, bank 0.
- Fund total cash: 10,953,000.
- Submitted cash: 3,366,000.
- Difference cash: -7,587,000.

Math proof:

```text
10,953,000 stale Fund report cash
- 7,587,000 stale B0039325 cash alias
= 3,366,000 actual submitted cash
```

After Phase258A fixture:

- B0039325 Fund row cash: 0.
- B0039325 Fund row bank: 0.
- B0039325 reward: 8,300,000, not counted as cash or bank.
- Fund report cash: 3,366,000.
- Fund report bank: 5,020,000.
- Difference cash: 0.
- Difference bank: 0.
- Match status: matched.

Evidence file: `PHASE258A_FUND_REMITTANCE_PAYMENT_STATE_EVIDENCE.json`.

## Call graph before fix

```text
Fund / Delivery cash submission preview
-> POST /api/funds/delivery-cash-submissions/preview
-> fundController.previewDeliverySubmission
-> fundService.buildDeliverySubmissionDraft
-> masterOrderDelivery.service
-> listDeliveryTodayOrdersCompact
-> child orders top-level payment fields
-> numberFromRow(row, ['cashAmount', 'cashCollected'])
```

The unsafe behavior was the first-positive fallback. If canonical `cashAmount` was 0 but legacy `cashCollected` was 7,587,000, Fund used 7,587,000.

## Delivery Today New call graph

```text
GET /api/new/delivery-today/orders
-> DeliveryTodayNewService.listOrders
-> deliveryTodayCanonicalOrderReader
-> orders primary
-> returnOrders
-> deliveryCloseoutVersions latest
-> orderPaymentAllocations current
-> summarizeOrder
```

Delivery Today New already preferred current allocation and latest closeout correction over top-level legacy fields.

## Root cause

The root cause was backend source divergence:

- Delivery Today New used canonical-ish payment state.
- Fund remittance used compact legacy delivery rows and top-level aliases.
- `numberFromRow()` returned the first positive value, so canonical zero could be overwritten by stale positive legacy aliases.

This is a P0 financial integrity issue because it can create false delivery-staff shortages and later shortage workflows from an incorrect report snapshot.

## Production-grade fix

Added shared read-only resolver:

`src/services/delivery/DeliveryPaymentStateReadService.js`

Resolver priority:

```text
orderPaymentAllocations.current
> deliveryCloseoutVersions.latest
> salesOrders.deliveryCloseout
> orders.top-level
```

Resolver behavior:

- Batch loads latest closeout versions for all order identities.
- Batch loads current payment allocations for all order identities.
- Ignores stale allocations when latest correction version is newer.
- Preserves canonical zero as a real value.
- Does not convert reward/bonus into cash or bank.
- Returns source metadata: payment state source, latest correction version, allocation code, stale allocation flag.

## Fund remittance changes

`buildDeliverySubmissionDraft()` still uses the existing delivery scope query for date/NVGH filtering, but it no longer trusts that compact row as the final payment state.

New flow:

```text
list delivery scope
-> resolve canonical payment states in batch
-> enrich preview rows with canonical cash/bank/reward
-> sum current-order cash and bank from resolved values
-> keep old-debt collection fields unchanged
```

Affected endpoints share the same builder:

- `POST /api/funds/delivery-cash-submissions/preview`
- `POST /api/funds/delivery-cash-submissions`
- `PUT /api/funds/delivery-cash-submissions/:id`

## Delivery Today New alignment

`DeliveryTodayNewService.summarizeOrder()` now calls the same resolver for payment state. KPI and return/debt flow remains in Delivery Today New; payment cash/bank/reward source selection is shared.

## Query budget

No N+1 query was introduced.

Expected read pattern for Fund preview:

- Delivery scope query: existing compact scope query.
- Closeout versions: 1 batch query.
- Payment allocations: 1 batch query.

No per-order `DeliveryCloseoutVersion.find()` and no per-order `OrderPaymentAllocation.find()`.

## Old-debt boundary

Phase258A intentionally keeps existing old-debt collection behavior:

- `reportOldDebtCashAmount`
- `reportOldDebtBankAmount`

Those still use the current row aliases and remain outside this payment-state alignment. Current-order reward is not added to old-debt, cash, or bank.

## Read-only audit script

Added:

`scripts/audit-delivery-fund-payment-state.js`

Usage:

```bash
node scripts/audit-delivery-fund-payment-state.js --date=2026-07-11 --delivery=ghtp --order=B0039325 --json
```

The script is read-only. It rejects `--apply`.

## Files changed

- `src/services/delivery/DeliveryPaymentStateReadService.js`
- `src/services/v2/deliveryTodayNew.service.js`
- `src/services/fundService.source/part-01.jsfrag`
- `src/services/fundService.source/part-01b.jsfrag`
- `src/services/fundService.js`
- `config/source-bundles.json`
- `test/phase258a-fund-remittance-canonical-payment-state.test.js`
- `test/fund-delivery-cash-preview-static.test.js`
- `test/fund-service-master-order-delivery-lazy-dependency-static.test.js`
- `test/fund-delivery-cash-update-refresh-behavior.test.js`
- `test/phase230-delivery-remittance-lines-accounting-date.test.js`
- `scripts/audit-delivery-fund-payment-state.js`
- `PHASE258A_FUND_REMITTANCE_PAYMENT_STATE_EVIDENCE.json`
- `PHASE258A_DELIVERY_FUND_REMITTANCE_CANONICAL_PAYMENT_STATE_ALIGNMENT_REPORT.md`

Generated-only note:

- `src/services/inventoryService.js` was refreshed by `npm run source-bundles:refresh` so the required full source-bundle check stays green. No inventory source fragment was edited for Phase258A.

## Test results

All required commands were run for real.

```text
npm run check:syntax
PASS - SYNTAX_OK 1506 JavaScript files
```

```text
node --test test/phase258a-fund-remittance-canonical-payment-state.test.js test/fund-delivery-cash-preview-static.test.js test/fund-delivery-cash-update-refresh-behavior.test.js test/fund-delivery-cash-update-refresh-static.test.js test/phase230-delivery-remittance-lines-accounting-date.test.js test/delivery-today-kpi-horizontal-reconcile.test.js test/delivery-today-canonical-source-reader.test.js test/delivery-today-source-note-contract.test.js
PASS - 38 tests, 38 pass, 0 fail
```

```text
npm run check:source-bundles
PASS - OK 19 bundles
```

```text
npm run docs:check
PASS - OpenAPI document is up to date. Scanned operations: 368.
```

```text
npm run test:release-governance
PASS - 85 tests, 85 pass, 0 fail
```

## Acceptance checklist

- B0039325 cash on Fund fixture is 0.
- B0039325 cash on Delivery Today New fixture is 0.
- Reward 8,300,000 is not counted as cash or bank.
- Fund report cash decreases by 7,587,000 in fixture.
- Difference cash changes from -7,587,000 to 0.
- Current allocation is preferred.
- Stale allocation is ignored when latest correction is newer.
- Latest correction is used correctly.
- Canonical zero does not fallback to stale positive legacy alias.
- Preview/create/edit use the same builder.
- No N+1 query introduced.
- No writer or production data mutation added.
- Behavioral test and read-only audit script were added.

## Risk and rollback

Risk:

- Fund preview now depends on two extra read-only batch sources. If those collections are unavailable, preview can fail instead of silently using stale legacy fields.
- Existing old-debt collection aliases are intentionally unchanged and may need a separate audit if future inconsistencies appear.

Rollback:

1. Revert `DeliveryPaymentStateReadService.js`.
2. Revert `DeliveryTodayNewService.summarizeOrder()` to local payment selection.
3. Revert `fundService.source` changes and rebuild source bundles.
4. Re-run the required test set.

No database rollback is required because Phase258A does not write production data or migrate schema.
