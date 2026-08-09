# R1.2 RED Evidence

## FINDING-001 — Historical audit duplicate ingestion
Before fix, the same persisted correction ledger supplied twice to timeline classification produced `canonicalCorrectionEventCount=2` instead of 1 and triggered duplicate/corruption logic. RED test: `test/ar-splitbrain-r1p2-historical-dedupe.red.test.js`.

## FINDING-002 — Debt New suggestion zero-tolerance inconsistency
This finding was initially masked by FINDING-003: the correction ledger was being misclassified as a return and omitted from the active projection. After the identity RED was fixed, the intended RED reproduced cleanly: B0041181 had normalized `debt=0` but raw `remainingDebt=85`, and `customerOrderSuggestions()` could fall back to 85 because money fallback used `||`. RED evidence showed **actual 85 vs expected 0** before the Debt New fix.

## FINDING-003 — Correction identity misclassified as return
Before fix, `AR-ADJUSTMENT + DELIVERY_CLOSEOUT_CORRECTION` with generic `refId/sourceId=DCOC-1` resolved `sourceKind='return'`; RED expected `correction`. This could cause ownership grouping as `RETURN_REDUCTION`. RED test: `test/ar-splitbrain-r1p2-correction-identity.red.test.js`.

## Additional audit RED from G10
A confirmed `AR-RETURN` after a delivery snapshot was classified `ambiguous` instead of `explained_by_subsequent_events`. A separate RED was written before modifying the audit timeline logic.

All four RED cases were captured before their corresponding source/script changes and now pass GREEN.
