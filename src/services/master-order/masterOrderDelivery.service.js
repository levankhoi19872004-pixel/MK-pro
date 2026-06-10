'use strict';

// Refactor phase 1: thin domain module over the preserved implementation.
// Business behavior is intentionally unchanged; routes continue through the facade.
const legacy = require('./masterOrderLegacy.service');

module.exports = {
  listUnmergedChildOrders: legacy.listUnmergedChildOrders,
  listMasterOrders: legacy.listMasterOrders,
  listDeliveryToday: legacy.listDeliveryToday,
  listDeliveryTodaySummary: legacy.listDeliveryTodaySummary,
  listDeliveryTodaySummaryFast: legacy.listDeliveryTodaySummaryFast,
  listDeliveryTodaySalesSummary: legacy.listDeliveryTodaySalesSummary,
  listDeliveryTodayOrdersCompact: legacy.listDeliveryTodayOrdersCompact,
  updateDeliveryTodayOrder: legacy.updateDeliveryTodayOrder,
  getMasterOrder: legacy.getMasterOrder,
  createMasterOrder: legacy.createMasterOrder,
  updateMasterOrder: legacy.updateMasterOrder,
  cancelMasterOrder: legacy.cancelMasterOrder,
  deleteMasterOrder: legacy.deleteMasterOrder,
};
