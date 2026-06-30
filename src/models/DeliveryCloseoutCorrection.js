'use strict';

const flexModel = require('./_flexModel');

module.exports = flexModel('DeliveryCloseoutCorrection', 'deliveryCloseoutCorrections', {
  id: String,
  code: String,
  correctionCode: String,
  tenantId: String,

  originalCloseoutId: String,
  originalCloseoutCode: String,
  newCloseoutId: String,
  newCloseoutCode: String,
  originalCloseoutVersion: Number,
  newCloseoutVersion: Number,

  deliveryDate: String,
  deliveryStaffCode: String,
  deliveryStaffName: String,
  salesStaffCode: String,
  salesStaffName: String,

  customerId: String,
  customerCode: String,
  customerName: String,
  salesOrderId: String,
  salesOrderCode: String,
  orderId: String,
  orderCode: String,

  previousReturnAmount: Number,
  previousCashCollectedAmount: Number,
  previousDebtAmount: Number,
  newReturnAmount: Number,
  newCashCollectedAmount: Number,
  newDebtAmount: Number,

  returnAdjustmentAmount: Number,
  cashAdjustmentAmount: Number,
  debtAdjustmentAmount: Number,
  returnAdjustmentItems: Array,
  cashAdjustmentLines: Array,

  reason: String,
  note: String,
  status: String,
  sourceType: String,
  idempotencyKey: String,
  arDebtAdjustmentLedgerId: String,
  arDebtAdjustmentLedgerCode: String,

  createdBy: String,
  createdAt: String,
  updatedAt: String,
  auditTrail: Array,
  metadata: Object
});
