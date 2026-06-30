'use strict';

const flexModel = require('./_flexModel');

module.exports = flexModel('DeliveryCloseoutVersion', 'deliveryCloseoutVersions', {
  id: String,
  code: String,
  closeoutCode: String,
  tenantId: String,

  closeoutVersion: Number,
  originalCloseoutVersion: Number,
  originalCloseoutId: String,
  originalCloseoutCode: String,
  correctionOfCloseoutId: String,
  correctionId: String,
  correctionCode: String,

  deliveryDate: String,
  deliveryStaffCode: String,
  deliveryStaffName: String,
  salesStaffCode: String,
  salesStaffName: String,

  salesOrderId: String,
  salesOrderCode: String,
  orderId: String,
  orderCode: String,
  customerId: String,
  customerCode: String,
  customerName: String,

  saleAmount: Number,
  originalAmount: Number,
  returnAmount: Number,
  returnedAmount: Number,
  cashCollectedAmount: Number,
  collectedAmount: Number,
  debtAmount: Number,
  finalDebtAmount: Number,

  previousReturnAmount: Number,
  previousCashCollectedAmount: Number,
  previousDebtAmount: Number,
  returnAdjustmentAmount: Number,
  cashAdjustmentAmount: Number,
  debtAdjustmentAmount: Number,

  status: String,
  immutable: Boolean,
  isLatest: Boolean,
  sourceType: String,
  idempotencyKey: String,
  reason: String,
  note: String,
  createdBy: String,
  createdAt: String,
  updatedAt: String,
  auditTrail: Array,
  metadata: Object
});
