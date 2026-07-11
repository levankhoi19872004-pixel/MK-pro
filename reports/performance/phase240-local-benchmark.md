# Phase240 API Benchmark

- Generated at: 2026-07-11T00:39:54.835Z
- Evidence status: MEASURED_LOCAL
- Base URL: http://127.0.0.1:64501
- Method: GET
- Production writes: false

| Endpoint | Concurrency | Requests | Success | Failures | RPS | Avg ms | p50 | p95 | p99 | Max | Avg Mongo | Avg JS | Avg queries | Avg bytes | Event loop p95 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
|/api/health/live|1|30|30|0|596.14|1.66|1.33|3.37|3.9|3.9|0|0|0|77|10.2|
|/api/health/live|5|30|30|0|1278.85|3.75|3.18|5.95|6.28|6.28|0|0|0|77|10.43|
|/api/health/live|10|30|30|0|1473.51|6.38|5.76|9|9.26|9.26|0|0|0|77|0|
|/api/health/live|20|30|30|0|1626.27|9.43|9.47|13.22|13.29|13.29|0|0|0|77|0|
|/api/system/status|1|30|30|0|1602.18|0.62|0.61|0.84|0.87|0.87|0|0|0|520|0|
|/api/system/status|5|30|30|0|1389.36|3.52|3.38|5.72|5.77|5.77|0|0|0|520|11.43|
|/api/system/status|10|30|30|0|1428.88|6.69|6.54|9.72|10.11|10.11|0|0|0|520|0|
|/api/system/status|20|30|30|0|1884.26|7.78|7.36|9.17|9.23|9.23|0|0|0|520|0|

Production capacity must only be interpreted when the target environment and workload are production-like.
