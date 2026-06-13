# Phase 22 — Fix duplicate promotion row on child invoice

## Root cause
`services/printDataBuilder.js::collectItemPromotionSources()` collected both:

1. structured promotion rows from `appliedPromotionRows` / `promotionRows`, and
2. legacy inline aggregate fields such as `promotionCode`, `promotionDescription`, `discountPercent`, `discountAfterTax`.

For an item with two structured rows (17% and 2%), the legacy aggregate fields contained the combined 19% discount and produced a third duplicate row.

## Patch
Inline promotion fields are now used only when no structured promotion source exists.

This preserves legacy orders while preventing the extra aggregate row on new orders.

## Scope
- Changed: `services/printDataBuilder.js`
- Added: `test/dms-exact-promotion-duplicate-guard.test.js`
- No changes to stock, debt, order totals, promotion calculation, or invoice layout.

## Expected result
The sample item prints only:
- `AD45232124DN11` — 17%
- `AD12345678DN11` — 2%

The extra `AD45232124DN11` — 19% row is removed.
