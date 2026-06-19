'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');

const CONTROLLER_PATH = path.resolve(__dirname, '../src/controllers/reportController.js');

function loadControllerWithReportService(reportService) {
  const originalLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (parent?.filename === CONTROLLER_PATH && request === '../services/reportService') return reportService;
    if (parent?.filename === CONTROLLER_PATH && request === '../services/inventoryService') return {};
    return originalLoad.apply(this, arguments);
  };
  try {
    delete require.cache[CONTROLLER_PATH];
    return require(CONTROLLER_PATH);
  } finally {
    Module._load = originalLoad;
  }
}

function invoke(handler, req) {
  return new Promise((resolve, reject) => {
    const response = {
      statusCode: 200,
      body: undefined,
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; resolve(this); return this; }
    };
    handler(req, response, reject);
  });
}

test('stock-card API keeps date validation and response contract', async () => {
  const calls = [];
  const controller = loadControllerWithReportService({
    async stockCardReport(query) {
      calls.push({ ...query });
      return { reportMode: 'stock_card', transactions: [], items: [], meta: { page: 1 }, summary: {} };
    }
  });

  const invalid = await invoke(controller.stockCard, { query: {} });
  assert.equal(invalid.statusCode, 400);
  assert.equal(calls.length, 0);

  const valid = await invoke(controller.stockCard, { query: { dateFrom: '2020-01-01', dateTo: '2020-01-10', page: '2', limit: '20' } });
  assert.equal(valid.statusCode, 200);
  assert.equal(valid.body.ok, true);
  assert.equal(valid.body.reportMode, 'stock_card');
  assert.deepEqual(calls, [{ dateFrom: '2020-01-01', dateTo: '2020-01-10', page: '2', limit: '20' }]);
});

test('stock-card routes retain the existing stock-report authorization guard', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../src/routes/reportRoutes.js'), 'utf8');
  assert.match(source, /const viewStockReports = requireRole\(\['admin', 'manager', 'accountant', 'warehouse', 'sales'\]\)/);
  assert.match(source, /router\.get\('\/stock-card', viewStockReports, reportController\.stockCard\)/);
  assert.match(source, /router\.get\('\/reports\/stock-card', viewStockReports, reportController\.stockCard\)/);
});
