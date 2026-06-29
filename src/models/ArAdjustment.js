'use strict';

const flexModel = require('./_flexModel');

module.exports = flexModel('ArAdjustment', 'arAdjustments', {
  id: String,
  tenantId: String,
  adjustmentCode: String,
  correctionId: String,
  correctionCode: String,
  customerCode: String,
  customerName: String,
  beforeDebt: Number,
  adjustAmount: Number,
  afterDebt: Number,
  reason: String,
  sourceType: String,
  sourceId: String,
  sourceCode: String,
  arLedgerId: String,
  arLedgerCode: String,
  adjustmentKind: String,
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
