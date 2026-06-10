'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

test('posting/event/domain/cache/read-model foundation files exist', () => {
  [
    'src/core/posting/posting.engine.js',
    'src/events/eventBus.js',
    'src/events/eventTypes.js',
    'src/events/listeners/ar.listener.js',
    'src/events/listeners/inventory.listener.js',
    'src/events/listeners/fund.listener.js',
    'src/events/listeners/audit.listener.js',
    'src/domain/order/OrderAggregate.js',
    'src/cache/product.cache.js',
    'src/cache/customer.cache.js',
    'src/cache/staff.cache.js',
    'src/cache/promotion.cache.js',
    'src/jobs/rebuildInventorySnapshot.job.js',
    'src/read-models/customerDebt.view.js',
    'src/read-models/deliveryToday.view.js',
    'src/read-models/inventory.view.js',
    'src/monitoring/ledgerValidator.js'
  ].forEach((rel) => assert.equal(exists(rel), true, `${rel} missing`));
});

test('internal event names are standardized', () => {
  const eventTypes = require('../src/events/eventTypes');
  ['SALE_CONFIRMED', 'SALE_CANCELLED', 'RETURN_CONFIRMED', 'RETURN_CANCELLED', 'PAYMENT_RECEIVED', 'MASTER_ORDER_ASSIGNED', 'DELIVERY_CONFIRMED']
    .forEach((name) => assert.equal(eventTypes[name], name));
});

test('posting engine facade exposes explicit AR inventory fund APIs', () => {
  const source = fs.readFileSync(path.join(ROOT, 'src/core/posting/posting.engine.js'), 'utf8');
  [
    'postSale',
    'postReturn',
    'postReceipt',
    'postCancelOrder',
    'postInventoryMovement',
    'postInventorySale',
    'postInventoryReturn',
    'postInventoryImport',
    'postInventoryAdjustment',
    'postBulkInventoryMovements',
    'postBulkSalesAR',
    'postFundReceipt',
    'postExpense',
    'postFundTransfer'
  ].forEach((fn) => {
    assert.match(source, new RegExp(`function\\s+${fn}\\s*\\(`), `${fn} missing implementation`);
    assert.match(source, new RegExp(`\\b${fn}\\b`), `${fn} missing export`);
  });
});

test('event listeners route ledger work through posting engine facade', () => {
  const listenerFiles = [
    'src/events/listeners/ar.listener.js',
    'src/events/listeners/inventory.listener.js',
    'src/events/listeners/fund.listener.js'
  ];
  for (const rel of listenerFiles) {
    const source = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    assert.match(source, /core\/posting\/posting\.engine/, `${rel} must depend on posting engine facade`);
    assert.doesNotMatch(source, /services\/fundService|services\/inventoryService|engines\/posting\.engine/, `${rel} must not call legacy ledger services directly`);
  }
});

test('business modules import canonical posting engine facade, not legacy engine directly', () => {
  const files = ['src/services', 'src/routes', 'src/controllers', 'src/modules', 'src/mobile']
    .map((rel) => path.join(ROOT, rel))
    .filter(fs.existsSync)
    .flatMap(function walk(dir) {
      return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return walk(full);
        return entry.isFile() && entry.name.endsWith('.js') ? [full] : [];
      });
    });
  const violations = [];
  for (const file of files) {
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    const source = fs.readFileSync(file, 'utf8');
    if (/require\(['"][.\/]+(?:\.\.\/)*engines\/posting\.engine['"]\)/.test(source)) {
      violations.push(rel);
    }
  }
  assert.deepEqual(violations, [], `Legacy posting engine imports found:\n${violations.join('\n')}`);
});
