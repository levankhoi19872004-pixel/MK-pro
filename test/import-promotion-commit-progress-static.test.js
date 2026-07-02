'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('promotion CK commit writes in progress-aware batches instead of a silent bulkWrite loop', () => {
  const source = read('src/services/import/operations/adminImport.impl.js');
  const branch = source.slice(source.indexOf('async function importPromotionProductRules'), source.indexOf('async function importPromotionGroupItems'));

  assert.match(branch, /async function importPromotionProductRules\(rows = \[\], options = \{\}\)/);
  assert.match(source, /PROMOTION_IMPORT_BATCH_SIZE/);
  assert.match(source, /buildPromotionBulkWriteError/);
  assert.match(branch, /const batches = promotionBulkChunks\(ops, batchSize\)/);
  assert.match(branch, /for \(const \[batchIndex, chunk\] of batches\.entries\(\)\)/);
  assert.match(branch, /PromotionProductRule\.bulkWrite\(chunk, \{ ordered: false \}\)/);
  assert.match(branch, /step: `committing:\$\{batchIndex \+ 1\}\/\$\{batches\.length\}`/);
  assert.match(branch, /await notifyPromotionProductRuleProgress\(options, progress\)/);
  assert.match(branch, /completedRows: writtenOps/);
  assert.doesNotMatch(branch, /for \(const chunk of promotionBulkChunks\(ops\)\) \{\s*if \(chunk\.length\) await PromotionProductRule\.bulkWrite\(chunk, \{ ordered: false \}\);\s*\}/);
});

test('import commit passes an onProgress callback into the operation handler', () => {
  const source = read('src/services/import/importCommit.impl.js');

  assert.match(source, /onProgress: async \(progress = \{\}\) => \{/);
  assert.match(source, /await importSessionService\.updateProgress\(currentSessionId, progress\)/);
  assert.match(source, /\[IMPORT_COMMIT_PROGRESS\]/);
  assert.match(source, /selectedRowKeys = \[\]/);
  assert.match(source, /selectRows\(session, selectedOrderCodes, selectedRowNumbers, selectedProgramCodes, selectedRowKeys\)/);
});

test('async import commit preserves selected row and promotion program scope', () => {
  const adapter = read('src/services/background-jobs/AsyncJobHttpAdapter.js');
  const submission = read('src/services/background-jobs/JobSubmissionService.js');
  const direct = read('src/services/import/ImportWebDirectCommitService.js');

  for (const source of [adapter, submission, direct]) {
    assert.match(source, /selectedRowNumbers/);
    assert.match(source, /selectedProgramCodes/);
    assert.match(source, /selectedRowKeys/);
    assert.match(source, /importMode/);
  }
  assert.match(submission, /positiveNumberArray\(payload\.selectedRowNumbers\)/);
  assert.match(submission, /stringArray\(payload\.selectedProgramCodes\)/);
  assert.match(submission, /stringArray\(payload\.selectedRowKeys\)/);
});

test('import controllers can accept async commit requests safely', () => {
  const exportController = read('src/controllers/importExportController.js');
  const runtimeController = read('src/controllers/importRuntimeController.js');

  for (const source of [exportController, runtimeController]) {
    assert.match(source, /shouldRunImportCommitAsync/);
    assert.match(source, /AsyncJobHttpAdapter\.prefersAsync\(req\)/);
    assert.match(source, /IMPORT_COMMIT_PROMOTION_ASYNC_THRESHOLD/);
    assert.match(source, /AsyncJobHttpAdapter\.submitImportCommit\(req\)/);
    assert.match(source, /res\.status\(202\)\.json\(AsyncJobHttpAdapter\.acceptedPayload/);
  }
});

test('stale importing sessions are failed explicitly instead of being left at 18 percent forever', () => {
  const service = read('src/services/importSessionService.js');
  const model = read('src/models/ImportSession.js');

  assert.match(model, /completedRows/);
  assert.match(model, /totalRows/);
  assert.match(model, /message/);
  assert.match(service, /IMPORT_STALE_IMPORTING_SESSION_MS/);
  assert.match(service, /status: 'importing'/);
  assert.match(service, /type: 'import_commit'/);
  assert.match(service, /import-commit:\$\{id\}/);
  assert.match(service, /Import bị gián đoạn ở bước ghi dữ liệu\. Vui lòng kiểm tra số dòng đã ghi và import lại\./);
});

test('frontend commit progress label supports generic batched data writes', () => {
  const part2 = read('public/js/app/admin/08d-import-excel.source/part-02.jsfrag');

  assert.match(part2, /const chunkMatch=step\.match\(\/\^committing:\(\\d\+\)\\\/\(\\d\+\)\$\//);
  assert.match(part2, /Đang ghi dữ liệu theo lô/);
});

test('promotion admin import uses cleanText from importValue util to avoid runtime undefined helper', () => {
  const source = read('src/services/import/operations/adminImport.impl.js');

  assert.match(source, /const \{ cleanText \} = require\('\.\.\/core\/importValue\.util'\)/);
  const rowUtilRequireIndex = source.indexOf("require('../core/importRow.util')");
  assert.notEqual(rowUtilRequireIndex, -1, 'admin import must import row helpers from importRow.util');
  const rowUtilBlockStart = source.lastIndexOf('const {', rowUtilRequireIndex);
  const rowUtilDestructuring = source.slice(rowUtilBlockStart, rowUtilRequireIndex);
  assert.doesNotMatch(rowUtilDestructuring, /\bcleanText\b/);
});
