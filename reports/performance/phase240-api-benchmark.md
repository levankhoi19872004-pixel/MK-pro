# Phase240 API Benchmark

- Generated at: 2026-07-11T00:42:02.250Z
- Evidence status: MEASURED_LOCAL
- Base URL: http://127.0.0.1:61299
- Method: GET
- Production writes: false

| Endpoint | Concurrency | Requests | Success | Failures | RPS | Avg ms | p50 | p95 | p99 | Max | Avg Mongo | Avg JS | Avg queries | Avg bytes | Event loop p95 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
|/api/health/live|1|30|30|0|431.54|2.28|2.04|3.78|4.58|4.58|0|0|0|77|10.23|
|/api/health/live|5|30|30|0|763.14|6.23|4.69|10.19|10.72|10.72|0|0|0|77|10.57|
|/api/health/live|10|30|30|0|1117.46|8.47|6.99|13.34|13.63|13.63|0|0|0|77|9.91|
|/api/health/live|20|30|30|0|1100.5|13.89|14.57|17.82|17.85|17.85|0|0|0|77|0|
|/api/system/status|1|30|30|0|1097.3|0.9|0.8|1.38|1.41|1.41|0|0|0|520|9.96|
|/api/system/status|5|30|30|0|1075.42|4.5|4.02|5.85|6.1|6.1|0|0|0|520|10.36|
|/api/system/status|10|30|30|0|718.15|13.11|15.15|19.04|19.34|19.34|0|0|0|520|17.09|
|/api/system/status|20|30|30|0|1134.3|13.28|12.95|15.67|15.8|15.8|0|0|0|520|13.66|

Production capacity must only be interpreted when the target environment and workload are production-like.
