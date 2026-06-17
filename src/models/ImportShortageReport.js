'use strict';

const mongoose = require('mongoose');

const ImportShortageItemSchema = new mongoose.Schema({
  documentCode: { type: String, default: '', trim: true },
  customerCode: { type: String, default: '', trim: true },
  customerName: { type: String, default: '', trim: true },
  productCode: { type: String, required: true, trim: true },
  productName: { type: String, default: '', trim: true },
  unit: { type: String, default: '', trim: true },
  conversionRate: { type: Number, default: 1 },
  requestedQuantity: { type: Number, default: 0 },
  availableQuantity: { type: Number, default: 0 },
  missingQuantity: { type: Number, required: true, min: 0 },
  unitPrice: { type: Number, default: 0 },
  cutAmount: { type: Number, default: 0 },
  reconciliationStatus: {
    type: String,
    enum: ['open', 'verified', 'resolved'],
    default: 'open'
  },
  reconciliationNote: { type: String, default: '', trim: true },
  reconciledBy: { type: String, default: '', trim: true },
  reconciledAt: { type: Date, default: null }
}, { _id: true });

const ImportShortageReportSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, trim: true },
  importSessionId: { type: String, required: true, unique: true, trim: true },
  importType: { type: String, enum: ['salesOrders'], default: 'salesOrders' },
  fileNames: { type: [String], default: [] },
  importDate: { type: Date, default: Date.now },
  status: {
    type: String,
    enum: ['open', 'in_review', 'resolved'],
    default: 'open'
  },
  itemCount: { type: Number, default: 0 },
  orderCount: { type: Number, default: 0 },
  productCount: { type: Number, default: 0 },
  totalMissingQuantity: { type: Number, default: 0 },
  totalCutAmount: { type: Number, default: 0 },
  items: { type: [ImportShortageItemSchema], default: [] },
  note: { type: String, default: '', trim: true },
  createdBy: { type: String, default: '', trim: true },
  updatedBy: { type: String, default: '', trim: true },
  resolvedBy: { type: String, default: '', trim: true },
  resolvedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { versionKey: false, collection: 'import_shortage_reports' });

ImportShortageReportSchema.index({ importDate: -1 }, { name: 'idx_importShortageReports_importDate' });
ImportShortageReportSchema.index({ status: 1, importDate: -1 }, { name: 'idx_importShortageReports_status_date' });
ImportShortageReportSchema.index({ 'items.productCode': 1, importDate: -1 }, { name: 'idx_importShortageReports_product_date' });

ImportShortageReportSchema.pre('save', function updateTimestamp(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.models.ImportShortageReport || mongoose.model('ImportShortageReport', ImportShortageReportSchema);
