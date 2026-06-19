'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => require('./helpers/sourceBundle.util').readSource(file);

test('canonical warehouse templates use print tokens and child invoice uses isolated exact CSS', () => {
  const templates = read('templates/printTemplates.js');
  const exactTemplate = read('templates/print/dmsExactSalesInvoice.template.js');
  assert.match(templates, /print-tokens\.css/);
  assert.match(templates, /WAREHOUSE_PICKING:\s*warehousePickingTemplate/);
  assert.match(exactTemplate, /dms-exact-sales-invoice\.css\?v=dms-exact-v1/);
});

test('print tokens define one canonical A4 spacing system', () => {
  const css = read('public/print-tokens.css');
  assert.match(css, /@page\s*\{[\s\S]*size:\s*A4 portrait;[\s\S]*margin:\s*8mm;/);
  assert.match(css, /--print-font-size:\s*9pt/);
  assert.match(css, /--print-cell-padding-y:\s*1\.2mm/);
  assert.match(css, /--print-section-gap:\s*3mm/);
  assert.match(css, /min-height:\s*18mm/);
});

test('DMS exact invoice column widths total the Invoice-36 content width', () => {
  const template = read('templates/print/dmsExactSalesInvoice.template.js');
  const block = template.slice(
    template.indexOf('<table class="dmsx-items-table">'),
    template.indexOf('</colgroup>', template.indexOf('<table class="dmsx-items-table">'))
  );
  const widths = [...block.matchAll(/width:(\d+(?:\.\d+)?)pt/g)].map((match) => Number(match[1]));
  assert.deepEqual(widths, [21.60, 44.28, 213.84, 37.44, 25.20, 40.32, 54.72, 40.32, 40.32, 54.72]);
  assert.equal(Number(widths.reduce((sum, value) => sum + value, 0).toFixed(2)), 572.76);
});


test('warehouse picking column widths use the shared seven-column 100 percent contract', () => {
  const templates = read('templates/printTemplates.js');
  const start = templates.indexOf('<table class="print-table master-picking-table">');
  const end = templates.indexOf('</thead>', start);
  const block = templates.slice(start, end);
  const visibleHeaders = [...block.matchAll(/<th(?![^>]*excel-only-column)[^>]*style="[^"]*width:(\d+)%[^"]*"[^>]*>/g)];
  const widths = visibleHeaders.map((match) => Number(match[1]));
  assert.deepEqual(widths, [4, 13, 39, 10, 8, 11, 15]);
  assert.equal(widths.reduce((sum, value) => sum + value, 0), 100);
  assert.match(block, /class="excel-only-column"[^>]*>Quy cách<\/th>/);
});
