'use strict';

const flexModel = require('./_flexModel');

module.exports = flexModel('InventoryAdjustment', 'inventoryAdjustments', {
  id: String,
  tenantId: String,
  adjustmentCode: String,
  correctionId: String,
  correctionCode: String,
  warehouseCode: String,
  warehouseName: String,
  productCode: String,
  productName: String,
  beforeQty: Number,
  adjustQty: Number,
  afterQty: Number,
  reason: String,
  sourceType: String,
  sourceId: String,
  sourceCode: String,
  stockTransactionId: String,
  stockTransactionCode: String,
  isRollback: Boolean,
  rollbackOf: String,
  createdBy: Object,
  approvedBy: Object,
  status: String,
  createdAt: String,
  approvedAt: String,
  appliedAt: String,
  rolledBackAt: String,
  metadata: Object
});
