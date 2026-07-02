'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { SOURCE_CONTRACT_REGISTRY } = require('../src/services/source-contracts/SourceContractRegistry');

const REQUIRED = ['dashboard-sales-today', 'dashboard-current-debt', 'dashboard-fund-balance', 'dashboard-inventory-summary', 'dashboard-delivery-today'];

test('dashboard contracts cover key cards with correct SSoT', () => {
  for (const code of REQUIRED) assert.ok(SOURCE_CONTRACT_REGISTRY[code], code);
  assert.deepEqual(SOURCE_CONTRACT_REGISTRY['dashboard-current-debt'].primaryCollections, ['arLedgers']);
  assert.equal(SOURCE_CONTRACT_REGISTRY['dashboard-fund-balance'].fundSource, 'fundLedgers');
  assert.equal(SOURCE_CONTRACT_REGISTRY['dashboard-inventory-summary'].inventorySource, 'inventories');
  assert.deepEqual(SOURCE_CONTRACT_REGISTRY['dashboard-delivery-today'].primaryCollections, ['orders']);
});

test('dashboard API attaches sourceNotes and UI renders compact note', () => {
  const controller = fs.readFileSync('src/controllers/dashboardController.js', 'utf8');
  const ui = fs.readFileSync('public/js/app/00-dashboard.js', 'utf8');
  assert.match(controller, /buildDashboardSourceNotes/);
  assert.match(controller, /sourceNotes/);
  assert.match(ui, /dashboardSourceNote/);
  assert.match(ui, /SourceNoteUi\.renderSourceNote/);
});
