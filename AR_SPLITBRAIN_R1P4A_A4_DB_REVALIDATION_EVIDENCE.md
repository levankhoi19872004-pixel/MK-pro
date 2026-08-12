# R1.4a A4 — DB Revalidation / Stale-plan Evidence

## Contract
Plan hash validity is necessary but insufficient. Revalidation reconstructs current immutable evidence and compares correction ID, actual predecessor, version IDs, previous/corrected financial states, exact event delta, lineage/evidence hashes, canonical item order, and whether the corresponding AR event is still missing.

## Old REAL plan
Old planHash: `41db128858fc09f17cce83416eac547aa0bea9f0c12dc24efd3145f83501f6a7`

Offline verification result:
- planHashValid = true
- dbRevalidated = false
- lineageRevalidated = false
- safeToApply = false

Fixture DB-equivalent revalidation against current R1.4a lineage reconstructs v3 from v2 and rejects the old plan as `STALE_OR_INVALID_PLAN_LINEAGE`.

## Fresh plan
Fresh production-shaped plan revalidation passes only when all items are lineage-valid, in canonical sequence, and still `MISSING_EVENT_SAFE_TO_PLAN`.

Safety behavior:
- one item already posted + one missing => `PARTIAL_PLAN_ALREADY_APPLIED`, abort;
- all plan events already posted => idempotent `IDEMPOTENT_ALREADY_APPLIED`;
- lineage/evidence change => stale, abort;
- ambiguous predecessor => no plan/apply.
