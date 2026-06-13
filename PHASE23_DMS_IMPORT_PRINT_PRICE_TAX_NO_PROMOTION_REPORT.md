# PHASE 23 — DMS IMPORT PRINT PRICE/TAX + NO PROMOTION FIX

## Root cause

1. `PrintReadService` always invoked `LegacyPromotionFallbackService` for every sales order missing promotion rows. DMS/import orders intentionally store empty promotion rows because they are direct-price orders, but the fallback interpreted that as legacy missing data and rebuilt promotions from the current promotion rule collections.
2. Old imported rows can contain `preTaxPriceAtOrder: 0` and `vatAmountAtOrder: 0`. The exact invoice builder used a first-defined rule, so numeric zero blocked the derived fallback from final price/line amount.
3. New DMS import snapshots stored final selling price but did not persist every exact print field (`lineAmountAtOrder`, final price snapshot, catalog/list price after VAT) and did not expose an explicit no-promotion contract at order level.

## Fixed business rule

- Imported/DMS/direct-price sales orders never run promotion fallback.
- Their promotion detail table is always empty.
- The direct selling price remains the final price from Excel.
- Pre-tax price and VAT are read from imported source fields when available; old zero/missing snapshots are derived safely at print time.
- Free/promotional stock lines, if explicitly imported as quantity lines, remain stock lines; only the promotion-program detail table is suppressed.

## Files added

- `src/domain/print/PrintPromotionPolicy.js`
- `test/dms-import-direct-print-no-promotion.test.js`
- `test/dms-import-price-tax-snapshot-static.test.js`

## Files changed

- `src/domain/print/LegacyPromotionFallbackService.js`
- `src/domain/print/builders/DmsExactSalesInvoiceBuilder.js`
- `src/repositories/printRepository.js`
- `src/services/excelImportService.js`
- `services/printDataBuilder.js`
- `test/print-order-snapshot-capture-static.test.js`

## Compatibility

Existing DMS/import orders do not require migration. The print builder recognizes DMS/import/direct-price lineage, suppresses promotion reconstruction, and derives pre-tax/VAT values when old snapshots contain zero.

New imports persist:

- `preTaxPriceAtOrder`
- `catalogSalePriceAtOrder`
- `priceAfterTaxBeforePromotionAtOrder`
- `finalPriceAtOrder`
- `vatAmountAtOrder`
- `lineAmountAtOrder`
- explicit `promotionMode: none` and empty promotion arrays

## Verification

- Syntax checks: PASS
- DMS/direct print tests: 4/4 PASS
- Relevant Print Domain tests: 18/18 PASS
- Static/pure regression suite: 188/188 PASS
