# PERF-A5R2 Rollback Runbook

1. Disable optimization flags; keep `PERF_BULK_CONCURRENCY=1`.
2. Telemetry rollback: set `PERF_TELEMETRY_ENABLED=0`; this now stops new measurements without deleting historical records.
3. Deploy parent release SHA `7cc8882d4a802b0aa580cc752b2c10a08936ff86a001f6ddfa4510fc6f584a1e` if application rollback is required.
4. Do not delete ledger rows or drop indexes automatically.
5. Restart each instance to clear process-local telemetry/cache state when operationally approved.
