# PHASE243 Closeout Result Contract Production Runbook

## Purpose

Use this runbook to verify that Delivery Today closeout cannot report false success after Phase243.

## Pre-Deploy Checklist

1. Deploy backend and frontend from the same source package.
2. Confirm no schema migration is required.
3. Confirm no new dependency installation is required.
4. Confirm `inventories`, `arLedgers`, `fundLedgers`, and `returnOrders` remain the source of truth.

## Smoke Test 1: Rejected Order Must Not Look Closed

Use an order that is not completed for delivery, such as the previous production example pattern `B0039299` if it still matches.

Steps:
1. Open Delivery Today.
2. Select the order.
3. Try closeout with a reason.
4. Inspect API response for `POST /api/new/delivery-today/closeout`.

Expected:
- HTTP status is 409 for rejected all-order requests.
- Response has `ok=false`.
- Response has `status=rejected`.
- Per-order result has `outcome=rejected`.
- Per-order result has `reasonCode=DELIVERY_NOT_COMPLETED` or another explicit rejection code.
- UI does not show the row as closed.
- Refresh/reload keeps the row not closed.
- No new `arLedgers` are required or expected for the rejected row.

## Smoke Test 2: Valid Completed Order Closes And Persists

Use a completed delivery order that is not already accounting-confirmed.

Steps:
1. Open Delivery Today.
2. Select only the valid completed order.
3. Submit closeout with a reason.
4. Inspect API response.
5. Refresh Delivery Today.
6. Verify Mongo state.

Expected API:
- `ok=true`
- `status=confirmed` or `partial`
- Per-order `outcome=confirmed`
- Per-order `accountingConfirmed=true`
- Per-order `persistence.salesOrderUpdated=true`
- Per-order `persistence.allocationWritten=true`

Expected Mongo:
- sales order has `accountingConfirmed=true`
- sales order has `accountingStatus=confirmed`
- payment allocation exists for the closeout
- AR/fund ledgers match allocation needs

Expected UI:
- UI may patch the row immediately.
- UI then reloads canonical backend state.
- After reload, the row remains closed.

## Smoke Test 3: Already Confirmed Order Is Idempotent

Use an already accounting-confirmed order.

Expected:
- Per-order `outcome=already_confirmed`
- Per-order `accountingConfirmed=true`
- If all selected orders are already confirmed, response `status=idempotent`
- UI can show already closed only because backend says so per order.

## Smoke Test 4: Mixed Selection

Select one valid completed order and one rejected order.

Expected:
- Response `ok=true`
- Response `status=partial`
- `confirmedOrders > 0`
- `rejectedOrders > 0`
- Only rows with `outcome=confirmed` or `outcome=already_confirmed` and `accountingConfirmed=true` are patched closed.
- Rejected rows remain not closed after canonical reload.

## API Contract Reference

Per-order result:

```json
{
  "orderId": "SO-ID",
  "orderCode": "Bxxxxxxx",
  "outcome": "confirmed | already_confirmed | rejected | failed",
  "reasonCode": "DELIVERY_NOT_COMPLETED",
  "accountingConfirmed": false,
  "persistence": {
    "salesOrderUpdated": false,
    "allocationWritten": false,
    "arPosted": false,
    "fundPosted": false
  }
}
```

Top-level result:

```json
{
  "ok": false,
  "status": "rejected",
  "closedOrders": 0,
  "alreadyConfirmedOrders": 0,
  "rejectedOrders": 1,
  "failedOrders": 0,
  "results": []
}
```

## Rollback Plan

If unexpected production behavior appears:
1. Revert the Phase243 source package.
2. Redeploy the previous Phase242C build.
3. Re-test closeout with a completed order and rejected order.
4. Keep the Phase243 failing API payload and Mongo snapshots for analysis.

Do not repair by writing `arLedgers` directly. Accounting/fund ledgers must remain inside domain services.

## Monitoring Notes

Watch for:
- Spike in `DELIVERY_CLOSEOUT_REJECTED`
- `reasonCode=DELIVERY_NOT_COMPLETED`
- `PERSISTENCE_VERIFICATION_FAILED`
- User reports where row is disabled because `closeoutEligibilityCode` is not `ELIGIBLE`

These are expected to expose previously hidden false-success cases.
