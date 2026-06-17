'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const inventoryReport = require('../src/services/reports/InventoryReportService');
const salesReport = require('../src/services/reports/SalesReportService');
const financeReport = require('../src/services/reports/FinanceReportService');
const inventoryStock = require('../src/services/inventoryStock.service');
const reportUtils = require('../src/services/reports/ReportDomainUtils');

test('inventory movement uses signed quantity before transaction-name heuristics', () => {
  assert.equal(inventoryReport.transactionQuantity({ type: 'RETURN_UPDATE_REVERSAL', direction: 'IN', quantity: -10 }), -10);
  assert.equal(inventoryReport.transactionCategory({ type: 'RETURN_UPDATE_REVERSAL', quantity: -10 }, -10), 'return_reversal');
  assert.equal(inventoryReport.transactionQuantity({ type: 'SALE', direction: 'OUT', quantity: 12 }), -12);
  assert.equal(inventoryReport.transactionQuantity({ type: 'IMPORT', direction: 'IN', quantity: 20 }), 20);
});

test('inventory snapshot keeps on-hand, reserved and available quantities separate', () => {
  const row = { onHand: 100, reservedQty: 20, availableQty: 80 };
  assert.equal(inventoryStock.onHandOf(row), 100);
  assert.equal(inventoryStock.availableQuantityOf(row), 80);
  assert.equal(inventoryStock.quantityOf(row), 80);
});

test('sales valuation excludes promotion quantity and reconciles line values to confirmed order total', () => {
  const productMap = new Map([
    ['SP01', { code: 'SP01', name: 'Sản phẩm 1', salePrice: 12000 }],
    ['SP02', { code: 'SP02', name: 'Khuyến mại', salePrice: 5000 }]
  ]);
  const order = {
    totalAmount: 18000,
    items: [
      { productCode: 'SP01', quantity: 2, catalogSalePriceAtOrder: 10000, finalPriceAtOrder: 9000 },
      { productCode: 'SP02', quantity: 3, lineType: 'PROMO', isPromo: true, amount: 0 }
    ]
  };
  const result = salesReport.valueOrder(order, productMap);
  assert.equal(result.saleQuantity, 2);
  assert.equal(result.promoQuantity, 3);
  assert.equal(result.beforePromoAmount, 20000);
  assert.equal(result.actualAmount, 18000);
  assert.equal(result.promotionDiscountAmount, 2000);
  assert.equal(result.promoValue, 15000);
  assert.equal(result.saleLines.reduce((sum, line) => sum + line.actualAmount, 0), 18000);
});


test('sales valuation preserves an explicitly locked zero total', () => {
  const productMap = new Map([['SP01', { code: 'SP01', salePrice: 10000 }]]);
  const result = salesReport.valueOrder({
    afterPromoAmount: 0,
    totalAmount: 20000,
    items: [{ productCode: 'SP01', quantity: 2, amount: 20000 }]
  }, productMap);
  assert.equal(result.actualAmount, 0);
  assert.equal(result.saleLines.reduce((sum, line) => sum + line.actualAmount, 0), 0);
  assert.equal(result.dataQuality.rootAmountDefined, true);
});

test('delivery status checks every lifecycle field instead of trusting a stale pending alias', () => {
  assert.equal(reportUtils.isDelivered({ deliveryStatus: 'pending', status: 'completed' }), true);
  assert.equal(reportUtils.isDelivered({ deliveryStatus: 'failed', lifecycleStatus: 'pending' }), false);
});

test('fund report separates fund type and account while respecting explicit direction', () => {
  assert.equal(financeReport.fundTypeOf({ fundType: 'bank', account: '1121' }), 'bank');
  assert.equal(financeReport.fundTypeOf({ fundType: 'cash', account: '1111' }), 'cash');
  assert.equal(financeReport.directionOf({ direction: 'out', type: 'receipt' }), 'out');
  assert.equal(financeReport.directionOf({ direction: 'in', type: 'payment' }), 'in');
  assert.equal(financeReport.accountKeyOf({ fundType: 'bank', account: '1121' }), 'bank:1121');
});
