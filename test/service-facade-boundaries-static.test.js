'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
const read = (file) => require('./helpers/sourceBundle.util').readSource(file);

test('large service entry points are now small facades', () => {
  for (const file of [
    'src/services/returnOrderService.js',
    'src/services/orderService.js',
    'src/services/reportService.js',
    'src/services/importExportService.js',
    'src/engines/delivery.engine.js',
    'services/printDataBuilder.js'
  ]) {
    const source = read(file);
    assert.ok(source.split(/\r?\n/).length < 20, `${file} must remain a small facade`);
  }
});

test('business boundaries exist for query command posting reporting and export', () => {
  for (const file of [
    'src/services/return-order/ReturnOrderQueryService.js',
    'src/services/return-order/ReturnOrderCommandService.js',
    'src/services/return-order/ReturnReceivingService.js',
    'src/services/return-order/ReturnAccountingService.js',
    'src/services/return-order/ReturnDraftSyncService.js',
    'src/services/sales-order/SalesOrderQueryService.js',
    'src/services/sales-order/SalesOrderCommandService.js',
    'src/services/sales-order/SalesOrderPostingCoordinator.js',
    'src/services/reports/DebtReportService.js',
    'src/services/import-export/ExportFacade.js',
    'src/engines/delivery/DeliveryEngineFacade.js',
    'services/print/PrintDocumentBuilder.js'
  ]) assert.ok(fs.existsSync(path.join(ROOT,file)), file);
});
