# PERF-A2A — Bulk Batch Context và Query Collapse

- **Generated:** 2026-08-06T10:17:30+07:00
- **Target:** `POST /api/new/delivery-today/adjustments/bulk-commit`
- **Gate:** `PASS_WITH_DEFERRED_RUNTIME`
- **Evidence:** E1 PASS, E2 PASS, E3 deferred to PERF-A6

## 1. Executive summary

Legacy bulk processing kept a per-order transaction but also repeated the same initial context discovery for every input. PERF-A2A introduces an off-by-default, request-scoped batch context that loads orders, latest eligible versions, return orders, current allocations, AR context and idempotency context once per bounded chunk. The command still executes one transaction per input and retains all reads that protect writes.

At 60 orders, logical reads decreased from **688** to **242** (64.83% reduction). Writes remained **203** and transactions remained **60**. The offline 500-equivalent gate and 300-equivalent target both pass.

## 2. Root cause

- `DeliveryAdjustmentBulkCommitService` iterated every input and entered the single-order command with no shared request context.
- Each input repeated order, latest version, return and allocation lookup.
- Initial AR balance and idempotency discovery were repeated before the correction/reconcile chain.
- Safety and verification reads were mixed with initial discovery, so eliminating all reads would have threatened correctness.
- Duplicate inputs resolving to the same canonical order require special handling because a request-start snapshot becomes stale after the first write.

## 3. Implemented design

- New `DeliveryAdjustmentBatchContextService` with bounded chunks (default 100, maximum 200).
- Context is local to one request; no global mutable cache and no reuse across requests.
- Complete maps: orders, latest versions, returns, allocations, AR balance details, AR idempotency rows, correction idempotency rows, canonical positions and input positions.
- Feature flag: `PERF_BULK_BATCH_CONTEXT_V1`; default OFF preserves the legacy path.
- Failure policy: `fail_request` by default; `fallback_legacy` is explicit and observable.
- Missing context, partial context, ambiguous identity and AR result-cap conditions fail closed.
- Later duplicate canonical inputs use a scoped legacy refresh so writes made earlier in the same request are visible.

## 4. Safety preserved

- One Mongo transaction per input remains unchanged.
- Latest closeout version is re-read before the confirmed correction write; stale batch versions are rejected.
- AR balance is re-read at the safety stage before ledger posting.
- Idempotency is always re-checked immediately before write.
- After-write AR verification remains on the non-prefetched path.
- Debt Zero Tolerance ±1,000 and negative-money guards are unchanged.
- Financial SSoT, returnOrders, orderPaymentAllocations and AR ledger contracts are unchanged.

## 5. RED/GREEN logical query comparison

| Batch | RED reads | GREEN reads | Reduction | Writes RED/GREEN | Tx RED/GREEN | Snapshot |
|---:|---:|---:|---:|---:|---:|:---:|
| 1 | 13 | 11 | 15.38% | 4/4 | 1/1 | MATCH |
| 16 | 190 | 72 | 62.11% | 57/57 | 16/16 | MATCH |
| 26 | 304 | 114 | 62.5% | 90/90 | 26/26 | MATCH |
| 60 | 688 | 242 | 64.83% | 203/203 | 60/60 | MATCH |
| 100 | 1146 | 404 | 64.75% | 337/337 | 100/100 | MATCH |

> Offline duration and heap delta only compare the dependency-free algorithm. They do not represent Mongo execution time, endpoint latency or production p95.

The production AR batch adapter internally performs multiple Mongo reads for raw/canonical inspection and idempotency. Therefore logical adapter counts are not a claim about physical Mongo query count; physical query traces remain E3.

## 6. Correctness parity

- Financial snapshots equal: **TRUE**
- Maximum debt deviation: **0**
- Duplicate ledgers: **0**
- Return-state parity: **TRUE**
- Allocation parity: **TRUE**
- Closeout-version parity: **TRUE**
- Error/result order parity: **TRUE**

## 7. Test evidence

- RED first before source changes: **9/9 PASS**.
- PERF-A2A GREEN: **9/9 PASS**.
- Dependency-free regression: **47/47 PASS**.
- JavaScript syntax: **SYNTAX_OK 1594 files**.
- Mongoose-dependent contract test: **NOT_RUN** because `node_modules/mongoose` is absent.
- Mongo transaction integration, explain/index stats and production p95: **NOT_RUN / deferred to PERF-A6**.

A post-GREEN combined diagnostic command is not a gate test: the old A1B static RED assertion intentionally describes the exact legacy loop and no longer matches the optimized source.

## 8. Changed files

| File | Type | Purpose |
|---|---|---|
| `scripts/performance/perf-a2a/run-red-green.js` | ADDED / tooling | Repeatable logical-query comparison and financial parity runner. |
| `src/services/accounting/OrderPaymentDebtReconcileService.js` | MODIFIED / production | Accept prefetched initial AR context; retain safety balance, pre-write idempotency and after-write reads. |
| `src/services/delivery/DeliveryAdjustmentBatchContextService.js` | ADDED / production | New request-scoped batch context loader, bounded chunking, completeness and ambiguity guards. |
| `src/services/delivery/DeliveryAdjustmentBulkCommitService.js` | MODIFIED / production | Feature-flagged batch preload, explicit failure policy, per-order transaction path and duplicate canonical refresh. |
| `src/services/delivery/DeliveryAdjustmentCommitService.js` | MODIFIED / production | Consume prefetched initial order/version/AR/idempotency context while preserving after-write verification. |
| `src/services/deliveryCloseoutCorrection.service.js` | MODIFIED / production | Consume prefetched version/return/allocation/correction-idempotency context and re-read latest version before write. |
| `test/performance/perf-a1b/fake-repository.js` | MODIFIED / test | Add deterministic batch repository methods for GREEN harness. |
| `test/performance/perf-a1b/logical-query-counter.js` | MODIFIED / test | Extend spy counter with batch correction-idempotency read without changing RED counts. |
| `test/performance/perf-a2a/batch-architecture-simulator.js` | ADDED / test | Dependency-free GREEN architecture simulator. |
| `test/performance/perf-a2a/perf-a2a-bulk-batch-context.test.js` | ADDED / test | RED/GREEN, completeness, ambiguity, parity and query-gate tests. |

No source file was deleted.

## 9. Feature flag and rollback

```bash
# Legacy behavior (default)
PERF_BULK_BATCH_CONTEXT_V1=0

# Batch-context path
PERF_BULK_BATCH_CONTEXT_V1=1

# Optional explicit compatibility fallback
PERF_BULK_BATCH_CONTEXT_FAILURE_POLICY=fallback_legacy
```

Recommended rollout uses the flag OFF by default, then enables it in a controlled environment while collecting E3 query trace, latency, 5xx and correctness metrics. Rollback is immediate by disabling the flag; no migration or schema change is required.

## 10. Gate decision

**PASS_WITH_DEFERRED_RUNTIME**

E1 and deterministic E2 satisfy PERF-A2A. No claim is made for production p95, Mongo transaction runtime behavior, physical query count or index effectiveness.
