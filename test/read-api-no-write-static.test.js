'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { READ_ENDPOINT_BUDGETS } = require('../src/config/readEndpointBudgets');

const ROOT = path.resolve(__dirname, '..');
function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('read endpoint budget config marks all read/list endpoints as read-only and write-forbidden', () => {
  Object.entries(READ_ENDPOINT_BUDGETS).forEach(([key, budget]) => {
    assert.equal(budget.readOnly, true, `${key} must be readOnly`);
    assert.equal(budget.forbiddenWrites, true, `${key} must forbid writes`);
    assert.ok(budget.reloadPolicy, `${key} should define reload policy`);
    assert.ok(budget.cachePolicy, `${key} should define cache policy`);
  });
});

test('selected read routes delegate GET/list behavior without inline heavy write calls', () => {
  const routeFiles = [
    'src/routes/productRoutes.js',
    'src/routes/customerRoutes.js',
    'src/routes/dmsInventoryRoutes.js',
    'src/routes/mobile/catalog.routes.js',
    'src/routes/mobile/warehouse.routes.js',
    'src/routes/reportRoutes.js',
    'src/routes/newOperationsRoutes.js',
    'src/routes/fundRoutes.js',
    'src/routes/returnRoutes.js'
  ];
  const forbiddenInlineWrite = /router\.get\([\s\S]{0,900}\.(?:save|create|insertMany|updateOne|updateMany|findOneAndUpdate|deleteOne|deleteMany|bulkWrite)\s*\(/;
  routeFiles.forEach((file) => {
    const source = read(file);
    assert.doesNotMatch(source, forbiddenInlineWrite, `${file} should not perform inline DB writes inside GET handlers`);
  });
});

test('list/search read contracts prefer projection/pagination vocabulary over full document scans', () => {
  const docs = read('docs/READ_REQUEST_BUDGET_MATRIX.md');
  assert.match(docs, /Projection hẹp/i);
  assert.match(docs, /page\/limit/i);
  assert.match(docs, /Không query từng item trong vòng lặp/i);
  assert.match(docs, /GET\/(list\/)?read route không ghi DB|GET\/read route không ghi DB|GET\/list\/read route không ghi DB/i);
});
