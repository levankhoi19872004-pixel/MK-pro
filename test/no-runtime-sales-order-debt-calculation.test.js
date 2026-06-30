'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const runtimeFiles = [
  'src/services/mobile/sales.service.js',
  'src/services/mobile/sales.service.source/part-02.jsfrag',
  'src/services/mobile/sales.service.source/part-03.jsfrag',
  'src/services/mobileService.js',
  'src/services/reportLegacy.service.js',
  'src/services/reportLegacy.service.source/part-03.jsfrag',
  'public/mobile/js/sales/sync.js'
];

const forbidden = [
  /totalAmount\s*-\s*paidAmount/,
  /debtAmount\s*:\s*[^\n;]*totalAmount[^\n;]*paidAmount/,
  /remainingDebt\s*\|\|/,
  /debtAmount\s*\|\|/,
  /currentDebt\s*=\s*order\./,
  /debt\s*=\s*order\.totalAmount/,
  /SALES_ORDER_DEBT_CALC/
];

test('runtime sales/mobile/report/frontend do not calculate debt from salesOrders', () => {
  for (const file of runtimeFiles) {
    const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
    for (const pattern of forbidden) {
      assert.doesNotMatch(source, pattern, `${file} contains forbidden debt calculation ${pattern}`);
    }
  }
});
