# V46 - Sales mode default direct and remove DMS price badge

## Files changed

- `public/js/app/05-sales-orders.js`

## Changes

1. `getSalesMode()` now reads the checked radio button `input[name="saleMode"]`.
   - `direct` => `DIRECT_PRICE`
   - `promotion` => `PROMOTION`

2. `resetSalesFormAfterSave()` now resets the form to `direct` mode by default.

3. `submitSalesOrder()` no longer forces every order to `PROMOTION`.
   - Payload fields now follow the selected radio mode:
     - `saleMethod`
     - `saleMode`
     - `pricingMode`
     - `orderPricingMode`
   - Item-level pricing mode also follows the selected radio mode.

4. The sales history order row no longer renders the pricing mode badge.
   - Removed visible labels such as `Giá DMS` / `Khuyến mại` from order history rows.

5. Radio mode changes still trigger UI sync and promotion recalculation when switching into promotion mode.

## Verification

- `public/index.html` radio buttons are not disabled.
- `node --check public/js/app/05-sales-orders.js` passed.
- No visible `Giá DMS` badge render remains in the sales history row.
