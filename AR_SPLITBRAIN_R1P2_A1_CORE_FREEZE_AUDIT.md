# AR Split-brain R1.2 — Core Freeze Audit

## Baseline
- Input: `MK-pro-closeout-ar-splitbrain-r1p1-hardening-fixed.zip`
- SHA256: `27a407a948aaecf5169e9fdfbeae5cc7dcc90e84d9b289798eafec18e04bb315`
- Stack: Node.js / Express / MongoDB-Mongoose.
- R1 event-delta core was re-traced from correction orchestration to `CloseoutCorrectionArEventDeltaPostingService`.

## Frozen invariants re-verified
- Runtime correction `reconcileOrderDebt()` call count in correction paths: **0**.
- Runtime correction active `AR-DEBT-ADJUSTMENT` writer count: **0** (one comment reference remains, no writer).
- `correctionOwnedDebtDelta = receivableDelta - cashDelta - bankDelta - rewardDelta`.
- `returnDelta` remains excluded from generic correction event posting and is owned by returnOrders / returnArPostingService / AR-RETURN.
- Event-delta continues to use canonical AR-before + correction-owned delta; no snapshot final-state targeting was introduced.
- Existing transaction/idempotency behavior was not redesigned.

## R1.2 scope decision
No RED evidence required changes to `CloseoutCorrectionArEventDeltaPostingService` or transaction orchestration. R1.2 changes are limited to historical audit dedupe/timeline safety, Debt New zero-tolerance consistency, and business-event identity precedence.
