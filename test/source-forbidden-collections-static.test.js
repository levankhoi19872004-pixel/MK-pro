'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { SOURCE_CONTRACT_REGISTRY } = require('../src/services/source-contracts/SourceContractRegistry');

function read(file) { return fs.readFileSync(file, 'utf8'); }

test('source contracts explicitly forbid dangerous legacy sources', () => {
  const forbidden = new Set(Object.values(SOURCE_CONTRACT_REGISTRY).flatMap((contract) => contract.forbiddenCollections));
  for (const value of ['reporting_snapshots', 'inventorySnapshots', 'products.stock', 'salesOrders.remainingDebt', 'salesOrders.debtAmount', 'cashbooks', 'bankbooks', 'master_orders.totalAmount']) {
    assert.ok(forbidden.has(value), `missing forbidden guard ${value}`);
  }
});

test('reward report does not use arLedgers or AR-BONUS as primary source', () => {
  const reward = read('src/services/reports/RewardReportService.js');
  assert.doesNotMatch(reward, /require\(['"]\.\.\/\.\.\/models\/ArLedger|AR-BONUS|arLedgers bonus/i);
  assert.match(read('src/services/reports/ReportSourceRegistry.js'), /'rewards-by-customer'[\s\S]*primaryCollections:\s*\['orders'\]/);
});

test('sensitive UI exclusions are preserved for create/edit order and mobile', () => {
  const files = [
    'public/js/app/05-sales-orders.source/part-01.jsfrag',
    'public/mobile/js/sales.source/part-01.jsfrag',
    'public/mobile/js/delivery-mobile-view.source.js'
  ];
  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    const content = read(file);
    assert.doesNotMatch(content, /source-note|renderSourceNote|Nguồn số liệu/);
  }
});
