'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const posting = fs.readFileSync(path.join(root, 'src/engines/posting.engine.js'), 'utf8');
const master = fs.readFileSync(path.join(root, 'src/services/master-order/masterOrderLegacy.service.js'), 'utf8');

test('AR-RETURN idempotency ignores reversed rows and uses batch suffix on re-accounting', () => {
  assert.match(posting, /status:\s*\{\s*\$nin:\s*\[\s*'void',\s*'reversed',\s*'cancelled'\s*\]/, 'hasExistingReturnOrderAR must not treat reversed AR-RETURN as active');
  assert.match(posting, /reversed:\s*\{\s*\$ne:\s*true\s*\}/, 'hasExistingReturnOrderAR must ignore rows explicitly marked reversed=true');
  assert.match(posting, /const\s+batchSuffix\s*=\s*options\.forceRepostReturn\s*&&\s*accountingBatchId\s*\?/, 'postReturnOrderAR must suffix id/code when forceRepostReturn is enabled');
  assert.match(posting, /id:\s*`AR-RETURN-\$\{returnOrderId \|\| returnOrderCode\}\$\{batchSuffix\}`/, 'AR-RETURN id must include batchSuffix');
  assert.match(posting, /code:\s*`AR-RETURN-\$\{returnOrderCode \|\| returnOrderId\}\$\{batchSuffix\}`/, 'AR-RETURN code must include batchSuffix');
});

test('re-accounting passes forceRepostReturn from confirmDeliveryAccounting to postReturnOrderAR', () => {
  assert.match(master, /postDeliveryCollectionsAfterAccountingConfirmed\(updated,\s*\{[\s\S]*forceRepostReturn:\s*true[\s\S]*\}\)/, 'requiresReAccounting branch must force repost AR-RETURN');
  assert.match(master, /postingEngine\.postReturnOrderAR\([\s\S]*forceRepostReturn:\s*options\.forceRepostReturn\s*===\s*true[\s\S]*\)/, 'postDeliveryCollectionsAfterAccountingConfirmed must pass forceRepostReturn to postReturnOrderAR');
});
