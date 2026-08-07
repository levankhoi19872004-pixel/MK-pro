# PERF-A5 Rollback Runbook

## Release status

- Engineering state: **ENGINEERING_VERIFIED**
- Production performance: **PENDING PERF-A6**
- No performance flag is enabled by default.

## Immediate rollback order

1. Set `PERF_BULK_CONCURRENCY=1` and `PERF_BULK_TRANSIENT_RETRY_LIMIT=0` if transaction pressure or duplicate-key noise appears.
2. Set `PERF_REPORT_CENTER_SNAPSHOT_V1=0` and `PERF_REPORT_DB_PAGINATION_V1=0` if Report Center parity, worker progress, or export artifact delivery is abnormal.
3. Set `PERF_DASHBOARD_CACHE_V2=0` and `PERF_DASHBOARD_READ_MODEL_V2=0` if dashboard freshness/completeness differs. Restart web instances to clear process-local cache.
4. Set `PERF_SUGGESTIONS_SEARCH_V1=0` if relevance/fallback rate/scope telemetry is abnormal.
5. Set `PERF_DELIVERY_CANONICAL_FILTER_V1=0` if order IDs, pagination, financial state, or legacy fallback parity differs.
6. Set `PERF_BULK_BATCH_CONTEXT_V1=0` to return bulk commit to the legacy initial-read path.

## Database unique index

- `uniq_arledger_idempotency_key_v1` is **not auto-applied**.
- Do not drop a production unique index automatically. Any rollback requires approved duplicate audit, incident evidence, and a written data-safety decision.
- Application idempotency guard remains useful even when all performance flags are OFF.

## Stop conditions during PERF-A6 canary

Rollback the latest enabled flag when any condition occurs:

- debt deviation is not 0;
- duplicate ledger count is not 0;
- return/allocation/current-version parity is below 100%;
- 5xx rate increases against control;
- p95 exceeds the control or contract without an explained transient event;
- Mongo pool saturation, transaction abort/retry spikes, stale dashboard after confirmed mutation, scope leakage, missing legacy orders, report truncation, or worker backlog appears.

## Verification after rollback

- Re-run the affected endpoint with the same scope and fixture/control request.
- Confirm status/error ordering and financial snapshot.
- Confirm API monitor p95, DB query count, rows, 5xx, and active concurrency return to control range.
- Preserve logs and telemetry; do not erase evidence.
