'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('RewardReportService does not query AR ledger or AR bonus as report source', () => {
  const source = read('src/services/reports/RewardReportService.js');
  assert.equal(/require\([^)]*ArLedger/.test(source), false);
  assert.equal(/arLedgerReadService/.test(source), false);
  assert.equal(/getCanonicalArLedgers/.test(source), false);
  assert.equal(/AR-BONUS|ar_bonus|BONUS_ALLOWANCE|mongo_ar_ledgers_bonus/.test(source), false);
  assert.match(source, /orderRepository\.findAll/);
  assert.match(source, /deliveryCloseout\.rewardAmount/);
  assert.match(source, /accountingConfirmedFilter\(\)/);
});

test('rewards-by-customer definition and registry describe order closeout source', () => {
  const center = read('src/services/reports/ReportCenterService.js');
  const registry = read('src/services/reports/ReportSourceRegistry.js');
  const rewardDefinition = center.slice(center.indexOf("code: 'rewards-by-customer'"), center.indexOf("code: 'delivery-by-staff'"));
  assert.doesNotMatch(rewardDefinition, /AR-BONUS|bút toán AR/);
  assert.match(rewardDefinition, /salesOrders\.deliveryCloseout/);

  const rewardRegistry = registry.slice(registry.indexOf("'rewards-by-customer'"), registry.indexOf("'delivery-by-staff'"));
  assert.match(rewardRegistry, /primaryCollections:\s*\['orders'\]/);
  assert.doesNotMatch(rewardRegistry, /primaryCollections:\s*\[[^\]]*arLedgers/);
  assert.match(rewardRegistry, /forbiddenCollections:\s*\[[^\]]*'arLedgers'/s);
  assert.match(rewardRegistry, /deliveryCloseout\.rewardAmount/);
});
