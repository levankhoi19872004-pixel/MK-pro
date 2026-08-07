'use strict';

const strictModel = require('./_strictModel');

module.exports = strictModel('ReportDataQualitySnapshot', 'report_data_quality_snapshots', {
  id: { type: String, required: true },
  tenantId: { type: String, required: true, default: 'default' },
  scopeKey: { type: String, required: true, default: 'global' },
  dateFrom: { type: String, required: true },
  dateTo: { type: String, required: true },
  snapshotVersion: { type: String, required: true },
  sourceVersion: { type: String, required: true },
  sourceTimestamp: { type: String, required: true },
  generatedAt: { type: String, required: true },
  sourceRange: { type: Object, default: {} },
  rows: { type: Array, default: [] },
  summary: { type: Object, default: {} },
  sourceCounts: { type: Object, default: {} },
  warnings: { type: Array, default: [] },
  status: { type: String, default: 'ready' }
});
