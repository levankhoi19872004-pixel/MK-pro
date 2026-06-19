'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const sourceBundle = require('./helpers/sourceBundle.util');
const ExcelInteractionService = require('../src/services/excel/ExcelInteractionService');
const ProductExcelEnrichmentService = require('../src/services/excel/ProductExcelEnrichmentService');

test('product Excel catalog metadata uses numeric packing quantity and catalog sale price', () => {
  const productMap = ProductExcelEnrichmentService.buildProductMap([{
    code: 'P1',
    conversionRate: 24,
    packing: '1 Thùng = 24 Gói',
    salePrice: 120000
  }]);
  const meta = ProductExcelEnrichmentService.catalogMeta(productMap, { productCode: 'P1' });

  assert.equal(meta.packingQty, 24);
  assert.equal(typeof meta.packingQty, 'number');
  assert.equal(meta.salePrice, 120000);
  assert.notEqual(meta.packingQty, '1 Thùng = 24 Gói');
});

test('child-order Excel keeps catalog sale price and post-promotion price as separate columns', () => {
  const productMap = ProductExcelEnrichmentService.buildProductMap([{
    code: 'P1',
    conversionRate: 24,
    salePrice: 120000
  }]);
  const rows = ExcelInteractionService._internal.salesItemRows([{
    code: 'SO1',
    items: [{
      productCode: 'P1',
      productName: 'Sản phẩm 1',
      conversionRate: 12,
      quantity: 25,
      salePrice: 100000,
      finalPrice: 90000,
      amount: 2250000
    }]
  }], productMap);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].catalogPackingQty, 24);
  assert.equal(rows[0].catalogSalePrice, 120000);
  assert.equal(rows[0].finalPrice, 90000);
  assert.equal(rows[0].promotionValue, 750000);
});

test('master-order and import-order product rows receive catalog packing and sale price', () => {
  const productMap = ProductExcelEnrichmentService.buildProductMap([{
    code: 'P1',
    conversionRate: 48,
    salePrice: 35000
  }]);
  const masters = [{
    code: 'MO1',
    children: [{ code: 'SO1', items: [{ productCode: 'P1', quantity: 50, salePrice: 30000 }] }]
  }];
  const imports = [{
    code: 'IN1',
    items: [{ productCode: 'P1', quantity: 50, costPrice: 20000 }]
  }];

  const masterRows = ExcelInteractionService._internal.masterItemRows(masters, productMap);
  const importRows = ExcelInteractionService._internal.importOrderItemRows(imports, productMap);

  assert.equal(masterRows[0].catalogPackingQty, 48);
  assert.equal(masterRows[0].catalogSalePrice, 35000);
  assert.equal(importRows[0].catalogPackingQty, 48);
  assert.equal(importRows[0].catalogSalePrice, 35000);
  assert.equal(importRows[0].costPrice, 20000);
});

test('all governed Excel paths include the product catalog rule and print Excel keeps post-promotion price', () => {
  const interaction = sourceBundle.readSource('src/services/excel/ExcelInteractionService.js');
  const legacy = sourceBundle.readSource('src/services/importExportLegacy.service.js');
  const templates = sourceBundle.readSource('templates/printTemplates.js');

  assert.match(interaction, /label: 'Quy cách', key: 'catalogPackingQty'/);
  assert.match(interaction, /label: 'Giá bán', key: 'catalogSalePrice'/);
  assert.match(interaction, /label: 'Giá sau KM', key: 'finalPrice'/);
  assert.match(legacy, /Quy cách là số lượng đóng gói/);
  assert.match(legacy, /Giá bán lấy từ danh mục sản phẩm/);
  assert.match(templates, /excel-only-column/);
  assert.match(templates, /Giá bán/);
  assert.match(templates, /priceAfterTaxAfterPromotion/);
});

test('print builders use current catalog metadata only for Excel fields while preserving transaction prices', () => {
  const ProductCatalogExportPolicy = require('../src/domain/catalog/ProductCatalogExportPolicy');
  const { buildDmsExactSalesInvoice } = require('../src/domain/print/builders/DmsExactSalesInvoiceBuilder');
  const { buildMasterPicking } = require('../src/domain/print/builders/MasterPickingBuilder');
  const { buildImportPicking } = require('../src/domain/print/builders/ImportPickingBuilder');
  const { buildReturnPicking } = require('../src/domain/print/builders/ReturnPickingBuilder');

  const product = { code: 'P1', conversionRate: 24, salePrice: 120000 };
  const productMap = new Map([['P1', product]]);
  const item = {
    productCode: 'P1', productName: 'Sản phẩm 1', quantity: 25,
    conversionRateAtOrder: 12, catalogSalePriceAtOrder: 100000,
    finalPrice: 90000, amount: 2250000
  };

  assert.deepEqual(ProductCatalogExportPolicy.metadata(product), { packingQty: 24, salePrice: 120000 });
  assert.deepEqual(ProductCatalogExportPolicy.metadata({}), { packingQty: '', salePrice: '' });

  const child = buildDmsExactSalesInvoice({ code: 'SO1', items: [item] }, { productMap });
  assert.equal(child.items[0].catalogPackingQty, 24);
  assert.equal(child.items[0].currentCatalogSalePrice, 120000);
  assert.equal(child.items[0].priceAfterTaxAfterPromotion, 90000);

  const master = buildMasterPicking(
    [{ code: 'MO1' }],
    [{ code: 'SO1', masterOrderCode: 'MO1', items: [item] }],
    { productMap, childMasterMap: new Map([['SO1', 'MO1']]) }
  );
  assert.equal(master.items[0].catalogPackingQty, 24);
  assert.equal(master.items[0].catalogSalePrice, 120000);

  const imported = buildImportPicking([{ code: 'IN1', items: [{ ...item, costPrice: 70000 }] }], { productMap });
  assert.equal(imported.items[0].catalogPackingQty, 24);
  assert.equal(imported.items[0].catalogSalePrice, 120000);
  assert.equal(imported.items[0].costPrice, 70000);

  const returned = buildReturnPicking(
    { code: 'MR1' },
    [{ code: 'RO1', items: [{ ...item, returnQty: 2 }] }],
    { productMap }
  );
  assert.equal(returned.items[0].catalogPackingQty, 24);
  assert.equal(returned.items[0].catalogSalePrice, 120000);
  assert.equal(returned.items[0].finalPrice, 90000);
});

test('exact child-order print Excel adds catalog packing and sale price without removing post-promotion price', () => {
  const template = require('../templates/print/dmsExactSalesInvoice.template');
  const html = template({
    document: { code: 'SO1' },
    erpInvoiceV46: {
      items: [{
        lineNo: 1,
        productCode: 'P1',
        productName: 'Sản phẩm 1',
        catalogPackingQty: 24,
        currentCatalogSalePrice: 120000,
        quantityCsSu: '1/1',
        quantity: 25,
        priceBeforeTaxBeforePromotion: 111111,
        priceAfterTaxBeforePromotion: 100000,
        priceAfterTaxAfterPromotion: 90000,
        vatAmount: 10000,
        lineAmount: 2250000
      }],
      summary: { totalQty: 25, goodsAmountAfterPromotion: 2250000 }
    }
  });

  assert.match(html, /class="excel-only-column">Quy cách<\/th>/);
  assert.match(html, /class="excel-only-column">Giá bán<\/th>/);
  assert.match(html, />24<\/td>/);
  assert.match(html, />120\.000<\/td>/);
  assert.match(html, />90\.000<\/td>/);
  assert.match(html, /exportCurrentPrintToExcel/);
});
