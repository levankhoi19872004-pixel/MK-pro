'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const CORE_FILE = path.join(ROOT, 'public/js/delivery/delivery-core.js');

function loadCore() {
  const source = fs.readFileSync(CORE_FILE, 'utf8');
  const localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
  const context = {
    window: { location: { pathname: '/delivery.html', search: '', href: '' } },
    localStorage,
    fetch: async () => { throw new Error('fetch must not run in unit test'); },
    console,
    Map,
    Set,
    Number,
    String,
    Boolean,
    Object,
    Array,
    Math,
    JSON,
    Date,
    URLSearchParams,
    encodeURIComponent,
    setTimeout,
    clearTimeout
  };
  vm.createContext(context);
  vm.runInContext(source, context, { filename: CORE_FILE });
  return context.window.DeliveryCore;
}

function canonicalRow(overrides = {}) {
  return {
    id: 'SO-1',
    orderCode: 'B0001',
    cashAmount: 9999,
    returnedAmount: 8888,
    debtAmount: 7777,
    amounts: { cash: 9999, returnAmount: 8888, debt: 7777 },
    financialContractVersion: 'delivery-financial-v1',
    financial: {
      financialContractVersion: 'delivery-financial-v1',
      receivableAmount: 10000,
      cashAmount: 0,
      bankAmount: 0,
      rewardAmount: 0,
      offsetAmount: 0,
      totalCollectedAmount: 0,
      returnAmount: 10000,
      totalHandledAmount: 10000,
      debtRaw: 0,
      debtAmount: 0,
      openDebtAmount: 0,
      ...overrides
    }
  };
}

test('FE-001 GREEN: canonical zero is preserved instead of falling through to stale aliases', () => {
  const core = loadCore();
  const row = core.normalizeOrder(canonicalRow());
  assert.equal(row.cashAmount, 0);
  assert.equal(row.amounts.cash, 0);
  assert.equal(row.returnAmount, 10000);
  assert.equal(row.debtAmount, 0);
});

test('FE-002 GREEN: server debt is authoritative for a loaded canonical row', () => {
  const core = loadCore();
  const result = core.calculateAmounts(canonicalRow({ debtRaw: 500, debtAmount: 0, openDebtAmount: 0, totalHandledAmount: 9500, returnAmount: 9500 }));
  assert.equal(result.source, 'server-canonical');
  assert.equal(result.debtRaw, 500);
  assert.equal(result.debt, 0);
  assert.equal(result.openDebtAmount, 0);
  assert.equal(result.isPreview, false);
});

test('FE-003 GREEN: local calculation only runs in explicit preview mode', () => {
  const core = loadCore();
  const result = core.calculateAmounts(canonicalRow({ cashAmount: 1000, returnAmount: 0, totalCollectedAmount: 1000, totalHandledAmount: 1000, debtRaw: 9000, debtAmount: 9000, openDebtAmount: 9000 }), { isPreview: true });
  assert.equal(result.source, 'local-preview');
  assert.equal(result.isPreview, true);
  assert.equal(result.debtRaw, 9000);
});

test('FE-004 GREEN: nested and top-level compatibility aliases equal canonical state', () => {
  const core = loadCore();
  const row = core.normalizeOrder(canonicalRow({ cashAmount: 1200, bankAmount: 300, rewardAmount: 100, offsetAmount: 50, totalCollectedAmount: 1650, returnAmount: 2000, totalHandledAmount: 3650, debtRaw: 6350, debtAmount: 6350, openDebtAmount: 6350 }));
  assert.equal(row.cashAmount, 1200);
  assert.equal(row.cashCollected, 1200);
  assert.equal(row.amounts.cashAmount, 1200);
  assert.equal(row.transferAmount, 300);
  assert.equal(row.amounts.offset, 50);
  assert.equal(row.returnedAmount, 2000);
  assert.equal(row.remainingAmount, 6350);
});

test('FE-005 GREEN: zero money remains renderable as numeric zero', () => {
  const core = loadCore();
  const row = core.normalizeOrder(canonicalRow({ returnAmount: 0, totalHandledAmount: 0, debtRaw: 10000, debtAmount: 10000, openDebtAmount: 10000 }));
  assert.strictEqual(row.cashAmount, 0);
  assert.strictEqual(row.bankAmount, 0);
  assert.strictEqual(row.rewardAmount, 0);
  assert.strictEqual(row.offsetAmount, 0);
  assert.strictEqual(row.returnAmount, 0);
});

test('FE-006 GREEN: remaining amount uses canonical openDebtAmount', () => {
  const core = loadCore();
  const row = core.normalizeOrder(canonicalRow({ debtRaw: -2000, debtAmount: -2000, openDebtAmount: 0, totalHandledAmount: 12000, returnAmount: 0, cashAmount: 12000, totalCollectedAmount: 12000 }));
  assert.equal(row.debtAmount, -2000);
  assert.equal(row.remainingAmount, 0);
  assert.equal(row.openDebtAmount, 0);
});

test('FE-007 GREEN: Web popup consumes canonical-compatible row fields from backend', () => {
  const source = fs.readFileSync(path.join(ROOT, 'public/js/app/new/91-delivery-today-new.js'), 'utf8');
  assert.match(source, /cashAmount/);
  assert.match(source, /returnedAmount/);
  assert.match(source, /finalDebtAmount/);
  assert.doesNotMatch(source, /OrderPaymentAllocation\.find|DeliveryCloseoutVersion\.find/);
});

test('FE-008 GREEN: migrated money normalization contains no truthy fallback chains', () => {
  const source = fs.readFileSync(CORE_FILE, 'utf8');
  const normalizeBlock = source.match(/function normalizeOrder\(order\) \{([\s\S]*?)\n  \}\n\n  function normalizeItem/);
  assert.ok(normalizeBlock, 'normalizeOrder block must be inspectable');
  assert.doesNotMatch(normalizeBlock[1], /amounts\.(cash|bank|reward|returnAmount|debt)\s*\|\|/);
  assert.doesNotMatch(normalizeBlock[1], /financial\.(cashAmount|bankAmount|rewardAmount|returnAmount|debtAmount)\s*\|\|/);
  assert.match(normalizeBlock[1], /firstDefined\(/);
});
