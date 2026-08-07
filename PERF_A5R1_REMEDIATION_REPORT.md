# PERF-A5R1 Remediation Report

Generated: 2026-08-06T16:21:22.681004+07:00

## Status
- **PASS_WITH_LIMITATIONS**
- Engineering core remediation: PASS E1/E2
- Production performance: PENDING PERF-A6R1

## Fixed
- Telemetry now attaches release/source SHA, stable instance/process IDs, immutable request-start flag snapshot, sample window, operation/cache/read-model/report modes, query/timing and correctness fields.
- Admin window start/close/export endpoints added; records are bounded and scope identity is hashed.
- Report timeout propagates AbortSignal/maxTimeMS and does not release admission until underlying work settles.
- Report pagination uses a per-report allowlist; default empty.
- Batch context replaces per-order history `filter` scans with one reverse index.

## Limitations
- Inventory, Delivery and Return report previews remain JS_MATERIALIZED_BLOCKED; optimized path stays OFF. No false DB-native claim.
- Dashboard cache remains process-local; instance metadata enables separate analysis but not shared invalidation.
- Mongo cancellation, production p95, index apply and correctness E3 remain pending.

## Verification
- Performance regression: 158/158 PASS.
- JavaScript syntax: 1659/1659 PASS.
- Correctness locks preserved from A5 and performance regression.
