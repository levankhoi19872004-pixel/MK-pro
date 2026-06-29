'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { readSource } = require('./helpers/sourceBundle.util');

test('postExternalDebt không còn tự build ledger bằng biến id/code ngoài scope', () => {
  const arPosting = readSource('src/domain/posting/ArPostingService.js');
  const service = readSource('src/services/accounting/externalDebtArPostingService.js');

  assert.match(arPosting, /externalDebtArPostingService\.postExternalDebt/);
  assert.doesNotMatch(arPosting, /async function postExternalDebt[\s\S]*`AR-EXTERNAL-\$\{id\}/);
  assert.doesNotMatch(arPosting, /async function postExternalDebt[\s\S]*`AR-EXTERNAL-\$\{code\}/);
  assert.match(service, /sourceIdFrom\(input\)/);
  assert.match(service, /sourceCodeFrom\(input\)/);
  assert.match(service, /buildExternalDebtIdempotencyKey/);
  assert.match(service, /P0_AR_EXTERNAL_DEBT_CONFLICT/);
  assert.match(service, /sourceType:\s*SOURCE_TYPE/);
});

test('ExternalDebtOrderService gọi postExternalDebt với contract source/idempotency rõ', () => {
  const service = readSource('src/services/ExternalDebtOrderService.js');
  assert.match(service, /sourceType:\s*'externalDebt'/);
  assert.match(service, /sourceId:\s*id/);
  assert.match(service, /sourceCode:\s*code/);
  assert.match(service, /idempotencyKey:\s*`AR-EXTERNAL-DEBT:\$\{id\}`/);
  assert.match(service, /createdBy:/);
  assert.match(service, /ArPostingService\.postExternalDebt/);
  assert.doesNotMatch(service, /paymentRepository\.upsert/);
});


test('idempotent retry của ExternalDebtOrderService vẫn ensure AR ledger nếu order đã tồn tại', () => {
  const service = readSource('src/services/ExternalDebtOrderService.js');
  assert.match(service, /async function ensureArLedgerForExternalDebtOrder/);
  assert.match(service, /const ensured = await ensureArLedgerForExternalDebtOrder\(existed, actor\)/);
  assert.match(service, /const ensured = await ensureArLedgerForExternalDebtOrder\(existed, actor, \{ session \}\)/);
  assert.match(service, /arLedger:\s*ensured\.ledger/);
});
