# PHASE241 - Production Runtime Evidence, Telemetry Hardening Report

Generated: 2026-07-11

## A. Executive Summary

Phase241 hardens Phase240 telemetry correctness, separates benchmark client metrics from MK-Pro server metrics, adds passive production observation sessions, introduces an approved benchmark endpoint registry, and creates candidate ranking artifacts without optimizing any business module.

Production/staging evidence is still blocked in this workspace because no production/staging URL, token, or approved live workload was provided.

## B. Phase240 Audit Result

| Component | Phase240 responsibility | Issue | Phase241 change |
|---|---|---|---|
| Performance telemetry | Process/request metric | sample timer and log timer both called `sampleNow()` | single canonical sample scheduler |
| API monitor | Route/Mongo metric | no overall API p95 summary for capacity | added overall/worst route p95/p99 summary |
| Operations service | Aggregate API | baseline had no release identity and capacity did not include API p95 | baseline includes release and API-aware capacity |
| Benchmark client | Synthetic GET load | remote CPU/heap/RSS described client but looked like server capacity | explicit `clientMetrics`, `serverBefore`, `serverAfter`, `serverDelta` |
| Evidence exporter | Static process snapshot | no Phase241 candidate artifact | added blocked candidate artifact when no production evidence exists |
| System UI | Display baseline | no passive observation workflow | added observation start/stop/status/export panel |

## C. Confirmed Telemetry Correctness Issues

Confirmed and fixed:

- Duplicate sampling from `sampleTimer` and `logTimer`.
- Event-loop histogram could be reset twice near the same interval.
- Read snapshots could create a sample when `lastSample` was missing.
- Rolling window used per-request event objects and O(n) filter/shift.
- `PERF_P95_WARN_MS` was configured but not used in capacity status.
- Benchmark response body used full buffering.
- Remote environment could be misclassified as production.

## D. Sampling Scheduler Before/After

Before:

```text
sample timer -> sampleNow()
log timer    -> sampleNow()
```

After:

```text
sample timer -> runSampleCycle()
             -> sampleNow()
             -> update history/listeners
             -> maybe log latest sample
```

Each sample increments `sampleSequence` exactly once. Log payloads include `sampleGeneratedAt`, `sampleAgeMs`, and `sampleSequence`. `snapshot()` is read-only and does not reset the event-loop histogram.

## E. Rolling Bucket Design

Runtime request windows now use 60 fixed buckets, default 5 seconds per bucket. Each bucket stores aggregate request/error/status/byte counters only. Recording a request updates one bucket. Snapshot reads scan at most 60 buckets.

Evidence: MEASURED by `test/phase241-performance-hardening.test.js`.

## F. Capacity Evaluator

Added `src/observability/capacityEvaluator.js`.

Used thresholds:

- `PERF_MEMORY_LIMIT_MB`
- `PERF_HEAP_WARN_RATIO`
- `PERF_EVENT_LOOP_WARN_MS`
- `PERF_EVENT_LOOP_CRITICAL_MS`
- `PERF_P95_WARN_MS`
- `PERF_ERROR_RATE_WARN`
- `PERF_ACTIVE_REQUEST_WARN`
- `PERF_MIN_API_SAMPLES`
- `PERF_MIN_ERROR_SAMPLES`

Capacity now returns dimensions: memory, eventLoop, requests, apiLatency, errors. Missing memory limit keeps memory dimension `unknown`.

## G. CPU Metric Semantics

Telemetry now exposes:

- `processCpuCoreRatio`: process CPU time divided by wall time.
- `hostCpuCapacityRatio`: `processCpuCoreRatio / cpuCount`.
- `cpuUtilizationRatio`: retained as a deprecated compatibility alias for `hostCpuCapacityRatio`.

## H. Observation Session Architecture

Added in-memory passive observation sessions:

- `POST /api/system/performance-observation/start` - admin
- `GET /api/system/performance-observation` - admin, manager
- `POST /api/system/performance-observation/stop` - admin
- `GET /api/system/performance-observation/export` - admin, manager

Observation stores bounded samples and route deltas. It does not reset telemetry and does not write MongoDB.

## I. Benchmark Endpoint Registry

Added `config/performance-benchmark-endpoints.js`.

Default approved endpoints:

- `/api/health/live`
- `/api/health/ready`
- `/api/system/status`
- `/api/system/performance-baseline`

Custom endpoints require both `PERF_ALLOW_CUSTOM_ENDPOINTS=true` and `PERF_APPROVED_ENDPOINTS=<explicit paths>`.

## J. Client/Server Metric Separation

Benchmark output now separates:

- `clientMetrics`: latency, throughput, client CPU/RSS/heap/event-loop.
- `serverBefore`: server baseline before scenario.
- `serverAfter`: server baseline after scenario.
- `serverDelta`: server-side deltas when baseline API is available.

