'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { simulateLegacyDataQuality, simulateLegacyPreview } = require('./legacy-report-fanout-simulator');
const { optimizedWork } = require('./optimized-report-orchestrator-simulator');

test('snapshot read removes request-time full report fan-out and cuts logical memory', () => {
  const legacy = simulateLegacyDataQuality();
  const optimized = optimizedWork({ snapshotRows: 50 }).dataQuality;
  assert.equal(optimized.serviceCalls, 1);
  assert.equal(optimized.fullExportCalls, 0);
  assert.ok(optimized.peakLogicalMemoryRows < legacy.peakLogicalMemoryRows * 0.01);
});

test('preview materialization is bounded to requested page instead of whole fixture', () => {
  const legacy = simulateLegacyPreview({ sourceRows: 10000, limit: 50 });
  const optimized = optimizedWork({ previewRows: 50 }).preview;
  assert.equal(optimized.rowsMaterialized, 50);
  assert.equal(optimized.fullExportCalls, 0);
  assert.ok(optimized.peakLogicalMemoryRows < legacy.peakLogicalMemoryRows * 0.01);
});
