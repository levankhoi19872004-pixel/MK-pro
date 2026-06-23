'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const source = fs.readFileSync('src/services/orderLegacy.service.source/part-03.jsfrag', 'utf8');
const runtime = fs.readFileSync('src/services/orderLegacy.service.js', 'utf8');
const repository = fs.readFileSync('src/repositories/orderRepository.js', 'utf8');
const apiMonitor = fs.readFileSync('src/middlewares/apiMonitor.middleware.js', 'utf8');
const systemUi = fs.readFileSync('public/js/app/09-system.js', 'utf8');
const updateOrderBlock = source.slice(source.indexOf('async function updateOrder('), source.indexOf('async function updateVatInvoiceSetting('));

test('sales order update uses inventory delta instead of unconditional full reverse and repost', () => {
  assert.match(source, /function buildSalesOrderStockDeltaItems\(/);
  assert.match(source, /InventoryPostingService\.postSaleEditDelta\(orderToSave, stockDelta\.inItems, 'IN'/);
  assert.match(source, /InventoryPostingService\.postSaleEditDelta\(orderToSave, stockDelta\.outItems, 'OUT'/);
  assert.doesNotMatch(updateOrderBlock, /await reverseSalesOrderPosting\(current, \{ session \}\)/);
  assert.match(runtime, /postSaleEditDelta/);
});

test('sales order SO id lookup is routed to indexed id field on hot path', () => {
  assert.match(repository, /function isGeneratedSalesOrderId\(value\)/);
  assert.match(repository, /if \(isGeneratedSalesOrderId\(value\)\) return \{ id: value \};/);
  assert.match(repository, /collectionRepository\.patchByIdentity\(ORDER_KEY, value, canonicalizeOperationalStaff\(patch\), \['id'\], options\)/);
});

test('api monitor separates last slowest query from historical slowest query', () => {
  assert.match(apiMonitor, /lastSlowestQueryMs/);
  assert.match(apiMonitor, /lastSlowestQueryLabel/);
  assert.match(systemUi, /function apiMonitorQueryText\(row = \{\}, mode = 'history'\)/);
  assert.match(systemUi, /apiMonitorQueryText\(row, 'last'\)/);
});
