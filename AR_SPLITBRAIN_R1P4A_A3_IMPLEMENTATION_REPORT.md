# R1.4a A3 — Implementation Report

## Repair-only services
- `HistoricalCorrectionTimelineService`: actual predecessor resolver, sourceOriginalVersion split, immutable-version priority, lineage hash/evidence, ambiguous-lineage fail closed.
- `HistoricalCorrectionMissingEventDetector`: ambiguous lineage cannot become repairable.
- `HistoricalCorrectionRepairPlanner`: R1P4A plan v2, canonical sequence, per-item lineage fields, sequential AR simulation, final raw/normalized evidence.
- `HistoricalCorrectionRepairExecutor`: shared DB revalidation, stale-plan rejection, whole-plan transactional sequence, per-event raw AR invariant, idempotent all-posted handling, partial-plan fail closed.

## CLI
- `apply-historical-correction-repair.js` default (without `--apply`) now performs DB-backed READ-ONLY revalidation.
- `--offline-verify` is explicit hash-only mode and always reports `safeToApply=false`.
- Apply remains explicit and requires plan + exact order + plan hash.

## Runtime financial freeze
No change to runtime correction event-delta algorithm, Debt New source, return ownership, or standard correction UI. No final-state reconcile and no new `AR-DEBT-ADJUSTMENT` were introduced.
