'use strict';

const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const test = require('node:test');
const assert = require('node:assert/strict');
const { importRouter } = require('../src/routes/importExportRoutes');
const importShortageReviewService = require('../src/services/import/ImportShortageReviewService');
const {
  createImportShortageRuntime,
  jsonResponse
} = require('./helpers/importShortageRuntimeHarness');

const rootDir = path.join(__dirname, '..');

function read(file) {
  return fs.readFileSync(path.join(rootDir, file), 'utf8');
}

function routerRoutes(router) {
  return (router.stack || [])
    .filter((layer) => layer.route)
    .map((layer) => ({
      path: layer.route.path,
      methods: Object.keys(layer.route.methods || {}).sort()
    }));
}

function hasRoute(routes, method, routePath) {
  return routes.some((route) => route.path === routePath && route.methods.includes(method));
}

function makeReviewPayload(sessionId = 'TEST-SESSION') {
  return {
    sessionId,
    fingerprint: 'fp-r3',
    selectedScopeFingerprint: 'scope-r3',
    status: 'pending',
    summary: {
      selectedOrderCount: 1,
      shortageOrderCount: 1,
      productCount: 1,
      itemCount: 1,
      totalMissingQuantity: 11,
      totalCutAmount: 320736
    },
    items: [{
      documentCode: 'B00395233',
      customerName: '',
      productCode: 'CLOSEUP',
      productName: 'CLOSEUP KDR Bac Ha',
      requestedQuantity: 32,
      availableQuantity: 21,
      missingQuantity: 11,
      cutAmount: 320736
    }]
  };
}

function makePreviewPayload() {
  return {
    ok: true,
    sessionId: 'TEST-SESSION',
    rows: [{
      documentCode: 'B00395233',
      previewMode: 'order',
      valid: true,
      canImport: true,
      hasShortage: true,
      shortageQuantity: 11,
      shortageAmount: 320736,
      rowNo: 3,
      shortageReport: [{
        documentCode: 'B00395233',
        productCode: 'CLOSEUP',
        productName: 'CLOSEUP KDR Bac Ha',
        requestedQuantity: 32,
        availableQuantity: 21,
        importQuantity: 21,
        missingQuantity: 11,
        cutAmount: 320736
      }]
    }]
  };
}

function installServiceStubs(stubs = {}) {
  const original = {
    getReview: importShortageReviewService.getReview,
    confirmReview: importShortageReviewService.confirmReview
  };
  importShortageReviewService.getReview = stubs.getReview || (async (sessionId) => makeReviewPayload(sessionId));
  importShortageReviewService.confirmReview = stubs.confirmReview || (async (sessionId, payload) => ({
    sessionId,
    mode: payload.mode,
    fingerprint: 'fp-r3-confirmed',
    selectedScopeFingerprint: 'scope-r3'
  }));
  return () => {
    importShortageReviewService.getReview = original.getReview;
    importShortageReviewService.confirmReview = original.confirmReview;
  };
}

async function withImportApp(stubs, fn) {
  const restore = installServiceStubs(stubs);
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { role: 'admin', username: 'route-test-admin', fullName: 'Route Test Admin' };
    next();
  });
  app.use('/api/import', importRouter);
  app.use('/api', (_req, res) => res.status(404).json({ ok: false, message: 'API không tồn tại' }));

  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    return await fn(baseUrl);
  } finally {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    restore();
  }
}

async function flushAsync() {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

async function waitFor(check, timeoutMs = 1000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = check();
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return check();
}

test('Phase257A-R3 canonical import router owns shortage review GET and PUT before session status', () => {
  const routes = routerRoutes(importRouter);
  const shortageIndex = routes.findIndex((route) => route.path === '/sessions/:sessionId/shortage-review');
  const statusIndex = routes.findIndex((route) => route.path === '/sessions/:sessionId');
  const indexRoutes = read('src/routes/index.js');

  assert.match(indexRoutes, /const \{ importRouter, exportRouter \} = require\('\.\/importExportRoutes'\)/);
  assert.match(indexRoutes, /app\.use\('\/api\/import', importRouter\)/);
  assert.equal(hasRoute(routes, 'get', '/sessions/:sessionId/shortage-review'), true);
  assert.equal(hasRoute(routes, 'put', '/sessions/:sessionId/shortage-review'), true);
  assert.ok(shortageIndex >= 0);
  assert.ok(statusIndex >= 0);
  assert.ok(shortageIndex < statusIndex);
});

test('Phase257A-R3 legacy review route files are not mounted as canonical import routers', () => {
  const indexRoutes = read('src/routes/index.js');

  assert.doesNotMatch(indexRoutes, /excelImportRoutes/);
  assert.doesNotMatch(indexRoutes, /importRuntimeRoutes/);
  assert.match(read('src/routes/excelImportRoutes.js'), /\/sessions\/:sessionId\/shortage-review/);
  assert.match(read('src/routes/importRuntimeRoutes.js'), /\/sessions\/:sessionId\/shortage-review/);
});

test('Phase257A-R3 GET and PUT shortage review reach the canonical mounted controller', async () => {
  const calls = [];
  await withImportApp({
    getReview: async (sessionId, selection, actor) => {
      calls.push({ action: 'getReview', sessionId, selection, actor });
      return { ...makeReviewPayload(sessionId), items: [] };
    },
    confirmReview: async (sessionId, payload, actor) => {
      calls.push({ action: 'confirmReview', sessionId, payload, actor });
      return {
        sessionId,
        mode: payload.mode,
        fingerprint: 'fp-r3-confirmed',
        selectedScopeFingerprint: 'scope-r3'
      };
    }
  }, async (baseUrl) => {
    const getRes = await fetch(`${baseUrl}/api/import/sessions/TEST-SESSION/shortage-review?selectedOrderCodes=B00395233`);
    const getJson = await getRes.json();
    const putRes = await fetch(`${baseUrl}/api/import/sessions/TEST-SESSION/shortage-review`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'exclude_shortage_quantity', selectedOrderCodes: ['B00395233'] })
    });
    const putJson = await putRes.json();

    assert.equal(getRes.status, 200);
    assert.equal(getJson.ok, true);
    assert.equal(putRes.status, 200);
    assert.equal(putJson.ok, true);
    assert.equal(putJson.mode, 'exclude_shortage_quantity');
    assert.deepEqual(calls.map((call) => call.action), ['getReview', 'confirmReview']);
  });
});

