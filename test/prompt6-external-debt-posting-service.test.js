'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');

function getByPath(row, key) {
  return String(key).split('.').reduce((acc, part) => (acc == null ? undefined : acc[part]), row);
}

function matchesValue(actual, expected) {
  if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
    if ('$or' in expected) return expected.$or.some((item) => matchesValue(actual, item));
    if ('$ne' in expected) return actual !== expected.$ne;
    if ('$in' in expected) return expected.$in.includes(actual);
  }
  if (expected instanceof RegExp) return expected.test(String(actual || ''));
  return actual === expected;
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

function createArLedgerModel(rows) {
  return {
    rows,
    findOne(query) { return queryOne(rows, query); },
    async create(payloads) {
      return payloads.map((payload) => {
        const doc = { ...payload };
        doc.toObject = () => ({ ...payload });
        rows.push({ ...payload });
        return doc;
      });
    }
  };
}

function loadService() {
  const servicePath = path.join(ROOT, 'src/services/accounting/externalDebtArPostingService.js');
  const arLedgerPath = path.join(ROOT, 'src/models/ArLedger.js');
  const dateUtilPath = path.join(ROOT, 'src/utils/date.util.js');
  for (const file of [servicePath, arLedgerPath, dateUtilPath]) delete require.cache[require.resolve(file)];
  const ledgerRows = [];
  require.cache[require.resolve(arLedgerPath)] = { id: arLedgerPath, filename: arLedgerPath, loaded: true, exports: createArLedgerModel(ledgerRows) };
  require.cache[require.resolve(dateUtilPath)] = {
    id: dateUtilPath,
    filename: dateUtilPath,
    loaded: true,
    exports: {
      nowIso: () => '2026-06-29T09:00:00.000Z',
      toDateOnly: (value) => String(value || '').slice(0, 10)
    }
  };
  return { service: require(servicePath), ledgerRows };
}

const validInput = {
  sourceType: 'externalDebt',
  sourceId: 'EDO001',
  sourceCode: 'NDNBLH001',
  customerId: 'CUS001',
  customerCode: 'C001',
  customerName: 'Khách A',
  amount: 150000,
  date: '2026-06-29',
  reason: 'Nợ ngoài luồng bán hàng',
  createdBy: 'accountant',
  salesStaffCode: 'NVBH01',
  deliveryStaffCode: 'NVGH01'
};

test('input hợp lệ tạo ledger external debt đúng source/idempotency/audit', async () => {
  const { service, ledgerRows } = loadService();
  const result = await service.postExternalDebt(validInput);
  assert.equal(ledgerRows.length, 1);
  assert.equal(result.type, 'ar_external_debt');
  assert.equal(result.ledgerType, 'AR-EXTERNAL-DEBT');
  assert.equal(result.direction, 'debit');
  assert.equal(result.sourceType, 'externalDebt');
  assert.equal(result.sourceId, 'EDO001');
  assert.equal(result.sourceCode, 'NDNBLH001');
  assert.equal(result.idempotencyKey, 'AR-EXTERNAL-DEBT:EDO001');
  assert.equal(result.customerCode, 'C001');
  assert.equal(result.amount, 150000);
  assert.equal(result.auditTrail[0].action, 'post_external_debt');
});

test('thiếu sourceId/sourceCode thì reject, không tạo ledger', async () => {
  const { service, ledgerRows } = loadService();
  await assert.rejects(
    () => service.postExternalDebt({ ...validInput, sourceId: '', sourceCode: '' }),
    /sourceId hoặc sourceCode/
  );
  assert.equal(ledgerRows.length, 0);
});

test('chạy lại cùng external debt không duplicate', async () => {
  const { service, ledgerRows } = loadService();
  const first = await service.postExternalDebt(validInput, { returnResult: true });
  const second = await service.postExternalDebt(validInput, { returnResult: true });
  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(second.reason, 'existing_idempotency_or_source');
  assert.equal(ledgerRows.length, 1);
});

test('cùng key nhưng amount khác thì báo lỗi P0', async () => {
  const { service } = loadService();
  await service.postExternalDebt(validInput);
  await assert.rejects(
    () => service.postExternalDebt({ ...validInput, amount: 200000 }),
    (err) => err.code === 'P0_AR_EXTERNAL_DEBT_CONFLICT'
  );
});

test('thiếu customer/date/reason/createdBy thì reject', async () => {
  const { service } = loadService();
  await assert.rejects(() => service.postExternalDebt({ ...validInput, customerId: '' }), /customerId/);
  await assert.rejects(() => service.postExternalDebt({ ...validInput, customerCode: '' }), /customerCode/);
  await assert.rejects(() => service.postExternalDebt({ ...validInput, date: '' }), /date/);
  await assert.rejects(() => service.postExternalDebt({ ...validInput, reason: '' }), /reason/);
  await assert.rejects(() => service.postExternalDebt({ ...validInput, createdBy: '' }), /createdBy/);
});
