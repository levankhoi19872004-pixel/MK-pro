# A4 — Missing Canonical Correction Event Detector

Added `HistoricalCorrectionMissingEventDetector`.

The detector compares each reconstructed non-zero transition with canonical AR rows using exact category, provenance, order/correction business identity and idempotency identity. It does not substring-match and does not match by amount alone.

Classifications:
- `MISSING_EVENT_SAFE_TO_PLAN`
- `ALREADY_POSTED`
- `NO_EFFECT`
- `DUPLICATE_EXISTING_EVENT`
- `EVENT_AMOUNT_MISMATCH`
- `AMBIGUOUS_TIMELINE`
- `DATA_CONFLICT`
- `RETURN_OWNED_EXTERNALLY`

Duplicate, mismatch, ambiguous and data-conflict states are fail-closed and are never converted into repair items.
