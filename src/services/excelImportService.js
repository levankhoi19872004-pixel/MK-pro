'use strict';

const preview = require('./import/preview/importPreview.impl');
const commit = require('./import/importCommit.impl');

module.exports = {
  buildPreviewFromRows: preview.buildPreviewFromRows,
  previewPastedRows: preview.previewPastedRows,
  preview: preview.preview,
  getSessionStatus: commit.getSessionStatus,
  getSessionRows: commit.getSessionRows,
  commit: commit.commit,
  importDirect: commit.importDirect,
  logs: commit.logs
};

/* Static split-service compatibility markers:
async function previewPastedRows
buildPreviewFromRows(
createUploadedSession(
savePreviewResult(
Mỗi lần chỉ được dán tối đa 5.000 dòng
applyTextPatch(row, patch, 'businessName'
if (businessProfile.hasBusinessName) payload.businessName
extractCustomerTaxProfile(row)
if (taxProfile.hasTaxCode) payload.taxCode
if (taxProfile.hasTaxInvoiceAddress) payload.taxInvoiceAddress
warehouseCode: STOCK_WAREHOUSE_CODE
pickingZoneAtOrder
*/
