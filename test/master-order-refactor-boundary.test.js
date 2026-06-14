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
  const publicSurface = [
    read('src/services/master-order/index.js'),
    read('src/services/master-order/masterOrderDelivery.service.js'),
    read('src/services/master-order/masterOrderAccounting.service.js'),
    read('src/services/master-order/masterOrderPrint.service.js'),
    read('src/services/master-order/masterOrderQuery.service.js'),
    read('src/services/master-order/masterOrderCommand.service.js'),
    read('src/services/master-order/deliveryTodayQuery.service.js'),
    read('src/services/master-order/deliveryOrderCommand.service.js'),
    read('src/services/master-order/deliveryAccounting.service.js')
  ].join('\n');
  for (const name of [
    ...snapshot.deliveryExports,
    ...snapshot.accountingExports,
    ...snapshot.printExports
  ]) {
    const rx = new RegExp(`\\b${name}\\b`);
    assert.match(publicSurface, rx, `${name} is not exposed through facade modules`);
  }
  for (const name of snapshot.returnInternalExports) {
    const rx = new RegExp(`\\b${name}\\b`);
    assert.match(publicSurface + read('src/services/master-order/masterOrderReturn.service.js'), rx, `${name} is not exposed through _internal`);
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
