'use strict';

const assert = require('node:assert/strict');
const Module = require('node:module');
const test = require('node:test');

function queryModel(rows = []) {
  return {
    find() {
      return { lean: async () => rows };
    }
  };
}

test('legacy promotion fallback is batch-based and never overwrites order snapshots', async () => {
  const originalLoad = Module._load;
  const fakeModules = new Map([
    ['../../models/PromotionProductRule', queryModel([
      { productCode: 'SP1', programCode: 'KM1', programName: 'KM cũ', discountPercent: 2, isActive: true },
      { productCode: 'SP2', programCode: 'KM2', programName: 'KM legacy', discountPercent: 2, isActive: true }
    ])],
    ['../../models/PromotionGroupItem', queryModel([])],
    ['../../models/PromotionGroupRule', queryModel([])]
  ]);

  Module._load = function patchedLoad(request, parent, isMain) {
    if (fakeModules.has(request)) return fakeModules.get(request);
    return originalLoad.call(this, request, parent, isMain);
  };

  const servicePath = require.resolve('../src/domain/print/LegacyPromotionFallbackService');
  delete require.cache[servicePath];

  try {
    const service = require(servicePath);
    const orders = [{
      code: 'SO1',
      items: [
        {
          productCode: 'SP1',
          productName: 'Snapshot product',
          quantity: 1,
          catalogSalePriceAtOrder: 14000,
          finalPrice: 13000,
          conversionRateAtOrder: 12,
          warehouseCodeAtOrder: 'KHO_PC'
        },
        {
          productCode: 'SP2',
          productName: 'Legacy product',
          quantity: 1,
          salePrice: 13000
        }
      ]
    }];
    const productMap = new Map([
      ['SP1', { code: 'SP1', salePrice: 15000, conversionRate: 24, warehouseCode: 'KHO_HC' }],
      ['SP2', { code: 'SP2', salePrice: 15000, conversionRate: 24, warehouseCode: 'KHO_HC' }]
    ]);

    const [enriched] = await service.enrichSalesOrders(orders, productMap);
    const snapshot = enriched.items[0];
    const legacy = enriched.items[1];

    assert.equal(snapshot.catalogSalePriceAtOrder, 14000);
    assert.equal(snapshot.conversionRateAtOrder, 12);
    assert.equal(snapshot.warehouseCodeAtOrder, 'KHO_PC');
    assert.equal(snapshot.promotionRows[0].qualifiedAmount, Math.round(14000 / 1.08));
    assert.equal(legacy.promotionRows[0].qualifiedAmount, Math.round(15000 / 1.08));
  } finally {
    delete require.cache[servicePath];
    Module._load = originalLoad;
  }
});
