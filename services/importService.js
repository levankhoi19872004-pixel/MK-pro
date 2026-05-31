'use strict';

// Legacy compatibility wrapper. The import module is now Mongo-native.
// Do not write to data.stock / kho-data.json here. All preview/commit work goes
// through src/services/excelImportService and persists to Mongo collections:
// products, customers, salesOrders, importOrders, receipts, cashbooks,
// stockTransactions and inventorySnapshots.

const excelImportService = require('../src/services/excelImportService');

async function previewImport(bufferOrType, maybeTypeOrRows) {
  if (Buffer.isBuffer(bufferOrType)) {
    return excelImportService.preview({ type: String(maybeTypeOrRows || '').trim(), buffer: bufferOrType });
  }
  // Compatibility for old internal calls previewImport(type, rows).
  return {
    error: 'Legacy previewImport(type, rows, data) đã bị tắt. Hãy dùng /api/import/preview Mongo-native.',
    status: 410,
    type: String(bufferOrType || ''),
    rows: Array.isArray(maybeTypeOrRows) ? maybeTypeOrRows : []
  };
}

async function commitImport(payload = {}) {
  return excelImportService.commit({
    type: String(payload.type || '').trim(),
    rows: Array.isArray(payload.rows) ? payload.rows : []
  });
}

module.exports = { previewImport, commitImport };
