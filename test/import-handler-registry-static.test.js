'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const orchestrator = require('../src/services/import/ImportCommitOrchestrator');

test('import handler registry contains every supported import type', () => {
  assert.deepEqual(orchestrator.supportedTypes().sort(), [
    'cashbook', 'customers', 'debtCollections', 'importOrders', 'openingDebt',
    'openingStock', 'products', 'promotionGroupItems', 'promotionGroupRules',
    'promotionProductRules', 'salesOrders', 'users'
  ].sort());
});

test('sales order handler applies autoCutStock and registry dispatches operation', async () => {
  let captured = null;
  const result = await orchestrator.commit('salesOrders', [{ code: 'SO1' }], {
    operations: {
      importSalesOrders: async (rows, options) => {
        captured = { rows, options };
        return { imported: rows.length };
      }
    }
  });
  assert.equal(result.imported, 1);
  assert.equal(captured.options.autoCutStock, true);
});

test('excelImportService commit no longer owns type if/else dispatch chain', () => {
  const source = fs.readFileSync(path.join(ROOT, 'src/services/excelImportService.js'), 'utf8');
  assert.match(source, /importCommitOrchestrator\.commit\(type, commitRows/);
  assert.doesNotMatch(source, /if \(type === 'products'\) result = await upsertProducts/);
  assert.doesNotMatch(source, /else if \(type === 'salesOrders'\) result = await importSalesOrders/);
});
