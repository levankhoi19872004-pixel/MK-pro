# R1.2 Event Identity / Ownership Audit

## Correction event
`AR-ADJUSTMENT + sourceType=DELIVERY_CLOSEOUT_CORRECTION` now resolves:
- semanticRole: `CORRECTION_DELTA`
- businessEventSourceKind: `correction`
- ownership group: correction-owned, not `RETURN_REDUCTION`

Generic `refId/sourceId` is not sufficient evidence of a return.

## Return event
Explicit `returnOrderId` and canonical return category/provenance continue to resolve `sourceKind=return`. Historical AR-RETURN ownership remains intact.

## Safety result
- correction misclassified as return count: 0 in R1.2 tests.
- return double-count regression count: 0 in core financial suite.
