# A8 — Historical Repair Safety Matrix

PASS cases:
- Missing historical correction event → exactly one planned item.
- Event already exists → no repair.
- Same plan/event retried → no duplicate financial effect.
- Latest current correction no-op → ignored; earlier financial transition selected.
- Subsequent confirmed receipt → preserved; repair appends historical event delta to current AR.
- Subsequent AR-RETURN → preserved; return is not generic-repaired.
- Duplicate existing correction event → blocked/data corruption.
- Existing correction event wrong amount → blocked/event amount mismatch.
- Historical predecessor missing → ambiguous/no apply.
- Multiple historical corrections → reconciled independently by event identity.
- One missing correction among posted corrections → only missing transition planned.
- Later cash/reward decrease → opposite-direction event reconstructed correctly.
- Return-only historical correction → `RETURN_OWNED_EXTERNALLY`, no generic repair.
- Current no-op UI correction → remains zero-event/no historical auto-repair.

Additional RED discovered during G5:
Actual `returnArPostingService` emitted `sourceType=returnOrder` but the canonical projection whitelist omitted normalized `RETURNORDER`, and the writer omitted canonical `entryType/active/reversed` fields. A dedicated RED proved that an actual writer-created AR-RETURN could be excluded from canonical AR. Minimal compatibility fix:
- preserve `sourceType=returnOrder`;
- add `entryType=normal`, `active=true`, `reversed=false` to new AR-RETURN entries;
- accept normalized `RETURNORDER` provenance in the canonical category registry.

This does not change return amount, identity or ownership; it makes the existing writer output satisfy the canonical read contract. RED→GREEN and existing AR-return idempotency/contract tests pass.
