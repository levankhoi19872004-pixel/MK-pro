'use strict';

// Compatibility facade retained while callers migrate to explicit domain modules.
const query = require('./masterOrderQuery.impl');
const deliveryList = require('./deliveryTodayList.impl');
const deliverySummary = require('./deliverySummary.impl');
const deliverySalesSummary = require('./deliverySalesSummary.impl');
const deliveryCompact = require('./deliveryOrdersCompact.impl');
const deliveryCommand = require('./deliveryOrderCommand.impl');
const accountingCommand = require('./deliveryAccountingCommand.impl');
const printLegacy = require('./masterOrderPrintLegacy.impl');
const command = require('./masterOrderCommand.impl');
const returns = require('./masterOrderReturn.impl');
const assignment = require('../../utils/masterOrderAssignment.util');

module.exports = {
  listUnmergedChildOrders: query.listUnmergedChildOrders,
  listMasterOrders: query.listMasterOrders,
  getMasterOrder: query.getMasterOrder,
  listDeliveryToday: deliveryList.listDeliveryToday,
  listDeliveryTodaySummary: deliverySummary.listDeliveryTodaySummary,
  listDeliveryTodaySummaryFast: deliverySummary.listDeliveryTodaySummaryFast,
  listDeliveryTodaySalesSummary: deliverySalesSummary.listDeliveryTodaySalesSummary,
  listDeliveryTodayOrdersCompact: deliveryCompact.listDeliveryTodayOrdersCompact,
  updateDeliveryTodayOrder: deliveryCommand.updateDeliveryTodayOrder,
  confirmDeliveryAccounting: accountingCommand.confirmDeliveryAccounting,
  adminUnlockDeliveryAccounting: accountingCommand.adminUnlockDeliveryAccounting,
  buildAggregateMasterPrintDocument: printLegacy.buildAggregateMasterPrintDocument,
  createMasterOrder: command.createMasterOrder,
  updateMasterOrder: command.updateMasterOrder,
  cancelMasterOrder: command.cancelMasterOrder,
  deleteMasterOrder: command.deleteMasterOrder,
  _internal: {
    returnOrdersForSalesOrder: returns.returnOrdersForSalesOrder,
    returnAmountForSalesOrder: returns.returnAmountForSalesOrder,
    hydrateReturnOrdersForAccounting: returns.hydrateReturnOrdersForAccounting,
    directReturnOrdersForSalesOrder: returns.directReturnOrdersForSalesOrder,
    returnOrderTotalAmount: returns.returnOrderTotalAmount,
    masterChildCountForReturnFallback: returns.masterChildCountForReturnFallback,
    buildDetachedSalesOrderMongoUpdate: assignment.buildDetachedSalesOrderMongoUpdate,
    hasDeliveryOperationalData: assignment.hasDeliveryOperationalData,
    canonicalMasterChildReferencePatch: assignment.canonicalMasterChildReferencePatch
  }
};
