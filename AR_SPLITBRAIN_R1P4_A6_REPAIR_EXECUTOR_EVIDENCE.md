# A6 — Guarded Repair Executor Evidence

Added `HistoricalCorrectionRepairExecutor` and explicit CLI `scripts/apply-historical-correction-repair.js`.

Guards:
- `--apply` required for mutation.
- plan required.
- exact plan hash required.
- explicit order code must equal the plan.
- optional plan-item hash can select an exact item; multiple-item plans cannot apply ambiguously.
- source evidence is re-read inside the supplied transaction/session.
- historical transition and evidence hash are recomputed.
- detector must still report `MISSING_EVENT_SAFE_TO_PLAN`.
- if exact event already exists, retry is idempotent/no financial write.
- duplicate/mismatch/ambiguous states fail closed.
- posting reuses the same canonical R1 correction event-delta posting service.
- exact raw invariant is `AR after = AR immediately before + missing historical event delta`.
- any error propagates to transaction rollback.

Executor test matrix: 7/7 PASS, including B004 raw AR=85/Debt New=0, confirmed receipt preservation, AR-RETURN preservation, duplicate/mismatch fail-closed, rollback and explicit apply/hash/order guards.

No production apply was executed.
