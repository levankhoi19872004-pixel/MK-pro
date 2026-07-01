'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { PROMOTION_TYPES, calculatePromotionEngine } = require('../src/services/promotion/promotionEngine.service');

test('QUANTITY_GROUP_PERCENT_DISCOUNT cộng gộp nhiều sản phẩm đủ số lượng thì giảm trên dòng thuộc nhóm', () => {
  const result = calculatePromotionEngine({
    orderDate: '2026-07-01',
    items: [
      { productCode: 'A', quantity: 5, salePrice: 100000, lineAmount: 500000 },
      { productCode: 'B', quantity: 7, salePrice: 100000, lineAmount: 700000 },
      { productCode: 'C', quantity: 1, salePrice: 100000, lineAmount: 100000 }
    ],
    rules: [{
      code: 'QTY-NXV',
      name: 'NXV COMFORT/SURF đủ 12 dây giảm 17%',
      promotionType: PROMOTION_TYPES.QUANTITY_GROUP_PERCENT_DISCOUNT,
      productCodes: ['A', 'B'],
      minQty: 12,
      discountPercent: 17,
      isActive: true
    }]
  });

  const byCode = new Map(result.items.map((line) => [line.productCode, line]));
  assert.equal(byCode.get('A').discountAmount, 85000);
  assert.equal(byCode.get('B').discountAmount, 119000);
  assert.equal(byCode.get('C').discountAmount, 0);
  assert.equal(result.summary.finalAmount, 1096000);
});

test('QUANTITY_GROUP_PERCENT_DISCOUNT chưa đủ số lượng thì không giảm', () => {
  const result = calculatePromotionEngine({
    items: [
      { productCode: 'A', quantity: 6, salePrice: 100000, lineAmount: 600000 },
      { productCode: 'B', quantity: 5, salePrice: 100000, lineAmount: 500000 }
    ],
    rules: [{
      code: 'QTY-NXV',
      promotionType: PROMOTION_TYPES.QUANTITY_GROUP_PERCENT_DISCOUNT,
      productCodes: ['A', 'B'],
      minQty: 12,
      discountPercent: 17,
      isActive: true
    }]
  });
  assert.equal(result.summary.lineDiscountAmount, 0);
});

test('CUSTOMER_ORDER_VALUE_EXTRA_PERCENT chỉ áp dụng đúng khách trong danh sách và đủ doanh số', () => {
  const result = calculatePromotionEngine({
    customerCode: 'B0038442',
    items: [
      { productCode: 'A', quantity: 1, salePrice: 2100000, lineAmount: 2100000 }
    ],
    rules: [{
      code: 'CUST-DS',
      promotionType: PROMOTION_TYPES.CUSTOMER_ORDER_VALUE_EXTRA_PERCENT,
      customerCodes: ['B0038442', 'B0038423'],
      minOrderAmount: 2000000,
      discountPercent: 3,
      isActive: true
    }]
  });
  assert.equal(result.orderDiscounts.length, 1);
  assert.equal(result.orderDiscounts[0].discountAmount, 63000);
  assert.equal(result.summary.finalAmount, 2037000);
});

test('CUSTOMER_ORDER_VALUE_EXTRA_PERCENT không áp dụng cho khách ngoài danh sách', () => {
  const result = calculatePromotionEngine({
    customerCode: 'B0099999',
    items: [{ productCode: 'A', quantity: 1, salePrice: 3000000, lineAmount: 3000000 }],
    rules: [{
      code: 'CUST-DS',
      promotionType: PROMOTION_TYPES.CUSTOMER_ORDER_VALUE_EXTRA_PERCENT,
      customerCodes: ['B0038442', 'B0038423'],
      minOrderAmount: 2000000,
      discountPercent: 3,
      isActive: true
    }]
  });
  assert.equal(result.orderDiscounts.length, 0);
  assert.equal(result.summary.finalAmount, 3000000);
});
