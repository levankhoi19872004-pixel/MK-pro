# Phase241 Production Performance Evidence Runbook

Generated: 2026-07-11

## Option A - Passive Observation (Recommended)

1. Deploy the Phase241 build.
2. Confirm the release ID from `/api/system/performance-baseline`.
3. Sign in as an admin and open the System screen.
4. Click `Bat dau quan sat`.
5. Let staff use MK-Pro normally for 30-120 minutes.
6. Click `Dung quan sat`.
7. Export JSON evidence from the observation panel.
8. Review evidence quality, capacity dimensions, request volume, error rate, event-loop p95/p99, and API p95.
9. Use the candidate ranking only to plan Phase242; do not treat local evidence as production capacity.

Safety:

- Observation is passive and does not create synthetic traffic.
- Observation is in-memory only and is lost on process restart.
- No MongoDB collection is written.
- Do not reset global telemetry before starting observation.

## Option B - Controlled Read-only Benchmark

Use only after explicit approval.

```bash
PERF_BASE_URL=<approved URL>
PERF_TARGET_ENV=staging|production
PERF_TOKEN=<manager-or-admin-JWT>
PERF_ALLOW_REMOTE=true
PERF_CONCURRENCY=1,2,5
PERF_REQUESTS_PER_LEVEL=30
PERF_SCENARIO_COOLDOWN_MS=5000
node scripts/performance/api-benchmark.js
```

Token handling:

- Put `PERF_TOKEN` only in the local shell/session secret context.
- Do not commit it.
- Do not paste it into reports or screenshots.
- Do not pass it in URL query strings.

Stop conditions:

- Stop or skip the next scenario if capacity is `critical`.
- Stop if readiness fails.
- Stop if 401/403 returns `BLOCKED_AUTH`.
- Stop if release changes during the run: `BLOCKED_RELEASE_CHANGED`.
- Do not use `POST /api/system/performance-baseline/reset` on production unless `PERF_ALLOW_REMOTE_RESET=true` and a separate explicit approval exists.

How to read server deltas:

- Client latency/RPS describes the benchmark client view.
- Client CPU/RSS/heap describes the benchmark client process only.
- Server capacity must come from `serverBefore`, `serverAfter`, and `serverDelta`.
- Staging evidence must be labeled `MEASURED_STAGING_READ_ONLY`.
- Production evidence must be labeled `MEASURED_PRODUCTION_READ_ONLY`.

