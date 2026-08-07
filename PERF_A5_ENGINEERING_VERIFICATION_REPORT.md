# PERF-A5 Engineering Verification Report

Generated: `2026-08-06T13:54:44+07:00`

## Final status

- **ENGINEERING_VERIFIED**
- **PRODUCTION_PERFORMANCE_PENDING**
- `FULLY_COMPLETE` is not used.

## Critical finding fixed during A5

A5 found a real P0 regression introduced by the performance program: `DeliveryAdjustmentBatchContextService` read `ArLedger` directly. This violated the canonical AR read boundary even though A2A parity tests passed. The release candidate now routes the read through `arLedgerRead.service`, preserves the 1,000-row fail-closed guard, and passes both global AR access audits and A2A regression.

## Test summary

- Performance RED/GREEN regression: **153/153 PASS**, including the three PERF-A5 telemetry-contract tests.
- JavaScript syntax: **1.656/1.656 PASS**.
- Individual test-file audit: **481 PASS**, **150 NOT_RUN_ENVIRONMENT**, **37 baseline-unrelated failures**, **0 new regression**.
- Static/contract file audit after P0 fix: **267 PASS**, **13 NOT_RUN_ENVIRONMENT**, **15 baseline-unrelated failures**, **0 new regression**.
- Lock-registry check: PASS.
- Source-bundle and artifact-clean scripts: NOT_RUN_ENVIRONMENT because `terser`/`jszip` are not present in the uploaded ZIP.
- Aggregate `npm test`: timed out in the tool environment; every test file was instead executed independently and classified.

## Correctness lock

All required engineering locks PASS: debt deviation 0; application duplicate ledger 0; return parity 100%; allocation/current-version parity 100%; zero-value semantics; negative-money guard; Debt Zero Tolerance; scope isolation; transaction failure isolation; idempotent retry. Production duplicate-ledger and debt-zero claims remain pending the production index/data audit.

## Source integrity

- Baseline file count: 2135
- Final release-candidate file count: 2.284
- Final hash-based diff versus A1A baseline: 149 added, 31 modified, 0 removed.
- No `.env`, private key, temporary editor file, `node_modules`, or customer database dump was found.
- URI matches were reviewed and are placeholders/redaction fixtures, not credentials.
- Seven source-size and eight path-portability diagnostics reproduce identically on the A1A baseline and are not new A5 regressions.

## Telemetry available for PERF-A6

`apiMonitor.middleware.js` already captures per-route p50/p95/p99, Mongo/JS time, logical DB query count, rows, response size, status counts, slowest query and max observed concurrency. `performanceTelemetry.js` captures memory, event-loop, CPU, active requests, 5xx/error windows and high-water marks. `PERF_A5_A6_TELEMETRY_CONTRACT.json` maps these fields to every hot endpoint. Metrics are process-local and must be aggregated or captured per instance during A6.

## Deferred E3

1. Mongo `explain("executionStats")`, physical query counts and production index stats.
2. Apply/verify `uniq_arledger_idempotency_key_v1` after a clean duplicate audit.
3. Production/canary p95 and 5xx for bulk, orders, suggestions, dashboards and reports.
4. Concurrency 2 then 3 canary, Mongo pool pressure and transaction retry/abort behavior.
5. Normalized suggestions backfill/index coverage and fallback rate.
6. Dashboard read-model completeness, repair evidence and multi-instance cache invalidation.
7. Report snapshot rebuild, worker capacity, heap and admission behavior.
8. Production debt deviation 0 and duplicate ledger 0 audit.

## Safe release defaults

All performance behavior flags remain OFF. `PERF_BULK_CONCURRENCY=1`; unique index auto-apply remains false; telemetry remains enabled.
