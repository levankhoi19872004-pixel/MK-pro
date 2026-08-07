# PERF-A1B — Offline Reproduction Harness và Logical Query Baseline

## Gate

**PASS_WITH_DEFERRED_RUNTIME**

- E1 source/static evidence: PASS.
- E2 deterministic offline evidence: PASS.
- E3 Mongo/runtime/p95: deferred to PERF-A6.
- Production behavior: not modified. All 2,135 original files are byte-identical to the input ZIP; only dependency-free harness/test/source files and evidence artifacts were added.

## RED baseline

| Batch | Logical reads | Writes | Transactions | Calls/order | Offline median ms | Offline memory median |
|---:|---:|---:|---:|---:|---:|---:|
| 1 | 13 | 4 | 1 | 19 | 0.15 | 7552 |
| 16 | 190 | 57 | 16 | 17.438 | 0.668 | 53096 |
| 26 | 304 | 90 | 26 | 17.154 | 1.06 | 80920 |
| 60 | 688 | 203 | 60 | 16.85 | 2.053 | 177600 |
| 100 | 1146 | 337 | 100 | 16.83 | 3.262 | 293568 |

Offline time/memory only compare algorithmic behavior and must not be interpreted as production latency.

## RED proof

- Logical reads grow approximately linearly: reads/order 11.46–11.875; spread 1.0362.
- `findOrder`, `findLatestVersion`, `findReturns` and `findAllocation` run once per input.
- One transaction starts per input; an error aborts only that input and the batch continues.
- Current baseline uses no batch-read operation.
- AR safety and idempotency reads repeat beyond one call per order.
- Duplicate canonical inputs repeat the per-input command chain.

## Fixture coverage

The deterministic matrix contains 21 scenario templates and batch sizes 1, 16, 26, 60, 100. The 60-order fixture includes all mandatory cases and repeats them deterministically. No current clock or unseeded random value is used.

## Correctness snapshot

The 60-order normalized snapshot captures order financial state, return state, payment allocation, AR ledger, debt balance, idempotency keys, closeout version, and result/error ordering. Two independent runs are deep-equal after normalization.

## Test status

- PASS: 9 dependency-free E1/E2 tests.
- FAIL: 0.
- NOT_RUN: Mongo transaction semantics, explain executionStats, production p95.

## Added files

- test/performance/perf-a1b/logical-query-counter.js
- test/performance/perf-a1b/fixture-factory.js
- test/performance/perf-a1b/fake-repository.js
- test/performance/perf-a1b/normalize-snapshot.js
- test/performance/perf-a1b/current-architecture-simulator.js
- test/performance/perf-a1b/perf-a1b-offline-repro.test.js
- scripts/performance/perf-a1b/run-offline-repro.js

## PERF-A2A RED handoff

PERF-A2A must reduce per-input context reads through batch prefetch and must preserve the correctness snapshot byte-for-byte after normalization. Target batch operations are already represented in the counter and are zero in this RED baseline.
