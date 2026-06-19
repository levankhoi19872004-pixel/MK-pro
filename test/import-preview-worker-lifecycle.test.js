'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const Module = require('node:module');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const QUEUE_PATH = path.join(ROOT, 'src/jobs/importPreviewQueue.js');
const SESSION_SERVICE_PATH = path.join(ROOT, 'src/services/importSessionService.js');
const TEMP_STORE_PATH = path.join(ROOT, 'src/utils/importTempFileStore.js');

function delay(ms = 60) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeFakeChild() {
  const child = new EventEmitter();
  child.pid = 43210;
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.channel = { unref() {} };
  child.unref = () => {};
  child.kill = () => true;
  return child;
}

function loadQueueHarness() {
  const child = makeFakeChild();
  const markFailedCalls = [];
  const cleanupCalls = [];
  const originalLoad = Module._load;

  delete require.cache[QUEUE_PATH];

  Module._load = function patchedLoad(request, parent, isMain) {
    let resolved = '';
    try {
      resolved = Module._resolveFilename(request, parent, isMain);
    } catch (_) {
      resolved = request;
    }

    if (request === 'child_process') return { fork: () => child };
    if (resolved === SESSION_SERVICE_PATH) {
      return {
        markFailed: async (...args) => {
          markFailedCalls.push(args);
          return {};
        }
      };
    }
    if (resolved === TEMP_STORE_PATH) {
      return {
        cleanupImportFiles: async (...args) => {
          cleanupCalls.push(args);
        }
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    const queue = require(QUEUE_PATH);
    return { queue, child, markFailedCalls, cleanupCalls };
  } finally {
    Module._load = originalLoad;
  }
}

test('worker structured failure is persisted once despite message/exit/close race', async () => {
  const harness = loadQueueHarness();
  harness.queue.enqueueImportPreviewJob({
    sessionId: 'IMP-FAIL-1',
    type: 'salesOrders',
    files: [{ fileName: 's3 19.06.xlsx', path: '/tmp/s3.xlsx', size: 10 }]
  });

  harness.child.emit('message', {
    type: 'failed',
    failure: {
      code: 'IMPORT_WORKER_SYSTEM_ERROR',
      kind: 'system',
      message: 'getProductCodeFromRow is not defined',
      stack: 'ReferenceError: getProductCodeFromRow is not defined',
      source: 'worker',
      exitCode: 1
    }
  });
  harness.child.emit('exit', 1, null);
  harness.child.emit('close', 1, null);

  await delay();

  assert.equal(harness.markFailedCalls.length, 1);
  assert.equal(harness.markFailedCalls[0][1].message, 'getProductCodeFromRow is not defined');
  assert.deepEqual(harness.markFailedCalls[0][2], { preserveExistingDetails: true });
  assert.equal(harness.cleanupCalls.length, 1);
  assert.equal(harness.queue.getImportPreviewQueueStats().activeJobs, 0);
});

test('worker is successful only after completed message and zero exit code', async () => {
  const harness = loadQueueHarness();
  harness.queue.enqueueImportPreviewJob({ sessionId: 'IMP-OK-1', type: 'salesOrders', files: [] });

  harness.child.emit('message', { type: 'completed', sessionId: 'IMP-OK-1' });
  harness.child.emit('exit', 0, null);
  harness.child.emit('close', 0, null);

  await delay();

  assert.equal(harness.markFailedCalls.length, 0);
  assert.equal(harness.cleanupCalls.length, 0);
  assert.equal(harness.queue.getImportPreviewQueueStats().activeJobs, 0);
});

test('zero exit without completed message is not treated as success', async () => {
  const harness = loadQueueHarness();
  harness.queue.enqueueImportPreviewJob({ sessionId: 'IMP-NO-MESSAGE', type: 'salesOrders', files: [] });

  harness.child.emit('disconnect');
  harness.child.emit('exit', 0, null);
  harness.child.emit('close', 0, null);

  await delay();

  assert.equal(harness.markFailedCalls.length, 1);
  assert.equal(harness.markFailedCalls[0][1].code, 'IMPORT_WORKER_ABNORMAL_EXIT');
  assert.equal(harness.queue.getImportPreviewQueueStats().activeJobs, 0);
});

test('product preload resolves product-code helper at runtime', async () => {
  const Product = require('../src/models/Product');
  const originalFind = Product.find;
  Product.find = () => ({ lean: async () => [] });

  try {
    const { preloadProductsByCode } = require('../src/services/import/core/importPersistence.util');
    const result = await preloadProductsByCode([{ 'Mã hàng': '12345678' }]);
    assert.equal(result instanceof Map, true);
  } finally {
    Product.find = originalFind;
  }
});


test('stock preload resolves product-code helper at runtime', async () => {
  const inventoryStockService = require('../src/services/inventoryStock.service');
  const originalGetAvailableStocks = inventoryStockService.getAvailableStocks;
  inventoryStockService.getAvailableStocks = async (codes) =>
    Object.fromEntries(codes.map((code) => [inventoryStockService.normalizeProductCode(code), 25]));

  try {
    const { getStockMapByProductCode } = require('../src/services/import/core/importRow.util');
    const result = await getStockMapByProductCode([{ 'Mã hàng': '12345678' }]);
    assert.equal(result.get('12345678'), 25);
  } finally {
    inventoryStockService.getAvailableStocks = originalGetAvailableStocks;
  }
});


test('sales-order preview imports both grouping helpers used at runtime', () => {
  const source = fs.readFileSync(path.join(ROOT, 'src/services/import/preview/importPreview.impl.js'), 'utf8');
  assert.match(source, /makeImportOrderGroupKey/);
  assert.match(source, /makeSalesOrderGroupKey/);
});

test('worker registers fatal handlers and sends structured terminal messages', () => {
  const source = fs.readFileSync(path.join(ROOT, 'src/jobs/importPreview.worker.js'), 'utf8');
  assert.match(source, /process\.on\('uncaughtException'/);
  assert.match(source, /process\.on\('unhandledRejection'/);
  assert.match(source, /type:\s*'failed'/);
  assert.match(source, /type:\s*'completed'/);
});

test('import failure normalization redacts secrets and application paths', () => {
  const { normalizeImportFailure } = require('../src/services/importSessionService');
  const cwd = process.cwd();
  const failure = normalizeImportFailure({
    code: 'BAD CODE/1',
    kind: 'system',
    message: `password=topsecret at ${cwd}/src/jobs/importPreview.worker.js`,
    stack: `Error: token=abc123\n    at ${cwd}/src/jobs/importPreview.worker.js:10:2`,
    source: 'worker',
    exitCode: 1
  });

  assert.equal(failure.code, 'BAD_CODE_1');
  assert.equal(failure.kind, 'system');
  assert.doesNotMatch(failure.message, /topsecret/);
  assert.doesNotMatch(failure.stack, /abc123/);
  assert.doesNotMatch(failure.message, new RegExp(cwd.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(failure.message, /<app>/);
  assert.equal(failure.exitCode, 1);
});

test('markFailed persists structured failure without adding a schema field', async () => {
  const servicePath = path.join(ROOT, 'src/services/importSessionService.js');
  const modelPath = path.join(ROOT, 'src/models/ImportSession.js');
  const rowModelPath = path.join(ROOT, 'src/models/ImportSessionRow.js');
  const tempStorePath = path.join(ROOT, 'src/utils/importTempFileStore.js');
  const originalLoad = Module._load;
  let captured = null;

  delete require.cache[servicePath];
  Module._load = function patchedLoad(request, parent, isMain) {
    let resolved = '';
    try {
      resolved = Module._resolveFilename(request, parent, isMain);
    } catch (_) {
      resolved = request;
    }

    if (resolved === modelPath) {
      return {
        findOneAndUpdate: async (filter, update, options) => {
          captured = { filter, update, options };
          return { id: 'IMP-STORE-1', ...update.$set };
        }
      };
    }
    if (resolved === rowModelPath) return {};
    if (resolved === tempStorePath) {
      return {
        cleanupImportFiles: async () => {},
        cleanupImportSession: async () => {}
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    const service = require(servicePath);
    await service.markFailed('IMP-STORE-1', {
      code: 'IMPORT_WORKER_SYSTEM_ERROR',
      kind: 'system',
      message: 'password=private worker crashed',
      stack: `Error: token=private\n at ${ROOT}/src/jobs/importPreview.worker.js:1:1`,
      source: 'worker',
      exitCode: 1
    });
  } finally {
    Module._load = originalLoad;
    delete require.cache[servicePath];
  }

  assert.ok(captured);
  assert.equal(captured.update.$set.status, 'failed');
  assert.equal(captured.update.$set['result.importFailure'].code, 'IMPORT_WORKER_SYSTEM_ERROR');
  assert.equal(captured.update.$set['result.importFailure'].kind, 'system');
  assert.equal(captured.update.$set['result.importFailure'].exitCode, 1);
  assert.doesNotMatch(captured.update.$set.errorMessage, /private/);
  assert.doesNotMatch(captured.update.$set['result.importFailure'].stack, /private/);
  assert.match(captured.update.$set['result.importFailure'].stack, /<app>/);
});

test('failed import session polling returns non-200 status and detailed message', async () => {
  const controllerPath = path.join(ROOT, 'src/controllers/importExportController.js');
  const excelServicePath = path.join(ROOT, 'src/services/excelImportService.js');
  const exportServicePath = path.join(ROOT, 'src/services/importExportService.js');
  const originalLoad = Module._load;
  let currentResult = {
    status: 'failed',
    errorKind: 'system',
    errorCode: 'IMPORT_WORKER_SYSTEM_ERROR',
    errorMessage: 'Worker lỗi chi tiết'
  };

  delete require.cache[controllerPath];
  Module._load = function patchedLoad(request, parent, isMain) {
    let resolved = '';
    try {
      resolved = Module._resolveFilename(request, parent, isMain);
    } catch (_) {
      resolved = request;
    }
    if (resolved === excelServicePath) {
      return { getSessionStatus: async () => currentResult };
    }
    if (resolved === exportServicePath) return {};
    return originalLoad.call(this, request, parent, isMain);
  };

  let controller;
  try {
    controller = require(controllerPath);
  } finally {
    Module._load = originalLoad;
  }

  const invoke = async () => {
    const response = { statusCode: 200, body: null };
    const res = {
      status(code) { response.statusCode = code; return res; },
      json(body) { response.body = body; return res; }
    };
    await controller.sessionStatus({ params: { sessionId: 'IMP-1' }, query: {} }, res);
    return response;
  };

  try {
    const systemResponse = await invoke();
    assert.equal(systemResponse.statusCode, 500);
    assert.equal(systemResponse.body.ok, false);
    assert.equal(systemResponse.body.message, 'Worker lỗi chi tiết');

    currentResult = {
      status: 'failed',
      errorKind: 'data',
      errorCode: 'IMPORT_EXCEL_DATA_ERROR',
      errorMessage: 'Header Excel không hợp lệ'
    };
    const dataResponse = await invoke();
    assert.equal(dataResponse.statusCode, 422);
    assert.equal(dataResponse.body.message, 'Header Excel không hợp lệ');
  } finally {
    delete require.cache[controllerPath];
  }
});

test('frontend commit polling stops on failed session even when HTTP status is non-2xx', () => {
  const source = fs.readFileSync(
    path.join(ROOT, 'public/js/app/admin/08d-import-excel.source/part-02.jsfrag'),
    'utf8'
  );
  const pollingStart = source.indexOf('function startImportCommitProgressPolling');
  const pollingEnd = source.indexOf('async function refreshAfterImport', pollingStart);
  const pollingSource = source.slice(pollingStart, pollingEnd);
  const statusIndex = pollingSource.indexOf("const status=String(json.status||'').toLowerCase();");
  const failedIndex = pollingSource.indexOf("if(status==='failed')");
  const okIndex = pollingSource.indexOf('if(res.ok&&json.ok)');

  assert.ok(pollingStart >= 0 && pollingEnd > pollingStart);
  assert.ok(statusIndex >= 0);
  assert.ok(failedIndex > statusIndex);
  assert.ok(okIndex > failedIndex);
  assert.match(pollingSource, /json\.errorMessage\|\|json\.message\|\|'Import thất bại'/);
});
