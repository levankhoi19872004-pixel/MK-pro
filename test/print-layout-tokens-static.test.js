'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('all canonical templates load print tokens after legacy print css', () => {
  const templates = read('templates/printTemplates.js');
  assert.match(templates, /print-tokens\.css/);
  assert.match(templates, /WAREHOUSE_PICKING:\s*warehousePickingTemplate/);
});

test('print tokens define one canonical A4 spacing system', () => {
  const css = read('public/print-tokens.css');
  assert.match(css, /@page\s*\{[\s\S]*size:\s*A4 portrait;[\s\S]*margin:\s*8mm;/);
  assert.match(css, /--print-font-size:\s*9pt/);
  assert.match(css, /--print-cell-padding-y:\s*1\.2mm/);
  assert.match(css, /--print-section-gap:\s*3mm/);
  assert.match(css, /min-height:\s*18mm/);
});

test('DMS invoice column widths total exactly 100 percent', () => {
  const templates = read('templates/printTemplates.js');
  const block = templates.slice(
    templates.indexOf('<table class="dms-invoice-table">'),
    templates.indexOf('</thead>', templates.indexOf('<table class="dms-invoice-table">'))
  );
  const widths = [...block.matchAll(/width:(\d+)%/g)].map((match) => Number(match[1]));
  assert.deepEqual(widths, [4, 9, 31, 7, 6, 9, 9, 9, 7, 9]);
  assert.equal(widths.reduce((sum, value) => sum + value, 0), 100);
});


test('warehouse picking column widths use the shared seven-column 100 percent contract', () => {
  const templates = read('templates/printTemplates.js');
  const start = templates.indexOf('<table class="print-table master-picking-table">');
  const end = templates.indexOf('</thead>', start);
  const block = templates.slice(start, end);
  const widths = [...block.matchAll(/width:(\d+)%/g)].map((match) => Number(match[1]));
  assert.deepEqual(widths, [4, 13, 39, 10, 8, 11, 15]);
  assert.equal(widths.reduce((sum, value) => sum + value, 0), 100);
});
