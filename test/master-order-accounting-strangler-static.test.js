'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

function functionBlock(source, name) {
  const marker = `async function ${name}`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `${name} not found`);
  const rest = source.slice(start);
  const next = rest.slice(marker.length).search(/\nasync function\s+/);
  return next === -1 ? rest : rest.slice(0, marker.length + next);
}

test('master order accounting facade uses Strangler env switch with legacy fallback', () => {
  const source = read('src/services/master-order/masterOrderAccounting.service.js');

  assert.match(source, /const legacy = require\('\.\/masterOrderLegacy\.service'\);/);
  assert.match(source, /const DeliverySettlementService = require\('\.\.\/\.\.\/domain\/settlement\/DeliverySettlementService'\);/);
  assert.match(source, /function useNewDeliverySettlement\(\)/);
  assert.match(source, /process\.env\.USE_NEW_DELIVERY_SETTLEMENT/);

  const confirmBlock = functionBlock(source, 'confirmDeliveryAccounting');
  assert.match(confirmBlock, /DeliverySettlementService\.confirmAccounting\(\.\.\.args\)/);
  assert.match(confirmBlock, /legacy\.confirmDeliveryAccounting\(\.\.\.args\)/);

  const unlockBlock = functionBlock(source, 'adminUnlockDeliveryAccounting');
  assert.match(unlockBlock, /DeliverySettlementService\.unlockAccounting\(\.\.\.args\)/);
  assert.match(unlockBlock, /legacy\.adminUnlockDeliveryAccounting\(\.\.\.args\)/);
});

test('DeliverySettlementService delegates accounting to legacy directly to avoid facade recursion', () => {
  const source = read('src/domain/settlement/DeliverySettlementService.js');

  assert.match(source, /function getMasterOrderLegacyService\(\)/);
  assert.match(source, /require\('\.\.\/\.\.\/services\/master-order\/masterOrderLegacy\.service'\)/);
  assert.doesNotMatch(source, /require\('\.\.\/\.\.\/services\/masterOrderService'\)/);
  assert.match(source, /async function confirmAccounting\(masterOrderIdOrBody = \{\}, body = \{\}, options = \{\}\)/);
  assert.match(source, /getMasterOrderLegacyService\(\)\.confirmDeliveryAccounting/);
  assert.match(source, /async function unlockAccounting\(idOrCode, body = \{\}, options = \{\}\)/);
  assert.match(source, /getMasterOrderLegacyService\(\)\.adminUnlockDeliveryAccounting\(idOrCode, body, options\)/);
  assert.match(source, /unlockAccounting,/);
});
