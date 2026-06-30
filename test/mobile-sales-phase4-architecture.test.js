'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const sourceBundle = require('./helpers/sourceBundle.util');

const ROOT = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const salesSource = sourceBundle.readSource(path.join(ROOT, 'public/mobile/js/sales.js'));
const html = read('public/mobile/sales.html');
const budget = require('../config/source-size-budget.json');

async function importStandalone(file) {
  const source = read(file);
  const url = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
  return import(url);
}

test('phase 4 exposes explicit mobile sales modules and keeps sales.js as orchestrator', () => {
  const modules = ['state', 'dom', 'customer', 'staff', 'product', 'cart', 'orders', 'debt', 'sync'];
  modules.forEach((name) => {
    assert.equal(fs.existsSync(path.join(ROOT, `public/mobile/js/sales/${name}.js`)), true, `${name}.js missing`);
    assert.match(salesSource, new RegExp(`sales/${name}\\.js`));
  });
  assert.doesNotMatch(salesSource, /let selectedCustomer\s*=|let cart\s*=|let todayOrderCache\s*=/);
  assert.match(salesSource, /createMobileSalesState/);
  assert.match(salesSource, /OrderDraftStore/);
  assert.match(salesSource, /collectMobileSalesDom/);
});

test('OrderDraftStore persists, restores and clears a user-scoped draft without DOM coupling', async () => {
  const { OrderDraftStore } = await importStandalone('public/mobile/js/sales/state.js');
  const rows = new Map();
  const storage = {
    getItem: (key) => rows.get(key) || null,
    setItem: (key, value) => rows.set(key, value),
    removeItem: (key) => rows.delete(key)
  };
  const store = new OrderDraftStore({ storage, ownerKey: '35128' });
  store.customer = { customerCode: 'C01' };
  store.cart = [{ productCode: 'P01', quantity: 2 }];
  store.editingOrderId = 'SO01';
  assert.equal(store.persist('1000'), true);

  const restored = new OrderDraftStore({ storage, ownerKey: '35128' });
  const snapshot = restored.restore();
  assert.equal(snapshot.customer.customerCode, 'C01');
  assert.equal(snapshot.cart[0].productCode, 'P01');
  assert.equal(snapshot.editingOrderId, 'SO01');
  assert.equal(snapshot.paidAmount, '1000');
  restored.clear();
  assert.equal(rows.size, 0);
});

test('customer identity and debt merge remain code-first and reject ambiguous name fallback', async () => {
  const customer = await importStandalone('public/mobile/js/sales/customer.js');
  const debtRows = [
    { customerCode: 'C01', customerName: 'Trùng tên', debtAmount: 100 },
    { customerCode: 'C02', customerName: 'Trùng tên', debtAmount: 200 }
  ];
  const lookup = customer.buildDebtLookup(debtRows);
  assert.equal(customer.mergeCustomerDebt({ customerCode: 'C02', customerName: 'Trùng tên' }, lookup).debtAmount, 200);
  assert.equal(customer.mergeCustomerDebt({ customerName: 'Trùng tên' }, lookup).debtAmount, 0);
});

test('staff and order domain modules preserve NVBH ownership and stable list merging', async () => {
  const staff = await importStandalone('public/mobile/js/sales/staff.js');
  const orders = await importStandalone('public/mobile/js/sales/orders.js');
  const scoped = staff.filterOrdersForCurrentSalesUser([
    { code: 'SO1', salesStaffCode: '35128' },
    { code: 'SO2', salesStaffCode: '99999' }
  ], { role: 'sales', salesStaffCode: '35128', salesStaffName: 'Tên trùng' });
  assert.deepEqual(scoped.map((row) => row.code), ['SO1']);
  const merged = orders.mergeOrderPages([{ id: '1', totalAmount: 10 }], [{ id: '1', totalAmount: 20 }, { id: '2' }]);
  assert.equal(merged.length, 2);
  assert.equal(merged.find((row) => row.id === '1').totalAmount, 20);
});

test('sync domain converts an offline command to a visible non-editable pending order', async () => {
  const sync = await importStandalone('public/mobile/js/sales/sync.js');
  const order = sync.offlineOperationToOrder({
    operationId: 'abc12345',
    clientCreatedAt: '2026-06-20T01:00:00.000Z',
    status: 'pending',
    payload: {
      customer: { customerCode: 'C01', customerName: 'Khách A' },
      items: [{ quantity: 2, salePrice: 100 }],
      paidAmount: 50
    }
  }, {
    customerCode: (row) => row.customerCode,
    customerName: (row) => row.customerName
  });
  assert.equal(order.pendingSync, true);
  assert.equal(order.canEdit, false);
  assert.equal(order.totalAmount, 200);
  assert.equal(order.debtAmount, null);
  assert.equal(order.currentDebtAmount, null);
  assert.equal(order.debtSource, 'UNAVAILABLE_PENDING_SYNC');
  assert.equal(order.debtDisplayText, 'Chưa có dữ liệu công nợ');
});

test('phase 4 lowers the main bundle budget and bumps browser cache version', () => {
  const bytes = fs.statSync(path.join(ROOT, 'public/mobile/js/sales.js')).size;
  assert.ok(bytes <= 40960, `sales.js is ${bytes} bytes`);
  assert.equal(budget.files['public/mobile/js/sales.js'], 40960);
  assert.match(html, /sales\.js\?v=phase86-production-hardening-v1/);
});
