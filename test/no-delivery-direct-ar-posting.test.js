'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}
function read(file) { return stripComments(fs.readFileSync(path.join(ROOT, file), 'utf8')); }

test('Phase87 active delivery closeout path does not call legacy AR posting APIs', () => {
  const activeFiles = [
    'src/domain/settlement/DeliverySettlementService.js',
    'src/services/accounting/AccountingCloseoutService.js',
    'src/services/accounting/DeliveryCloseoutService.js'
  ];
  const source = activeFiles.map(read).join('\n');
  assert.doesNotMatch(source, /postReceiptAR\s*\(/);
  assert.doesNotMatch(source, /postReturnAR\s*\(/);
  assert.doesNotMatch(source, /postSalesOrderAR\s*\(/);
  assert.doesNotMatch(source, /ArPostingService\.postReceipt\s*\(/);
  assert.doesNotMatch(source, /returnArPostingService\.postReturnOrderToAR\s*\(/);
});
