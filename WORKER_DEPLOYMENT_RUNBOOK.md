# MK-Pro Background Worker Runbook — Phase 07

## 1. Deployment topology

```text
Browser / Mobile
       |
       v
Web process (npm start)
- authentication and validation
- enqueue background_jobs
- status/cancel APIs
- GridFS artifact streaming
       |
       v
MongoDB
- background_jobs (persistent queue + lease)
- background_job_artifacts.files/chunks (GridFS)
- import_sessions / audit_logs / reconciliation_reports
       ^
       |
Worker process (npm run worker:background)
- atomic claim with lease
- bounded concurrency
- child executor per job
- timeout and max-old-space-size
- retry/backoff/dead-letter
```

The web and worker processes must use the same `MONGO_URI` and tenant settings. No shared filesystem is required because import inputs and export artifacts use MongoDB GridFS.

## 2. Required processes

### Web

```bash
npm start
```

### Worker

```bash
npm run worker:background
```

Run exactly one worker service initially. Horizontal scaling is supported because each job is claimed through an atomic MongoDB lease.

## 3. Recommended production values

```dotenv
BACKGROUND_JOB_CONCURRENCY=2
BACKGROUND_JOB_POLL_MS=1000
BACKGROUND_JOB_LEASE_MS=60000
BACKGROUND_JOB_MAX_OLD_SPACE_MB=512
BACKGROUND_JOB_ARTIFACT_TTL_MS=86400000
BACKGROUND_JOB_RETENTION_MS=604800000
EXPORT_JOB_TIMEOUT_MS=600000
IMPORT_COMMIT_JOB_TIMEOUT_MS=900000
RECONCILIATION_JOB_TIMEOUT_MS=1800000
AUTO_RECONCILIATION_JOB=true
```

Do not set concurrency higher than available CPU cores or MongoDB connection capacity. Start at 2 and observe CPU, heap, queue wait time and database latency.

## 4. Job states

```text
pending -> running -> completed
                   -> pending (retry/backoff)
                   -> dead_letter
pending -> cancelled
running export/import_preview -> cancel_requested -> cancelled
```

`import_commit` and `reconciliation` cannot be killed after execution starts because interruption could leave domain operations partially completed. They can only be cancelled before claim.

## 5. Operational APIs

```text
GET  /api/background-jobs/:id
POST /api/background-jobs/:id/cancel
GET  /api/background-jobs/:id/artifact
```

Access is restricted to admin/manager/accountant/warehouse roles and tenant scoped.

## 6. Failure handling

- Worker crash: lease expires and an eligible idempotent job is reclaimed.
- Export/import preview: retry with exponential backoff.
- Import commit/reconciliation: one attempt only; investigate before manual retry.
- Dead-letter: inspect `lastError`, audit log and the related import session/report.
- Artifact cleanup: worker removes expired GridFS files; job metadata expires later through TTL.

## 7. Safe restart

1. Stop accepting deploy traffic or use rolling deploy.
2. Stop worker with `SIGTERM`.
3. Wait for active child executors to exit.
4. Deploy web and worker from the same ZIP/version.
5. Start web, verify DB readiness.
6. Start worker and check queue processing.

A hard-killed worker does not release the lease immediately. The next worker reclaims the job after `BACKGROUND_JOB_LEASE_MS`.

## 8. Rollback

Deploy Phase 06 ZIP and stop the Phase 07 worker process:

```text
MK-pro-phase06-api-query-performance-patched.zip
```

Phase 06 does not read `background_jobs`; queued Phase 07 jobs remain inert. After forward-fixing, redeploy Phase 07 and resume the worker. Do not manually delete import sessions, audit logs, reconciliation reports or ledger data.


## Phase255C scheduler ownership

The background worker always continues its lease-safe `background_jobs` claim loop. It owns periodic schedulers only when all services use:

```env
SCHEDULED_JOB_OWNER=worker
```

With `SCHEDULED_JOB_OWNER=web` or `none`, the worker does not load reconciliation, outbox, integration, or reporting projection scheduler modules. Scheduler ownership does not change job payload, lease, retry, dead-letter, or child executor behavior.
