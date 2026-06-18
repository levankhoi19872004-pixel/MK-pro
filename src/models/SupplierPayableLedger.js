'use strict';

const strictModel = require('./_strictModel');

module.exports = strictModel('SupplierPayableLedger', 'supplier_payable_ledgers', {
  id: { type: String, required: true },
  tenantId: { type: String, required: true },
  idempotencyKey: { type: String, required: true },
  supplierId: { type: String, default: '' },
  supplierCode: { type: String, required: true },
  supplierName: { type: String, default: '' },
  date: { type: String, required: true },
  type: { type: String, enum: ['PURCHASE', 'PAYMENT', 'RETURN', 'ADJUSTMENT'], required: true },
  direction: { type: String, enum: ['credit', 'debit'], required: true },
  amount: { type: Number, required: true, min: 0 },
  refType: { type: String, required: true },
  refId: { type: String, required: true },
  refCode: { type: String, default: '' },
  note: { type: String, default: '' },
  status: { type: String, enum: ['posted', 'reversed'], default: 'posted' },
  createdAt: { type: String, required: true },
  createdBy: { type: String, default: '' }
});
