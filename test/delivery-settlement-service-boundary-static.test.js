'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

function functionBlock(source, name) {
  const start = source.indexOf(`async function ${name}`);
  assert.notEqual(start, -1, `missing function ${name}`);
  const nextAsync = source.indexOf('\nasync function ', start + 1);
  const candidates = [nextAsync].filter((idx) => idx !== -1);
  const end = candidates.length ? Math.min(...candidates) : source.length;
  return source.slice(start, end);
}

test('DeliverySettlementService owns delivery settlement posting boundaries', () => {
  const source = read('src/domain/settlement/DeliverySettlementService.js');

  assert.match(source, /const ArPostingService = require\('\.\.\/posting\/ArPostingService'\);/);
  assert.match(source, /const fundService = require\('\.\.\/\.\.\/services\/fundService'\);/);
  assert.match(source, /async function recordCollectedMoney\(order = \{\}, options = \{\}\)/);
  assert.match(source, /async function submitCashToFund\(idOrCode, body = \{\}\)/);
  assert.match(source, /async function cashInTransitReport\(query = \{\}\)/);
  assert.match(source, /ArPostingService\.postReceipt\(\{/);
  assert.match(source, /fundService\.confirmDeliveryCashSubmission\(target, payload\)/);
  assert.match(source, /DeliveryCashInTransitReportService/);
  assert.match(source, /DeliveryCashInTransitReportService\.listDeliveryCashInTransit\(query\)/);
  assert.doesNotMatch(source, /fundService\.buildDeliverySubmissionDraft\(query\)/);
});

test('mobile delivery submitCash uses DeliverySettlementService instead of 501 stub', () => {
  const source = read('src/services/mobile/delivery.service.js');
  const submitCashBlock = functionBlock(source, 'submitCash');

  assert.match(source, /const DeliverySettlementService = require\('\.\.\/\.\.\/domain\/settlement\/DeliverySettlementService'\);/);
  assert.match(submitCashBlock, /DeliverySettlementService\.submitCashToFund\(/);
  assert.match(submitCashBlock, /confirmedBy:\s*mobileUser\?\.code \|\| mobileUser\?\.name \|\| body\.confirmedBy/);
  assert.doesNotMatch(submitCashBlock, /statusCode:\s*501/);
  assert.doesNotMatch(submitCashBlock, /chưa được triển khai ở route modular/);
});
