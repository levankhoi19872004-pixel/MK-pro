# PERF-A5R2 Telemetry Capture Runbook

Set valid `RELEASE_ID`, `RELEASE_SHA`, `SOURCE_SHA`, and `PERF_TELEMETRY_ENABLED=true`. Start one baseline window with optimization flags OFF, execute the required workload set, close/export, then start a separate canary window after changing only the approved flag. Never overlap windows. Collect per-instance exports and merge only when release SHA, flag snapshot and operation mode match.
