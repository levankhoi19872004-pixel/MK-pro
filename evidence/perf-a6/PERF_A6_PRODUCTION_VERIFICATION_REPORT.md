# PERF-A6 Production Telemetry Verification Report

Generated: `2026-08-06T14:08:02+07:00`

## Final decision

**`INSUFFICIENT_SAMPLE`**

The release candidate remains **ENGINEERING_VERIFIED**, but production performance and production correctness are not verified. No optimization flag is approved for enablement from the supplied evidence.

## Input verification

- Release candidate: `MK-pro-performance-release-candidate.zip`
- Release ZIP SHA-256: `c1670933d271d64762c679d3ac81419e92134564b7d8e0ab74edb260ea14b018`
- A5 status: `ENGINEERING_VERIFIED / PRODUCTION_PERFORMANCE_PENDING`
- Static A6 telemetry contract rerun: **3/3 PASS**
- Telemetry source syntax: **PASS**
- Release source was not modified during A6.

## Evidence inventory

### Present

- A5 release manifest and release candidate.
- A5 dependency-free test evidence.
- A5 financial/correctness parity at E1/E2.
- A5 telemetry field contract.
- Historical user-reported baseline totals/ranges.

### Missing

- Log telemetry trước tối ưu có timestamp/release SHA/feature flags/sample count
- Log telemetry sau deploy hoặc canary cho release SHA c1670933d271d64762c679d3ac81419e92134564b7d8e0ab74edb260ea14b018
- Feature-flag state snapshot tại thời điểm từng phép đo
- Index audit/apply/verify output cho uniq_arledger_idempotency_key_v1
- 5xx/error-rate logs baseline và canary
- Production correctness audit: debt deviation, duplicate ledger, missing orders/customers, scope leak
- Dashboard samples được tách riêng cache-hit/read-model/fallback
- Report Center snapshot/preview/export runtime samples

Because these files are missing, p95, 5xx change, physical Mongo query counts, cache-mode results and production correctness cannot be calculated.

## Historical baseline available

| Endpoint/workload | Historical value | Classification |
|---|---:|---|
| Bulk 16 orders | 55.288 s / 252 queries | User-reported single observation |
| Bulk 26 orders | 89.839 s / 413 queries | User-reported single observation |
| Bulk 60 orders | 210.881 s / 986 queries | User-reported single observation; baseline contract FAIL |
| Delivery orders | 2.1–2.7 s | Historical range; not p95 |
| Suggestions | 1.3–1.7 s | Historical range; not p95 |
| Sales-staff dashboard | 2.4–4.0 s | Cache source unspecified |
| Delivery-summary dashboard | 1.2–1.3 s | Cache source unspecified |
| Report Center | No runtime baseline | Missing |

No canary value is available for comparison.

## Endpoint decision

| Endpoint | Production result | Reason |
|---|---|---|
| Bulk commit 16/26/60 | **INSUFFICIENT_SAMPLE** | No canary duration/query/Mongo/JS/5xx/correctness logs |
| Delivery orders | **INSUFFICIENT_SAMPLE** | No canary p95, query count, index/explain or missing-order audit |
| Suggestions | **INSUFFICIENT_SAMPLE** | No canary p95, normalized coverage/index or fallback-rate evidence |
| Sales-staff dashboard | **INSUFFICIENT_SAMPLE** | No separate cache-hit/read-model/fallback samples |
| Delivery-summary dashboard | **INSUFFICIENT_SAMPLE** | No separate cache-hit/read-model/fallback samples |
| Report Center | **INSUFFICIENT_SAMPLE** | No preview/snapshot/export worker runtime evidence |

## Correctness result

Engineering E1/E2 remains PASS: debt deviation 0, application duplicate ledger 0, return/allocation parity 100%, zero/negative/tolerance guards, scope isolation, failure isolation and idempotent retry.

Production correctness remains **NOT VERIFIED**:

- Production debt deviation: unknown.
- Production duplicate ledger: unknown.
- Unique AR idempotency index: not verified.
- Missing orders/customers and staff scope leak: not audited.
- Dashboard read-model freshness: not audited.
- Transaction retry/abort and 5xx behavior: not audited.

No rollback is ordered solely from missing evidence because no confirmed canary failure was supplied. Optimization enablement is blocked. Any correctness failure during telemetry-only or canary rollout requires immediate rollback.

## Feature-flag decision

- `PERF_TELEMETRY_ENABLED`: **KEEP ON**.
- `PERF_BULK_CONCURRENCY`: **KEEP 1**.
- `PERF_BULK_TRANSIENT_RETRY_LIMIT`: **KEEP 1**.
- All behavior optimization flags: **KEEP OFF**.
- `uniq_arledger_idempotency_key_v1`: **PENDING approved duplicate audit/apply/verify; never auto-apply**.
- Concurrency 2/3: **DO NOT ENABLE** at this evidence level.

## Required next capture

1. Deploy or confirm the exact release SHA with telemetry ON and all optimization flags OFF.
2. Export baseline telemetry per application instance, with timestamp, release SHA, flag state and sample count.
3. Capture bulk workloads 16/26/60 with query count, Mongo/JS duration, status, debt deviation and duplicate-ledger audit.
4. Capture read endpoints with p50/p95/p99; separate dashboard cache-hit, read-model and fallback.
5. Run duplicate audit and index dry-run; apply/verify unique index only after approval and a clean audit.
6. Enable one optimization flag at a time in the prescribed order and repeat the same evidence package.

## Release conclusion

The release candidate may be used for **telemetry-only baseline capture with all optimization flags OFF**, subject to normal operational approval. It is not approved as a production performance PASS and no optimization flag should be enabled from the current evidence set.
