# PHASE255C — Scheduler Ownership and Readiness Governance Report

## 1. Executive result

Phase255C replaces eager web-process scheduler imports with one explicit ownership contract:

```text
SCHEDULED_JOB_OWNER=none | web | worker
```

Safe defaults are now `owner=none`, all four schedulers disabled, reconciliation startup enqueue disabled, and background-worker readiness advisory only. No AR, Fund, Inventory, Delivery, accounting, reconciliation writer, queue lease, retry, payload, schema, or index implementation was changed.

## 2. Root cause

Before Phase255C, `src/app.js` imported `reconciliationJob`, `outboxJob`, `integrationJob`, `reportingProjectionJob`, and `registerDefaultOutboxHandlers` at module top level. Web startup always called all four start functions and each module independently re-read environment variables. Reconciliation treated a missing flag as enabled and treated a missing startup flag as run-on-start enabled.

Baseline evidence:

| Metric | Phase255B baseline |
|---|---:|
| Scheduler modules loaded when all flags were unset/false | 4/4 |
| Default outbox handler registry loaded | Yes |
| Default reconciliation enabled | Yes |
| Default reconciliation startup enqueue | Yes |
| Explicit owner contract | None |
| App import module count, local require-cache | 1,910 |

## 3. Ownership design

`src/jobs/scheduledJobOrchestrator.js` owns deterministic load/start/stop decisions. It uses static loader closures and never imports job implementations at module top level.

| Process role | Configured owner | Result |
|---|---|---|
| web | none | No scheduler module loaded; no timer |
| worker | none | No scheduler module loaded; queue worker remains available |
| web | web | Only explicitly enabled jobs load/start |
| worker | worker | Only explicitly enabled jobs load/start; queue claim loop remains unchanged |
| web | worker | Owner mismatch; no load/start |
| worker | web | Owner mismatch; no load/start |

Start order is `outbox → integration → reportingProjection → reconciliation`. Stop order is reversed. Duplicate start and repeated stop are idempotent. Loader/start failures reject process startup and record the failed job.

## 4. Scheduler matrix

| Job | New default | Execution type | Background worker dependency |
|---|---:|---|---|
| Reconciliation | Disabled | Persistent queue producer | Yes — scheduler only calls `JobSubmissionService.submitReconciliation()` |
| Outbox | Disabled | In-process drain timer | No |
| Integration | Disabled | In-process drain timer | No |
| Reporting projection | Disabled | In-process projection timer | No |

Reconciliation idempotency key, schedule bucket, payload, timeout, attempts, and executor implementation were preserved. No fallback direct call to `ReconciliationService` was added.

## 5. Web and worker bootstrap

### Web

`src/app.js` no longer imports job modules or default handlers eagerly. It creates a web-role orchestrator from the validated runtime configuration, starts it only after MongoDB startup steps, writes structured startup evidence, and stops only modules that were actually started.

When Enterprise is enabled, default outbox handlers are registered lazily so the existing manual drain endpoint remains functional without starting the outbox timer.

### Worker

`scripts/background-job-worker.js` now passes the hard-coded role `worker` to the same orchestrator. The existing lease-safe queue claim loop, child executor, retry, dead-letter, cancellation, and concurrency behavior are unchanged. Shutdown order is queue loop, owned schedulers, heartbeat, then MongoDB.

## 6. Readiness and operations evidence

Default HTTP readiness remains independent of batch processing:

```text
READINESS_REQUIRE_BACKGROUND_WORKER=false
```

With the default, a missing worker heartbeat is advisory and does not make `/api/health/ready` fail. When strict readiness is explicitly enabled, at least one healthy worker heartbeat with the same release ID is required. Reconciliation enabled without a same-release worker produces advisory code `RECONCILIATION_EXECUTOR_UNAVAILABLE`; the web process does not execute the writer directly as compensation.

Operational status now includes scheduler ownership, per-job requested/loaded/started/reason data, healthy worker count, and same-release worker count. Web and worker heartbeat metadata includes scheduler owner and started job IDs without secrets or business payloads.

## 7. Before/after measurement

| Metric | Before | Owner none | Web owner example | Worker owner example |
|---|---:|---:|---:|---:|
| Job modules loaded | 4 | 0 | 2 requested/loaded | 2 requested/loaded |
| Timers started | Potentially 1 by default reconciliation | 0 | Explicit jobs only | Explicit jobs only |
| Reconciliation startup timer | Default on | 0 | Only when run-on-start=true | Only when run-on-start=true |
| Outbox handlers loaded | Always | No, unless Enterprise/manual drain requires them | When outbox starts or Enterprise requires manual drain | When outbox starts |
| App import module count, local require-cache | 1,910 | 1,904 | Not used as production memory evidence | Not used as production memory evidence |

