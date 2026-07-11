# PHASE240 - Production Performance Telemetry & Capacity Baseline Report

Generated: 2026-07-11

## A. Scope Summary

Implemented Phase240 runtime performance telemetry and capacity baseline support for MK-Pro.

The requested source artifact name `MK-pro-phase239-legacy-facade-retirement-canonical-cutover-fixed(2).zip` was not present in the workspace. The available artifact was `MK-pro-phase239-legacy-facade-retirement-canonical-cutover-fixed.zip`; implementation was applied to the current workspace source tree.

## B. Impact Inventory

| Area | Files |
|---|---|
| Runtime telemetry owner | `src/observability/performanceTelemetry.js` |
| Express lifecycle integration | `src/app.js` |
| Admin APIs | `src/routes/systemRoutes.js`, `src/controllers/systemController.js`, `src/services/operationsService.js` |
| Config/env | `src/config/app.config.js`, `.env.example`, `.env.production.example` |
| API monitor hardening | `src/middlewares/apiMonitor.middleware.js` |
| Admin UI | `public/fragments/index/07-index-body.html`, `public/js/app/09-system.js`, `public/js/app/state/00c-admin-system-state.js`, `public/js/bootstrap/02-delivery-system.js` |
| Benchmark/export tooling | `scripts/performance/api-benchmark.js`, `scripts/benchmark-phase240-capacity.js`, `scripts/export-performance-baseline.js` |
| Docs/tests | `docs/openapi.json`, `test/phase240-performance-telemetry.test.js`, `test/fixtures/index-page/phase79-assembled.sha256` |
| Evidence artifacts | `reports/performance/phase240-*.json`, `reports/performance/phase240-*.md`, `reports/performance/phase240-npm-test.log` |

## C. Root Cause

Before Phase240, MK-Pro had request context, request logging, health endpoints, and API monitor timing, but no single bounded runtime owner for process memory, CPU delta, event-loop delay, active requests, response bytes, rolling error windows, or capacity status. Existing API monitor query labels could also derive from raw Mongo filter/pipeline payloads, which was too noisy and could expose sensitive values.

## D. Production-grade Option A

Implemented a process-local telemetry owner with bounded samples, lifecycle middleware, protected admin APIs, benchmark tooling, and admin UI visibility.

This option is production-safe because it:

- Does not write MongoDB collections.
- Does not change business SSoT or ledger posting boundaries.
- Does not call `global.gc()`.
- Does not alter business API response contracts.
- Uses bounded in-memory samples and rolling windows.
- Uses role protection for admin visibility/reset.
- Uses read-only benchmark defaults and rejects write-like endpoints.

## E. Lower-effort Option B

Only extending the existing API monitor would have been faster, but would not cover process memory, CPU delta, event-loop delay, capacity status, startup baseline, or safe capacity evidence exports. It also would have left telemetry ownership split across unrelated modules.

## F. Runtime Lifecycle

Telemetry is mounted after request context middleware and before API routes. It tracks request start, finish, close/abort, status class, response bytes, and active/max-active request counts. Timers are singleton/idempotent and use `unref()`.

## G. Metrics Captured

- Process RSS, heap total, heap used, external memory, array buffers.
- Memory high-water and delta since startup/reset.
- CPU user/system delta.
- Event-loop mean, p50, p95, p99, max.
- Active requests, completed requests, failed requests, aborted requests.
- Status class counts.
- Response bytes average/max.
- Rolling 1 minute and 5 minute throughput/error rates.
- Capacity status: `healthy`, `watch`, `critical`, or `unknown`.

## H. Privacy and Contract Safety

API monitor query tracing now uses query shape labels only. It records model/method, field names, flags, and aggregate stage names. Raw filter values and raw pipelines are not stored in slow query labels.

Existing API monitor headers and response `perf` metadata were kept for backward compatibility.

## I. RBAC

- `GET /api/system/performance-baseline`: `admin`, `manager`
- `POST /api/system/performance-baseline/reset`: `admin`

