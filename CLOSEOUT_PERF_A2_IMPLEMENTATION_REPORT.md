# CLOSEOUT-PERF-A2 Implementation Report

Generated: 2026-08-07T04:11:28.874399+00:00

## Gate result

**A2_GREEN_QUERY_DEDUP_VERIFIED** (subject to final fresh-extract verification recorded in the release manifest).

## Baseline

- Authoritative release: `REWARD-DOUBLECOUNT-A4-FINAL`.
- Input ZIP SHA-256: `0042270bff18480b6cf45f383127686e0b8e0c4f3b5ea7a814b9acbc4135a398`.
- Input file count: 2349.
- Reward fix baseline remained green: backend 18/18, frontend 12/12.

## RED before implementation

- OPT-01: expected RED, 1/3 pass and 2/3 fail. Source had no A2 dedup flag/early no-debt branch.
- OPT-02: expected RED, 0/3 pass and 3/3 fail. Source had serial `updateOne` enqueue only.
- OPT-03: expected RED, 0/2 pass and 2/2 fail. MasterOrder metadata lookup was unconditional for scoped closeout.

## GREEN changes

### OPT-01 — Q17 NO_DEBT_DELTA short-circuit

`PERF_CLOSEOUT_QUERY_DEDUP_V1` defaults OFF. With it ON, a balance already within ±1000 returns before the initial debt-adjustment idempotency DB read. If request-scoped cache already contains the idempotent ledger, the old `IDEMPOTENCY_KEY_EXISTS_AND_BALANCE_OK` diagnostic is preserved without Mongo access. Any actual adjustment candidate still performs the fresh `order.debt.prePostIdempotency` read immediately before posting.

Behavior evidence: flag ON no-debt Q17=0; flag OFF Q17=1; actual adjustment path fresh Q17=1 and one AR adjustment post.

### OPT-02 — post-commit sync bulk enqueue

`PERF_CLOSEOUT_SYNC_BULK_V1` defaults OFF. With it ON, all sync groups are normalized into idempotent `updateOne` operations and sent with one `bulkWrite(..., ordered:false)` command on success. Duplicate idempotency keys are deduplicated in-memory. One whole-batch retry is allowed because every operation is an upsert by the existing idempotency key. Permanent failure exposes pending job identities and returns warning-only semantics because financial commit already occurred. Worker scheduling errors are also warning-only.

### OPT-03 — selective MasterOrder metadata

Applied. The existing `orderDeliveryAssignment` contract already treats stored SalesOrder delivery assignment as verified and authoritative. MasterOrder lookup is skipped only when every pending order resolves through that canonical stored assignment and matches requested NVGH. Missing or mismatching assignment keeps the old metadata lookup; mismatch still returns `DELIVERY_CLOSEOUT_ORDER_SCOPE_MISMATCH`.

## Query budget

| Workload | Before | OPT-01+02 | OPT-01+02+03 |
|---:|---:|---:|---:|
| 1 | 18 | 17 | 16 |
| 16 | 168 | 137 | 136 |
| 26 | 268 | 217 | 216 |
| 60 | 608 | 489 | **488** |

This is deterministic E2 logical-query evidence only; it is not a production latency claim. The <=500 hard gate is met even without OPT-03 (489), and the verified canonical-assignment path reaches 488.

## Protected contracts

Q15/Q16 AR balance reads, transaction runner, critical transaction re-reads, AccountingCloseoutService, allocation writer, reward/offset money contract, ReturnOrder lookup implementation and AR reader all remain byte-for-byte unchanged from the authoritative baseline. No concurrency or production index change was made.

## Correctness

- Reward double count: 0.
- Debt deviation on golden/reward-return fixtures: 0.
- Duplicate AR application: 0 in idempotent retry fixture.
- Return parity: 100%.
- Allocation parity: 100%.
- Scope isolation: PASS.
- Transaction failure isolation: PASS in dependency-free transaction-boundary harness.
- Full performance regression: 187/187 PASS.
- A2 targeted: 24/24 PASS.
- Syntax: PASS.

Mongoose-dependent legacy tests are recorded `NOT_RUN_ENVIRONMENT` because `node_modules` is intentionally absent from the release ZIP. Phase247's four VM failures are proven pre-existing by rerunning the same test against the untouched baseline ZIP.

## E3 non-scope

The observed ~409 ms `SalesOrder.find fields=[id]` remains unresolved between Q1 and Q6. A2 does not change Q1/Q6 or Mongo indexes and makes no new production latency claim.

## Rollback

Both optimization flags default OFF. Rollback is configuration-only: unset/set `PERF_CLOSEOUT_QUERY_DEDUP_V1=0` and/or `PERF_CLOSEOUT_SYNC_BULK_V1=0`. No data rollback or migration is required.