Client CPU/memory is never reported as server capacity.

## K. Environment Classification

Remote targets require `PERF_TARGET_ENV=staging|production`. Localhost and in-process runs are `local`. Remote without classification is refused and reported as `REMOTE_UNCLASSIFIED`.

## L. Response Streaming Safety

Benchmark response bodies are streamed chunk-by-chunk and only byte counts are accumulated. `PERF_MAX_RESPONSE_BYTES` aborts oversized responses with `RESPONSE_TOO_LARGE`.

## M. Security and Redaction

Evidence does not export JWT, cookie, Authorization, Mongo URI, request body, raw query values, customer name, phone number, or order code. Benchmark token comes only from `PERF_TOKEN` and is redacted from errors.

## N. Telemetry Overhead Benchmark

Artifact: `reports/performance/phase241-telemetry-overhead.md`

Evidence: `LOCAL_FIXTURE_ONLY`.

Warnings observed in local fixture:

- `/api/health/live` concurrency 20: p95 delta 3.8ms, ratio 0.1946.
- `/api/system/status` concurrency 10: p95 delta 16.87ms, ratio 2.0776.

This is noisy local in-process evidence and not production capacity evidence.

## O. Local Evidence

Artifact: `reports/performance/phase241-benchmark.md`

Evidence: `MEASURED_LOCAL`.

Worst local p95:

- `/api/health/live` c=20: 54.15ms.
- `/api/system/status` c=20: 18.98ms.

## P. Staging Evidence

Status: `BLOCKED`.

Reason: no staging URL/token/workload was provided.

## Q. Production Evidence

Status: `BLOCKED`.

Reason: no production URL/token/approval/workload was provided.

## R. Evidence Quality

- Local benchmark: `MEASURED_LOCAL`, not valid for production capacity.
- Overhead benchmark: `LOCAL_FIXTURE_ONLY`.
- Observation: `BLOCKED_NO_RUNTIME_WORKLOAD`.
- Candidate ranking: `BLOCKED_NO_PRODUCTION_EVIDENCE`.

## S. Candidate Ranking

Artifacts:

- `reports/performance/phase241-optimization-candidates.json`
- `reports/performance/phase241-optimization-candidates.md`

Status: `BLOCKED_NO_PRODUCTION_EVIDENCE`.

No Phase242 candidate is selected from local health/status endpoints.

## T. Files Changed

Key files:

- `src/observability/performanceTelemetry.js`
- `src/observability/capacityEvaluator.js`
- `src/observability/performanceObservation.js`
- `src/middlewares/apiMonitor.middleware.js`
- `src/services/operationsService.js`
- `src/controllers/systemController.js`
- `src/routes/systemRoutes.js`
- `scripts/performance/api-benchmark.js`
- `scripts/benchmark-phase241-telemetry-overhead.js`
- `scripts/export-phase241-candidates.js`
- `config/performance-benchmark-endpoints.js`
- `public/fragments/index/07-index-body.html`
- `public/js/app/09-system.js`
- `public/js/app/state/00c-admin-system-state.js`
- `public/js/bootstrap/02-delivery-system.js`
- `test/phase241-performance-hardening.test.js`

## U. Files Explicitly Not Changed

No business writer, MongoDB schema, MongoDB index, AR/Fund/Inventory/Return posting, closeout, debt reconcile, import commit, promotion calculation, SSE/Excel formula, or legacy retirement was changed.

## V. Tests and Commands

Passed targeted:

- `node --test test/phase240-performance-telemetry.test.js`
- `node --test test/phase241-performance-hardening.test.js`
- `node --test test/operations-*.test.js`
- `node --test test/runtime-flow-telemetry-static.test.js`
- `node --test test/global-api-security-boundary-static.test.js`
- `node --test test/web-operational-read-rbac-static.test.js`
- `npm run check:syntax`
- `npm run check:source-size`
- `npm run check:source-bundles`
- `npm run docs:check`
- `git diff --check`

`npm test` passed; log: `reports/performance/phase241-npm-test.log`.

## W. Known Limitations

- Observation sessions are in-memory and lost on process restart.
- Server baseline before/after needs manager/admin token on remote targets.
- Local in-process benchmark combines client and server process by design.
- Mongo pool wait metrics are still not available through a stable wired driver event path.

## X. Rollback Plan

Code-only rollback:

1. Remove observation routes/controllers/UI.
2. Restore Phase240 benchmark script.
3. Restore Phase240 scheduler if needed.
4. Keep MongoDB untouched.
5. No data migration, no repair, no index rollback.

## Y. Recommendation for Phase242

Run passive production or staging observation first. Only after `MEASURED_STAGING_READ_ONLY` or `MEASURED_PRODUCTION_READ_ONLY` evidence exists, rank Phase242 candidates by call volume, p95/p99, Mongo/JS ratio, query count, response bytes, error rate, and business risk.
