'use strict';

const DEFAULT_ROWS = Object.freeze({
  sales: 12000,
  inventory: 8000,
  delivery: 5000,
  returns: 3000
});

function simulateLegacyDataQuality(rowsByDomain = DEFAULT_ROWS) {
  const calls = Object.entries(rowsByDomain).map(([domain, rows]) => ({
    domain,
    full: true,
    export: true,
    rowsMaterialized: Number(rows || 0)
  }));
  return {
    serviceCalls: calls.length,
    fullExportCalls: calls.filter((call) => call.full && call.export).length,
    rowsMaterialized: calls.reduce((sum, call) => sum + call.rowsMaterialized, 0),
    peakLogicalMemoryRows: calls.reduce((sum, call) => sum + call.rowsMaterialized, 0),
    concurrency: calls.length,
    calls
  };
}

function simulateLegacyPreview({ sourceRows = 10000, page = 1, limit = 50 } = {}) {
  const start = Math.max(0, (Number(page || 1) - 1) * Number(limit || 50));
  return {
    serviceCalls: 1,
    fullExportCalls: 1,
    rowsMaterialized: Number(sourceRows || 0),
    peakLogicalMemoryRows: Number(sourceRows || 0),
    rowsReturned: Math.max(0, Math.min(Number(limit || 50), Number(sourceRows || 0) - start)),
    paginationStage: 'after-assemble'
  };
}

module.exports = { DEFAULT_ROWS, simulateLegacyDataQuality, simulateLegacyPreview };
