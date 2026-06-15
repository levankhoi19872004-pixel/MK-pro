'use strict';

const flexModel = require('./_flexModel');

module.exports = flexModel('InternalSaleAllocation', 'internalSaleAllocations', {
  id: String,
  code: String,
  importId: String,
  importCode: String,
  snapshotId: String,
  snapshotDate: String,
  snapshotAt: String,
  productId: String,
  productCode: String,
  productName: String,
  dmsSnapshotQty: Number,
  internalSnapshotQty: Number,
  openingQty: Number,
  consumedQty: Number,
  releasedQty: Number,
  remainingQty: Number,
  status: String,
  source: String,
  activatedAt: String,
  supersededAt: String,
  supersededByImportId: String,
  createdAt: String,
  updatedAt: String
});
