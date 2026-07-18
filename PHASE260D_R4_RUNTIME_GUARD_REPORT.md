# Phase260D R4 Runtime Guard Report

Generated: 2026-07-17T10:11:08.579Z

- Debt New backend reader now resolves ownership before grouping totals.
- Mobile debt reader now uses the same ownership resolver and debit-credit projector path.
- Debt New browser code consumes backend debt DTO fields and does not rebuild available debt by subtracting pending collection.
- Duplicate repair script is dry-run by default and requires `--apply`, `--confirmation-token=PHASE260D_APPLY`, and `AR_DEBT_DUPLICATE_REPAIR_ENABLED=true`.
- `PROJECTION_SHADOW` rows are projection-only and non-mutating.
