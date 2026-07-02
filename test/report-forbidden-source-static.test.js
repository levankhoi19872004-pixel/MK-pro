'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const reportDir = path.join(root, 'src/services/reports');
const files = fs.readdirSync(reportDir).filter((name) => name.endsWith('.js') && !['ReportSourceRegistry.js'].includes(name));
const read = (file) => fs.readFileSync(path.join(reportDir, file), 'utf8');

test('report services do not read forbidden snapshot/cache sources as primary source', () => {
  for (const file of files) {
    const source = read(file);
    assert.equal(/require\([^)]*ReportingSnapshot/.test(source), false, `${file} requires ReportingSnapshot`);
    assert.equal(/reporting_snapshots/.test(source), false, `${file} reads reporting_snapshots`);
    assert.equal(/inventorySnapshots/.test(source), false, `${file} reads inventorySnapshots`);
    assert.equal(/products\.stock/.test(source), false, `${file} reads products.stock`);
  }
});

test('finance/debt/delivery reports do not use forbidden legacy sources as authoritative amounts', () => {
  const finance = read('FinanceReportService.js');
  assert.equal(/require\([^)]*(cashbook|bankbook|Cashbook|Bankbook)/i.test(finance), false);
  assert.equal(/require\([^)]*(cashbooks|bankbooks|Cashbook|Bankbook)/i.test(finance), false);

  const debt = read('DebtReportService.js');
  assert.equal(/ArDebt(Customer|Order)|salesOrders\.debtAmount|remainingDebt/.test(debt), false);

  const delivery = read('DeliveryReportService.js');
  assert.equal(/totalAmount\s*:\s*toNumber\(master\.(totalAmount|amount)/.test(delivery), false);
  assert.match(delivery, /amountSource:\s*'orders_recomputed'/);
  assert.match(delivery, /snapshotUsedForAmount:\s*false/);
});
