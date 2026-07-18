# Phase260F R3 Projection Policy Report

Generated: 2026-07-18T00:36:34.165Z
Baseline: MK-pro-phase260e-canonical-ar-source-posting-fixed.zip
Baseline SHA256: 43dd771217d6c05eb3d7fd54c4e3797a0d98568a3e2590e9165d89c91fea2e0f
Git commit: 507b2a8e8d300b1853d1d9985eb54b5783fe9661
Checkpoint: Phase260F-R3

## Actual Result

Read projection no longer blanket-excludes AR-DEBT-ADJUSTMENT. Replacement-verified adjustment rows are excluded only when a metadata-linked canonical replacement exists and amount/effect matches. Source-known rows without replacement remain included as legacyFallback. Source-unresolved rows remain included with LEGACY_ADJUSTMENT_SOURCE_UNRESOLVED. Explicit duplicate/final-state classifications can be excluded with their evidence reason.

## Production Gate

PROJECTION_CUTOVER_BLOCKED for production because audit/backfill evidence did not run.
