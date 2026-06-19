'use strict';

const strictModel = require('./_strictModel');

const item = {
  productId: { type: String, default: '' },
  productCode: { type: String, required: true },
  productName: { type: String, default: '' },
  unit: { type: String, default: '' },
  quantity: { type: Number, required: true, min: 0 },
  receivedQty: { type: Number, default: 0, min: 0 },
  costPrice: { type: Number, default: 0, min: 0 },
  amount: { type: Number, default: 0, min: 0 }
};

module.exports = strictModel('PurchaseOrder', 'purchase_orders', {
  id: { type: String, required: true },
  code: { type: String, required: true },
  tenantId: { type: String, required: true },
  supplierId: { type: String, default: '' },
  supplierCode: { type: String, required: true },
  supplierName: { type: String, required: true },
  orderDate: { type: String, required: true },
  expectedDate: { type: String, default: '' },
  warehouseCode: { type: String, default: 'MAIN' },
  status: { type: String, enum: ['draft', 'approved', 'partially_received', 'received', 'cancelled'], default: 'draft' },
  items: { type: [item], default: [] },
  totalQuantity: { type: Number, default: 0 },
  totalAmount: { type: Number, default: 0 },
  note: { type: String, default: '' },
  approvedAt: { type: String, default: '' },
  approvedBy: { type: String, default: '' },
  createdAt: { type: String, required: true },
  createdBy: { type: String, default: '' },
  updatedAt: { type: String, required: true },
  updatedBy: { type: String, default: '' }
});
