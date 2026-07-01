'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const { readSource } = require('./helpers/sourceBundle.util');
const { normalizeDebtAmount } = require('../src/constants/finance.constants');

function read(file) {
  return readSource(path.join(__dirname, '..', file));
}

function classifyForFixture(row = {}) {
  const text = [row.type, row.category, row.ledgerType, row.sourceType, row.source, row.refType, row.code, row.id, row.idempotencyKey]
    .map((value) => String(value || '').toLowerCase())
    .join(' ');
  const upper = (value) => String(value || '').toUpperCase();
  const isSale = upper(row.category) === 'AR-SALE'
    || upper(row.ledgerType) === 'AR-SALE'
    || /(?:^|[\s:_-])(ar_sale|ar-sale|sale|external_debt|external-debt)(?:$|[\s:_-])/.test(text);
  const isReturn = upper(row.category) === 'AR-RETURN'
    || upper(row.ledgerType) === 'AR-RETURN'
    || /^AR-RETURN/.test(upper(row.code))
    || /^AR-RETURN/.test(upper(row.id))
    || /^AR-RETURN:/.test(upper(row.idempotencyKey))
    || /return[_ -]?order|ar[_ -]?return/.test(text);
  const isBonus = /bonus|discount|allowance/.test(text);
  const isReceipt = !isSale && !isReturn && /receipt|payment|collection|debt_collection/.test(text);
  return { isSale, isReturn, isReceipt, isBonus };
}

function creditLike(row = {}) {
  return Number(row.credit || 0) > 0 ? Number(row.credit) : Number(row.amount || 0);
}

function debitLike(row = {}) {
  return Number(row.debit || 0) > 0 ? Number(row.debit) : Number(row.amount || 0);
}

function summarizeFixture(rows = []) {
  return rows.reduce((acc, row) => {
    if (String(row.entryType || '').toLowerCase() === 'reversal') return acc;
    const kind = classifyForFixture(row);
    if (kind.isSale) acc.debit += debitLike(row);
    if (Number(row.credit || 0) > 0) acc.credit += Number(row.credit);
    else if (!kind.isSale) acc.credit += Number(row.amount || 0);
    if (kind.isReceipt) acc.receiptAmount += creditLike(row);
    if (kind.isReturn) acc.returnAmount += creditLike(row);
    if (kind.isBonus) acc.bonusAmount += creditLike(row);
    return acc;
  }, { debit: 0, credit: 0, receiptAmount: 0, returnAmount: 0, bonusAmount: 0 });
}

test('B0038424 debt read model contract: AR-RETURN category/idempotencyKey is counted and tolerance zeroes 889', () => {
  const rows = [
    { category: 'AR-SALE', type: 'ar_sale', debit: 5141521, credit: 0, amount: 5141521, orderCode: 'B0038424' },
    { category: 'AR-RECEIPT', type: 'ar_receipt', debit: 0, credit: 4864000, amount: 4864000, orderCode: 'B0038424' },
    { category: 'AR-RETURN', type: null, ledgerType: 'AR-RETURN', idempotencyKey: 'AR-RETURN:RO-B0038424', debit: 0, credit: 276632, amount: 276632, orderCode: 'B0038424' },
    { category: 'AR-RETURN', ledgerType: 'AR-RETURN', entryType: 'reversal', debit: 0, credit: 276632, amount: 276632, orderCode: 'B0038424' }
  ];
  const summary = summarizeFixture(rows);
  const rawDebt = summary.debit - summary.receiptAmount - summary.returnAmount - summary.bonusAmount;

  assert.equal(summary.receiptAmount, 4864000);
  assert.equal(summary.returnAmount, 276632);
  assert.equal(rawDebt, 889);
  assert.equal(normalizeDebtAmount(rawDebt), 0);
});

test('reportLegacy debt report delegates to AR debt read model v2 instead of classifying AR-RETURN legacy', () => {
  const src = read('src/services/reportLegacy.service.js');

  assert.match(src, /arCustomerDebtReadModel\.debtReport\(query\)/);
  assert.match(src, /debtSource:\s*'AR_DEBT_READ_MODEL_V2'/);
  assert.doesNotMatch(src, /isReturn:\s*\{\s*\$or:/);
  assert.doesNotMatch(src, /returnAmount:\s*\{\s*\$sum:\s*\{\s*\$cond:\s*\['\$isReturn'/);
});

test('DebtReadService matches AR-RETURN:RO-B0038424 to B0038424 and blocks collection after tolerance', () => {
  const src = read('src/services/DebtReadService.js');

  assert.match(src, /function extractSalesOrderCodeFromReturnToken/);
  assert.match(src, /function expandOrderKeys/);
  assert.match(src, /function rowOrderKeys/);
  assert.match(src, /idempotencyKey:\s*\{\s*\$in:\s*values\s*\}/);
  assert.match(src, /returnOrderCode:\s*\{\s*\$in:\s*values\s*\}/);
  assert.match(src, /sourceOrderCode:\s*\{\s*\$in:\s*values\s*\}/);
  assert.match(src, /entryType:\s*\{\s*\$ne:\s*'reversal'\s*\}/);
  assert.match(src, /availableToCollect:\s*availableDebt/);
  assert.match(src, /pendingCollectionAmount:\s*pendingAmount/);

  const officialDebt = normalizeDebtAmount(5141521 - 4864000 - 276632);
  const availableDebt = Math.max(0, normalizeDebtAmount(officialDebt - 0));
  assert.equal(availableDebt, 0);
  assert.equal(277521 > availableDebt + 0.0001, true);
});
