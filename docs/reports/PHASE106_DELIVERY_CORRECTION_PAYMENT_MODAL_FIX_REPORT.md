# PHASE106 — Delivery correction payment modal fix

## Scope

Fixed the Delivery Today New adjustment modal payment-correction flow after closeout/accounting confirmation.

Touched only the Delivery Today New UI, delivery closeout correction service, static/contract tests, and a read-only audit script.

## Root causes fixed

1. **Raw HTML rendered in delta cards**: `detailCell()` escaped values, so the `<span id="deliveryCashDeltaText">...</span>` string appeared on the screen.
2. **Corrected amount semantics were ambiguous**: UI labels say “Tiền mặt đúng”, so the value must be treated as the final corrected amount. Delta is now computed as `corrected - current`.
3. **Negative current cash blocked valid correction**: backend validation rejected negative `oldAmount`; it now rejects only negative corrected/final `newAmount`.
4. **Vietnamese money parsing was unsafe for formatted input**: `1.400.000` now parses as `1400000`, and input values are formatted on blur.
5. **Close button appeared disabled/muted**: top modal close action is now styled as active and receives an explicit aria-label.

## New formula

```text
cashDeltaAmount = correctedCashAmount - currentCashAmount
bankDeltaAmount = correctedBankAmount - currentBankAmount
rewardDeltaAmount = correctedRewardAmount - currentRewardAmount

totalCollectedDelta =
  (correctedCashAmount + correctedBankAmount + correctedRewardAmount)
  -
  (currentCashAmount + currentBankAmount + currentRewardAmount)
```

Important: `correctedCashAmount` is a final amount, not an add-on delta.

## UI changes

- Added `parseVietnameseMoney()` and `formatVietnameseMoney()`.
- Delta cards now render DOM cells with IDs:
  - `deliveryCashDeltaText`
  - `deliveryBankDeltaText`
  - `deliveryRewardDeltaText`
  - `deliveryCashTotalDeltaText`
- Current negative payment values show a diagnostic warning instead of being silently hidden.
- If current cash is negative, the corrected cash input defaults to `0`, allowing a correction version to fix the final amount.
- Top close button is always visible, active, and wired to `closeAdjustmentPopup()`.
- Confirmed/closed orders show a clear note explaining that changes create a correction version and do not mutate the old closeout.

## Backend changes

- `normalizeCashAdjustmentLines()` now always computes adjustment from `newAmount - oldAmount`, ignoring a caller-supplied `adjustmentAmount`.
- Backend validation allows negative current/old payment values, but rejects negative corrected/final values.
- Cash line objects carry `correctionSemantics: 'corrected_final_amount'` for diagnostics.

## Audit script

Added read-only script:

```bash
node scripts/audit-delivery-payment-negative-cash.js --strict
```

It reports orders or closeout versions with negative cash-collected values and never mutates data.

## Tests

Updated:

- `test/delivery-today-new-popup-ui-static.test.js`
- `test/delivery-closeout-correction-contract-static.test.js`

Checks cover raw HTML regression, final-amount semantics, corrected-minus-current formula, close button behavior, Vietnamese money parsing hooks, and backend validation of negative current vs negative final cash.
