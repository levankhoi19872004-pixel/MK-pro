'use strict';

const strictModel = require('./_strictModel');

module.exports = strictModel('SupplierPayableAccount', 'supplier_payable_accounts', {
  id: { type: String, required: true },
  tenantId: { type: String, required: true },
  supplierId: { type: String, default: '' },
  supplierCode: { type: String, required: true },
  supplierName: { type: String, default: '' },
  creditTotal: { type: Number, default: 0 },
  debitTotal: { type: Number, default: 0 },
  balanceAmount: { type: Number, default: 0 },
  updatedAt: { type: String, required: true }
});
