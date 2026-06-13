'use strict';

const flexModel = require('./_flexModel');

module.exports = flexModel('ExternalDebtOrder', 'externalDebtOrders', {
  id: String,
  code: String,
  orderType: String,
  orderName: String,

  customerId: String,
  customerCode: String,
  customerName: String,

  salesStaffId: String,
  salesStaffCode: String,
  salesStaffName: String,

  deliveryStaffId: String,
  deliveryStaffCode: String,
  deliveryStaffName: String,

  totalAmount: Number,
  paidAmount: Number,
  remainingDebt: Number,

  documentDate: String,
  dueDate: String,
  referenceCode: String,
  reason: String,

  status: String,
  accountingStatus: String,
  accountingConfirmed: Boolean,

  arLedgerId: String,
  arLedgerCode: String,
  idempotencyKey: String,

  createdBy: String,
  createdAt: String,
  updatedAt: String
});
