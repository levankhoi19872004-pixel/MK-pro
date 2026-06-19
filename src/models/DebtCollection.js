'use strict';

const flexModel = require('./_flexModel');

module.exports = flexModel('DebtCollection', 'debtCollections', {
  id: String,
  code: String,
  status: String,

  customerId: String,
  customerCode: String,
  customerName: String,

  collectorType: String,
  collectorUserId: String,
  collectorCode: String,
  collectorName: String,

  salesStaffCode: String,
  salesStaffName: String,
  deliveryStaffCode: String,
  deliveryStaffName: String,

  amount: Number,
  paymentMethod: String,
  note: String,

  allocations: [Object],

  submittedAt: String,
  submittedBy: String,

  accountingConfirmedAt: String,
  accountingConfirmedBy: String,
  accountingNote: String,

  rejectedAt: String,
  rejectedBy: String,
  rejectReason: String,

  arLedgerIds: [String],
  fundLedgerIds: [String],

  idempotencyKey: String,

  createdAt: String,
  updatedAt: String
});
