'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const readPublicCss = require('./helpers/readPublicCss');

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

test('listReturnOrders no longer throws uniqueClean ReferenceError and returns Mongo rows', async () => {
  let capturedFilter = null;
  let capturedOptions = null;
  const restore = patch(returnOrderRepository, {
    findAll: async (filter, options) => {
      capturedFilter = filter;
      capturedOptions = options;
      return [{
        id: 'RO-SO001',
        code: 'RO-SO001',
        salesOrderCode: 'SO001',
        customerCode: 'KH001',
        customerName: 'Khách thử nghiệm',
        date: '2026-06-14',
        status: 'waiting_receive',
        totalQuantity: 2,
        totalAmount: 150000,
        debtReduction: 150000,
        items: [{ productCode: 'SP01', returnQty: 2, price: 75000 }]
      }];
    }
  });

  try {
    const rows = await returnOrderService.listReturnOrders({
      dateFrom: '2026-06-14',
      dateTo: '2026-06-14',
      page: '1',
      limit: '50'
    });

    assert.equal(rows.length, 1);
    assert.equal(rows[0].code, 'RO-SO001');
    assert.equal(rows[0].totalAmount, 150000);
    assert.ok(capturedFilter);
    assert.deepEqual(capturedOptions, {
      sort: { createdAt: -1, code: -1 },
      skip: 0,
      limit: 50
    });
  } finally {
    restore();
  }
});

test('return-order screen uses a full-width list and readonly detail popup', () => {
  const root = path.resolve(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
  const js = [
    fs.readFileSync(path.join(root, 'public/js/app/debt/07b-return-orders.js'), 'utf8'),
    fs.readFileSync(path.join(root, 'public/js/app/debt/07d-master-return-orders.js'), 'utf8')
  ].join('\n');
  const dom = fs.readFileSync(path.join(root, 'public/js/app/state/00b-debt-return-fund-state.js'), 'utf8');
  const css = readPublicCss(root);
  const service = fs.readFileSync(path.join(root, 'src/services/returnOrderLegacy.service.js'), 'utf8');

  assert.match(html, /id="returnOrderDetailModal" class="modal-backdrop return-order-detail-modal"/);
  assert.match(html, /id="returnOrderDetailPanel" class="return-order-detail-panel return-order-modal-body"/);
  assert.match(html, /<th>Thao tác<\/th>/);
  assert.doesNotMatch(html, /class="return-order-split-layout"/);

  assert.match(dom, /const returnOrderDetailModal=document\.getElementById\('returnOrderDetailModal'\)/);
  assert.match(js, /function openReturnOrderDetailModal\(\)/);
  assert.match(js, /function closeReturnOrderDetailPopup\(options=\{\}\)/);
  assert.match(js, /event\.key==='Escape'&&isReturnOrderDetailModalOpen\(\)/);
  assert.match(js, /data-return-action="view">Xem chi tiết<\/button>/);
  assert.match(js, /if\(options\.open!==false\)openReturnOrderDetailModal\(\)/);
  assert.doesNotMatch(js, /selectedReturnOrderKey=returnOrderRowKey\(rows\[0\]\)/);

  assert.match(css, /#returnOrdersTab \.return-order-detail-modal-card\{/);
  assert.match(css, /width:min\(1120px,96vw\)!important/);
  assert.match(css, /#returnOrdersTab \.return-order-list-full\{/);

  assert.match(service, /const directValues = uniqueStrings\(\[/);
  assert.doesNotMatch(service, /const directValues = uniqueClean\(\[/);
  assert.match(service, /ReturnStateMachine\.patchForState\(current, RETURN_STATES\.CANCELLED\)/);
});
