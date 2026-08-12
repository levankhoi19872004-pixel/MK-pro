# A5 — Read-only Repair Planner Evidence

Added `HistoricalCorrectionRepairPlanner` and CLI `scripts/plan-historical-correction-repair.js`.

Fixture B0041181 result:
- proposed repairs: 1
- selected correction: `DCOC-B0041181-v2`
- fromVersion: 1
- toVersion: 2
- expected missing event delta: -23,800,000
- debit: 0
- credit: 23,800,000
- category: `AR-ADJUSTMENT`
- sourceType: `DELIVERY_CLOSEOUT_CORRECTION`
- event identity: `AR-ADJUSTMENT:DELIVERY_CLOSEOUT_CORRECTION:SO-B0041181:DCOC-B0041181-v2:v2`
- fixture plan hash: `4c1eaba7c69ce3895e4bbd78e242498a4c15d92d9a32ed87f0f43fb9eb0b9aa7`
- fixture item hash: `b833354800d416ab23a39314521b1526c48c682717f9b5cd8f0224b33dd47c75`

The current no-op transition is not planned.

The plan's `currentArBeforeObserved` is evidence only. `expectedMissingEventDelta` is reconstructed exclusively from historical correction/version state.

**The included B004 fixture plan is test evidence only and must not be used as a production plan.** A real production plan must be regenerated from the read-only DB command and reviewed before any guarded apply.
