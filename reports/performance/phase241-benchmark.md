# Phase241 API Benchmark

- Generated at: 2026-07-11T01:10:50.727Z
- Evidence status: MEASURED_LOCAL
- Target environment: local
- Base URL: http://127.0.0.1:59108
- Method: GET
- Production writes: false

| Endpoint | Concurrency | Requests | Success | Failures | RPS | Avg ms | p95 | Avg Mongo header | Avg JS header | Avg bytes | Client loop p95 | Server API p95 after | Status |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
|/api/health/live|1|50|50|0|340.44|2.9|4.4|0|0|77|10.9||MEASURED|
|/api/health/live|5|50|50|0|412.71|11.78|17.7|0|0|77|14.65||MEASURED|
|/api/health/live|10|50|50|0|465.45|20.68|31.94|0|0|77|21.92||MEASURED|
|/api/health/live|20|50|50|0|479.91|36.86|54.15|0|0|77|40.86||MEASURED|
|/api/system/status|1|50|50|0|662.85|1.49|3.11|0|0|520|10.81||MEASURED|
|/api/system/status|5|50|50|0|547.03|8.97|12.82|0|0|520|13.86||MEASURED|
|/api/system/status|10|50|50|0|1333.79|7.24|9.3|0|0|521|12.68||MEASURED|
|/api/system/status|20|50|50|0|1373.72|12.97|18.98|0|0|521|9.63||MEASURED|

Client CPU/memory/event-loop metrics describe the benchmark client process only unless the run is explicitly in-process.
Server capacity must be read from serverBefore/serverAfter/serverDelta only.
