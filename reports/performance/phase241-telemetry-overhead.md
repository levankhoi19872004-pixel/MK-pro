# Phase241 Telemetry Overhead Benchmark

- Generated at: 2026-07-11T01:11:28.534Z
- Evidence: LOCAL_FIXTURE_ONLY

| Endpoint | Concurrency | p95 off | p95 on | Delta ms | Delta ratio | RPS off | RPS on | Warning |
|---|---:|---:|---:|---:|---:|---:|---:|---|
|/api/health/live|1|3.24|2.59|-0.65|-0.2006|554.39|761.76||
|/api/health/live|5|10.43|9.33|-1.1|-0.1055|1146.99|1021.69||
|/api/health/live|10|8.5|8.7|0.2|0.0235|1534.24|1565.32||
|/api/health/live|20|19.53|23.33|3.8|0.1946|1121.54|1205.46|OVERHEAD_WARN|
|/api/system/status|1|1.09|1.36|0.27|0.2477|1616.32|1144.64||
|/api/system/status|5|5.44|2.87|-2.57|-0.4724|1729.82|2020.17||
|/api/system/status|10|8.12|24.99|16.87|2.0776|1758.45|560.72|OVERHEAD_WARN|
|/api/system/status|20|17.65|15.9|-1.75|-0.0992|1509.64|1555.09||

This local fixture compares two in-process runs on the same machine. It is not production capacity evidence.
