'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const read = (file) => require('./helpers/sourceBundle.util').readSource(path.join(__dirname, '..', file));

test('persistent import preview queue records failure and cleans GridFS inputs safely', () => {
  const preview = read('src/services/import/preview/importPreview.impl.js');
  const submission = read('src/services/background-jobs/JobSubmissionService.js');
  const handlers = read('src/services/background-jobs/BackgroundJobHandlers.js');
  const service = read('src/services/background-jobs/BackgroundJobService.js');
  const store = read('src/services/background-jobs/GridFsArtifactStore.js');
  const worker = read('src/jobs/backgroundJobWorker.js');

  assert.match(preview, /submitImportPreview/);
  assert.match(preview, /markFailed\(session\.id/);
  assert.match(preview, /status: Number\(err\.statusCode \|\| err\.status \|\| 503\)/);
  assert.match(submission, /for \(const artifact of artifacts\) await ArtifactStore\.remove/);
  assert.match(handlers, /for \(const item of inputArtifacts\) await ArtifactStore\.remove/);
  assert.match(service, /dead_letter/);
  assert.match(store, /metadata\.expiresAt/);
  assert.match(store, /async function cleanupExpired/);
  assert.match(worker, /ArtifactStore\.cleanupExpired/);
});
