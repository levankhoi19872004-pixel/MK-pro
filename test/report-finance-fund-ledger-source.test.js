'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const finance = fs.readFileSync(path.join(root, 'src/services/reports/FinanceReportService.js'), 'utf8');
const delivery = fs.readFileSync(path.join(root, 'src/services/reports/DeliveryReportService.js'), 'utf8');

test('FinanceReportService defines and uses canonical fundLedger filter', () => {
  assert.match(finance, /function fundLedgerCanonicalFilter\(extra = \{\}\)/);
  assert.match(finance, /status:\s*\{\s*\$nin:\s*\['void', 'cancelled', 'canceled', 'deleted', 'duplicate_cancelled'\]/);
  assert.match(finance, /reversed:\s*\{\s*\$ne:\s*true\s*\}/);
  assert.match(finance, /isReversal:\s*\{\s*\$ne:\s*true\s*\}/);
  assert.match(finance, /isDeleted:\s*\{\s*\$ne:\s*true\s*\}/);
  assert.match(finance, /active:\s*\{\s*\$ne:\s*false\s*\}/);
  assert.match(finance, /accountingConfirmed:\s*true/);
  assert.match(finance, /accountingStatus:\s*\{\s*\$in:\s*\['confirmed', 'posted', 'locked'\]/);
  assert.match(finance, /\{\s*\$match:\s*fundLedgerCanonicalFilter\(\)\s*\}/);
});

test('DeliveryReportService reuses fundLedgerCanonicalFilter for collections', () => {
  assert.match(delivery, /const \{ fundLedgerCanonicalFilter \} = require\('\.\/FinanceReportService'\)/);
  assert.match(delivery, /fundLedgerCanonicalFilter\(\{ direction:/);
});
