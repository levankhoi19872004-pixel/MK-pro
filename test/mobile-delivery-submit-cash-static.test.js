'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

function read(file) {
  return fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
}

test('mobile delivery service defines submitCash before exporting it', () => {
  const src = read('src/services/mobile/delivery.service.js');
  const submitCashIndex = src.indexOf('async function submitCash(');
  const exportIndex = src.lastIndexOf('  return {');

  assert.ok(submitCashIndex > -1, 'submitCash must be defined');
  assert.ok(exportIndex > submitCashIndex, 'submitCash must be defined before export return block');
  assert.match(src, /submitCash/);

  const submitCashBlock = src.slice(submitCashIndex, exportIndex);

  // Step 6: submitCash is no longer a 501 stub; it must go through DeliverySettlementService.
  assert.match(src, /const DeliverySettlementService = require\('\.\.\/\.\.\/domain\/settlement\/DeliverySettlementService'\);/);
  assert.match(submitCashBlock, /DeliverySettlementService\.submitCashToFund\(/);
  assert.match(submitCashBlock, /confirmedBy:\s*mobileUser\?\./);
  assert.doesNotMatch(submitCashBlock, /statusCode:\s*501/);
  assert.doesNotMatch(submitCashBlock, /chưa được triển khai ở route modular/);
});
