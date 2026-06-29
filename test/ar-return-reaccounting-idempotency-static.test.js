'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const posting = require('./helpers/sourceBundle.util').readSource(path.join(root, 'src/engines/posting.engine.js'));
const accountingCommand = require('./helpers/sourceBundle.util').readSource(path.join(root, 'src/services/master-order/deliveryAccountingCommand.impl.js'));
const accountingCore = require('./helpers/sourceBundle.util').readSource(path.join(root, 'src/services/master-order/deliveryAccountingCore.impl.js'));

test('AR-RETURN idempotency ignores reversed/cancelled/deleted rows and uses batch suffix on re-accounting', () => {
  assert.match(posting, /status:\s*\{\s*\$nin:\s*\[\s*'void',\s*'reversed',\s*'cancelled',\s*'canceled',\s*'deleted'\s*\]/, 'hasExistingReturnOrderAR must not treat inactive AR-RETURN as active');
  assert.match(posting, /reversed:\s*\{\s*\$ne:\s*true\s*\}/, 'hasExistingReturnOrderAR must ignore rows explicitly marked reversed=true');
  assert.match(posting, /isDeleted:\s*\{\s*\$ne:\s*true\s*\}/, 'hasExistingReturnOrderAR must ignore soft-deleted rows');
  assert.match(posting, /const\s+batchSuffix\s*=\s*options\.forceRepostReturn\s*&&\s*accountingBatchId\s*\?/, 'postReturnOrderAR must suffix id/code when forceRepostReturn is enabled');
  assert.match(posting, /id:\s*`AR-RETURN-\$\{returnOrderId \|\| returnOrderCode\}\$\{batchSuffix\}`/, 'AR-RETURN id must include batchSuffix');
  assert.match(posting, /code:\s*`AR-RETURN-\$\{returnOrderCode \|\| returnOrderId\}\$\{batchSuffix\}`/, 'AR-RETURN code must include batchSuffix');
});

test('re-accounting passes forceRepostReturn to canonical returnArPostingService writer', () => {
  assert.match(accountingCommand, /postDeliveryCollectionsAfterAccountingConfirmed\(updated,\s*\{[\s\S]*forceRepostReturn:\s*true[\s\S]*\}\)/, 'requiresReAccounting branch must request AR-RETURN repost through collections step');
  assert.match(accountingCore, /returnArPostingService\.postReturnOrderToAR\([\s\S]*forceRepostReturn:\s*options\.forceRepostReturn\s*===\s*true[\s\S]*\)/, 'postDeliveryCollectionsAfterAccountingConfirmed must pass forceRepostReturn to returnArPostingService');
  assert.doesNotMatch(accountingCore, /postingEngine\.postReturnOrderAR\(/, 'deliveryAccountingCore must not call postingEngine.postReturnOrderAR directly');
});
