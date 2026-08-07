# PERF-A5R1 Telemetry Capture Runbook

1. Deploy RC-R1 with `RELEASE_SHA`, `SOURCE_SHA`, `INSTANCE_ID`; keep all optimization flags OFF and concurrency 1.
2. POST `/api/system/performance-measurements/window/start` body `{ "label": "baseline" }`.
3. Execute required workloads: bulk 16/26/60; orders; suggestions; dashboard cache-hit/read-model/fallback separately; report preview/snapshot/export.
4. POST `/api/system/performance-measurements/window/close`.
5. GET `/api/system/performance-measurements/export`; save JSON per instance.
6. Start a new window for each canary flag state. Never merge different release SHA, featureFlags, mode, cacheSource or window ID.
7. Run production debt/duplicate/index audits separately; do not include credentials.
