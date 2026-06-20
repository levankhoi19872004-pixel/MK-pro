'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

function withoutRuntimeTimestamp(value) {
  const clone = JSON.parse(JSON.stringify(value, (_key, item) => typeof item === 'function' ? undefined : item));
  if (clone?.meta) delete clone.meta.printedAt;
  return clone;
}

test('print composition root is acyclic and lower-level modules do not import the public facade', () => {
  const facade = read('services/printDataBuilder.js');
  const builder = read('services/print/PrintDocumentBuilder.js');
  const formatter = read('services/print/PrintFormatService.js');
  const legacySource = read('services/printDataBuilder.legacy.source/part-01.jsfrag');

  assert.match(facade, /createPrintDocumentBuilder\(legacyImplementation\)/);
  assert.match(facade, /require\('\.\/printDataBuilder\.legacy'\)/);
  assert.doesNotMatch(builder, /printDataBuilder(?:\.legacy)?/);
  assert.doesNotMatch(formatter, /printDataBuilder(?:\.legacy)?/);
  assert.match(legacySource, /require\('\.\/print\/PrintFormatService'\)/);
  assert.doesNotMatch(legacySource, /function formatMoney\(/);
  assert.doesNotMatch(legacySource, /function numberToVietnameseWords\(/);
});

test('PrintDocumentBuilder depends on an explicit implementation contract', () => {
  const { REQUIRED_METHODS, createPrintDocumentBuilder } = require('../services/print/PrintDocumentBuilder');
  assert.deepEqual(REQUIRED_METHODS, [
    'buildPrintData',
    'buildDeliveryInvoicePayload',
    'calculateDeliveryInvoiceSummary',
    'paginateDeliveryInvoice',
    'validateAgainstDmsSample'
  ]);
  assert.throws(() => createPrintDocumentBuilder({}), /missing/i);

  const calls = [];
  const implementation = Object.fromEntries(REQUIRED_METHODS.map((method) => [method, (...args) => {
    calls.push([method, args]);
    return method;
  }]));
  const builder = createPrintDocumentBuilder(implementation);
  assert.equal(builder.buildPrintData({ id: 'SO1' }), 'buildPrintData');
  assert.deepEqual(calls, [['buildPrintData', [{ id: 'SO1' }]]]);
  assert.equal(Object.isFrozen(builder), true);
});

test('public printDataBuilder contract and behavior remain compatible with legacy implementation', () => {
  const facade = require('../services/printDataBuilder');
  const legacy = require('../services/printDataBuilder.legacy');
  const expectedMethods = [
    'buildPrintData',
    'buildDeliveryInvoicePayload',
    'calculateDeliveryInvoiceSummary',
    'paginateDeliveryInvoice',
    'validateAgainstDmsSample',
    'formatMoney',
    'formatDate',
    'formatDateTime',
    'numberToVietnameseWords'
  ];
  assert.deepEqual(Object.keys(facade).sort(), expectedMethods.sort());

  const document = {
    id: 'SO-PRINT-DI',
    code: 'SO-PRINT-DI',
    orderDate: '2026-06-20',
    customerCode: 'KH01',
    customerName: 'Khách A',
    salesStaffCode: 'BH01',
    salesStaffName: 'Bán A',
    deliveryStaffCode: 'GH01',
    deliveryStaffName: 'Giao A',
    items: [{
      productCode: 'P01',
      productName: 'Sản phẩm A',
      quantity: 12,
      conversionRateAtOrder: 10,
      catalogSalePriceAtOrder: 10800,
      finalPrice: 10000,
      lineAmountAtOrder: 120000,
      warehouseCodeAtOrder: 'KHO_HC'
    }]
  };

  assert.deepEqual(
    withoutRuntimeTimestamp(facade.buildPrintData(document)),
    withoutRuntimeTimestamp(legacy.buildPrintData(document))
  );
  assert.equal(facade.formatMoney(1234567), legacy.formatMoney(1234567));
  assert.equal(facade.numberToVietnameseWords(1234567), legacy.numberToVietnameseWords(1234567));
});
