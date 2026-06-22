'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getCurrentPickingZone,
  applyCurrentProductPickingZone
} = require('../src/utils/productHydration');
const { buildMasterPicking } = require('../src/domain/print/builders/MasterPickingBuilder');
const { buildReturnPicking } = require('../src/domain/print/builders/ReturnPickingBuilder');
const { buildImportPicking } = require('../src/domain/print/builders/ImportPickingBuilder');

const STALE_HC_ITEM = {
  productCode: '65711748',
  productName: 'COMFORT ThanhNhã 1.4L + OMO CTrên MẫuĐơn 1.9Kg & B.Dịu/3 Bộ',
  quantity: 3,
  salePrice: 177300,
  pickingZone: 'HC',
  warehouseCode: 'KHO_HC',
  conversionRate: 3
};

const CURRENT_PC_PRODUCT = {
  code: '65711748',
  name: 'COMFORT ThanhNhã 1.4L + OMO CTrên MẫuĐơn 1.9Kg & B.Dịu/3 Bộ',
  pickingZone: 'PC',
  salePrice: 177300,
  conversionRate: 3
};

test('getCurrentPickingZone uses products.pickingZone before stale line snapshot', () => {
  assert.equal(getCurrentPickingZone(STALE_HC_ITEM, CURRENT_PC_PRODUCT), 'PC');
  assert.deepEqual(
    applyCurrentProductPickingZone(STALE_HC_ITEM, CURRENT_PC_PRODUCT),
    {
      ...STALE_HC_ITEM,
      pickingZone: 'PC',
      currentPickingZone: 'PC',
      pickingZoneSource: 'products.currentPickingZone',
      warehouseCode: 'KHO_PC',
      warehouseName: 'PC'
    }
  );
});

test('getCurrentPickingZone falls back to line snapshot when product is missing from catalog', () => {
  assert.equal(getCurrentPickingZone(STALE_HC_ITEM, null), 'HC');
});

test('buildMasterPicking hydrates stale HC item to current PC without changing quantity or price', () => {
  const master = { id: 'MO1', code: 'MO1', deliveryStaffCode: 'GH01' };
  const children = [{ id: 'SO1', code: 'SO1', masterOrderCode: 'MO1', items: [STALE_HC_ITEM] }];
  const document = buildMasterPicking([master], children, {
    childMasterMap: new Map([['SO1', 'MO1']]),
    productMap: new Map([['65711748', CURRENT_PC_PRODUCT]])
  });

  assert.equal(document.items.length, 1);
  assert.equal(document.items[0].pickingZone, 'PC');
  assert.equal(document.items[0].warehouseCode, 'KHO_PC');
  assert.equal(document.items[0].quantity, 3);
  assert.equal(document.items[0].salePrice, 177300);
  assert.equal(document.items[0].amount, 531900);
});

test('buildMasterPicking hydrates stale PC item back to current HC', () => {
  const stalePcItem = { ...STALE_HC_ITEM, pickingZone: 'PC', warehouseCode: 'KHO_PC' };
  const currentHcProduct = { ...CURRENT_PC_PRODUCT, pickingZone: 'HC' };
  const document = buildMasterPicking(
    [{ id: 'MO1', code: 'MO1' }],
    [{ id: 'SO1', code: 'SO1', masterOrderCode: 'MO1', items: [stalePcItem] }],
    { childMasterMap: new Map([['SO1', 'MO1']]), productMap: new Map([['65711748', currentHcProduct]]) }
  );

  assert.equal(document.items[0].pickingZone, 'HC');
  assert.equal(document.items[0].warehouseCode, 'KHO_HC');
});

test('return and import aggregate picking also use current product picking zone', () => {
  const returnDocument = buildReturnPicking(
    { id: 'MRO1', code: 'MRO1' },
    [{ id: 'RO1', code: 'RO1', items: [{ ...STALE_HC_ITEM, returnQty: 3 }] }],
    { productMap: new Map([['65711748', CURRENT_PC_PRODUCT]]) }
  );
  assert.equal(returnDocument.items[0].warehouseCode, 'KHO_PC');

  const importDocument = buildImportPicking(
    [{ id: 'PN1', code: 'PN1', items: [{ ...STALE_HC_ITEM, costPrice: 1000 }] }],
    { productMap: new Map([['65711748', CURRENT_PC_PRODUCT]]) }
  );
  assert.equal(importDocument.items[0].warehouseCode, 'KHO_PC');
});

test('hydrate before group keeps Phase33 ABC sort inside current HC/PC groups', () => {
  const children = [{
    id: 'SO1',
    code: 'SO1',
    masterOrderCode: 'MO1',
    items: [
      { productCode: '003', productName: 'OMO Đỏ', quantity: 1, salePrice: 1, pickingZone: 'HC', conversionRate: 1 },
      { productCode: '001', productName: 'Comfort Xanh', quantity: 1, salePrice: 1, pickingZone: 'HC', conversionRate: 1 },
      { productCode: '002', productName: 'Cif Kem', quantity: 1, salePrice: 1, pickingZone: 'HC', conversionRate: 1 }
    ]
  }];
  const productMap = new Map([
    ['003', { code: '003', name: 'OMO Đỏ', pickingZone: 'PC' }],
    ['001', { code: '001', name: 'Comfort Xanh', pickingZone: 'PC' }],
    ['002', { code: '002', name: 'Cif Kem', pickingZone: 'PC' }]
  ]);

  const document = buildMasterPicking([{ id: 'MO1', code: 'MO1' }], children, {
    childMasterMap: new Map([['SO1', 'MO1']]),
    productMap
  });

  assert.deepEqual(document.items.map((row) => `${row.pickingZone}:${row.productName}`), [
    'PC:Cif Kem',
    'PC:Comfort Xanh',
    'PC:OMO Đỏ'
  ]);
});
