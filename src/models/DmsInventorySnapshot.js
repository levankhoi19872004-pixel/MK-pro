'use strict';

const flexModel = require('./_flexModel');

module.exports = flexModel('DmsInventorySnapshot', 'dmsInventorySnapshots', {
  id: String,
  importId: String,
  importCode: String,
  snapshotDate: String,
  snapshotAt: String,
  productId: String,
  productCode: String,
  productName: String,
  dmsProductName: String,
  dmsConversionRate: Number,
  internalConversionRate: Number,
  dmsCaseLoose: String,
  dmsBaseQty: Number,
  internalBaseQty: Number,
  differenceQty: Number,
  dmsExcessQty: Number,
  internalExcessQty: Number,
  comparisonType: String,
  sourcePresentInDms: Boolean,
  formulaValid: Boolean,
  warning: String,
  status: String,
  expiresAt: Date,
  createdAt: String,
  updatedAt: String
});
