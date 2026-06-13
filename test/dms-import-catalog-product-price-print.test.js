'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  buildDmsExactSalesInvoice
} = require('../src/domain/print/builders/DmsExactSalesInvoiceBuilder');

const ROOT = path.resolve(__dirname, '..');

function directDmsOrder(item = {}) {
  return {
    id: 'SO-DMS-CATALOG-PRICE',
    code: 'B0037457',
    source: 'DMS',
    sourceType: 'dms_import',
    orderSource: 'DMS',
    saleMethod: 'direct_price',
    saleMode: 'direct_price',
    priceLocked: true,
    promotionCalculated: false,
    isPromotionSale: false,
    items: [{
      productCode: 'P001',
      productName: 'Sản phẩm kiểm thử',
      quantity: 10,
      conversionRateAtOrder: 12,
      finalPriceAtOrder: 92000,
      finalPrice: 92000,
      lineAmountAtOrder: 920000,
      ...item
    }]
  };
}

test('legacy DMS line restores column 4 from current product.salePrice instead of imported actual price', () => {
  const order = directDmsOrder({
    // Dữ liệu Phase 23 cũ từng lưu nhầm giá thực tế vào snapshot catalog.
    catalogSalePriceAtOrder: 92000,
    priceAfterTaxBeforePromotionAtOrder: 92000
  });
  const productMap = new Map([['P001', { code: 'P001', salePrice: 100000 }]]);
  const document = buildDmsExactSalesInvoice(order, { productMap });
  const item = document.items[0];

  assert.equal(item.priceBeforeTaxBeforePromotion, 92593); // cột 3 = cột 4 / 1.08
  assert.equal(item.priceAfterTaxBeforePromotion, 100000); // cột 4 = products.salePrice
  assert.equal(item.priceAfterTaxAfterPromotion, 92000); // cột 5 = giá thực tế import
  assert.equal(item.lineAmountAtOrder, 920000); // cột 7 = cột 5 x số lượng
  assert.equal(item.vatAmountAtOrder, 68148); // cột 6 tính theo giá thực tế
});

test('new DMS line keeps product sale-price snapshot even if catalog changes later', () => {
  const order = directDmsOrder({
    catalogSalePriceAtOrder: 100000,
    catalogSalePriceSource: 'product.salePrice',
    priceAfterTaxBeforePromotionSource: 'product.salePrice',
    priceAfterTaxBeforePromotionAtOrder: 100000,
    preTaxPriceAtOrder: 92593
  });
  const productMap = new Map([['P001', { code: 'P001', salePrice: 110000 }]]);
  const document = buildDmsExactSalesInvoice(order, { productMap });
  const item = document.items[0];

  assert.equal(item.priceAfterTaxBeforePromotion, 100000);
  assert.equal(item.priceBeforeTaxBeforePromotion, 92593);
  assert.equal(item.priceAfterTaxAfterPromotion, 92000);
});

test('DMS import source captures product.salePrice as catalog snapshot for column 4', () => {
  const source = fs.readFileSync(
    path.join(ROOT, 'src/services/excelImportService.js'),
    'utf8'
  );

  assert.match(source, /const productCatalogSalePrice = toNumber/);
  assert.match(source, /product\?\.salePrice/);
  assert.match(source, /catalogSalePriceSource = productCatalogSalePrice > 0/);
  assert.match(source, /'product\.salePrice'/);
  assert.match(source, /const listPriceBeforeVat = catalogSalePriceAtOrder > 0/);
  assert.match(source, /Math\.round\(catalogSalePriceAtOrder \/ 1\.08\)/);
});
