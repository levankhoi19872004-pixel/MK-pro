'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const importSessionService = require('../src/services/importSessionService');
const { runImportPreviewPipeline } = require('../src/jobs/importPreviewRunner');

function withSessionServiceStubs(stubs, run) {
  const originals = {};
  for (const [key, value] of Object.entries(stubs)) {
    originals[key] = importSessionService[key];
    importSessionService[key] = value;
  }

  return Promise.resolve()
    .then(run)
    .finally(() => {
      for (const [key, value] of Object.entries(originals)) {
        importSessionService[key] = value;
      }
    });
}

test('async worker runner defers final failure ownership to queue parent', async () => {
  let markFailedCalls = 0;

  await withSessionServiceStubs({
    async markParsing() { return { importMode: 'create' }; },
    async updateProgress() { return null; },
    async markFailed() { markFailedCalls += 1; }
  }, async () => {
    await assert.rejects(
      runImportPreviewPipeline({
        sessionId: 'IMP-DEFER-FAIL',
        type: 'salesOrders',
        files: [],
        deferFinalState: true,
        async buildPreviewFromRows() {
          return { error: 'Dữ liệu kiểm tra không hợp lệ', status: 400 };
        }
      }),
      (err) => err.message === 'Dữ liệu kiểm tra không hợp lệ' && err.importStage === 'validating'
    );
  });

  assert.equal(markFailedCalls, 0);
});

test('async worker runner stores rows but does not mark preview ready', async () => {
  let savedArgs = null;

  await withSessionServiceStubs({
    async markParsing() { return { importMode: 'create' }; },
    async updateProgress() { return null; },
    async savePreviewResult(id, args) {
      savedArgs = { id, args };
      return { id };
    },
    async markFailed() {
      throw new Error('markFailed must not be called');
    }
  }, async () => {
    const result = await runImportPreviewPipeline({
      sessionId: 'IMP-DEFER-SUCCESS',
      type: 'salesOrders',
      files: [],
      deferFinalState: true,
      async buildPreviewFromRows() {
        return { rows: [], total: 0, valid: 0, invalid: 0 };
      }
    });

    assert.equal(result.totalFiles, 0);
  });

  assert.equal(savedArgs.id, 'IMP-DEFER-SUCCESS');
  assert.equal(savedArgs.args.deferFinalState, true);
});
