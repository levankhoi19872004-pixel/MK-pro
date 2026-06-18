'use strict';

const strictModel = require('./_strictModel');

module.exports = strictModel('PurchaseReturn', 'purchase_returns', {
  id: { type: String, required: true },
  code: { type: String, required: true },
  tenantId: { type: String, required: true },
  goodsReceiptId: { type: String, required: true },
  goodsReceiptCode: { type: String, required: true },
  purchaseOrderId: { type: String, default: '' },
  purchaseOrderCode: { type: String, default: '' },
  supplierId: { type: String, default: '' },
  supplierCode: { type: String, required: true },
  supplierName: { type: String, default: '' },
  returnDate: { type: String, required: true },
  warehouseCode: { type: String, default: 'MAIN' },
  items: { type: Array, default: [] },
  totalQuantity: { type: Number, default: 0 },
  totalAmount: { type: Number, default: 0 },
  status: { type: String, enum: ['posted', 'cancelled'], default: 'posted' },
  note: { type: String, default: '' },
  createdAt: { type: String, required: true },
  createdBy: { type: String, default: '' },
  updatedAt: { type: String, required: true }
});
