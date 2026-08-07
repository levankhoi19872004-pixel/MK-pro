'use strict';

function pageRows(rows = [], { page = 1, limit = 50 } = {}) {
  const safePage = Math.max(1, Number(page || 1));
  const safeLimit = Math.min(Math.max(Number(limit || 50), 1), 200);
  const start = (safePage - 1) * safeLimit;
  return {
    rows: rows.slice(start, start + safeLimit),
    meta: {
      page: safePage,
      limit: safeLimit,
      total: rows.length,
      totalPages: rows.length ? Math.ceil(rows.length / safeLimit) : 0,
      hasMore: start + safeLimit < rows.length
    }
  };
}

function optimizedWork({ previewRows = 50, snapshotRows = 50 } = {}) {
  return {
    preview: {
      serviceCalls: 1,
      fullExportCalls: 0,
      rowsMaterialized: previewRows,
      peakLogicalMemoryRows: previewRows,
      paginationStage: 'before-response'
    },
    dataQuality: {
      serviceCalls: 1,
      fullExportCalls: 0,
      rowsMaterialized: snapshotRows,
      peakLogicalMemoryRows: snapshotRows,
      concurrency: 1,
      source: 'report_data_quality_snapshot'
    }
  };
}

module.exports = { pageRows, optimizedWork };
