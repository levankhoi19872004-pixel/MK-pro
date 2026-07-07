'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const TOOL_FILES = [
  'src/routes/tools/orderSplit.routes.js',
  'src/services/tools/orderSplitExcelParser.service.js',
  'src/services/tools/orderSplitAlgorithm.service.js',
  'src/services/tools/orderSplitExport.service.js',
  'src/services/tools/orderSplitVatExport.service.js'
];

const FORBIDDEN_IMPORTS = [
  'orderService', 'arService', 'inventoryService', 'accountingService', 'invoiceService',
  'orderLegacy.service', 'inventoryStock.service', 'arLedger', 'fundLedger'
];
const FORBIDDEN_COLLECTIONS = [
  'orders', 'master_orders', 'returnOrders', 'arLedgers', 'fundLedgers',
  'inventories', 'stockTransactions', 'reporting_snapshots'
];

test('order split tool stays isolated from ERP business services and collections', () => {
  for (const relativeFile of TOOL_FILES) {
    const fullPath = path.join(ROOT, relativeFile);
    assert.equal(fs.existsSync(fullPath), true, `${relativeFile} must exist`);
    const source = fs.readFileSync(fullPath, 'utf8');
    assert.match(source, /OUT-OF-FLOW TOOL ONLY/, `${relativeFile} must declare out-of-flow guard`);
    for (const forbidden of FORBIDDEN_IMPORTS) {
      assert.equal(source.includes(`require('${forbidden}`) || source.includes(`require("${forbidden}`), false, `${relativeFile} must not import ${forbidden}`);
    }
    for (const collection of FORBIDDEN_COLLECTIONS) {
      assert.equal(new RegExp(`\\b(db\\.|collection\\(|mongoose\\.|model\\(|deleteMany|updateMany|insertMany|save\\()`).test(source) && source.includes(collection), false, `${relativeFile} must not write/read business collection ${collection}`);
    }
  }
});

test('order split API is mounted under isolated tools prefix', () => {
  const routesIndex = fs.readFileSync(path.join(ROOT, 'src/routes/index.js'), 'utf8');
  assert.match(routesIndex, /app\.use\('\/api\/tools\/order-split'/);
});
