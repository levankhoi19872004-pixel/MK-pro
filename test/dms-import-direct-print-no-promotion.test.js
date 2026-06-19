'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const PrintPromotionPolicy = require('../src/domain/print/PrintPromotionPolicy');
const { buildDmsExactSalesInvoice } = require('../src/domain/print/builders/DmsExactSalesInvoiceBuilder');
const { buildPrintData } = require('../services/printDataBuilder');
const { renderPrintHtml } = require('../services/printService');

function importedDirectOrder() {
  return {
    id: 'SO-DMS-1',
    code: 'B0037463',
    invoiceCode: 'B0037463',
    source: 'DMS',
    sourceType: 'dms_import',
    orderSource: 'DMS',
    orderSourceName: 'Từ DMS',
    saleMethod: 'direct_price',
    saleMode: 'direct_price',
    priceLocked: true,
    promotionCalculated: false,
    isPromotionSale: false,
    totalPromotionAmount: 999999,
    promotions: [{ promotionCode: 'SHOULD-NOT-PRINT', discountAfterTax: 999999 }],
    items: [{
      productCode: '65087872',
      productName: 'CLEAR Dầu Gội Mát Lạnh Bạc Hà',
      quantity: 12,
      conversionRateAtOrder: 84,
      catalogSalePriceAtOrder: 11916,
      finalPrice: 11916,
      preTaxPriceAtOrder: 0,
      vatAmountAtOrder: 0,
      lineAmountAtOrder: 142992,
      amount: 142992,
      appliedPromotionRows: [{
        promotionCode: 'AD45232124DN11',
        description: 'Bảng Giá Tháng 6',
        discountPercent: 14,
        discountAfterTax: 23752
      }],
      promotionCode: 'AD45232124DN11',
      promotionDescription: 'Bảng Giá Tháng 6',
      discountPercent: 14
    }]
  };
}

test('DMS/direct-price orders suppress all promotion detail and legacy fallback', () => {
  const order = importedDirectOrder();
  assert.equal(PrintPromotionPolicy.shouldSuppressPromotionDetails(order), true);
  assert.equal(PrintPromotionPolicy.shouldApplyLegacyPromotionFallback(order), false);

  const sanitized = PrintPromotionPolicy.suppressPromotionDetails(order);
  assert.deepEqual(sanitized.promotions, []);
  assert.deepEqual(sanitized.items[0].appliedPromotionRows, []);
  assert.equal(sanitized.items[0].discountPercent, 0);
});

test('DMS exact builder recovers legacy zero pre-tax/VAT snapshots without promotions', () => {
  const document = buildDmsExactSalesInvoice(importedDirectOrder());
  const item = document.items[0];

  assert.equal(item.priceBeforeTaxBeforePromotion, 11033);
  assert.equal(item.priceAfterTaxBeforePromotion, 11916);
  assert.equal(item.priceAfterTaxAfterPromotion, 11916);
  assert.equal(item.vatAmountAtOrder, 10592);
  assert.equal(item.lineAmountAtOrder, 142992);
  assert.deepEqual(item.promotionRows, []);
  assert.deepEqual(document.promotions, []);
  assert.equal(document.totalPromotionAmount, 0);
  assert.equal(document.printPromotionSuppressed, true);

  const data = buildPrintData(document);
  assert.equal(data.erpInvoiceV46.items[0].priceBeforeTaxBeforePromotion, 11033);
  assert.equal(data.erpInvoiceV46.items[0].vatAmount, 10592);
  assert.deepEqual(data.erpInvoiceV46.promotions, []);
  assert.equal(data.erpInvoiceV46.summary.totalPromotionAmount, 0);

  const html = renderPrintHtml('SALES_INVOICE', document);
  assert.doesNotMatch(html, /CHI TIẾT KHUYẾN MÃI/);
  assert.doesNotMatch(html, /AD45232124DN11/);
});
