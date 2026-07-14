'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createImportShortageRuntime,
  buildReviewPayload,
  jsonResponse
} = require('./helpers/importShortageRuntimeHarness');

const rootDir = path.join(__dirname, '..');

function s3ShortageRow(overrides = {}) {
  return {
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
    }],
    ...overrides
  };
}

function previewPayload() {
  return {
    ok: true,
    sessionId: 'IMP-S3-R2',
    rows: [s3ShortageRow()]
  };
}

function reviewPayload(overrides = {}) {
  return buildReviewPayload({
    sessionId: 'IMP-S3-R2',
    fingerprint: 'fp-s3-r2',
    selectedScopeFingerprint: 'scope-s3-r2',
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
    }],
    ...overrides
  });
}

async function flushAsync() {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

async function runPreviewButtonJourney(rawImportType) {
  const { context, document, fetchCalls, vm } = createImportShortageRuntime({
    rawImportType,
    previewRows: [],
    sessionId: '',
    fetchImpl: async (url) => {
      const target = String(url);
      if (target === '/api/import/preview') return jsonResponse(previewPayload());
      if (target.includes('/shortage-review?')) return jsonResponse(reviewPayload());
      if (target.includes('/commit')) return jsonResponse({ ok: true, message: 'unexpected commit' });
      return jsonResponse({ ok: true });
    }
  });

  vm.runInContext(`
    importDataType.value=${JSON.stringify(rawImportType)};
    importExcelFile.files=[{name:'s3-shortage.xlsx'}];
    importPreviewRows=[];
    importPreviewSessionId='';
    importSelectedRowKeySet=new Set();
  `, context);

  const previewButtonClicked = await document.getElementById('commitImportButton').click();
  await flushAsync();

  return { context, document, fetchCalls, previewButtonClicked, vm };
}

test('Phase257A-R2 normalizes S3 raw import type to the sales order business domain', () => {
  const { context, vm } = createImportShortageRuntime({ rawImportType: 'salesOrdersS3' });

  assert.equal(vm.runInContext("normalizeImportBusinessType('salesOrders')", context), 'salesOrders');
  assert.equal(vm.runInContext("normalizeImportBusinessType('salesOrdersS3')", context), 'salesOrders');
  assert.equal(vm.runInContext("isSalesOrderImportType('salesOrders')", context), true);
  assert.equal(vm.runInContext("isSalesOrderImportType('salesOrdersS3')", context), true);
  assert.equal(vm.runInContext("isSalesOrderImportType('products')", context), false);
});

test('Phase257A-R2 S3 shortage rows render the banner and auto-open review', async () => {
  const { context, document, fetchCalls, vm } = createImportShortageRuntime({
    rawImportType: 'salesOrdersS3',
    sessionId: 'IMP-S3-R2',
    previewRows: [s3ShortageRow()],
    fetchImpl: async () => jsonResponse(reviewPayload())
  });

  vm.runInContext('renderImportShortageActions(importPreviewRows)', context);
  await flushAsync();

  const banner = document.getElementById('importShortageActions');
  const modal = document.getElementById('importShortageReviewModal');
  assert.notEqual(banner.style.display, 'none');
  assert.ok(document.getElementById('reopenImportShortageReviewButton'));
  assert.equal(fetchCalls.some((call) => String(call.url).includes('/shortage-review?')), true);
  assert.equal(modal.classList.contains('show'), true);
  assert.equal(modal.getAttribute('aria-hidden'), 'false');
});

test('Phase257A-R2 preview button journey keeps S3 raw request type and opens review', async () => {
  const { context, document, fetchCalls, previewButtonClicked, vm } = await runPreviewButtonJourney('salesOrdersS3');
  const previewCall = fetchCalls.find((call) => call.url === '/api/import/preview');
  const reviewCall = fetchCalls.find((call) => String(call.url).includes('/shortage-review?'));
  const commitCall = fetchCalls.find((call) => String(call.url).includes('/commit'));
  const modal = document.getElementById('importShortageReviewModal');
  const shortageTable = document.getElementById('importShortageReviewTable');

  assert.equal(previewButtonClicked, true);
  assert.ok(previewCall);
  assert.equal(previewCall.init.body.get('type'), 'salesOrdersS3');
  assert.notEqual(document.getElementById('importShortageActions').style.display, 'none');
  assert.ok(reviewCall);
  assert.equal(modal.classList.contains('show'), true);
  assert.equal(modal.getAttribute('aria-hidden'), 'false');
  assert.equal(shortageTable.querySelectorAll('tr').length, 1);
  assert.equal(Boolean(commitCall), false);
  assert.equal(vm.runInContext('normalizeImportBusinessType(importDataType.value)', context), 'salesOrders');
});

test('Phase257A-R2 standard salesOrders preview journey still opens review', async () => {
  const { document, fetchCalls } = await runPreviewButtonJourney('salesOrders');

  const previewCall = fetchCalls.find((call) => call.url === '/api/import/preview');
  assert.equal(previewCall.init.body.get('type'), 'salesOrders');
  assert.equal(fetchCalls.some((call) => String(call.url).includes('/shortage-review?')), true);
  assert.equal(document.getElementById('importShortageReviewModal').classList.contains('show'), true);
});

test('Phase257A-R2 non-sales imports do not open shortage review', async () => {
  for (const rawImportType of ['products', 'customers', 'openingStock']) {
    const { context, document, fetchCalls, vm } = createImportShortageRuntime({
      rawImportType,
      previewRows: [s3ShortageRow()],
      fetchImpl: async () => jsonResponse(reviewPayload())
    });

    vm.runInContext('renderImportShortageActions(importPreviewRows)', context);
    await flushAsync();

    assert.equal(document.getElementById('importShortageActions').style.display, 'none');
    assert.equal(fetchCalls.some((call) => String(call.url).includes('/shortage-review?')), false);
    assert.equal(Boolean(document.getElementById('importShortageReviewModal')), false);
  }
});

test('Phase257A-R2 S3 commit gate opens review before commit', async () => {
  const { document, fetchCalls } = createImportShortageRuntime({
    rawImportType: 'salesOrdersS3',
    sessionId: 'IMP-S3-R2',
    previewRows: [s3ShortageRow()],
    stubCommitCore: false,
    fetchImpl: async (url) => {
      const target = String(url);
      if (target.includes('/shortage-review?')) return jsonResponse(reviewPayload());
      if (target.includes('/commit')) return jsonResponse({ ok: true, message: 'should not commit' });
      return jsonResponse({ ok: true });
    }
  });

  await document.getElementById('commitImportButton').click();
  await flushAsync();

  assert.equal(fetchCalls.filter((call) => String(call.url).includes('/commit')).length, 0);
  assert.equal(fetchCalls.some((call) => String(call.url).includes('/shortage-review?')), true);
  assert.equal(document.getElementById('importShortageReviewModal').classList.contains('show'), true);
});

test('Phase257A-R2 backend review errors reopen the S3 review modal', async () => {
  for (const code of [
    'IMPORT_SHORTAGE_REVIEW_REQUIRED',
    'IMPORT_SHORTAGE_REVIEW_STALE',
    'IMPORT_SHORTAGE_REVIEW_INCOMPLETE'
  ]) {
    const { context, document, fetchCalls, vm } = createImportShortageRuntime({
      rawImportType: 'salesOrdersS3',
      sessionId: 'IMP-S3-R2',
      previewRows: [s3ShortageRow()],
      stubCommitCore: false,
      fetchImpl: async (url) => {
        const target = String(url);
        if (target.includes('/commit')) return jsonResponse({ ok: false, code, message: code }, 409);
        if (target.includes('/shortage-review?')) return jsonResponse(reviewPayload());
        return jsonResponse({ ok: true });
      }
    });

    await vm.runInContext('commitImportExcelCore({confirmedShortageReview:true})', context);
    await flushAsync();

    assert.equal(fetchCalls.filter((call) => String(call.url).includes('/commit')).length, 1);
    assert.equal(fetchCalls.some((call) => String(call.url).includes('/shortage-review?')), true);
    assert.equal(document.getElementById('importShortageReviewModal').classList.contains('show'), true);
  }
});

test('Phase257A-R2 S3 confirmation modes PUT review then commit', async () => {
  for (const [buttonId, expectedMode] of [
    ['confirmImportShortageQuantityButton', 'exclude_shortage_quantity'],
    ['confirmImportShortageOrderButton', 'exclude_shortage_orders']
  ]) {
    const putBodies = [];
    const { context, document, fetchCalls, vm } = createImportShortageRuntime({
      rawImportType: 'salesOrdersS3',
      sessionId: 'IMP-S3-R2',
      previewRows: [s3ShortageRow()],
      stubCommitCore: false,
      fetchImpl: async (url, init = {}) => {
        const target = String(url);
        if (target.includes('/shortage-review?')) return jsonResponse(reviewPayload());
        if (target.includes('/shortage-review') && init.method === 'PUT') {
          putBodies.push(JSON.parse(init.body));
          return jsonResponse({
            ok: true,
            fingerprint: 'fp-s3-r2',
            selectedScopeFingerprint: 'scope-s3-r2'
          });
        }
        if (target.includes('/commit')) return jsonResponse({ ok: true, message: 'Import thanh cong' });
        return jsonResponse({ ok: true });
      }
    });

    await vm.runInContext('openImportShortageReviewModal({manual:true})', context);
    await document.getElementById(buttonId).onclick();
    await flushAsync();

    assert.equal(putBodies.at(-1).mode, expectedMode);
    assert.equal(fetchCalls.filter((call) => String(call.url).includes('/commit')).length, 1);
  }
});

test('Phase257A-R2 S3 post-import refresh reloads sales orders, stock, and shortage reports', async () => {
  const { context, fetchCalls, window, vm } = createImportShortageRuntime({
    rawImportType: 'salesOrdersS3',
    sessionId: 'IMP-S3-R2',
    previewRows: [s3ShortageRow()],
    stubCommitCore: false,
    fetchImpl: async (url) => {
      if (String(url).includes('/commit')) return jsonResponse({ ok: true, message: 'Import thanh cong' });
      return jsonResponse({ ok: true });
    }
  });

  vm.runInContext(`
    importShortageReviewState={
      ...importShortageReviewState,
      status:'confirmed',
      mode:'exclude_shortage_quantity',
      fingerprint:'fp-s3-r2',
      selectedScopeFingerprint:'scope-s3-r2'
    };
  `, context);
  await vm.runInContext('commitImportExcelCore({confirmedShortageReview:true})', context);
  await flushAsync();

  assert.equal(window.__loadCalls.includes('loadSalesOrders'), true);
  assert.equal(window.__loadCalls.includes('loadStock'), true);
  assert.equal(fetchCalls.some((call) => String(call.url).includes('/api/import/shortage-reports')), true);
});

test('Phase257A-R2 cache marker replaces the R1 import asset marker', () => {
  const files = [
    'public/index.shell.html',
    'public/fragments/index/07-index-body.html'
  ];
  const combined = files.map((file) => fs.readFileSync(path.join(rootDir, file), 'utf8')).join('\n');

  assert.equal(combined.includes('phase257a-import-shortage-review-v1'), false);
  assert.equal(combined.includes('phase257a-r2-s3-shortage-review-routing-v1'), true);
});
