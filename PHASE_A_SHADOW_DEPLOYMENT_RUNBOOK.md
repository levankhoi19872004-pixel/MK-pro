# PHASE A — SHADOW DEPLOYMENT RUNBOOK

**Release decision:** `READY_FOR_SHADOW_BY_OWNER_OVERRIDE`  
**Prepared at:** 2026-08-05T09:55:12+07:00

## 1. Render configuration

Deploy to the existing single Render Web Service. Do not add a worker or a second service.

Set:

```text
CANONICAL_DELIVERY_FINANCIAL_READ_V1=shadow
CANONICAL_DELIVERY_FINANCIAL_SHADOW_SAMPLE_RATE=1
```

Do not set the mode to `on` in this release.

## 2. Expected behavior

- Web/App responses remain legacy while the canonical resolver computes read-only shadow comparisons.
- GET requests must create zero MongoDB writes.
- Shadow telemetry must contain aggregate counts only; no customer name, phone, address or raw MongoDB document.
- One non-empty list request performs exactly three canonical join queries: allocation, closeout version and returnOrders.

## 3. Smoke checks after deploy

1. Confirm the service starts without module or syntax errors.
2. Open Web delivery list and App delivery list using normal authorized users.
3. Confirm legacy-visible amounts have not changed in `shadow`.
4. Confirm logs show `financialReadMode=shadow`.
5. Confirm `resolverQueryCount=3` for non-empty lists.
6. Confirm no AR, Fund, Stock, ReturnOrder or SalesOrder writes are created by GET requests.
7. Check aggregate mismatch counts for the `B0040961` class without changing that record.

## 4. Monitoring

- Active observation: first 2 hours, review every 15 minutes.
- Extended observation: 24 hours covering a normal delivery/accounting cycle.
- Track request error rate, p95, heap/RSS, resolver query count, legacy fallback count, stale allocation count, return snapshot differences and debt differences.

## 5. Rollback

Set:

```text
CANONICAL_DELIVERY_FINANCIAL_READ_V1=off
```

Redeploy/restart the same Render service. Roll back to the previous known-good release if startup or request behavior remains abnormal. Do not update, delete, backfill or reverse MongoDB data.

## 6. Conditions before `on`

`on` remains blocked until production read-only audit, MongoDB explain, HTTP Web/App parity smoke and direct review of the `B0040961`-class findings are completed.
