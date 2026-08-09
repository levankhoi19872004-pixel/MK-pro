# R1.1 Semantic Contract and Actual Debt New E2E

## Semantic fix
Modified `src/domain/ar/debtLedgerSemanticRegistry.js` so semantic resolution is provenance-aware:
- `AR-ADJUSTMENT + DELIVERY_CLOSEOUT_CORRECTION` => `CORRECTION_DELTA`.
- Other/manual `AR-ADJUSTMENT` => `MANUAL_ADJUSTMENT`.
- Historical category/amount/direction are not rewritten.

## Debt New public read-path fix
Modified `src/services/v2/debtNew.service.js` to normalize the signed order balance with the canonical `normalizeDebtAmount(..., DEBT_ZERO_TOLERANCE)` before exposing debt/credit projection aliases.

This does **not** change the SSoT. Debt New still reads canonical AR ledgers; it does not read OrderPaymentAllocation or DeliveryCloseoutVersion as debt balance.

## Actual public service test
`test/ar-splitbrain-r1p1-debtnew-e2e.test.js` runs:
1. actual `CloseoutCorrectionArEventDeltaPostingService`,
2. actual `arPosting.service`,
3. actual `arLedgerRead.service`,
4. actual `DebtNewService.listCustomers()`.

Fake boundary: in-memory persistence adapters and `searchService` dependency only, because `npm ci` is blocked by registry and Mongoose is unavailable.

### Results
- B0041181: raw ledger balance 85 -> public Debt New debt 0: PASS.
- Confirmed receipt preservation: 4,000,000 remains after correction: PASS.
- No-op correction after receipt: unchanged: PASS.
- Multiple orders same customer: only corrected order changes; aggregate remains correct: PASS.
