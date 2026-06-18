'use strict';

const strictModel = require('./_strictModel');

module.exports = strictModel('SupplierPayment', 'supplier_payments', {
  id: { type: String, required: true },
  code: { type: String, required: true },
  tenantId: { type: String, required: true },
  supplierId: { type: String, default: '' },
  supplierCode: { type: String, required: true },
  supplierName: { type: String, default: '' },
  paymentDate: { type: String, required: true },
  paymentMethod: { type: String, enum: ['cash', 'bank_transfer'], default: 'cash' },
  amount: { type: Number, required: true, min: 0 },
  status: { type: String, enum: ['posted', 'cancelled'], default: 'posted' },
  note: { type: String, default: '' },
  createdAt: { type: String, required: true },
  createdBy: { type: String, default: '' },
  updatedAt: { type: String, required: true }
});
