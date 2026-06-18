'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const exists = (file) => fs.existsSync(path.join(ROOT, file));

test('masterOrderService remains a backward-compatible facade', () => {
  const facade = read('src/services/masterOrderService.js');
  assert.match(facade, /module\.exports\s*=\s*require\('\.\/master-order'\)/);
});

test('master-order domain modules exist', () => {
  [
    'src/services/master-order/index.js',
    'src/services/master-order/masterOrderDelivery.service.js',
    'src/services/master-order/masterOrderReturn.service.js',
    'src/services/master-order/masterOrderAccounting.service.js',
    'src/services/master-order/masterOrderPrint.service.js',
    'src/services/master-order/masterOrderLegacy.service.js'
  ].forEach((file) => assert.equal(exists(file), true, `${file} missing`));
});

test('facade export surface is preserved by domain index', () => {
  const snapshot = JSON.parse(read('test/fixtures/master-order/before-refactor.json'));
  const service = require('../src/services/master-order');
  const publicNames = new Set(Object.keys(service));
  const internalNames = new Set(Object.keys(service._internal || {}));

  for (const name of [
    ...snapshot.deliveryExports,
    ...snapshot.accountingExports,
    ...snapshot.printExports
  ]) {
    assert.equal(publicNames.has(name), true, `${name} is not exposed through facade modules`);
    assert.equal(typeof service[name], 'function', `${name} must remain callable`);
  }
  for (const name of snapshot.returnInternalExports) {
    assert.equal(internalNames.has(name), true, `${name} is not exposed through _internal`);
    assert.equal(typeof service._internal[name], 'function', `${name} must remain callable`);
  }
});

test('domain modules do not import the public facade, avoiding dependency cycles', () => {
  [
    'src/services/master-order/masterOrderDelivery.service.js',
    'src/services/master-order/masterOrderReturn.service.js',
    'src/services/master-order/masterOrderAccounting.service.js',
    'src/services/master-order/masterOrderPrint.service.js'
  ].forEach((file) => {
    const body = read(file);
    assert.doesNotMatch(body, /require\(['"]\.\.\/masterOrderService['"]\)/, `${file} imports facade`);
  });
});
