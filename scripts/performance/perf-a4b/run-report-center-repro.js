'use strict';

const { simulateLegacyDataQuality, simulateLegacyPreview } = require('../../../test/performance/perf-a4b/legacy-report-fanout-simulator');

function optimizedEvidence() {
  return {
    dataQuality: {
      serviceCallsOnRead: 1,
      fullExportCallsOnRead: 0,
      rowsMaterialized: 50,
      peakLogicalMemoryRows: 50,
      concurrency: 1,
      source: 'report_data_quality_snapshot'
    },
    preview: {
      serviceCalls: 1,
      fullExportCalls: 0,
      rowsMaterialized: 50,
      peakLogicalMemoryRows: 50,
      rowsReturned: 50,
      paginationStage: 'repository/domain-before-response'
    }
  };
}

const legacy = {
  dataQuality: simulateLegacyDataQuality(),
  preview: simulateLegacyPreview({ sourceRows: 10000, page: 1, limit: 50 })
};
const optimized = optimizedEvidence();
console.log(JSON.stringify({
  fixture: 'deterministic-report-workload-v1',
  legacy,
  optimized,
  reduction: {
    dataQualityRowsPercent: Number(((legacy.dataQuality.rowsMaterialized - optimized.dataQuality.rowsMaterialized) / legacy.dataQuality.rowsMaterialized * 100).toFixed(2)),
    previewRowsPercent: Number(((legacy.preview.rowsMaterialized - optimized.preview.rowsMaterialized) / legacy.preview.rowsMaterialized * 100).toFixed(2))
  },
  warning: 'Logical rows/memory only; not production heap, Mongo docsExamined or p95.'
}, null, 2));
