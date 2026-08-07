'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {
  simulateLegacyDataQuality,
  simulateLegacyPreview
} = require('./legacy-report-fanout-simulator');

test('RED proof: data-quality fans out four full/export reports and retains all datasets', () => {
  const result = simulateLegacyDataQuality();
  assert.equal(result.serviceCalls, 4);
  assert.equal(result.fullExportCalls, 4);
  assert.equal(result.rowsMaterialized, 28000);
  assert.equal(result.peakLogicalMemoryRows, 28000);
  assert.equal(result.concurrency, 4);
});

test('RED proof: preview materializes broad result before pagination', () => {
  const result = simulateLegacyPreview({ sourceRows: 10000, page: 1, limit: 50 });
  assert.equal(result.rowsMaterialized, 10000);
  assert.equal(result.rowsReturned, 50);
  assert.equal(result.paginationStage, 'after-assemble');
});

test('GREEN contract not implemented yet: report center must use snapshot and preview execution policy', () => {
  const source = fs.readFileSync('src/services/reports/ReportCenterService.js', 'utf8');
  assert.match(source, /ReportExecutionPolicy/);
  assert.match(source, /DataQualitySnapshotService/);
  assert.doesNotMatch(source, /case 'data-quality'[\s\S]{0,600}Promise\.all\(\[/);
});
