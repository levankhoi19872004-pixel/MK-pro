'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => require('./helpers/sourceBundle.util').readSource(file);

test('DMS import stores print price/tax snapshots and explicit no-promotion contract', () => {
  const source = read('src/services/excelImportService.js');

  assert.match(source, /function getDmsCatalogPriceAfterVatFromRow/);
  assert.match(source, /function getDmsVatAmountForLine/);
  assert.match(source, /priceAfterTaxBeforePromotionAtOrder:\s*catalogSalePriceAtOrder/);
  assert.match(source, /finalPriceAtOrder:\s*salePrice/);
  assert.match(source, /lineAmountAtOrder:\s*lineAmount/);
  assert.match(source, /promotionMode:\s*['"]none['"]/);
  assert.match(source, /isPromotionSale:\s*false/);
  assert.match(source, /promotions:\s*\[\]/);
  assert.match(source, /totalPromotionAmount:\s*0/);
});

test('Print domain blocks promotion fallback for imported/direct-price orders', () => {
  const policy = read('src/domain/print/PrintPromotionPolicy.js');
  const fallback = read('src/domain/print/LegacyPromotionFallbackService.js');
  const builder = read('src/domain/print/builders/DmsExactSalesInvoiceBuilder.js');
  const legacyRepository = read('src/repositories/printRepository.js');

  assert.match(policy, /if \(isImportedOrder\(order\)\) return true/);
  assert.match(fallback, /shouldApplyLegacyPromotionFallback/);
  assert.match(builder, /printPromotionSuppressed/);
  assert.match(builder, /suppressPromotions \? \[\] : line\.promotionRows/);
  assert.match(legacyRepository, /shouldSuppressPromotionDetails/);
  assert.match(legacyRepository, /appliedPromotionRows/);
});