test('Phase257A-R3 missing review session is a business 404, not global API fallback 404', async () => {
  let controllerReached = false;
  await withImportApp({
    getReview: async () => {
      controllerReached = true;
      return {
        error: 'Import session not found',
        status: 404,
        code: 'IMPORT_SESSION_NOT_FOUND'
      };
    }
  }, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/import/sessions/MISSING-SESSION/shortage-review`);
    const json = await res.json();

    assert.equal(res.status, 404);
    assert.equal(controllerReached, true);
    assert.equal(json.ok, false);
    assert.equal(json.code, 'IMPORT_SESSION_NOT_FOUND');
    assert.notEqual(json.message, 'API không tồn tại');
  });
});

test('Phase257A-R3 S3 frontend workflow uses canonical GET and PUT routes before commit', async () => {
  const routeCalls = [];
  await withImportApp({
    getReview: async (sessionId) => {
      routeCalls.push({ action: 'getReview', sessionId });
      return makeReviewPayload(sessionId);
    },
    confirmReview: async (sessionId, payload) => {
      routeCalls.push({ action: 'confirmReview', sessionId, mode: payload.mode });
      return {
        sessionId,
        mode: payload.mode,
        fingerprint: 'fp-r3-confirmed',
        selectedScopeFingerprint: 'scope-r3'
      };
    }
  }, async (baseUrl) => {
    const fetchCalls = [];
    const { context, document, vm } = createImportShortageRuntime({
      rawImportType: 'salesOrdersS3',
      previewRows: [],
      sessionId: '',
      stubCommitCore: false,
      fetchImpl: async (url, init = {}) => {
        const target = String(url);
        fetchCalls.push({ url: target, method: init.method || 'GET', body: init.body || '' });
        if (target === '/api/import/preview') return jsonResponse(makePreviewPayload());
        if (target.includes('/shortage-review')) {
          const res = await fetch(`${baseUrl}${target}`, init);
          const json = await res.json();
          return jsonResponse(json, res.status);
        }
        if (target.includes('/commit')) return jsonResponse({ ok: true, message: 'Import thanh cong' });
        return jsonResponse({ ok: true });
      }
    });

    vm.runInContext(`
      importDataType.value='salesOrdersS3';
      importExcelFile.files=[{name:'s3-shortage.xlsx'}];
      importPreviewRows=[];
      importPreviewSessionId='';
      importSelectedRowKeySet=new Set();
    `, context);

    await document.getElementById('commitImportButton').click();
    const modal = await waitFor(() => {
      const candidate = document.getElementById('importShortageReviewModal');
      return candidate && candidate.classList.contains('show') ? candidate : null;
    });
    assert.equal(modal.classList.contains('show'), true);
    assert.equal(document.getElementById('importShortageReviewTable').querySelectorAll('tr').length, 1);

    await document.getElementById('confirmImportShortageQuantityButton').onclick();
    await flushAsync();

    const reviewGetIndex = fetchCalls.findIndex((call) => call.url.includes('/shortage-review') && call.method === 'GET');
    const reviewPutIndex = fetchCalls.findIndex((call) => call.url.includes('/shortage-review') && call.method === 'PUT');
    const commitIndex = fetchCalls.findIndex((call) => call.url.includes('/commit'));

    assert.ok(reviewGetIndex >= 0);
    assert.ok(reviewPutIndex > reviewGetIndex);
    assert.ok(commitIndex > reviewPutIndex);
    assert.deepEqual(routeCalls.map((call) => call.action), ['getReview', 'confirmReview']);
    assert.equal(routeCalls[1].mode, 'exclude_shortage_quantity');
  });
});
