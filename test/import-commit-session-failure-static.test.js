'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

function read(file) {
  return fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
}

test('excel import commit marks session failed when commit implementation throws', () => {
  const service = read('src/services/excelImportService.js');

  assert.match(service, /safeMarkImportFailed/);
  assert.match(service, /async function commit/);
  assert.match(service, /markImporting\(sessionId\)/);
  assert.match(service, /catch\s*\(err\)\s*\{[\s\S]*safeMarkImportFailed\(currentSessionId/);
  assert.match(service, /status:\s*500/);
  assert.match(service, /detail:\s*message/);

  assert.match(service, /if \(type === 'products'\) result = await upsertProducts\(commitRows\)/);
  assert.match(service, /else if \(type === 'salesOrders'\) result = await importSalesOrders\(commitRows, \{ autoCutStock: true \}\)/);
  assert.match(service, /else if \(type === 'openingDebt'\) result = await importOpeningDebt\(commitRows\)/);
});

test('excel import commit audit log is best effort after markDone', () => {
  const service = read('src/services/excelImportService.js');

  const markDoneIndex = service.indexOf('await importSessionService.markDone(currentSessionId, result)');
  const auditIndex = service.indexOf("await auditService.log('IMPORT_COMMIT'");
  const auditCatchIndex = service.indexOf('[IMPORT_COMMIT_AUDIT_ERROR]');

  assert.ok(markDoneIndex > -1, 'commit must call markDone');
  assert.ok(auditIndex > markDoneIndex, 'audit log must run after markDone');
  assert.ok(auditCatchIndex > auditIndex, 'audit log failure must be caught separately');
});