The endpoints are not public and do not query business collections.

## J. Benchmark Safety

Benchmark tooling defaults to GET/read-only operational endpoints. It rejects write-like paths such as reset, confirm, commit, delete, update, create, repair, reconciliation run, and closeout. Remote concurrency is capped unless explicitly overridden.

## K. Local Evidence

Local in-process benchmark evidence was generated, not production evidence.

Artifact: `reports/performance/phase240-api-benchmark.md`

Summary:

| Endpoint | Max concurrency | Worst p95 ms | Failures |
|---|---:|---:|---:|
| `/api/health/live` | 20 | 17.82 | 0 |
| `/api/system/status` | 20 | 19.04 | 0 |

Evidence status: `MEASURED_LOCAL`.

## L. Production Capacity Status

Production capacity is blocked from conclusion because no production or staging workload was available in this environment.

Artifact: `reports/performance/phase240-baseline.md`

Evidence status: `BLOCKED_NO_RUNTIME_WORKLOAD`.

Do not use the local benchmark to claim production capacity.

## M. Files Not Changed

No MongoDB schema was changed. No package dependency was added. No business ledger writer was changed. No Inventory/AR/Fund/Return SSoT rule was changed.

## N. Diff Summary

`git diff --stat` before packaging:

```text
.env.example                                      |  11 ++
.env.production.example                           |  11 ++
docs/openapi.json                                 |  80 +++++++++++++++
package.json                                      |   2 +
public/fragments/index/07-index-body.html         |  24 +++++
public/js/app/09-system.js                        |  58 +++++++++++
public/js/app/state/00c-admin-system-state.js     |  10 ++
public/js/bootstrap/02-delivery-system.js         |   5 +-
scripts/performance/api-benchmark.js              |  72 ++++++++++++--
src/app.js                                        |   5 +
src/config/app.config.js                          |  27 +++++
src/controllers/systemController.js               |  18 ++++
src/middlewares/apiMonitor.middleware.js          | 116 +++++++++++++++++-----
src/routes/systemRoutes.js                        |   2 +
src/services/operationsService.js                 |  61 ++++++++++++
test/fixtures/index-page/phase79-assembled.sha256 |   2 +-
```

## O. Verification

Passed:

- `node --check src/observability/performanceTelemetry.js`
- `node --check src/middlewares/apiMonitor.middleware.js`
- `node --check src/config/app.config.js`
- `node --check scripts/performance/api-benchmark.js`
- `node --check scripts/benchmark-phase240-capacity.js`
- `node --check scripts/export-performance-baseline.js`
- `node --test test/phase240-performance-telemetry.test.js`
- `node --test test/operations-*.test.js`
- `node --test test/runtime-flow-telemetry-static.test.js`
- `node --test test/global-api-security-boundary-static.test.js`
- `node --test test/web-operational-read-rbac-static.test.js`
- `npm run check:syntax`
- `npm run check:source-size`
- `npm run check:source-bundles`
- `npm run docs:check`
- `node --test test/docs-generate.test.js`
- `node --test test/phase79-production-strangler.test.js`
- `npm test`
- `git diff --check`
- `node scripts/export-performance-baseline.js`
- `node scripts/benchmark-phase240-capacity.js` with local read-only endpoints

## P. Risks

- Process-local telemetry does not aggregate across multiple app instances.
- Mongo driver pool wait metrics are not available through stable public APIs here, so the endpoint reports that limitation instead of fabricating data.
- Production capacity remains unknown until staging/production read-only workload evidence is collected.
- Reset endpoint clears telemetry baselines and is admin-only, but operational teams should avoid resetting during active incident analysis unless intended.

## Q. Recommended Next Phase

Phase241 should be based on real production/staging evidence. Recommended next step: run the read-only benchmark against staging/production with approved endpoints and use the new baseline API to compare memory, event-loop, active requests, and p95 under realistic traffic.

