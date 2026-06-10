'use strict';

const Module = require('module');
const originalLoad = Module._load;
const calls = [];

function makeFindModel(name, rows) {
  return {
    find(query) {
      calls.push({ name, query });
      return {
        lean: async () => rows.filter((row) => {
          if (query?.code?.$in) return query.code.$in.includes(row.code);
          if (query?.productCode?.$in) return query.productCode.$in.includes(row.productCode);
          if (query?.programCode?.$in) return query.programCode.$in.includes(row.programCode);
          return true;
        })
      };
    }
  };
}

const fakeOrder = {
  id: 'SO20260606198451',
  code: 'SO20260606198451',
  items: [
    {
      productCode: '64828148',
      productName: 'OMO NG THIEN NHIEN 4X3.6KG',
      quantity: 1,
      qty: 1,
      salePrice: 128912,
      amount: 128912
    },
    {
      productCode: '65650864',
      productName: 'OMO NướcGiặt MG CửaTrước H.Hoa Oải Hương Thư Thái 3.6kg/4túi',
      quantity: 1,
      qty: 1,
      salePrice: 166154,
      amount: 166154
    }
  ]
};

const fakeModules = new Map([
  ['./orderRepository', {
    findByIdOrCode: async () => fakeOrder
  }],
  ['./masterOrderRepository', {}],
  ['./importOrderRepository', {}],
  ['./receiptRepository', {}],
  ['./cashbookRepository', {}],
  ['./bankbookRepository', {}],
  ['../models/Product', makeFindModel('Product', [
    { code: '64828148', name: 'OMO NG THIEN NHIEN 4X3.6KG', salePrice: 198327, conversionRate: 4, unit: 'Thùng' },
    { code: '65650864', name: 'OMO NướcGiặt MG CửaTrước H.Hoa Oải Hương Thư Thái 3.6kg/4túi', salePrice: 169545, conversionRate: 4, unit: 'Thùng' }
  ])],
  ['../models/PromotionProductRule', makeFindModel('PromotionProductRule', [
    { programCode: 'AD45232124DN11', programName: 'Bảng Giá Tháng 6', productCode: '65650864', discountPercent: 2, isActive: true }
  ])],
  ['../models/PromotionGroupItem', makeFindModel('PromotionGroupItem', [])],
  ['../models/PromotionGroupRule', makeFindModel('PromotionGroupRule', [])]
]);

Module._load = function patchedLoad(request, parent, isMain) {
  if (fakeModules.has(request)) return fakeModules.get(request);
  return originalLoad.apply(this, arguments);
};

(async () => {
  const repo = require('./src/repositories/printRepository');
  const result = await repo.findDocumentByPrintType('DMS_DELIVERY_INVOICE', 'SO20260606198451');
  const target = result.document.items.find((item) => item.productCode === '65650864');
  console.log(JSON.stringify(target.promotionRows, null, 2));

  if (!target.promotionRows || target.promotionRows.length !== 1) throw new Error('promotionRows missing');
  const row = target.promotionRows[0];
  if (row.promotionCode !== 'AD45232124DN11') throw new Error('wrong promotionCode');
  if (row.description !== 'Bảng Giá Tháng 6') throw new Error('wrong description');
  if (row.discountPercent !== 2) throw new Error('wrong percent');
  if (row.qualifiedAmount !== 156986) throw new Error('wrong qualifiedAmount: ' + row.qualifiedAmount);
  if (row.discountAfterTax !== 3391) throw new Error('wrong afterTax: ' + row.discountAfterTax);
  if (row.discountBeforeTax !== 3140) throw new Error('wrong beforeTax: ' + row.discountBeforeTax);
  console.log('PRINT_PROMOTION_FALLBACK_TEST_OK');
})().finally(() => {
  Module._load = originalLoad;
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
