'use strict';

const strictModel = require('./_strictModel');

module.exports = strictModel('InventoryReservation', 'inventory_reservations', {
  id: { type: String, required: true },
  tenantId: { type: String, required: true },
  referenceType: { type: String, required: true },
  referenceId: { type: String, required: true },
  referenceCode: { type: String, default: '' },
  warehouseCode: { type: String, default: 'MAIN' },
  status: { type: String, enum: ['active', 'released', 'consumed', 'expired'], default: 'active' },
  items: { type: Array, default: [] },
  expiresAt: { type: String, default: '' },
  createdAt: { type: String, required: true },
  createdBy: { type: String, default: '' },
  releasedAt: { type: String, default: '' },
  releasedBy: { type: String, default: '' },
  updatedAt: { type: String, required: true }
});
