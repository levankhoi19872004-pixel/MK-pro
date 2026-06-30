'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

test('returnOrders in Phase87 delivery closeout are operational and do not post AR-RETURN', () => {
  const source = read('src/services/accounting/AccountingCloseoutService.js') + read('src/services/accounting/DeliveryCloseoutCorrectionService.js');
  assert.doesNotMatch(source, /category:\s*['\"]AR-RETURN['\"]/);
  assert.doesNotMatch(source, /ledgerType:\s*['\"]AR-RETURN['\"]/);
  assert.doesNotMatch(source, /postReturnOrderToAR/);
  assert.doesNotMatch(source, /postReturnAR\s*\(/);
});
