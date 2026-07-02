'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/services/reports/InformationReportService.js'), 'utf8');
const fn = source.slice(source.indexOf('async function customerMonthlySalesMap'), source.indexOf('async function productInformationReport'));

test('customerMonthlySalesMap uses canonical confirmed sales report source', () => {
  assert.match(source, /const SalesReportService = require\('\.\/SalesReportService'\)/);
  assert.match(fn, /SalesReportService\.salesReport\(\{[\s\S]*dateFrom:\s*start,[\s\S]*dateTo:\s*end,[\s\S]*full:\s*'1',[\s\S]*export:\s*'1'/);
  assert.equal(/SalesOrder\.aggregate/.test(fn), false);
  assert.equal(/orderDate\s*:\s*\{/.test(fn), false);
  assert.equal(/pending|reopened|cancelled/.test(fn), false);
});
