'use strict';

const strictModel = require('./_strictModel');

module.exports = strictModel('DeliveryRoutePlan', 'delivery_route_plans', {
  id: { type: String, required: true },
  code: { type: String, required: true },
  tenantId: { type: String, required: true },
  deliveryDate: { type: String, required: true },
  deliveryStaffCode: { type: String, required: true },
  deliveryStaffName: { type: String, default: '' },
  vehicleCode: { type: String, default: '' },
  capacity: { type: Number, default: 0 },
  status: { type: String, enum: ['draft', 'assigned', 'in_progress', 'completed', 'cancelled'], default: 'draft' },
  stops: { type: Array, default: [] },
  summary: { type: Object, default: {} },
  createdAt: { type: String, required: true },
  createdBy: { type: String, default: '' },
  updatedAt: { type: String, required: true }
});
