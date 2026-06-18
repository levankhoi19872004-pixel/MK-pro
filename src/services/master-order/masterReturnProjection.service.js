'use strict';
const implementation = require('./masterOrderReturn.impl');
module.exports = {
  returnOrdersForSalesOrder: implementation.returnOrdersForSalesOrder,
  returnAmountForSalesOrder: implementation.returnAmountForSalesOrder,
  hydrateReturnOrdersForAccounting: implementation.hydrateReturnOrdersForAccounting,
  directReturnOrdersForSalesOrder: implementation.directReturnOrdersForSalesOrder,
  returnOrderTotalAmount: implementation.returnOrderTotalAmount,
  masterChildCountForReturnFallback: implementation.masterChildCountForReturnFallback
};
