'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ReturnOrder = require('../src/models/ReturnOrder');
const returnOrderRepository = require('../src/repositories/returnOrderRepository');
const returnOrderService = require('../src/services/returnOrderService');

function patch(target, replacements) {
  const originals = {};
  for (const [key, value] of Object.entries(replacements)) {
    originals[key] = target[key];
    target[key] = value;
  }
  return () => {
    for (const [key, value] of Object.entries(originals)) target[key] = value;
  };
}

test('ReturnOrder schema declares all date paths used by strictQuery filters', () => {
  for (const field of ['returnDate', 'date', 'documentDate', 'deliveryDate']) {
    assert.ok(ReturnOrder.schema.path(field), `Missing ReturnOrder schema path: ${field}`);
  }
  for (const field of ['customerCode', 'deliveryStaffCode', 'salesStaffCode', 'note']) {
    assert.ok(ReturnOrder.schema.path(field), `Missing ReturnOrder searchable path: ${field}`);
  }
});

test('listReturnOrders rechecks canonical displayed date and removes rows outside selected range', async () => {
  const restore = patch(returnOrderRepository, {
    findAll: async () => [
      {
        id: 'RO-OUTSIDE',
        code: 'RO-OUTSIDE',
        returnDate: '2026-06-13',
        deliveryDate: '2026-06-14',
        status: 'waiting_receive',
        totalAmount: 100000,
        debtReduction: 100000
      },
      {
        id: 'RO-MATCH',
        code: 'RO-MATCH',
        returnDate: '14/06/2026',
        deliveryDate: '2026-06-13',
        status: 'waiting_receive',
        totalAmount: 200000,
        debtReduction: 200000
      }
    ]
  });

  try {
    const rows = await returnOrderService.listReturnOrders({
      dateFrom: '2026-06-14',
      dateTo: '2026-06-14'
    });
    assert.deepEqual(rows.map((row) => row.code), ['RO-MATCH']);
    assert.equal(rows[0].returnDate, '2026-06-14');
  } finally {
    restore();
  }
});

test('listReturnOrders rejects reversed date range before querying MongoDB', async () => {
  let called = false;
  const restore = patch(returnOrderRepository, {
    findAll: async () => {
      called = true;
      return [];
    }
  });

  try {
    await assert.rejects(
      returnOrderService.listReturnOrders({ dateFrom: '2026-06-15', dateTo: '2026-06-14' }),
      (err) => err && err.code === 'INVALID_RETURN_ORDER_DATE_RANGE' && err.status === 400
    );
    assert.equal(called, false);
  } finally {
    restore();
  }
});

test('return-order filter UI is compact, modular and has no Today mode selector', () => {
  const root = path.resolve(__dirname, '..');
  const html = require('./helpers/sourceBundle.util').readSource(path.join(root, 'public/index.html'));
  const dom = require('./helpers/sourceBundle.util').readSource(path.join(root, 'public/js/app/state/00b-debt-return-fund-state.js'));
  const js = require('./helpers/sourceBundle.util').readSource(path.join(root, 'public/js/app/debt/07b-return-orders.js'));
  const masterReturnJs = require('./helpers/sourceBundle.util').readSource(path.join(root, 'public/js/app/debt/07d-master-return-orders.js'));
  const css = require('./helpers/sourceBundle.util').readSource(path.join(root, 'public/css/10-operational-overrides.css'));

  assert.match(html, /id="returnOrderFilterForm" class="return-order-filter-form"/);
  assert.match(html, /id="applyReturnOrderFiltersButton"[^>]*>Lọc<\/button>/);
  assert.match(html, /id="clearReturnOrderFiltersButton"[^>]*>Xóa lọc<\/button>/);
  assert.doesNotMatch(html, /id="returnOrderDateMode"/);
  assert.doesNotMatch(html, /<option value="today">Hôm nay<\/option>/);

  assert.match(dom, /const returnOrderFilterForm=document\.getElementById\('returnOrderFilterForm'\)/);
  assert.doesNotMatch(dom, /returnOrderDateMode/);
  assert.match(js, /if\(dateFrom&&dateTo&&dateFrom>dateTo\)/);
  assert.match(js, /returnOrderFilterForm\.addEventListener\('submit'/);
  assert.match(js, /clearReturnOrderFiltersButton\.addEventListener\('click'/);
  assert.match(js, /formatDateVN\(returnDate\)/);
  assert.doesNotMatch(js, /params\.set\('dateMode'/);
  assert.doesNotMatch(masterReturnJs, /returnOrderFilterForm\.addEventListener/);
  assert.doesNotMatch(masterReturnJs, /returnOrderDateMode/);

  assert.match(css, /#returnOrdersTab \.return-order-filter-form\{/);
  assert.match(css, /grid-template-columns:minmax\(280px,1fr\) minmax\(330px,420px\) auto!important/);
});
