# PHASE244 Closeout AR Persistence Production Runbook

## Purpose

Verify that Delivery Today closeout can only return `outcome=confirmed` when AR obligations are satisfied by created, idempotent-existing, or valid no-op evidence.

## Pre-Deploy Checklist

1. Deploy backend and frontend from the same Phase244 package.
2. Confirm no Mongo schema migration is required.
3. Confirm no new dependency installation is required.
4. Confirm AR SSoT remains `arLedgers`.
5. Confirm Fund SSoT remains `fundLedgers`.
6. Confirm Return SSoT remains `returnOrders`.

## Smoke Test 1: Debt Order Creates New AR

Use a delivered order with positive receivable/debt and no existing allocation AR rows.

Expected API per-order result:

```json
{
  "outcome": "confirmed",
  "accountingConfirmed": true,
  "persistence": {
    "salesOrderUpdated": true,
    "allocationWritten": true,
    "arRequired": true,
    "arSatisfied": true,
    "arPosted": true,
    "arAlreadyExists": false,
    "arReasonCode": "POSTED"
  }
}
```

Expected Mongo:

- SalesOrder accounting confirmed.
- OrderPaymentAllocation exists.
- AR rows exist with allocation idempotency keys.
- No duplicate AR rows for the same idempotency keys.

## Smoke Test 2: Retry With Existing Idempotent AR

Retry the same closeout or use an order where the expected AR idempotency keys already exist.

Expected:

- No duplicate AR rows.
- Per-order `outcome=confirmed` for active closeout, or `already_confirmed` if SalesOrder is already confirmed before writer path.
- If writer path runs and AR exists:
  - `arRequired=true`
  - `arSatisfied=true`
  - `arPosted=false`
  - `arAlreadyExists=true`
  - `arReasonCode=ALREADY_EXISTS`

## Smoke Test 3: No-Debt / No-AR-Intent Order

Use an order whose allocation does not produce AR intents.

Expected:

- `arRequired=false`
- `arSatisfied=true`
- `arNoopValid=true`
- No AR row is created only to satisfy the guard.

## Smoke Test 4: Debt Zero Tolerance

Use an order with final delta inside +/- 1,000.

Expected:

- No tiny AR-DEBT-ADJUSTMENT is created.
- `arRequired=false` for reconcile adjustment if there are no other AR intents.
- `arSatisfied=true`
- `arNoopValid=true`
- `arReasonCode=ZERO_TOLERANCE` when zero tolerance is the noop reason.

## Smoke Test 5: Reward / Return / Debt Adjustment

Use a delivered order with reward, return, or debt adjustment effects.

Expected:

- Expected allocation AR intents are all satisfied.
- Reward maps to `AR-REWARD-ALLOWANCE`.
- Return maps to `AR-RETURN`.
- Debt reconcile creates or skips `AR-DEBT-ADJUSTMENT` with explicit evidence.
- `missingIntents` is empty.

## Smoke Test 6: Simulate Missing AR Evidence

In staging only, simulate an AR writer result that does not return created/existing/noop evidence for a required AR intent.

Expected:

- API returns `ok=false`.
- Error code is `AR_PERSISTENCE_VERIFICATION_FAILED`.
- SalesOrder is not left accounting-confirmed after transaction rollback.
- UI does not receive a confirmed per-order result.

## API Error Contract

Expected failure shape:

```json
{
  "ok": false,
  "success": false,
  "code": "AR_PERSISTENCE_VERIFICATION_FAILED",
  "message": "Khong xac minh duoc ghi nhan cong no sau chot so.",
  "data": {
    "details": {
      "arRequired": true,
      "arSatisfied": false,
      "arReasonCode": "UNKNOWN",
      "missingIdempotencyKeys": []
    }
  }
}
```

## Query Budget Check

The Phase244 guard should not add DB queries.

Verify with closeout query audit:

- Validator DB query count: 0
- AR verification per-order query loop: 0
- Batch AR verification query: 0
- No return to N+1 AR idempotency graph

## Debt New Verification

After a successful closeout:

1. Open Debt New.
2. Search by customer/order.
3. Confirm debt comes from canonical `arLedgers`.
4. Confirm no duplicate amount appears after retry.

## Rollback Check

If a staging missing-evidence simulation fails:

- SalesOrder should remain unconfirmed after rollback.
- Allocation/AR/Fund writes in the same transaction should not remain partially committed.
- Read-model sync should not be queued for failed closeout.

## Rollback Plan

Rollback by deploying the previous known-good package.

Do not:

- manually insert `arLedgers`,
- delete AR rows,
- edit SalesOrder accounting flags by script,
- bypass idempotency keys.

Use domain services only for any production correction.

## Evidence Package

Collect:

- closeout API response,
- order code and customer code,
- `persistence` object,
- AR idempotency keys,
- closeout query audit export,
- Debt New screenshot/query summary,
- no-duplicate AR verification summary.
