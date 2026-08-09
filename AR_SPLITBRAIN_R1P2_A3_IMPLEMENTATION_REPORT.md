# R1.2 Implementation Report

## Production changes
1. `src/domain/ar/debtBusinessEventIdentity.js`
   - Separates explicit/canonical return identity from generic refs.
   - Generic `refId/sourceId` is no longer enough to infer a return.
   - `CORRECTION_DELTA` always prefers correction identity and resolves `sourceKind=correction`.
   - Canonical return category/provenance can still use return refs, preserving AR-RETURN behavior.

2. `src/services/v2/debtNew.service.js`
   - `remainingDebt` now uses the same normalized collectible projection as `debt` and `debtAmount`.
   - Money fallbacks in customer/order/staff suggestions use nullish-safe precedence so valid zero is preserved.

## Audit script change
`audit-closeout-ar-splitbrain.js` now deduplicates merged AR query results by stable persisted/event identity before timeline classification. It does not dedupe by amount/category. It also treats canonical return reduction as a subsequent accounting event for historical timeline classification.

## Deliberately unchanged
- Event-delta writer financial formula.
- Transaction orchestration.
- returnOrders SSoT and AR-RETURN ownership.
- Historical ledger data.
- Debt New source of truth (still canonical AR ledger).
