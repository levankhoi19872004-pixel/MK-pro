'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { buildDmsExactSalesInvoice } = require('../src/domain/print/builders/DmsExactSalesInvoiceBuilder');
const printDataBuilder = require('../services/printDataBuilder');
const dmsExactSalesInvoiceTemplate = require('../templates/print/dmsExactSalesInvoice.template');
const templates = require('../templates/printTemplates');

function promotionOrder() {
  return {
    id: 'SO-PROMO-SUMMARY',
    code: 'B-PROMO-001',
    invoiceCode: 'B-PROMO-001',
    customerOrderCode: 'B-PROMO-001',
    source: 'DMS',
    orderSource: 'DMS',
    orderSourceName: 'Từ DMS',
    promotionCalculated: true,
    customerCode: 'KH001',
    customerName: 'Khách test',
    salesStaffCode: 'NV001',
    salesStaffName: 'NVBH test',
    totalPromotionAmount: 0,
    promotionAmount: 0,
    promotionValue: 0,
    items: [{
      productCode: 'P001',
      productName: 'Sản phẩm có mô tả khuyến mãi rất dài cần xuống dòng trong đúng cột',
      quantity: 100,
      conversionRateAtOrder: 12,
      catalogSalePriceAtOrder: 10000,
      catalogSalePriceSource: 'product.salePrice',
      priceAfterTaxBeforePromotionAtOrder: 10000,
      priceAfterTaxBeforePromotion: 10000,
      priceAfterTaxAfterPromotion: 9700,
      finalPriceAtOrder: 9700,
      finalPrice: 9700,
      lineAmountAtOrder: 970000,
      lineAmount: 970000,
      amount: 970000,
      lineType: 'SALE',
      appliedPromotionRows: [
        {
          promotionCode: 'AD-LONG-1',
          description: 'Mô tả chương trình chiết khấu cực dài có nhiều sản phẩm và điều kiện áp dụng cần tự xuống dòng, không được lấn sang các cột số tiền bên phải',
          qualifiedAmount: 500000,
          discountPercent: 2,
          discountBeforeTax: 9259,
          discountAfterTax: 10000
        },
        {
          promotionCode: 'AD-LONG-2',
          description: 'Mô tả chương trình khuyến mãi bằng tiền dòng thứ hai',
          qualifiedAmount: 500000,
          discountPercent: 4,
          discountBeforeTax: 18519,
          discountAfterTax: 20000
        }
      ]
    }]
  };
}

function productMap() {
  return new Map([['P001', { code: 'P001', name: 'Sản phẩm test', salePrice: 10000, conversionRate: 12 }]]);
}

test('DMS exact print calculates C total and promotion rate from promotion detail rows even when order totals are zero', () => {
  const document = buildDmsExactSalesInvoice(promotionOrder(), { productMap: productMap() });
  assert.equal(document.totalMoneyPromotionAmount, 30000);
  assert.equal(document.totalPromotionAmount, 30000);
  assert.equal(document.promotionRate, 3);

  const data = printDataBuilder.buildPrintData(document);
  assert.equal(data.erpInvoiceV46.summary.totalMoneyPromotionAmount, 30000);
  assert.equal(data.erpInvoiceV46.summary.totalPromotionAmount, 30000);
  assert.equal(data.erpInvoiceV46.summary.promotionRate, 3);

  const html = dmsExactSalesInvoiceTemplate(data);
  assert.match(html, /Tổng giá trị khuyến mãi tiền \(C\)<\/b><\/td><td class="dmsx-right"><b>30\.000<\/b>/);
  assert.match(html, /Tổng trị giá khuyến mãi bằng hàng và tiền \(B\+C\):<\/span><span>30\.000<\/span>/);
  assert.match(html, /Tỉ lệ KM &amp; CK của đơn hàng \[\(B\+C\+F\)\/G\]\*100%:<\/span><span>3,00%<\/span>/);
});

test('Legacy DMS template summary uses promotion rows for total C and renders 0,00% safely when no promotion exists', () => {
  const data = printDataBuilder.buildPrintData({
    ...promotionOrder(),
    promotions: promotionOrder().items[0].appliedPromotionRows,
    totalPromotionAmount: 0,
    items: promotionOrder().items
  });
  const html = templates.ORDER_TOTAL ? templates.DMS_DELIVERY_INVOICE(data) : '';
  assert.match(html, /Tổng giá trị khuyến mãi tiền \(C\)<\/b><\/td><td class="dmsx-right"><b>30\.000<\/b>/);

  const noPromoData = printDataBuilder.buildPrintData({
    code: 'SO-NO-PROMO',
    customerCode: 'KH0',
    customerName: 'Không KM',
    salesStaffCode: 'NV0',
    items: [{ productCode: 'A', productName: 'A', quantity: 1, priceAfterTaxBeforePromotion: 10000, priceAfterTaxAfterPromotion: 10000, lineAmount: 10000 }]
  });
  assert.equal(noPromoData.erpInvoiceV46.summary.totalPromotionAmount, 0);
  assert.equal(noPromoData.erpInvoiceV46.summary.promotionRate, 0);
});

test('DMS promotion detail CSS wraps long descriptions and keeps numeric columns isolated', () => {
  const exactCss = fs.readFileSync(path.join(__dirname, '..', 'public', 'dms-exact-sales-invoice.css'), 'utf8');
  const legacyCss = fs.readFileSync(path.join(__dirname, '..', 'public', 'print.source', 'print-02.css'), 'utf8');

  assert.match(exactCss, /\.dmsx-promotion-table[\s\S]*table-layout:\s*fixed/);
  assert.match(exactCss, /\.dmsx-promotion-table \.dmsx-promo-description[\s\S]*overflow-wrap:\s*anywhere/);
  assert.match(exactCss, /\.dmsx-promotion-table \.dmsx-money-cell[\s\S]*white-space:\s*nowrap/);

  assert.match(legacyCss, /\.dms-promotion-table[\s\S]*table-layout:\s*fixed/);
  assert.match(legacyCss, /\.dms-promotion-table \.dms-promo-description-cell[\s\S]*overflow-wrap:\s*anywhere/);
  assert.match(legacyCss, /\.dms-promotion-table \.dms-money-cell[\s\S]*white-space:\s*nowrap/);
});
