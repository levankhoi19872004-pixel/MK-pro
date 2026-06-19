'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = require('./helpers/sourceBundle.util').readSource('src/services/reportLegacy.service.js');

test('major operational reports expose paged items, full summary and metadata', () => {
  for (const [start, end] of [
    ['async function stockCardReport', 'function moneyDocKey'],
    ['async function salesReport', 'async function financeReport'],
    ['async function financeReport', 'async function deliveryReport'],
    ['async function deliveryReport', 'async function dashboardReport']
  ]) {
    const block = source.slice(source.indexOf(start), source.indexOf(end));
    assert.ok(block.length > 0, `${start} block must exist`);
    assert.match(block, /reportPagination\(/);
    assert.match(block, /\bmeta\b/);
    assert.match(block, /\bsummary\b/);
  }
});

test('sales and delivery calculate rows and totals in a single Mongo facet before returning a page', () => {
  const sales = source.match(/async function salesReport[\s\S]*?\nasync function financeReport/)?.[0] || '';
  const delivery = source.match(/async function deliveryReport[\s\S]*?\nasync function dashboardReport/)?.[0] || '';
  for (const block of [sales, delivery]) {
    assert.match(block, /\$facet/);
    assert.match(block, /rows:/);
    assert.match(block, /totals:/);
    assert.match(block, /\$skip:\s*skip/);
    assert.match(block, /\$limit:\s*limit/);
  }
});

test('stock export explicitly opts into full result despite API pagination', () => {
  const exportSource = require('./helpers/sourceBundle.util').readSource('src/services/importExportLegacy.service.js');
  assert.match(exportSource, /stockReport\(\{ \.\.\.query, full: '1', export: '1' \}\)/);
});
