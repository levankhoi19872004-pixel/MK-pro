# Phase242C Closeout Canonical Context Production Runbook

## Purpose

Verify `POST /api/new/delivery-today/closeout` after canonical context cutover without replaying production accounting writes from automation.

## Deploy Checklist

- Deploy the Phase242C build.
- Confirm `/api/system/release`.
- Confirm the closeout button still calls `POST /api/new/delivery-today/closeout`.
- Keep Mongo schema and indexes unchanged.
- Keep frontend unchanged.
- Enable query audit only during evidence collection:

```txt
CLOSEOUT_QUERY_AUDIT_ENABLED=true
CLOSEOUT_QUERY_AUDIT_HISTORY_LIMIT=20
CLOSEOUT_QUERY_AUDIT_MAX_EVENTS=300
```

## Smoke Test

1. Login as admin/accountant.
2. Open Delivery Today New.
3. Select one closeout-eligible order.
4. Enter closeout reason.
5. Confirm closeout.
6. Verify success response and row state.
7. Export closeout query audit evidence.

## Small Closeout

- Dataset: 1 order, no return, cash or bank amount.
- Verify:
  - SalesOrder accounting confirmed.
  - orderPaymentAllocation exists.
  - AR rows use expected idempotency keys.
  - Fund row exists only when cash/bank amount > 0.
  - No duplicate ledger on retry.

## Multi-Order Closeout

- Dataset: 10+ selected orders.
- Verify:
  - Query count does not grow linearly for context preload/idempotency lookups.
  - `context.existingArLedgers` and `context.existingFundLedgers` appear in stage attribution.
  - No per-order AR/Fund idempotency read storm.

## Closeout With Return Orders

- Dataset: at least one confirmed return order with valid inventory impact.
- Verify:
  - Return SSoT is `returnOrders`.
  - Return inventory guard passes only when latest DB row has posted impact.
  - No stock impact is created by closeout itself.
  - AR return amount matches canonical allocation behavior.

## Closeout With Adjustment/Reward

- Dataset: order with reward/allowance/debt offset.
- Verify:
  - Reward amount is deducted from debt.
  - AR reward allowance row is present when amount > 0.
  - Debt reconcile does not create a duplicate adjustment.

## Retry Test

1. Retry the same closeout request or resubmit the same selection quickly.
2. Verify:
   - Response is idempotent or duplicate-suppressed.
   - No extra SalesOrder patch for already-confirmed orders.
   - No duplicate AR/Fund/orderPaymentAllocation rows.

## AR Verification

- Query by allocation idempotency keys.
- Confirm:
  - `account = AR`.
  - `accountingConfirmed = true`.
  - `accountingStatus = confirmed`.
  - Amount/sign/category/ledgerType unchanged from canonical writer.

## Fund Verification

- Query by `FUND:OPA:{allocationIdempotencyKey}:cash|bank`.
- Confirm:
  - At most one fund ledger per idempotency key.
  - Cash/bank semantics match payment source.

## Inventory Verification

- Confirm closeout did not use `inventorySnapshots`.
- Confirm return stock had already been posted by return lifecycle before closeout.
- Confirm no duplicate stock transaction was created by closeout.

## ReturnOrder Verification

- Confirm return orders read from `returnOrders`.
- Confirm stale frontend/order embedded return data does not bypass latest DB return guard.

## Query Budget Verification

Export each audit run:

```txt
GET /api/system/closeout-query-audit/:auditId/export
GET /api/system/closeout-query-audit/:auditId/export?format=md
```

Required checks:

| Metric | Target |
| --- | ---: |
| Validator DB query count | 0 |
| Per-order AR/Fund idempotency lookup | 0 after preload |
| Total DB operations | <= 30 target |
| Recommended total | <= 20 when feasible |
| Endpoint duration | < 5 seconds on equivalent production dataset |

If total DB operations remains above target, classify the remaining operations:

- debt reconcile safety reads,
- SalesOrder patches,
- allocation writes,
- AR/Fund writes,
- audit writes,
- read-model sync enqueue.

Do not hide operations by disabling instrumentation.

## Rollback Trigger

Rollback by code version if any of these occur:

- duplicate AR ledger,
- duplicate Fund ledger,
- wrong closeout amount,
- stale return accepted,
- missing return inventory guard,
- failed transaction leaves partial business state,
- response contract breaks frontend.

## Rollback Steps

1. Stop deploy rollout.
2. Deploy previous known-good code version.
3. Keep generated ledgers intact.
4. Do not manually delete ledger rows.
5. Export query audit and application logs for the failed run.
6. If post-commit read-model sync failed, retry sync idempotently instead of rolling back accounting.

## Evidence Package

Collect:

- exported Phase242B/Phase242C query audit JSON,
- response sample with sensitive data redacted,
- AR/Fund/Return/Inventory verification screenshots or query summaries,
- p50/p95/p99 if enough samples exist,
- slowest operation group,
- transaction duration,
- total operation count.
