'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const fundService = require('../src/services/fundService');
const fundLedgerRepository = require('../src/repositories/fundLedgerRepository');
const fundSummaryService = require('../src/services/fundSummary.service');

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
    async findAll(filter = {}) {
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
    async findByIdempotencyKey(idempotencyKey) {
      return rows.find((row) => row.idempotencyKey === idempotencyKey) || null;
    },
    async upsert(entry) {
      const existingIndex = rows.findIndex((row) => row.idempotencyKey === entry.idempotencyKey);
      if (existingIndex >= 0) rows[existingIndex] = { ...rows[existingIndex], ...entry };
      else rows.push({ ...entry });
      return entry;
    }
  };
}

async function withPatchedFundLedgerRepo(fn) {
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

function netFundEffect(rows = []) {
  return rows.reduce((sum, row) => sum + (row.direction === 'in' ? Number(row.amount || 0) : -Number(row.amount || 0)), 0);
}

test('Phase77: debt collection cash-in fund ledger is confirmed, source-bound and idempotent', async () => {
  await withPatchedFundLedgerRepo(async (rows) => {
    const payload = {
      date: '2026-06-29',
      fundType: 'cash',
      direction: 'in',
      amount: 4864000,
      sourceType: 'debtCollection',
      sourceId: 'DC-TEST-001',
      sourceCode: 'DC-TEST-001',
      customerCode: '4501256',
      customerId: 'CUST-4501256',
      customerName: 'Chị Sen',
      idempotencyKey: 'FUND-RECEIPT:DC-TEST-001'
    };

    const first = await fundService.postFundLedger(payload);
    const second = await fundService.postFundLedger(payload);

    assert.equal(rows.length, 1);
    assert.equal(second.skipped, true);
    assert.equal(first.direction, 'in');
    assert.equal(first.amount, 4864000);
    assert.equal(first.sourceType, 'debtCollection');
    assert.equal(first.sourceId, 'DC-TEST-001');
    assert.equal(first.customerCode, '4501256');
    assert.equal(first.category, 'RECEIPT');
    assert.equal(first.type, 'fund_receipt');
    assert.equal(first.status, 'posted');
    assert.equal(first.accountingConfirmed, true);
    assert.equal(first.accountingStatus, 'confirmed');
    assert.equal(first.idempotencyKey, 'FUND-RECEIPT:DC-TEST-001');
  });
});

test('Phase77: AR-RECEIPT credit and fund cash-in stay aligned by source and amount', async () => {
  await withPatchedFundLedgerRepo(async (rows) => {
    const arReceipt = {
      category: 'AR-RECEIPT',
      sourceType: 'debtCollection',
      sourceId: 'DC-TEST-001',
      customerCode: '4501256',
      credit: 4864000
    };
    const fund = await fundService.postFundLedger({
      fundType: 'cash',
      direction: 'in',
      amount: arReceipt.credit,
      sourceType: arReceipt.sourceType,
      sourceId: arReceipt.sourceId,
      customerCode: arReceipt.customerCode,
      idempotencyKey: 'FUND-RECEIPT:DC-TEST-001'
    });

    assert.equal(rows.length, 1);
    assert.equal(fund.amount, arReceipt.credit);
    assert.equal(fund.sourceId, arReceipt.sourceId);
    assert.equal(fund.sourceType, arReceipt.sourceType);
    assert.equal(fund.customerCode, arReceipt.customerCode);
  });
});

test('Phase77: expense cash-out stays positive amount with OUT direction and no duplicate', async () => {
  await withPatchedFundLedgerRepo(async (rows) => {
    const payload = {
      date: '2026-06-29',
      fundType: 'cash',
      direction: 'out',
      amount: 1250000,
      sourceType: 'EXPENSE_VOUCHER',
      sourceId: 'EXP-TEST-001',
      sourceCode: 'EXP-TEST-001',
      receiverName: 'Chi phí vận chuyển',
      idempotencyKey: 'FUND-EXPENSE:EXP-TEST-001'
    };

    await fundService.postFundLedger(payload);
    await fundService.postFundLedger(payload);

    assert.equal(rows.length, 1);
    assert.equal(rows[0].direction, 'out');
    assert.equal(rows[0].amount, 1250000);
    assert.equal(rows[0].category, 'EXPENSE');
    assert.equal(rows[0].type, 'fund_expense');
    assert.equal(rows[0].idempotencyKey, 'FUND-EXPENSE:EXP-TEST-001');
  });
});

test('Phase77: fund transfer has exactly two balanced idempotent ledger rows', async () => {
  await withPatchedFundLedgerRepo(async (rows) => {
    const outPayload = {
      fundType: 'cash',
      direction: 'out',
      amount: 10000000,
      sourceType: 'FUND_TRANSFER',
      sourceId: 'FT-TEST-001',
      sourceCode: 'FT-TEST-001',
      idempotencyKey: 'FUND-TRANSFER-OUT:FT-TEST-001'
    };
    const inPayload = {
      fundType: 'bank',
      direction: 'in',
      amount: 10000000,
      sourceType: 'FUND_TRANSFER',
      sourceId: 'FT-TEST-001',
      sourceCode: 'FT-TEST-001',
      idempotencyKey: 'FUND-TRANSFER-IN:FT-TEST-001'
    };

    await fundService.postFundLedger(outPayload);
    await fundService.postFundLedger(inPayload);
    await fundService.postFundLedger(outPayload);
    await fundService.postFundLedger(inPayload);

    assert.equal(rows.length, 2);
    assert.equal(rows.filter((row) => row.direction === 'out').length, 1);
    assert.equal(rows.filter((row) => row.direction === 'in').length, 1);
    assert.equal(rows.every((row) => row.category === 'TRANSFER'), true);
    assert.equal(rows.every((row) => row.type === 'fund_transfer'), true);
    assert.equal(netFundEffect(rows), 0);
  });
});

test('Phase77: fund summary excludes inactive/voided/reversed fund ledgers', () => {
  const active = fundSummaryService.normalizeLedgerForSummary({
    idempotencyKey: 'OK',
    sourceId: 'OK',
    sourceType: 'DELIVERY_CASH_SUBMISSION',
    direction: 'in',
    amount: 100,
    status: 'posted',
    deliveryStaffCode: 'GH01',
    deliveryStaffName: 'NVGH 01'
  });
  assert.ok(active);

  for (const status of ['void', 'voided', 'cancelled', 'canceled', 'deleted', 'removed', 'reversed', 'superseded']) {
    const normalized = fundSummaryService.normalizeLedgerForSummary({
      idempotencyKey: `BAD-${status}`,
      sourceId: `BAD-${status}`,
      sourceType: 'DELIVERY_CASH_SUBMISSION',
      direction: 'in',
      amount: 100,
      status,
      isReversal: status === 'reversed',
      deliveryStaffCode: 'GH01',
      deliveryStaffName: 'NVGH 01'
    });
    assert.equal(normalized, null, `${status} fund ledger must not be active in current fund summary`);
  }
});

test('Phase77: fund summary runtime uses fundLedgers, not cashbook/bankbook snapshots', () => {
  const files = [
    'src/services/fundSummary.service.js',
    'src/services/fund-summary/FundSummaryDomain.js',
    'src/services/fund-summary/FundSummaryFilters.js',
    'src/services/fund-summary/FundSummaryQueryBuilder.js'
  ];
  const combined = files.map((file) => fs.readFileSync(path.join(ROOT, file), 'utf8')).join('\n');

  assert.match(combined, /fundLedgerRepository/);
  assert.doesNotMatch(combined, /cashbookRepository|bankbookRepository|Cashbook\.find|Bankbook\.find|cashbooks\s*[:=]|bankbooks\s*[:=]/i);
});
