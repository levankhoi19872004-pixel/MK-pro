'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('/api/mobile/debts runtime uses DebtNewService canonical adapter', () => {
  const service = read('src/services/mobile/debts.service.js');
  const adapter = read('src/services/mobile/mobileDebtNewAdapter.service.js');

  assert.match(service, /mobileDebtNewAdapter\.service/);
  assert.match(service, /listMobileDebtsFromDebtNew\(/);
  assert.doesNotMatch(service, /DebtReadService/);
  assert.doesNotMatch(service, /mobileDebtQuery\.service/);

  assert.match(adapter, /require\('\.\.\/v2\/debtNew\.service'\)/);
  assert.match(adapter, /DebtNewService\.listCustomers\(scopedQuery/);
  assert.match(adapter, /source:\s*'mobile-debtnew-arledgers'/);
  assert.match(adapter, /ledgerCollection:\s*'arLedgers'/);
});

test('legacy mobileDebtQuery is not the production mobile debt endpoint boundary', () => {
  const legacy = read('src/services/mobile/mobileDebtQuery.service.js');
  const debtRead = read('src/services/DebtReadService.js');

  assert.match(legacy, /Legacy mobile debt query kept for historical diagnostics/);
  assert.match(legacy, /Production \/api\/mobile\/debts must use DebtNewService\.listCustomers/);
  assert.match(debtRead, /listMobileDebtsFromDebtNew/);
});

test('mobile frontend debt view displays backend debt fields and does not calculate total - paid debt', () => {
  const frontendFiles = [
    'public/mobile/js/sales.source/part-03.jsfrag',
    'public/mobile/js/sales/customer.js',
    'public/mobile/js/config.js'
  ];
  for (const file of frontendFiles) {
    const source = read(file);
    assert.doesNotMatch(source, /totalAmount\s*-\s*paidAmount/, file);
    assert.doesNotMatch(source, /debt\s*=\s*order\.totalAmount/, file);
  }
  assert.match(read('public/mobile/js/config.js'), /salesDebts:\s*'\/api\/mobile\/debts'/);
});
