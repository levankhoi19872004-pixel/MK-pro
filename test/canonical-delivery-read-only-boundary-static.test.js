'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const WRITE_CALL = /\.(?:save|create|insert|insertMany|updateOne|updateMany|findOneAndUpdate|bulkWrite|deleteOne|deleteMany)\s*\(/;

const pureFiles = [
  'src/services/delivery/DeliveryPaymentStateReadService.js',
  'src/services/delivery/financial/deliveryFinancialIdentity.js',
  'src/services/delivery/financial/deliveryMoneyContract.js',
  'src/services/delivery/financial/deliveryReturnStateReader.js'
];

for (const file of pureFiles) {
  const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
  test(`RO-001: ${file} contains no database mutation call`, () => {
    assert.doesNotMatch(source, WRITE_CALL);
  });
}

function functionBody(source, signature, followingSignature) {
  const start = source.indexOf(signature);
  assert.notEqual(start, -1, `missing ${signature}`);
  const end = source.indexOf(followingSignature, start + signature.length);
  assert.notEqual(end, -1, `missing boundary ${followingSignature}`);
  return source.slice(start, end);
}

test('RO-002: Web GET list canonical integration contains no write call', () => {
  const source = fs.readFileSync(path.join(ROOT, 'src/services/v2/deliveryTodayNew.service.js'), 'utf8');
  const body = functionBody(source, 'async function listOrders(query = {}, options = {}) {', '\nasync function suggestions');
  assert.doesNotMatch(body, WRITE_CALL);
  assert.match(body, /resolvePaymentStatesForOrders/);
});

test('RO-003: App GET list canonical integration contains no write call', () => {
  const source = [
    'src/engines/delivery.legacy.engine.source/part-01.jsfrag',
    'src/engines/delivery.legacy.engine.source/part-02.jsfrag',
    'src/engines/delivery.legacy.engine.source/part-03.jsfrag'
  ].map((file) => fs.readFileSync(path.join(ROOT, file), 'utf8')).join('');
  const body = functionBody(source, '  async listOrders(query = {}) {', '\n  normalizeReturnItems');
  assert.doesNotMatch(body, WRITE_CALL);
  assert.match(body, /resolvePaymentStatesForOrders/);
});

test('RO-004: delivery POST writer routes remain present and transaction-wrapped', () => {
  const source = fs.readFileSync(path.join(ROOT, 'src/routes/deliveryRoutes.js'), 'utf8');
  for (const route of ['return', 'payment', 'confirm']) {
    assert.match(source, new RegExp(`router\\.post\\('/${route}'`));
  }
  assert.match(source, /withMongoTransaction\(\(session\) => engine\.saveReturn/);
  assert.match(source, /withMongoTransaction\(\(session\) => engine\.savePayment/);
  assert.match(source, /withMongoTransaction\(\(session\) => engine\.confirm/);
});

