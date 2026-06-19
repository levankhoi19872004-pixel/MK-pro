'use strict';

const strictModel = require('./_strictModel');

module.exports = strictModel('StockCount', 'stock_counts', {
  id: { type: String, required: true },
  code: { type: String, required: true },
  tenantId: { type: String, required: true },
  warehouseCode: { type: String, default: 'MAIN' },
  countDate: { type: String, required: true },
  status: { type: String, enum: ['draft', 'posted', 'cancelled'], default: 'draft' },
  items: { type: Array, default: [] },
  totalVarianceQty: { type: Number, default: 0 },
  note: { type: String, default: '' },
  createdAt: { type: String, required: true },
  createdBy: { type: String, default: '' },
  postedAt: { type: String, default: '' },
  postedBy: { type: String, default: '' },
  updatedAt: { type: String, required: true }
});
