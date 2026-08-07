# PERF-A5R1 Rollback Runbook

- Correctness failure: immediately disable affected flag, keep concurrency 1, stop rollout, export current window and logs.
- Report issue: remove only the report code from `PERF_REPORT_DB_PAGINATION_ALLOWLIST`; global flag may remain off.
- Telemetry issue: set `PERF_TELEMETRY_ENABLED=0`; business requests continue.
- Cache rollback: set dashboard flags 0 and restart each instance to clear process-local cache.
- Never delete ledger rows or drop the AR index automatically.