These are local CommonJS module-cache measurements, not Render RSS/heap evidence.

## 8. Test evidence

| Command | Result |
|---|---|
| `npm run test:phase255a` | PASS 9/9 |
| `npm run test:phase255a-r1` | PASS 12/12 |
| `npm run test:phase255b` | PASS 8/8 |
| `npm run test:phase255c` | PASS 23/23 |
| `npm run test:release-governance` | PASS 85/85 |
| `npm run check:syntax` | PASS 1,482 JavaScript files |
| `npm run test:artifact-clean` | PASS before final manifest |

Phase255C tests cover safe defaults, enum validation, owner matching/mismatch, selective module loading, deterministic ordering, duplicate protection, stop idempotency, fail-closed startup, reconciliation startup timer, queue submission parity, Enterprise manual outbox parity, require-cache isolation, worker role injection, readiness advisory/strict behavior, heartbeat metadata, state contracts, non-mutating audits, and system status without eager reconciliation import.

## 9. Files changed

### New

- `src/jobs/scheduledJobOrchestrator.js`
- `scripts/audit-scheduler-ownership.js`
- `test/phase255c-scheduler-ownership-readiness-governance.test.js`
- `PHASE255C_SCHEDULER_OWNERSHIP_BASELINE.json`
- `PHASE255C_SCHEDULER_OWNERSHIP_AFTER.json`
- `PHASE255C_INTEGRITY_DIFF.json`
- `PHASE255C_SCHEDULER_OWNERSHIP_READINESS_GOVERNANCE_REPORT.md`

### Modified runtime/bootstrap

- `src/app.js`
- `src/config/app.config.js`
- `src/jobs/reconciliationJob.js`
- `src/jobs/outboxJob.js`
- `src/jobs/integrationJob.js`
- `src/jobs/reportingProjectionJob.js`
- `src/services/outbox/registerDefaultHandlers.js`
- `src/services/operationsService.js`
- `src/services/startupState.js`
- `src/services/systemService.js`
- `scripts/background-job-worker.js`

### Modified release/docs/config templates

- `.env.example`
- `.env.production.example`
- `ENVIRONMENT_VARIABLES.md`
- `DEPLOYMENT_RUNBOOK.md`
- `WORKER_DEPLOYMENT_RUNBOOK.md`
- `package.json`
- `RELEASE_MANIFEST.json` during finalization

No files were deleted.

## 10. Scope not changed

Confirmed unchanged:

```text
AR/Fund/Inventory/Delivery/accounting writers
Reconciliation business calculation
Background-job payload, idempotency, lease, retry and dead-letter
Outbox claim/mark processed/mark failed
Integration business processing
Reporting projection calculation
Database schema and Mongo indexes
Enterprise API/static governance
Optional route registry
Route aliases
Frontend and mobile behavior
```

No production database connection, migration, backfill, repair, or distributed lock collection was used.

## 11. Deployment profiles

- `owner=none`: no scheduler timer.
- `owner=web`: suitable only for one web instance; enable jobs explicitly.
- `owner=worker`: use the same value on web and worker; web loads no scheduler modules and one scheduler-owning worker starts explicitly enabled timers.

Reconciliation remains a queue producer. A background worker is required to execute the persistent `background_jobs` queue.

## 12. Remaining risks

1. Web ownership is not multi-instance leader election and is safe only with one web instance.
2. No distributed scheduler lock was added.
3. Worker heartbeat evidence depends on Mongo operational heartbeat availability.
4. Strict readiness is opt-in; default mode reports worker absence as advisory.
5. Enterprise manual outbox drain intentionally loads the outbox/integration graph when Enterprise is enabled.
6. Adding a separate Render worker can improve isolation but is not required by this phase and has separate cost.
7. Production cadence was not changed; only defaults and ownership were governed.

## 13. Rollback

Rollback is configuration-first: set `SCHEDULED_JOB_OWNER=web`, explicitly enable required job flags, and restart the process. Code rollback is limited to scheduler bootstrap/orchestrator wiring, job config/state wrappers, operations metadata, worker entry wiring, and documentation. No database rollback is required.

## 14. Next phase

The next isolated phase is:

```text
Phase256A — Persistent Route Alias Telemetry
```

No alias was retired in Phase255C.
