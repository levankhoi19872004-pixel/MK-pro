'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const fundService = require('../src/services/fundService');
const fundLedgerRepository = require('../src/repositories/fundLedgerRepository');

function patch(target, replacements) {
  const originals = {};
  for (const [key, value] of Object.entries(replacements)) {
    originals[key] = target[key];
    target[key] = value;
  }
  return () => {
    for (const [key, value] of Object.entries(originals)) target[key] = value;
  };
}

function createInMemoryFundLedgerRepo() {
  const rows = [];
  return {
    rows,
    findAll: async (filter = {}) => {
      return rows.filter((row) => {
        if (filter.idempotencyKey !== undefined) return row.idempotencyKey === filter.idempotencyKey;
        if (filter.fundType && row.fundType !== filter.fundType) return false;
        if (filter.direction && row.direction !== filter.direction) return false;
        if (filter.account && row.account !== filter.account) return false;
        if (Array.isArray(filter.$or) && filter.$or.length) {
          return filter.$or.some((clause) => Object.entries(clause).every(([key, value]) => row[key] === value));
        }
        return true;
      });
    },
    findByIdempotencyKey: async (key) => rows.find((row) => row.idempotencyKey === key) || null,
    upsert: async (entry) => {
      const existingIndex = rows.findIndex((row) => row.idempotencyKey === entry.idempotencyKey);
      if (existingIndex >= 0) rows[existingIndex] = { ...rows[existingIndex], ...entry };
      else rows.push({ ...entry });
      return entry;
    }
  };
}

async function withPatchedRepo(fn) {
  const repo = createInMemoryFundLedgerRepo();
  const restore = patch(fundLedgerRepository, {
    findAll: repo.findAll,
    findByIdempotencyKey: repo.findByIdempotencyKey,
    upsert: repo.upsert
  });
  try {
    await fn(repo.rows);
  } finally {
    restore();
  }
}

test('postFundLedger does not write duplicate rows for the same idempotency key', async () => {
  await withPatchedRepo(async (rows) => {
    const payload = {
      date: '2026-06-10',
      sourceType: 'DELIVERY_COLLECTION',
      sourceId: 'MO_TEST_001',
      sourceCode: 'DT_TEST_001',
      fundType: 'cash',
      direction: 'in',
      amount: 100000
    };

    const first = await fundService.postFundLedger(payload);
    const second = await fundService.postFundLedger(payload);

    assert.equal(rows.length, 1);
    assert.equal(first.idempotencyKey, second.ledger.idempotencyKey);
    assert.equal(second.skipped, true);
    assert.equal(second.reason, 'DUPLICATE_FUND_LEDGER');
  });
});

test('delivery cash collection posted twice with the same source creates one fund ledger only', async () => {
  await withPatchedRepo(async (rows) => {
    const payload = {
      sourceType: 'DELIVERY_COLLECTION',
      sourceId: 'MO_TEST_001',
      fundType: 'CASH',
      direction: 'IN',
      amount: 100000
    };

    await fundService.postFundLedger(payload);
    await fundService.postFundLedger(payload);

    assert.equal(rows.length, 1);
    assert.equal(rows[0].fundType, 'cash');
    assert.equal(rows[0].direction, 'in');
    assert.equal(rows[0].account, 'CASH');
    assert.equal(rows[0].amount, 100000);
  });
});

test('cash and bank collection for the same source create two separate fund ledger rows', async () => {
  await withPatchedRepo(async (rows) => {
    await fundService.postFundLedger({ sourceType: 'DELIVERY_COLLECTION', sourceId: 'MO_TEST_001', fundType: 'cash', direction: 'in', amount: 100000 });
    await fundService.postFundLedger({ sourceType: 'DELIVERY_COLLECTION', sourceId: 'MO_TEST_001', fundType: 'bank', direction: 'in', amount: 200000 });

    assert.equal(rows.length, 2);
    assert.deepEqual(rows.map((row) => `${row.fundType}:${row.direction}:${row.amount}`).sort(), ['bank:in:200000', 'cash:in:100000']);
    assert.notEqual(rows[0].idempotencyKey, rows[1].idempotencyKey);
  });
});

test('fund transfer creates exactly two balanced fund ledger rows and is idempotent', async () => {
  await withPatchedRepo(async (rows) => {
    const outPayload = { sourceType: 'FUND_TRANSFER', sourceId: 'TRANSFER_TEST_001', fundType: 'cash', direction: 'out', amount: 500000 };
    const inPayload = { sourceType: 'FUND_TRANSFER', sourceId: 'TRANSFER_TEST_001', fundType: 'bank', direction: 'in', amount: 500000 };

    await fundService.postFundLedger(outPayload);
    await fundService.postFundLedger(inPayload);
    await fundService.postFundLedger(outPayload);
    await fundService.postFundLedger(inPayload);

    assert.equal(rows.length, 2);
    const cashOut = rows.find((row) => row.fundType === 'cash' && row.direction === 'out');
    const bankIn = rows.find((row) => row.fundType === 'bank' && row.direction === 'in');
    assert.equal(cashOut.amount, 500000);
    assert.equal(bankIn.amount, 500000);
    const net = rows.reduce((sum, row) => sum + (row.direction === 'in' ? row.amount : -row.amount), 0);
    assert.equal(net, 0);
  });
});

test('expense voucher fund ledger is always positive amount with OUT direction', async () => {
  await withPatchedRepo(async (rows) => {
    await fundService.postFundLedger({ sourceType: 'EXPENSE_VOUCHER', sourceId: 'PC_TEST_001', fundType: 'cash', direction: 'out', amount: 500000 });
    await fundService.postFundLedger({ sourceType: 'EXPENSE_VOUCHER', sourceId: 'PC_TEST_001', fundType: 'cash', direction: 'out', amount: -500000 });

    assert.equal(rows.length, 1);
    assert.equal(rows[0].direction, 'out');
    assert.equal(rows[0].amount, 500000);
  });
});
