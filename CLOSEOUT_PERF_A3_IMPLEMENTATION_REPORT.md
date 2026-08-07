# CLOSEOUT-PERF-A3 — Implementation Report

## Gate

Target: consolidate per-order Q15/Q16 initial AR balance reads into transaction-scoped batch context without weakening financial correctness.

## Baseline

- Parent ZIP SHA-256: `37eee2f85fd1836b928805ac624dcee1613314ddff5bc2d03201af9547ca6099`.
- A2 targeted: 24/24 PASS.
- Reward backend/frontend: 30/30 PASS.
- Full performance: 187/187 PASS.
- JavaScript syntax: 1,671 files PASS.
- A2 logical query budget 1/16/26/60: 16 / 136 / 216 / 488.

## RED -> GREEN

RED before production changes: 1/9 PASS, 8 FAIL. Missing contracts were the A3 flag, batch reader, identity partition/fail-closed behavior, transaction injection, and Q1/Q6 telemetry metadata.

GREEN after implementation: 17/17 A3 targeted PASS. Full performance: 204/204 PASS.

## Q15/Q16 architecture

A3 does **not** preload AR outside the transaction. After fresh critical SalesOrder/ReturnOrder reads, the runner performs two sequential ArLedger queries on the same session: one raw inspection query and one canonical debt-read-model query. Rows are partitioned by canonical order identity.

A subtle correctness constraint is preserved: allocation AR rows Q11-Q13 are written later per order. Therefore A3 validates and merges the actual `allocationResult.arLedgers` into that order's prefetched inspection before debt reconcile. This gives reconcile the same logical post-allocation initial state without another Q15/Q16 round-trip.

## Query budget

| Orders | A2 | A3 | Saved |
|---:|---:|---:|---:|
| 1 | 16 | 16 | 0 |
| 16 | 136 | 106 | 30 |
| 26 | 216 | 166 | 50 |
| 60 | 488 | 370 | 118 |

60-order result = **370**, meeting the preferred A3 target. This is deterministic E2 logical-query evidence, not a production latency claim.

## Financial safety

- Initial per-order balance reads can be replaced by validated batch context.
- Actual debt adjustment still performs fresh `order.debt.safetyBalance`.
- Fresh `order.debt.prePostIdempotency` remains immediately before adjustment write.
- `order.debt.afterBalance` remains after write.
- Transaction count remains 1.
- No Promise.all on the same transaction session.
- AR write count is unchanged.

## Identity isolation

The implementation reuses `resolveCanonicalArOrderIdentity`. It reverse-indexes only allowed lookup aliases. Missing identity, duplicate canonical identity, shared alias, and cross-assignment fail closed. CustomerCode is never used as the primary partition key.

## Observability

Closeout raw query events now expose `stage`, `hasSession`, `orderIndex`, `durationMs`, `collection`, `operation`, and `fingerprint`, allowing a later E3 capture to distinguish Q1 `context.orders` from Q6 `transaction.critical.orders`. AuditLog `Model.create` is confirmed outside the Query/Aggregate exec counter; isolated `nonQueryMongoOrModelWriteMs` timing was added without batching/optimizing AuditLog.

## Feature flag

`PERF_CLOSEOUT_AR_BALANCE_BATCH_V1=0` by default. OFF preserves A2 behavior. Rollback is configuration-only.

## Known environment / pre-existing test disposition

Mongoose-dependent legacy tests cannot run because the source package intentionally excludes node_modules; these are recorded as NOT_RUN_ENVIRONMENT, never PASS. A separate closeout legacy suite fails identically 30/40 on both original A2 and A3 due missing historical artifact, missing mongoose, and stale Phase246/247 UI harness contracts; therefore it is not an A3 regression.

## Production source changed

- `src/config/featureFlags.js`
- `src/observability/closeoutQueryAudit.js`
- `src/services/accounting/AccountingCloseoutService.js`
- `src/services/accounting/OrderPaymentDebtReconcileService.js`
- `src/services/accounting/closeout/CloseoutTransactionRunner.js`
- `src/services/arLedgerRead.service.js`
- `src/services/auditService.js`

No production index, production data, concurrency, reward/offset money contract, Return mutation policy, Q6 critical fresh read, or allocation persistence contract was changed.
