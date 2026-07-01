'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const DebtCollectionPolicy = require('../src/policies/debtCollection.policy');

function readSource(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function order(overrides = {}) {
  return {
    customerCode: 'BBHOASON',
    customerName: 'Hoa Sơn',
    salesOrderCode: 'DCOC-SO1782830072433596-2-950e16ede9c8',
    salesStaffCode: 'NVBH-HOASON',
    salesStaffName: 'NVBH Hoa Sơn',
    deliveryStaffCode: 'NVGH-HOASON',
    deliveryStaffName: 'NVGH Hoa Sơn',
    ...overrides
  };
}

test('debt collection policy allows web admin/accountant to collect any debt order', () => {
  const admin = DebtCollectionPolicy.canCreateDebtCollection({ role: 'admin', staffCode: 'ADMIN' }, order());
  assert.equal(admin.allowed, true);
  assert.equal(admin.scope, 'all');

  const accountant = DebtCollectionPolicy.canCreateDebtCollection({ role: 'accountant', staffCode: 'KT01' }, order());
  assert.equal(accountant.allowed, true);
  assert.equal(accountant.scope, 'all');
});

test('manager needs ar collection create-any permission for all-order collection scope', () => {
  const denied = DebtCollectionPolicy.canCreateDebtCollection({ role: 'manager', staffCode: 'QL01' }, order());
  assert.equal(denied.allowed, false);
  assert.equal(denied.scope, 'none');

  const allowed = DebtCollectionPolicy.canCreateDebtCollection({ role: 'manager', staffCode: 'QL01', permissions: ['ar:collection:create:any'] }, order());
  assert.equal(allowed.allowed, true);
  assert.equal(allowed.scope, 'all');
});

test('mobile sales/delivery collection remains owner-scoped', () => {
  const deliveryOwner = DebtCollectionPolicy.canCreateDebtCollection({ role: 'delivery', staffCode: 'NVGH-HOASON' }, order());
  assert.equal(deliveryOwner.allowed, true);
  assert.equal(deliveryOwner.scope, 'own');

  const deliveryOther = DebtCollectionPolicy.canCreateDebtCollection({ role: 'delivery', staffCode: 'NVGH-KHAC' }, order());
  assert.equal(deliveryOther.allowed, false);
  assert.equal(deliveryOther.reason, 'delivery_order_not_owned');

  const salesOwner = DebtCollectionPolicy.canCreateDebtCollection({ role: 'sales', staffCode: 'NVBH-HOASON' }, order());
  assert.equal(salesOwner.allowed, true);
  assert.equal(salesOwner.scope, 'own');

  const salesOther = DebtCollectionPolicy.canCreateDebtCollection({ role: 'sales', staffCode: 'NVBH-KHAC' }, order());
  assert.equal(salesOther.allowed, false);
  assert.equal(salesOther.reason, 'sales_order_not_owned');
});

test('users without collection role or permission are denied', () => {
  const result = DebtCollectionPolicy.canCreateDebtCollection({ role: 'viewer', staffCode: 'VIEW01' }, order());
  assert.equal(result.allowed, false);
  assert.equal(result.scope, 'none');
  assert.equal(result.reason, 'missing_debt_collection_permission');
});

test('DebtCollectionService submit uses policy all-scope instead of forcing admin staffCode as NVBH/NVGH scope', () => {
  const source = readSource('src/services/DebtCollectionService.js');
  const start = source.indexOf('async function submitDebtCollection');
  const end = source.indexOf('function buildListFilter', start);
  const block = source.slice(start, end);

  assert.match(source, /require\('\.\.\/policies\/debtCollection\.policy'\)/);
  assert.match(block, /DebtCollectionPolicy\.debtCollectionCreateScopeForUser\(mobileUser, body, collector\)/);
  assert.match(block, /if \(!access\.allowed\) return fail\(403, 'Bạn không có quyền lập phiếu thu công nợ'\)/);
  assert.match(block, /scope:\s*access\.queryScope/);
  assert.match(block, /actor:\s*mobileUser/);
  assert.match(block, /collectionScope:\s*access\.scope/);
  assert.doesNotMatch(block, /const debtScope = collector\.collectorType === 'delivery'[\s\S]*\? \{ delivery: collector\.collectorCode \}/);
  assert.doesNotMatch(block, /scope:\s*debtScope/);
  assert.match(block, /status:\s*'submitted'/);
  assert.doesNotMatch(block, /ArPostingService\.postReceipt/);
});

test('DebtReadService checks per-order authorization through policy and returns scoped 403 reason', () => {
  const source = readSource('src/services/DebtReadService.js');
  assert.match(source, /require\('\.\.\/policies\/debtCollection\.policy'\)/);
  assert.match(source, /function debtCollectionAccessForSource\(source = \{\}, input = \{\}\)/);
  assert.match(source, /DebtCollectionPolicy\.canCreateDebtCollection\(actor, source/);
  assert.match(source, /code:\s*'DEBT_COLLECTION_ORDER_FORBIDDEN'/);
  assert.match(source, /reason:\s*access\.reason/);
  assert.match(source, /message:\s*`Bạn không được thu công nợ của đơn \$\{row\.key\}`/);
});

test('Debt New frontend keeps backend 403 message inside popup scope', () => {
  const source = readSource('public/js/app/new/92-debt-new.js');
  const start = source.indexOf('async function submitCollection');
  const end = source.indexOf('function collectionCardsHtml', start);
  const block = source.slice(start, end);
  assert.match(block, /setPopupNotice\('Đang tạo phiếu thu chờ xác nhận\.\.\.', 'info'\)/);
  assert.match(block, /throw new Error\(json\.message/);
  assert.match(block, /setPopupError\(err\.message/);
  assert.doesNotMatch(block, /setMainError\(/);
});
