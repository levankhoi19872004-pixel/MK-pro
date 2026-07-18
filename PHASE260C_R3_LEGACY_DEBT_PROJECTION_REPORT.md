# Phase260C-R3 Legacy Debt Projection Stabilization

## Root cause
Legacy readers used one normalized remainingDebt field for both signed ledger balance and display debt. Negative balances could be normalized/clamped before status evaluation, while the debt-new frontend also stripped minus signs and rebuilt available debt by subtracting pending collection in the browser.

## Fix
Added a shared LegacyDebtProjector. Readers now compute rawBalance from confirmed AR ledger debit-credit, expose debtAmount as positive debt only, and expose creditBalance separately for negative balances. Customer summaries sum positive order debt and credit balance separately, so one credit order does not automatically offset another open order.

## B0039602 projection
- Original receivable: 7,788,690
- Confirmed receipt: 7,788,690
- Post-closeout return delta: 92,211
- Final rawBalance: -92,211
- Display debtAmount: 0
- creditBalance: 92,211

## Frontend
The debt-new browser code now preserves minus signs in parsing and reads backend DTO fields such as debtAmount, creditBalance and availableToCollect. It no longer rebuilds available debt as remainingDebt minus pending collection.

## Tests
- node --test test\phase260c-r3-legacy-debt-projection.test.js: PASS (5 tests)
- npm run check:syntax: PASS
- npm run check:source-bundles: PASS
