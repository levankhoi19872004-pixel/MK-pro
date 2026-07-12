# PHASE245 Strict AR Satisfaction Evidence Guard Report

## Executive Summary

Phase245 tightens the Phase244 AR satisfaction evaluator.

Before Phase245, an allocation AR intent could be considered satisfied when an `entry` object existed, even if both `created` and `alreadyExists` were false.

After Phase245, an allocation AR intent is satisfied only when:

```js
created === true || alreadyExists === true
```

`entry` is now metadata only. It can provide `entryId` for diagnostics, but it cannot decide `arSatisfied`, `arPosted`, or `arAlreadyExists`.

## Root Cause

The evaluator previously had equivalent logic:

```js
if (!row || (!row.created && !row.alreadyExists && !row.entry)) {
  missingIntents.push(intent);
}
```

That made `entry` a persistence evidence fallback. A failed writer-like result such as:

```js
{
  idempotencyKey: 'A',
  created: false,
  alreadyExists: false,
  reasonCode: 'FAILED',
  entry: { _id: '123' }
}
```

could incorrectly satisfy the expected AR intent.

## Fix

`CloseoutArSatisfaction.evaluateArSatisfaction` now computes allocation intent satisfaction as:

```js
const satisfied = row && (row.created === true || row.alreadyExists === true);
```

If not satisfied, the intent is added to `missingIntents`.

## Diagnostic Contract

`missingIntents` now includes compact diagnostic fields:

- `orderId`
- `orderCode`
- `idempotencyKey`
- `category`
- `created`
- `alreadyExists`
- `reasonCode`

It does not include the full ledger `entry`.

## Scope Control

Changed:

- `src/services/accounting/closeout/CloseoutArSatisfaction.js`
- `test/phase245-strict-ar-satisfaction-evidence.test.js`

Not changed:

- AR writer
- Fund writer
- Inventory writer
- accounting formula
- closeout formula
- debt reconcile algorithm
- idempotency key
- category
- account
- ledgerType
- sign
- amount

## Query Budget

No DB query was added.

The evaluator still runs only from writer result objects. It does not call:

- `ArLedger.find`
- `ArLedger.findOne`
- `ArLedger.aggregate`

## Test Evidence

Targeted tests:

```bash
node --test test/phase245-strict-ar-satisfaction-evidence.test.js
node --test test/phase244-closeout-ar-persistence-satisfaction.test.js
node --test test/phase242c-closeout-canonical-context-cutover.test.js test/phase243-closeout-result-contract.test.js test/phase244-closeout-ar-persistence-satisfaction.test.js test/phase245-strict-ar-satisfaction-evidence.test.js test/order-payment-allocation-reward-contract.test.js test/order-payment-debt-reconcile-contract.test.js test/delivery-today-closeout-idempotent-fast-skip.test.js test/delivery-today-closeout-contract.test.js test/delivery-today-closeout-performance-static.test.js test/delivery-today-closeout-readmodel-safety.test.js test/delivery-closeout-command-standard-v2.test.js test/single-ar-debt-open-idempotency.test.js
npm test
```

Result:

- Phase245 entry-only regression passed.
- Phase244 created/idempotent/noop/zero-tolerance regressions passed.
- Phase242C and Phase243 regressions passed.
- Full repository `npm test` passed.

## Completion Checklist

- `entry` no longer affects `arSatisfied`.
- `created=true` passes.
- `alreadyExists=true` passes.
- entry-only evidence fails.
- `missingIntents` detects the failed intent.
- No AR query was added.
- AR writer was not changed.
- Accounting business logic was not changed.
- Regression suite passed.
