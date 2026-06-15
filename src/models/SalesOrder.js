'use strict';

const mongoose = require('mongoose');
const flexModel = require('./_flexModel');

const Mixed = mongoose.Schema.Types.Mixed;

const SalesOrder = flexModel('SalesOrder', 'orders', {
  id: String,
  code: String,
  documentCode: String,
  invoiceCode: String,
  orderCode: String,
  orderNo: Mixed,
  salesOrderCode: String,

  date: String,
  orderDate: String,
  documentDate: String,
  createdDate: String,
  deliveryDate: String,
  createdAt: String,
  updatedAt: String,

  deleted: Mixed,
  isDeleted: Mixed,
  deletedAt: Mixed,
  deleteMode: String,
  deleteReason: String,

  customerId: String,
  customerCode: String,
  customerName: String,
  customerPhone: String,

  // Canonical NVBH fields. These paths must be declared because Mongo uses
  // mongoose strictQuery=true; otherwise Mongoose silently strips the filter
  // before skip/limit and the UI only finds matching rows inside page 1.
  salesStaffId: String,
  salesStaffCode: String,
  salesStaffName: String,

  // Read-only compatibility aliases for historical/imported orders.
  // Mixed preserves old numeric staff codes during exact alias matching.
  salesPersonCode: Mixed,
  salesPersonName: String,
  salesmanCode: Mixed,
  salesmanName: String,
  nvbhCode: Mixed,
  nvbhName: String,
  maNVBH: Mixed,
  maNVBHName: String,
  salesStaff: {
    code: Mixed,
    name: String,
    fullName: String
  },

  // staff* remains compatibility/audit data only; new business writes use salesStaff*.
  staffId: String,
  staffCode: Mixed,
  staffName: String,

  deliveryStaffId: String,
  deliveryStaffCode: String,
  deliveryStaffName: String,
  deliveryCode: Mixed,
  deliveryName: String,
  nvghCode: Mixed,
  nvghName: String,
  deliveryStaff: {
    code: Mixed,
    name: String,
    fullName: String
  },

  source: String,
  orderSource: String,
  externalOrderCode: String,
  status: String,
  lifecycleStatus: String,
  deliveryStatus: String,
  mergeStatus: String,
  masterOrderId: String,
  masterOrderCode: String,
  accountingStatus: String,
  accountingConfirmed: Boolean,
  arStatus: String,

  note: String,
  remark: String,
  description: String,

  vatInvoiceRequired: { type: Boolean, default: true },
  vatInvoiceDecisionSource: { type: String, default: 'default' },
  vatInvoiceNote: { type: String, default: '' },
  vatInvoiceUpdatedAt: { type: String, default: '' },
  vatInvoiceUpdatedBy: { type: String, default: '' },
  cancelledAt: String,
  cancelReason: String,

  items: Array,
  usesInternalSaleQuota: Boolean,
  internalSaleAllocationRefs: Array,
  totalAmount: Number,
  amount: Number,
  total: Number,
  paidAmount: Number,
  debtAmount: Number,
  version: { type: Number, default: 0 }
});

// Index được chuẩn hoá tập trung tại src/services/mongoIndexService.js
// để tránh khai báo trùng ở model và service làm chậm quá trình ghi/import đơn.

module.exports = SalesOrder;
