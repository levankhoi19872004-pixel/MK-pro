'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createImportShortageRuntime,
  buildReviewPayload,
  jsonResponse
} = require('./helpers/importShortageRuntimeHarness');

test('Phase257A-R1 import shortage state loads without the lazy Reports module', () => {
  const { context, window, vm } = createImportShortageRuntime();

  assert.equal(window.__reportsModuleLoaded, false);
  assert.doesNotThrow(() => vm.runInContext('importShortageReviewState.status', context));
  assert.doesNotThrow(() => vm.runInContext('importPreviewSessionId', context));
});

test('Phase257A-R1 shortage review modal uses MK-Pro modal contract', () => {
  const { context, document, vm } = createImportShortageRuntime();

  const modal = vm.runInContext('ensureImportShortageReviewModal()', context);

  assert.equal(modal.id, 'importShortageReviewModal');
  assert.equal(modal.classList.contains('modal-backdrop'), true);
  assert.equal(modal.getAttribute('aria-hidden'), 'true');
  assert.ok(modal.querySelector('.modal-card'));
  assert.ok(modal.querySelector('.import-shortage-review-content'));
  assert.equal(document.body.classList.contains('modal-open'), false);
});

test('Phase257A-R1 render review opens and closes a visible modal backdrop', () => {
  const { context, document, window, vm } = createImportShortageRuntime();

  vm.runInContext(`renderImportShortageReview(${JSON.stringify(buildReviewPayload())})`, context);
  const modal = document.getElementById('importShortageReviewModal');

  assert.equal(modal.hidden, false);
  assert.equal(modal.classList.contains('show'), true);
  assert.equal(modal.getAttribute('aria-hidden'), 'false');
  assert.equal(document.body.classList.contains('modal-open'), true);
  assert.equal(window.getComputedStyle(modal).position, 'fixed');

  vm.runInContext('closeImportShortageReviewModal()', context);

  assert.equal(modal.hidden, true);
  assert.equal(modal.classList.contains('show'), false);
  assert.equal(modal.getAttribute('aria-hidden'), 'true');
  assert.equal(document.body.classList.contains('modal-open'), false);
});

test('Phase257A-R1 auto review opens the popup when selected rows have shortages', async () => {
  const { context, document, fetchCalls, window, vm } = createImportShortageRuntime({
    fetchImpl: async () => jsonResponse(buildReviewPayload())
  });

  const result = await vm.runInContext('openImportShortageReviewModal({auto:true})', context);
  const modal = document.getElementById('importShortageReviewModal');

  assert.equal(result.items.length, 1);
  assert.equal(fetchCalls.length, 1);
  assert.match(fetchCalls[0].url, /\/api\/import\/sessions\/IMP-257A-R1\/shortage-review\?/);
  assert.equal(modal.classList.contains('show'), true);
  assert.equal(modal.getAttribute('aria-hidden'), 'false');
  assert.equal(vm.runInContext('importShortageReviewState.autoOpened', context), true);
  assert.equal(window.__reportsModuleLoaded, false);
});

test('Phase257A-R1 auto review can retry after a GET failure', async () => {
  const { context, document, fetchCalls, vm } = createImportShortageRuntime({
    fetchImpl: async () => jsonResponse({ ok: false, message: 'review failed' }, 500)
  });

  const result = await vm.runInContext('openImportShortageReviewModal({auto:true})', context);

  assert.equal(result, null);
  assert.equal(fetchCalls.length, 1);
  const modal = document.getElementById('importShortageReviewModal');
  assert.equal(Boolean(modal && modal.classList.contains('show')), false);
  assert.equal(vm.runInContext('importShortageReviewState.autoOpened', context), false);
  assert.equal(vm.runInContext('importShortageReviewState.loading', context), false);
});

test('Phase257A-R1 auto review stays closed when the API returns no shortage items', async () => {
  const { context, document, vm } = createImportShortageRuntime({
    fetchImpl: async () => jsonResponse(buildReviewPayload({
      summary: { selectedOrderCount: 1, shortageOrderCount: 0, itemCount: 0 },
      items: []
    }))
  });

  const result = await vm.runInContext('openImportShortageReviewModal({auto:true})', context);

  const modal = document.getElementById('importShortageReviewModal');
  assert.deepEqual(result.items, []);
  assert.equal(Boolean(modal && modal.classList.contains('show')), false);
  assert.equal(vm.runInContext('importShortageReviewState.status', context), 'not_required');
});

test('Phase257A-R1 confirmation buttons send the approved shortage modes', async () => {
  const putBodies = [];
  const { context, document, window, vm } = createImportShortageRuntime({
    fetchImpl: async (_url, init = {}) => {
      if (init.method === 'PUT') {
        putBodies.push(JSON.parse(init.body));
        return jsonResponse({ ok: true, fingerprint: 'fp-confirmed', selectedScopeFingerprint: 'scope-r1' });
      }
      return jsonResponse(buildReviewPayload());
    }
  });

  await vm.runInContext('openImportShortageReviewModal({manual:true})', context);
  await document.getElementById('confirmImportShortageQuantityButton').onclick();
  assert.equal(putBodies.at(-1).mode, 'exclude_shortage_quantity');
  assert.equal(window.__commitCalled, true);

  window.__commitCalled = false;
  await vm.runInContext('openImportShortageReviewModal({manual:true})', context);
  await document.getElementById('confirmImportShortageOrderButton').onclick();
  assert.equal(putBodies.at(-1).mode, 'exclude_shortage_orders');
  assert.equal(window.__commitCalled, true);
});
