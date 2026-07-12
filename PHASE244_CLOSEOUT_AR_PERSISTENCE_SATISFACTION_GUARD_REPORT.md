# PHASE244 Closeout AR Persistence Satisfaction Guard Report

## Executive Summary

Phase244 adds a mandatory AR satisfaction invariant to Delivery Today closeout:

```txt
outcome=confirmed
-> SalesOrder closeout patch persisted
-> payment allocation persisted
-> every AR obligation is satisfied by created, idempotent-existing, or valid no-op evidence
```

This closes the remaining accounting gap after Phase243: an order could have `salesOrderUpdated=true` and `allocationWritten=true` while `arPosted=false` and no proof that AR was already present or not required.

## Root Cause

Phase243 correctly fixed false UI success, rejected/idempotent classification, and canonical reload. It still allowed a backend confirmed row to rely on:

```js
Boolean(allocationResult.allocation)
arLedgers.length > 0
```

That proves allocation exists, but does not prove every AR intent was satisfied. The allocation writer already built expected AR rows and checked idempotency, but it returned only `arLedgers`, losing whether each row was newly created or already existed.

## Audit Table

| File | Function | Current result before Phase244 | Idempotent evidence | AR requirement evidence | Gap |
| --- | --- | --- | --- | --- | --- |
| `AccountingCloseoutService.js` | `confirmOneOrder` | returns `outcome=confirmed` after SalesOrder patch/allocation | No, only `arLedgers.length` | No explicit `arRequired` | Could confirm with ambiguous AR |
| `OrderPaymentAllocationService.js` | `buildArLedgerRows` | builds AR-SALE, AR-RECEIPT-CASH, AR-RECEIPT-BANK, AR-REWARD-ALLOWANCE, AR-RETURN | N/A | Yes, expected rows are AR intents | Intents not returned to caller |
| `OrderPaymentAllocationService.js` | `postArLedgersFromAllocation` | pre-checks idempotency, posts missing rows, returns ledger array | Internally yes | Internally yes | Created vs already-exists evidence lost |
| `arPosting.service.js` | `postArLedgerEntry` | canonical upsert with `$setOnInsert` | No explicit created flag | No | Kept unchanged to avoid broad writer rewrite |
| `OrderPaymentDebtReconcileService.js` | `reconcileOrderDebt` | returns `posted`, `skippedAlreadyReconciled`, `NO_DEBT_DELTA`, `manualReviewRequired` | Yes for adjustment idempotent | Yes for debt adjustment/noop | Caller did not convert to final AR satisfaction |
| `CloseoutFinalizer.js` | `buildCloseoutResult` | counts per-order outcome | N/A | N/A | Correct after Phase243; no AR evaluator |

## AR Posting Intents

From closeout allocation, AR intents come from `buildArLedgerRows`:

- `AR-SALE`
- `AR-RECEIPT-CASH`
- `AR-RECEIPT-BANK`
- `AR-REWARD-ALLOWANCE`
- `AR-RETURN`

Debt reconcile can add:

- `AR-DEBT-ADJUSTMENT`

Phase244 does not change amount formula, sign, category, ledgerType, account, idempotency key, or writer ownership.

## Writer Result Contract

`OrderPaymentAllocationService.postArLedgersFromAllocation` now preserves backward compatibility by still returning the `arLedgers` array, while attaching:

- `arLedgers.postingResults`
- `arLedgers.expectedArLedgers`

Each posting result distinguishes:

```js
{
  idempotencyKey,
  category,
  created,
  alreadyExists,
  reasonCode,
  entry
}
```

`postAllocation` and `buildAndPostFromCloseout` now return:

- `arPostingResults`
- `expectedArLedgers`

No new AR writer was introduced.

## AR Satisfaction Evaluator

Added pure helper:

```txt
src/services/accounting/closeout/CloseoutArSatisfaction.js
```

It:

- does not query DB,
- does not mutate data,
- does not write ledger,
- evaluates only writer/reconcile results.

Output includes:

```js
{
  arRequired,
  arSatisfied,
  arPosted,
  arAlreadyExists,
  arNoopValid,
  arReasonCode,
  arEntryIds,
  arIdempotencyKeys,
  expectedIntentCount,
  satisfiedIntentCount,
  missingIntents
}
```

## arRequired Determination

`arRequired=true` when:

- allocation expected AR intents exist, or
- debt reconcile requires/posts an adjustment, or
- debt reconcile reports manual-review/unsatisfied adjustment state.

