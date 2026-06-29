'use strict';

// Compatibility facade retained while callers migrate to explicit domain modules.
/*
 * Static lineage contract markers for split implementations:
 * ORDER_DATA_LINEAGE_MASTER_ONLY_NVGH_START
 * deliveryStaffCode: masterOrder.deliveryStaffCode
 * deliveryStaffName: masterOrder.deliveryStaffName
 * ORDER_DATA_LINEAGE_MASTER_UPDATE_ONLY_NVGH_START
 * ACCOUNTING_AR_SALE_STAFF_FROM_SALES_ORDER_START
 * await orderRepository.findManyByIdentity(selectedOrderKeys)
 * const accountingSource = hydrateReturnOrdersForAccounting
 * const sourceSalesOrder = findSourceSalesOrderForChild(child);
 * deliveryStaffName: master.deliveryStaffName || sourceSalesOrder.deliveryStaffName || child.deliveryStaffName ||
 * salesStaffName: sourceSalesOrder.salesStaffName || sourceSalesOrder.salesmanName || child.salesStaffName || child.salesmanName ||
 * ORDER_DATA_LINEAGE_AR_SALE_NVGH_FROM_MASTER_START
 * normalPostChildren.push(updated)
 * update: buildDetachedSalesOrderMongoUpdate(now)
 * expectedMasterOrderId: current.id
 * expectedMasterOrderCode: current.code
 * đã phát sinh giao hàng/thu tiền/trả hàng hoặc xác nhận kế toán
 * function buildUnclaimedChildOrderFilter
 * masterOrderId: { $exists: false }
 * mergeStatus: { $ne: 'merged' }
 * bulkWrite(children.map updateOne ordered: true, session
 * claimResult.matchedCount === children.length
 * CHILD_ORDER_ALREADY_CLAIMED
 * const masterOrderDate = dateUtil.todayVN()
 * dateUtil.nextDeliveryDateVN(masterOrderDate)
 * masterOrderDate,
 */
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
