'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const read = (f) => require('./helpers/sourceBundle.util').readSource(path.join(__dirname, '..', f));

test('return service no longer depends on delivery engine', () => {
  const source = read('src/services/returnOrderLegacy.service.js');
  assert.doesNotMatch(source, /require\(['"]\.\.\/engines\/delivery\.engine['"]\)/);
  assert.match(source, /returnOrderRepository\.findAll/);
});

test('excel import service and worker share a cycle-free runner', () => {
  const service = read('src/services/excelImportService.js');
  const job = read('src/jobs/importExcelJob.js');
  assert.doesNotMatch(service, /require\(['"]\.\.\/jobs\/importExcelJob['"]\)/);
  assert.match(service, /runImportPreviewPipeline/);
  assert.match(job, /runImportPreviewPipeline/);
});
