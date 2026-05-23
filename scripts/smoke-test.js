'use strict';

const assert = require('assert');
const { getMemoryData, setMemoryData } = require('../config/db');
const salesService = require('../services/mobile/mobileSalesService');

async function run() {
  setMemoryData({
    products: [{ sku: 'SP001', name: 'Test Product', qty: 10, price: 10000 }],
    customers: [{ code: 'C001', name: 'Khach Test', staffCode: 'NV001' }],
    staff: [], deliveryStaff: [], users: [], orders: [], receipts: [], masterOrders: [], debts: [], payments: [], promotions: [], productPromotions: [], groupPromotions: [], customerGroups: [], customerGroupPromotions: [], productGroups: [], categoryGroups: [], shortageReports: [], returns: [], deliveryReports: [], dmsStocks: [], dmsAllocations: [], dmsHistory: [], dmsAllowSales: [], cashFunds: []
  });

  const user = { role: 'sales', maNhanVien: 'NV001', tenNhanVien: 'Nhan vien 001' };
  const payload = { id: 'APP-TEST-001', customerCode: 'C001', customer: 'Khach Test', items: [{ sku: 'SP001', name: 'Test Product', qty: 2, sale: 10000 }] };
  const created = await salesService.createOrder(user, payload);
  assert.strictEqual(created.created, true, 'first order should be created');

  let data = getMemoryData();
  assert.strictEqual(data.orders.length, 1, 'order should be saved');
  assert.strictEqual(Number(data.products[0].qty), 8, 'stock should decrease once');

  const duplicate = await salesService.createOrder(user, payload);
  assert.strictEqual(duplicate.created, false, 'duplicate should not create new order');

  data = getMemoryData();
  assert.strictEqual(data.orders.length, 1, 'duplicate must not increase order count');
  assert.strictEqual(Number(data.products[0].qty), 8, 'duplicate must not deduct stock again');

  let failed = false;
  try {
    await salesService.createOrder(user, { id: 'APP-TEST-002', customerCode: 'C001', items: [{ sku: 'SP001', qty: 99, sale: 10000 }] });
  } catch (err) {
    failed = err.code === 'INSUFFICIENT_STOCK';
  }
  assert.strictEqual(failed, true, 'oversell should be rejected');

  console.log('SMOKE_TEST_OK: mobile sales order, duplicate-safe, stock validation');
}

run().catch(err => {
  console.error('SMOKE_TEST_FAILED:', err);
  process.exit(1);
});
