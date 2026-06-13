'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { normalizeLine } = require('../src/domain/print/PrintLineNormalizer');
const { mergeLines } = require('../src/domain/print/PrintMergeService');
const { buildMasterPicking } = require('../src/domain/print/builders/MasterPickingBuilder');

test('snapshot price, pack and warehouse win over current product fallback', () => {
  const line = normalizeLine({
    productCode: 'SP1',
    productName: 'Sản phẩm cũ',
    quantity: 25,
    catalogSalePriceAtOrder: 14000,
    finalPrice: 13000,
    conversionRateAtOrder: 12,
    warehouseCodeAtOrder: 'KHO_PC'
  }, {
    product: {
      code: 'SP1',
      name: 'Sản phẩm mới',
      salePrice: 15000,
      conversionRate: 24,
      warehouseCode: 'KHO_HC'
    },
    mode: 'sale'
  });

  assert.equal(line.catalogPrice, 14000);
  assert.equal(line.finalPrice, 13000);
  assert.equal(line.conversionRate, 12);
  assert.equal(line.warehouseCode, 'KHO_PC');
  assert.equal(line.cartonUnitDisplay, '2/1');
});

test('merge key keeps warehouse, line type and price separated', () => {
  const base = {
    productCode: 'SP1',
    productName: 'Sản phẩm',
    quantity: 2,
    catalogPrice: 10000,
    finalPrice: 9000,
    lineAmount: 18000,
    conversionRate: 12,
    sourceOrderCodes: ['SO1']
  };

  const merged = mergeLines([
    { ...base, warehouseCode: 'KHO_HC', lineType: 'SALE' },
    { ...base, warehouseCode: 'KHO_PC', lineType: 'SALE' },
    { ...base, warehouseCode: 'KHO_HC', lineType: 'PROMO', finalPrice: 0, lineAmount: 0 },
    { ...base, warehouseCode: 'KHO_HC', lineType: 'SALE', catalogPrice: 11000 }
  ], { priceField: 'catalogPrice' });

  assert.equal(merged.length, 4);
});

test('single and selected-master print use the same builder contract', () => {
  const master = {
    id: 'MO1',
    code: 'MO1',
    deliveryDate: '2026-06-13',
    childOrderIds: ['SO1'],
    deliveryStaffCode: 'GH1',
    deliveryStaffName: 'NV giao'
  };
  const child = {
    id: 'SO1',
    code: 'SO1',
    items: [{
      productCode: 'SP1',
      productName: 'Sản phẩm',
      quantity: 12,
      catalogSalePriceAtOrder: 10000,
      finalPrice: 9000,
      conversionRateAtOrder: 12,
      warehouseCodeAtOrder: 'KHO_HC'
    }]
  };
  const childMasterMap = new Map([['SO1', 'MO1']]);

  const single = buildMasterPicking([master], [child], { childMasterMap, productMap: new Map() });
  const selected = buildMasterPicking([master], [child], { childMasterMap, productMap: new Map() });

  assert.deepEqual(single.items, selected.items);
  assert.equal(single.totalAmount, selected.totalAmount);
  assert.equal(single.printProfile, 'WAREHOUSE_PICKING');
});
