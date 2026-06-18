'use strict';

const strictModel = require('./_strictModel');

module.exports = strictModel('ReportingSnapshot', 'reporting_snapshots', {
  id: { type: String, required: true },
  tenantId: { type: String, required: true },
  projectionType: { type: String, required: true },
  date: { type: String, required: true },
  dimensionKey: { type: String, required: true },
  dimensions: { type: Object, default: {} },
  metrics: { type: Object, default: {} },
  sourceWatermark: { type: String, default: '' },
  generatedAt: { type: String, required: true },
  version: { type: Number, default: 1 }
});
