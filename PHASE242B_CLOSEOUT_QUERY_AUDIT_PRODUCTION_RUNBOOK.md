# Phase242B Closeout Query Audit Production Runbook

## Purpose

Collect real runtime attribution for `POST /api/new/delivery-today/closeout` without running, replaying, or optimizing closeout from Codex.

## Workflow

1. Deploy the Phase242B build.
2. Confirm the deployed release ID from `/api/system/release`.
3. Set environment variable:

   `CLOSEOUT_QUERY_AUDIT_ENABLED=true`

4. Keep the bounded defaults unless there is a clear reason:

   `CLOSEOUT_QUERY_AUDIT_HISTORY_LIMIT=20`  
   `CLOSEOUT_QUERY_AUDIT_MAX_EVENTS=300`

5. Restart/redeploy the service if the platform requires env reload.
6. Confirm audit status with:

   `GET /api/system/closeout-query-audit`

7. Let real users perform normal delivery closeout work.
8. Do not create fake closeouts.
9. Do not use a production token to POST closeout from Codex or automation.
10. Do not replay writer requests.
11. Collect 5 to 10 real closeout runs:

   - small scope,
   - medium scope,
   - large scope.

12. Export each run:

   `GET /api/system/closeout-query-audit/:auditId/export`

13. Optional Markdown export:

   `GET /api/system/closeout-query-audit/:auditId/export?format=md`

14. After evidence is sufficient, set:

   `CLOSEOUT_QUERY_AUDIT_ENABLED=false`

15. Restart/redeploy if env reload is required.
16. Send exported evidence for Phase242C analysis.

## Safety Rules

- Codex must not run production closeout.
- Codex must not use production tokens.
- Codex must not replay accounting writers.
- Phase242B endpoints only view, export, or clear in-memory audit evidence.
- There is no endpoint to run closeout, replay closeout, or benchmark closeout.

## RBAC

- List/detail/export: `admin`, `manager`.
- Clear: `admin`.

## Evidence To Send For Phase242C

For every captured run, export JSON. Markdown is useful for review, but JSON is the source of truth.

Phase242C should not start optimization until either:

- controlled fixture attribution has high coverage, or
- 5 to 10 real production closeout exports are available.
