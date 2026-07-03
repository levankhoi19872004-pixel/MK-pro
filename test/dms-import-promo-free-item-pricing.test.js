'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildDmsExactSalesInvoice } = require('../src/domain/print/builders/DmsExactSalesInvoiceBuilder');
const printDataBuilder = require('../services/printDataBuilder');
const importValues = require('../src/services/import/core/importValue.util');

function sampleOrder() {
  return {
    id: 'SO-TEST',
    code: 'B0038748',
    documentCode: 'B0038748',
    orderDate: '2026-07-27',
    customerCode: '457649',
    customerName: 'Dũng Tin',
    salesStaffCode: '33955',
    salesStaffName: 'Đỗ Thị Mừng',
    source: 'DMS',
    orderSource: 'DMS',
    importSource: 'excel_dms',
    isImported: true,
    totalAmount: 113104,
    debtAmount: 113104,
    items: [
      {
        productCode: '65087872',
        productName: 'CLEAR Dầu Gội Mát Lạnh Bạc Hà 6gx(10+2)/84 dây',
        unit: 'dây',
        quantity: 8,
        conversionRateAtOrder: 84,
        catalogSalePriceAtOrder: 14138,
        catalogSalePriceSource: 'product.salePrice',
        priceAfterTaxBeforePromotionAtOrder: 14138,
        priceAfterTaxBeforePromotion: 14138,
        preTaxPriceAtOrder: 13091,
        listPriceBeforeVat: 13091,
        salePrice: 14138,
        finalPrice: 14138,
        finalPriceAtOrder: 14138,
        priceAfterTaxAfterPromotion: 14138,
        vatAmountAtOrder: 0,
        lineAmountAtOrder: 113104,
        lineAmount: 113104,
        amount: 113104,
        lineType: 'SALE',
        isPromo: false
      },
      {
        productCode: '65087872',
        productName: 'CLEAR Dầu Gội Mát Lạnh Bạc Hà 6gx(10+2)/84 dây',
        unit: 'dây',
        quantity: 4,
        conversionRateAtOrder: 84,
        // Mô phỏng dữ liệu xấu đã từng lưu: dòng KM vẫn có snapshot/danh mục giá > 0.
        catalogSalePriceAtOrder: 14138,
        catalogSalePriceSource: 'product.salePrice',
        productSnapshot: { salePrice: 14138, conversionRate: 84, unit: 'dây' },
        salePrice: 0,
        price: 0,
        finalPrice: 0,
        finalPriceAtOrder: 0,
        priceAfterTaxAfterPromotion: 0,
        vatAmountAtOrder: 0,
        lineAmountAtOrder: 0,
        lineAmount: 0,
        amount: 0,
        lineType: 'PROMO',
        isPromo: true,
        isPromotionItem: true
      }
    ]
  };
}

function productMap() {
  return new Map([
    ['65087872', {
      code: '65087872',
      name: 'CLEAR Dầu Gội Mát Lạnh Bạc Hà 6gx(10+2)/84 dây',
      unit: 'dây',
      conversionRate: 84,
      salePrice: 14138
    }]
  ]);
}

test('DMS exact print keeps promotion/free item monetary columns at zero even with catalog fallback available', () => {
  const built = buildDmsExactSalesInvoice(sampleOrder(), { productMap: productMap() });
  assert.equal(built.items.length, 2);

  const saleLine = built.items[0];
  const promoLine = built.items[1];

  assert.equal(saleLine.productCode, '65087872');
  assert.equal(saleLine.lineType, 'SALE');
  assert.equal(saleLine.priceAfterTaxBeforePromotion, 14138);
  assert.equal(saleLine.priceAfterTaxAfterPromotion, 14138);
  assert.equal(saleLine.lineAmount, 113104);

  assert.equal(promoLine.productCode, '65087872');
  assert.equal(promoLine.lineType, 'PROMO');
  assert.equal(promoLine.isPromo, true);
  assert.equal(promoLine.priceBeforeTaxBeforePromotion, 0);
  assert.equal(promoLine.priceAfterTaxBeforePromotion, 0);
  assert.equal(promoLine.priceAfterTaxAfterPromotion, 0);
  assert.equal(promoLine.currentCatalogSalePrice, 0);
  assert.equal(promoLine.vatAmount, 0);
  assert.equal(promoLine.lineAmount, 0);
  assert.equal(built.totalAmount, 113104);
  assert.equal(built.debtAmount, 113104);
});

test('print payload and summary do not fallback catalog price for promotion/free item rows', () => {
  const built = buildDmsExactSalesInvoice(sampleOrder(), { productMap: productMap() });
  const data = printDataBuilder.buildPrintData(built);
  const payload = data.erpInvoiceV46;
  const promoLine = payload.items.find((item) => item.lineType === 'PROMO' || item.isPromotionGift);

  assert.ok(promoLine, 'promotion line should be preserved in print payload');
  assert.equal(promoLine.priceBeforeTaxBeforePromotion, 0);
  assert.equal(promoLine.priceAfterTaxBeforePromotion, 0);
  assert.equal(promoLine.priceAfterTaxAfterPromotion, 0);
  assert.equal(promoLine.vatAmount, 0);
  assert.equal(promoLine.lineAmount, 0);
  assert.equal(payload.summary.goodsAmountAfterPromotion, 113104);
  assert.equal(payload.summary.grossAmountBeforePromotion, 113104);
  assert.equal(payload.summary.payableAmount, 113104);
});

test('DMS import parser treats quantity with explicit zero amount as promotion quantity, not sale quantity', () => {
  const row = {
    productCode: '65087872',
    quantity: 14,
    amount: 0,
    lineAmount: 0
  };
  assert.equal(importValues.isZeroAmountPromoLineFromRow(row), true);
  assert.equal(importValues.getDmsQuantityFromRow(row, { conversionRate: 84 }), 0);
  assert.equal(importValues.getDmsPromoQuantityFromRow(row, { conversionRate: 84 }), 14);
  assert.equal(importValues.getDmsPriceFromRow(row, 14), 0);
  assert.equal(importValues.getDmsAmountFromRow(row, 14, 14138), 0);
});
