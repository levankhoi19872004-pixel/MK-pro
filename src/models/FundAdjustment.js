'use strict';

const flexModel = require('./_flexModel');

module.exports = flexModel('FundAdjustment', 'fundAdjustments', {
  id: String,
  tenantId: String,
  adjustmentCode: String,
  correctionId: String,
  correctionCode: String,
  fundCode: String,
  fundType: String,
  account: String,
  beforeBalance: Number,
  adjustAmount: Number,
  afterBalance: Number,
  reason: String,
  sourceType: String,
  sourceId: String,
  sourceCode: String,
  fundLedgerId: String,
  fundLedgerCode: String,
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
