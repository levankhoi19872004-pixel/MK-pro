'use strict';

const strictModel = require('./_strictModel');

module.exports = strictModel('GoodsReceipt', 'goods_receipts', {
  id: { type: String, required: true },
  code: { type: String, required: true },
  tenantId: { type: String, required: true },
  purchaseOrderId: { type: String, required: true },
  purchaseOrderCode: { type: String, required: true },
  supplierId: { type: String, default: '' },
  supplierCode: { type: String, required: true },
  supplierName: { type: String, required: true },
  receiptDate: { type: String, required: true },
  warehouseCode: { type: String, default: 'MAIN' },
  status: { type: String, enum: ['posted', 'cancelled'], default: 'posted' },
  items: { type: Array, default: [] },
  totalQuantity: { type: Number, default: 0 },
  totalAmount: { type: Number, default: 0 },
  stockPosted: { type: Boolean, default: true },
  payablePosted: { type: Boolean, default: true },
  note: { type: String, default: '' },
  createdAt: { type: String, required: true },
  createdBy: { type: String, default: '' },
  updatedAt: { type: String, required: true }
});
