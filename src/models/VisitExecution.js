'use strict';

const strictModel = require('./_strictModel');

module.exports = strictModel('VisitExecution', 'visit_executions', {
  id: { type: String, required: true },
  tenantId: { type: String, required: true },
  visitPlanId: { type: String, required: true },
  stopId: { type: String, required: true },
  customerId: { type: String, default: '' },
  customerCode: { type: String, required: true },
  customerName: { type: String, default: '' },
  salesStaffCode: { type: String, required: true },
  status: { type: String, enum: ['checked_in', 'completed', 'no_sale', 'cancelled'], default: 'checked_in' },
  checkInAt: { type: String, required: true },
  checkInLocation: { type: Object, default: {} },
  checkOutAt: { type: String, default: '' },
  checkOutLocation: { type: Object, default: {} },
  outcome: { type: Object, default: {} },
  photoUrls: { type: Array, default: [] },
  note: { type: String, default: '' },
  createdAt: { type: String, required: true },
  updatedAt: { type: String, required: true }
});
