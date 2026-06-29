'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');

function matchesValue(actual, expected) {
  if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
    if ('$ne' in expected) return actual !== expected.$ne;
    if ('$nin' in expected) return !expected.$nin.includes(actual);
    if ('$in' in expected) return expected.$in.includes(actual);
  }
  return actual === expected;
}

function getByPath(row, key) {
  return String(key).split('.').reduce((acc, part) => (acc == null ? undefined : acc[part]), row);
}

function matches(row, query = {}) {
  for (const [key, expected] of Object.entries(query || {})) {
    if (key === '$or') {
      if (!expected.some((sub) => matches(row, sub))) return false;
      continue;
    }
    if (!matchesValue(getByPath(row, key), expected)) return false;
  }
  return true;
}

function queryOne(rows, query) {
  const value = rows.find((row) => matches(row, query)) || null;
  return {
    session() { return this; },
    lean() { return Promise.resolve(value ? JSON.parse(JSON.stringify(value)) : null); },
    then(resolve, reject) { return this.lean().then(resolve, reject); }
  };
}

function createModel(rows) {
  return {
    rows,
    findOne(query) { return queryOne(rows, query); },
    async create(payloads) {
      const created = payloads.map((payload) => {
        const doc = { ...payload };
        doc.toObject = () => ({ ...payload });
        rows.push({ ...payload });
        return doc;
      });
      return created;
    },
    async updateMany(query, update) {
      let count = 0;
      for (const row of rows) {
        if (!matches(row, query)) continue;
        Object.assign(row, update.$set || {});
        count += 1;
      }
      return { matchedCount: count, modifiedCount: count };
    }
  };
}

function loadService() {
  const servicePath = path.join(ROOT, 'src/services/accounting/arAdjustmentService.js');
  const arLedgerPath = path.join(ROOT, 'src/models/ArLedger.js');
  const arAdjustmentPath = path.join(ROOT, 'src/models/ArAdjustment.js');
  const dateUtilPath = path.join(ROOT, 'src/utils/date.util.js');
  for (const file of [servicePath, arLedgerPath, arAdjustmentPath, dateUtilPath]) {
    delete require.cache[require.resolve(file)];
  }
  const ledgerRows = [];
  const adjustmentRows = [];
  require.cache[require.resolve(arLedgerPath)] = { id: arLedgerPath, filename: arLedgerPath, loaded: true, exports: createModel(ledgerRows) };
  require.cache[require.resolve(arAdjustmentPath)] = { id: arAdjustmentPath, filename: arAdjustmentPath, loaded: true, exports: createModel(adjustmentRows) };
  require.cache[require.resolve(dateUtilPath)] = { id: dateUtilPath, filename: dateUtilPath, loaded: true, exports: { nowIso: () => '2026-06-29T09:00:00.000Z' } };
  return { service: require(servicePath), ledgerRows, adjustmentRows };
}

const validInput = {
  tenantId: 'default',
  correctionId: 'CORR-001',
  correctionCode: 'CORR-001',
  customerCode: 'C001',
  customerName: 'Khách A',
  amount: -100000,
  reasonCode: 'DEBT_FIX',
  reasonText: 'Điều chỉnh công nợ theo biên bản',
  createdBy: { username: 'admin' },
  approvedBy: { username: 'owner' }
};

test('tạo AR adjustment thành công với idempotency và audit trail', async () => {
  const { service, ledgerRows, adjustmentRows } = loadService();
  const result = await service.createArAdjustment(validInput);
  assert.equal(result.created, true);
  assert.equal(ledgerRows.length, 1);
  assert.equal(adjustmentRows.length, 1);
  assert.equal(ledgerRows[0].type, 'AR-ADJUSTMENT');
  assert.equal(ledgerRows[0].sourceType, 'adminCorrection');
  assert.equal(ledgerRows[0].correctionId, 'CORR-001');
  assert.equal(ledgerRows[0].idempotencyKey, 'AR-ADJUSTMENT:CORR-001:C001:-100000:DEBT_FIX');
  assert.equal(ledgerRows[0].auditTrail.length, 1);
});

test('chạy lại cùng correction không tạo trùng ledger', async () => {
  const { service, ledgerRows, adjustmentRows } = loadService();
  const first = await service.createArAdjustment(validInput);
  const second = await service.createArAdjustment(validInput);
  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(ledgerRows.length, 1);
  assert.equal(adjustmentRows.length, 1);
  assert.equal(second.reason, 'existing_idempotency_key');
});

test('cùng correctionId nhưng amount khác thì báo lỗi P0', async () => {
  const { service } = loadService();
  await service.createArAdjustment(validInput);
  await assert.rejects(
    () => service.createArAdjustment({ ...validInput, amount: -200000 }),
    (err) => err.code === 'P0_AR_ADJUSTMENT_CONFLICT'
  );
});

test('rollback tạo bút toán đảo và chạy lại không tạo trùng', async () => {
  const { service, ledgerRows, adjustmentRows } = loadService();
  const created = await service.createArAdjustment(validInput);
  const rollback1 = await service.rollbackArAdjustment(created.adjustment.id, { reason: 'Rollback theo phê duyệt', actor: { username: 'admin' } });
  const rollback2 = await service.rollbackArAdjustment(created.adjustment.id, { reason: 'Rollback theo phê duyệt', actor: { username: 'admin' } });
  assert.equal(rollback1.created, true);
  assert.equal(rollback2.created, false);
  assert.equal(ledgerRows.length, 2);
  assert.equal(adjustmentRows.length, 2);
  assert.equal(ledgerRows[1].amount, 100000);
  assert.equal(ledgerRows[1].isRollback, true);
  assert.equal(ledgerRows[1].rollbackOf, 'AR-ADJUSTMENT:CORR-001:C001:-100000:DEBT_FIX');
});

test('thiếu customer, amount hoặc reason thì reject', async () => {
  const { service } = loadService();
  await assert.rejects(() => service.createArAdjustment({ ...validInput, customerCode: '' }), /customerCode/);
  await assert.rejects(() => service.createArAdjustment({ ...validInput, amount: 0 }), /amount/);
  await assert.rejects(() => service.createArAdjustment({ ...validInput, reasonText: '' }), /reasonText/);
});
