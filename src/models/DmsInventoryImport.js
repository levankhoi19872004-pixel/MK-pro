'use strict';

const flexModel = require('./_flexModel');

module.exports = flexModel('DmsInventoryImport', 'dmsInventoryImports', {
  id: String,
  code: String,
  previewToken: String,
  fileHash: String,
  originalFilename: String,
  fileSize: Number,
  source: String,
  snapshotDate: String,
  snapshotAt: String,
  status: String,
  totalRows: Number,
  validRows: Number,
  matchedRows: Number,
  dmsGreaterRows: Number,
  internalGreaterRows: Number,
  unmappedRows: Number,
  conversionMismatchRows: Number,
  totalDmsQty: Number,
  totalInternalQty: Number,
  totalDmsExcessQty: Number,
  totalInternalExcessQty: Number,
  importedByCode: String,
  importedByName: String,
  importedAt: String,
  committedAt: String,
  supersedesImportId: String,
  expiresAt: Date,
  note: String,
  createdAt: String,
  updatedAt: String
});
