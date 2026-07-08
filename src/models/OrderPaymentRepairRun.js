const flexModel = require('./_flexModel');

const OrderPaymentRepairRun = flexModel('OrderPaymentRepairRun', 'orderPaymentRepairRuns', {
  runCode: String,
  mode: String, // dry-run | apply
  fromDate: String,
  toDate: String,
  deliveryStaffCode: String,
  salesStaffCode: String,
  customerCode: String,
  orderCode: String,
  scannedOrders: Number,
  createdAllocations: Number,
  createdArLedgers: Number,
  createdFundLedgers: Number,
  createdDebtAdjustments: Number,
  skippedAlreadyFixed: Number,
  skippedDebtAlreadyReconciled: Number,
  zeroToleranceApplied: Number,
  debtAdjustmentDebitAmount: Number,
  debtAdjustmentCreditAmount: Number,
  invalidAllocations: Number,
  manualReviewRequired: Number,
  errorRows: Array, // DB vẫn lưu field errors qua strict:false; tránh warning reserved pathname của Mongoose.
  status: String,
  startedAt: String,
  finishedAt: String,
  createdBy: String,
  createdAt: String,
  updatedAt: String,
  metadata: Object
});

module.exports = OrderPaymentRepairRun;