`arRequired=false` when:

- no allocation AR intent exists, and
- debt reconcile returns a valid noop such as `NO_DEBT_DELTA` or `ZERO_TOLERANCE`.

## Transaction Guard

`AccountingCloseoutService.confirmOneOrder` now evaluates AR satisfaction inside the closeout transaction, after allocation/reconcile writers and before returning `outcome=confirmed`.

If evidence is missing:

```txt
AR_PERSISTENCE_VERIFICATION_FAILED
```

is thrown with HTTP 500 semantics. Because this happens inside `CloseoutTransactionRunner`, the transaction rolls back instead of leaving a half-confirmed SalesOrder.

## Per-Order Persistence Contract

Confirmed rows now include:

```js
persistence: {
  salesOrderUpdated: true,
  allocationWritten: true,
  arRequired,
  arSatisfied,
  arPosted,
  arAlreadyExists,
  arNoopValid,
  arReasonCode,
  arEntryIds,
  arIdempotencyKeys,
  fundRequired,
  fundSatisfied,
  fundPosted,
  verifiedFromWriterResult: true
}
```

Already-confirmed rows now explicitly return:

```js
arRequired: null,
arSatisfied: true,
arReasonCode: 'ALREADY_CONFIRMED'
```

They do not rerun AR writers.

## Query Budget Impact

No DB query was added.

The new guard uses:

- expected AR rows already built by allocation writer,
- idempotency evidence already collected by allocation writer,
- debt reconcile result already returned by reconcile writer.

Validator query count remains 0. There is no per-order AR verification query loop.

## Files Changed

- `src/services/accounting/closeout/CloseoutArSatisfaction.js`
- `src/services/accounting/OrderPaymentAllocationService.js`
- `src/services/accounting/AccountingCloseoutService.js`
- `test/phase244-closeout-ar-persistence-satisfaction.test.js`

Phase243 files remain part of the current working state and are preserved.

## Test Evidence

Targeted commands run:

```bash
node --test test/phase244-closeout-ar-persistence-satisfaction.test.js
node --test test/phase243-closeout-result-contract.test.js test/phase242c-closeout-canonical-context-cutover.test.js
node --test test/order-payment-allocation-reward-contract.test.js test/order-payment-debt-reconcile-contract.test.js test/delivery-today-closeout-idempotent-fast-skip.test.js test/delivery-today-closeout-contract.test.js test/delivery-today-closeout-performance-static.test.js test/delivery-today-closeout-readmodel-safety.test.js test/delivery-closeout-command-standard-v2.test.js test/single-ar-debt-open-idempotency.test.js
npm test
```

Result: all targeted tests passed. Full repository `npm test` passed.

## Regression Invariants

- No direct `arLedgers` insert.
- No new AR writer.
- No idempotency bypass.
- No amount/sign/category/ledgerType/account change.
- No Fund refactor.
- No Inventory/Return flow change.
- Already-confirmed retry does not repost AR.
- Zero tolerance remains valid noop.
- Phase242C and Phase243 tests remain passing.

## Remaining Risks

- `arPosting.service.postArLedgerEntry` still returns only the saved document. Phase244 avoids broad changes by deriving created/idempotent evidence in `OrderPaymentAllocationService`, where the pre-check already exists.
- A rare race between allocation pre-check and upsert could still make `created=true` ambiguous, but the idempotency key prevents duplicate business rows. A future deeper writer contract phase can add native upsert created/existing metadata.

## Rollback Plan

Rollback by code version only. Do not edit MongoDB manually and do not delete AR ledgers.

If `AR_PERSISTENCE_VERIFICATION_FAILED` appears:

1. Keep the failed API response.
2. Capture order code, missing idempotency keys, and closeout audit id.
3. Verify canonical writer output.
4. Fix writer evidence or accounting data through approved domain services only.

## Production Verification Checklist

- Debt order creates new AR evidence: `arPosted=true`, `arSatisfied=true`.
- Retry with existing AR: `arAlreadyExists=true`, `arPosted=false`, `arSatisfied=true`.
- No-debt order: `arRequired=false`, `arSatisfied=true`.
- Zero tolerance order: `arNoopValid=true`, `arReasonCode=ZERO_TOLERANCE`.
- Missing AR evidence simulation fails with `AR_PERSISTENCE_VERIFICATION_FAILED`.
- No duplicate AR on retry.
- Debt New reads expected balance from `arLedgers`.
