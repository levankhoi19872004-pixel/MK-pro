'use strict';

const strictModel = require('./_strictModel');

module.exports = strictModel('VisitPlan', 'visit_plans', {
  id: { type: String, required: true },
  code: { type: String, required: true },
  tenantId: { type: String, required: true },
  planDate: { type: String, required: true },
  salesStaffCode: { type: String, required: true },
  salesStaffName: { type: String, default: '' },
  routeCode: { type: String, default: '' },
  status: { type: String, enum: ['planned', 'in_progress', 'completed', 'cancelled'], default: 'planned' },
  stops: { type: Array, default: [] },
  createdAt: { type: String, required: true },
  createdBy: { type: String, default: '' },
  updatedAt: { type: String, required: true }
});
