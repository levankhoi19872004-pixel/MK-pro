const flexModel = require('./_flexModel');

const FundLedger = flexModel('FundLedger', 'fundLedgers', {
  id: String,
  tenantId: String,
  code: String,
  date: String,
  accountingDate: String,
  remittanceDate: String,
  fundType: String, // cash | bank
  direction: String, // in | out
  account: String, // CASH | BANK or accounting sub-account
  category: String, // RECEIPT | EXPENSE | TRANSFER
  type: String, // fund_receipt | fund_expense | fund_transfer
  accountingConfirmed: Boolean,
  accountingStatus: String,
  idempotencyKey: String,
  amount: Number,
  sourceType: String,
  sourceId: String,
  sourceCode: String,
  sourceLineId: String,
  refType: String,
  refId: String,
  refCode: String,
  referenceType: String,
  referenceId: String,
  referenceCode: String,
  deliveryDate: String,
  bankAccountCode: String,
  bankReference: String,
  deliveryStaffCode: String,
  deliveryStaffName: String,
  salesStaffCode: String,
  salesStaffName: String,
  customerCode: String,
  customerName: String,
  staffCode: String,
  staffName: String,
  staffRole: String,
  collectorType: String,
  collectorCode: String,
  collectorName: String,
  receiverCode: String,
  receiverName: String,
  receiverRole: String,
  supplierCode: String,
  supplierName: String,
  payerCode: String,
  payerName: String,
  payerRole: String,
  depositorCode: String,
  depositorName: String,
  depositorRole: String,
  counterpartyCode: String,
  counterpartyName: String,
  counterpartyRole: String,
  isReversal: Boolean,
  reversalOf: String,
  originalSourceId: String,
  isDeleted: Boolean,
  deletedAt: String,
  note: String,
  status: String,
  createdBy: String,
  createdAt: String,
  updatedAt: String
});

FundLedger.schema.index(
  { idempotencyKey: 1 },
  { unique: true, sparse: true, name: 'uniq_fund_ledger_idempotency_key' }
);

module.exports = FundLedger;
