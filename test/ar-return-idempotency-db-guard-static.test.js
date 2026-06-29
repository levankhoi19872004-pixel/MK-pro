'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }

test('mongoIndexService deploys only non-unique AR-RETURN idempotency lookup indexes', () => {
  const source = read('src/services/mongoIndexService.js');
  assert.match(source, /\[\{ idempotencyKey: 1 \}, \{ name: 'idx_arledger_idempotencyKey' \}\]/);
  assert.match(source, /\[\{ type: 1, sourceType: 1, sourceId: 1 \}, \{ name: 'idx_ar_return_source_lookup' \}\]/);
  assert.doesNotMatch(source, /uniq_arledger_idempotencyKey/);
});

test('unique AR-RETURN index is gated behind audit script and is not auto-created on deploy', () => {
  const auditScript = read('scripts/audit-ar-return-idempotency.js');
  const createScript = read('scripts/create-ar-return-unique-index.js');
  const pkg = read('package.json');

  assert.match(auditScript, /summarizeArReturnIdempotency/);
  assert.match(auditScript, /--json/);
  assert.match(createScript, /hasBlockingIssues\(audit\)/);
  assert.match(createScript, /uniq_arledger_idempotencyKey/);
  assert.match(createScript, /partialFilterExpression:\s*\{[\s\S]*idempotencyKey:\s*\{\s*\$exists:\s*true,\s*\$type:\s*'string'/);
  assert.match(createScript, /if \(!apply\)/);
  assert.match(pkg, /audit:ar-return-idempotency/);
  assert.match(pkg, /mongo:ar-return-unique-index/);
});
