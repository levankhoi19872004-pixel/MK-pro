'use strict';
const legacy = require('./masterOrderLegacy.service');
const internal = legacy._internal;
module.exports = {
  returnOrdersForSalesOrder: internal.returnOrdersForSalesOrder,
  returnAmountForSalesOrder: internal.returnAmountForSalesOrder,
  hydrateReturnOrdersForAccounting: internal.hydrateReturnOrdersForAccounting,
  directReturnOrdersForSalesOrder: internal.directReturnOrdersForSalesOrder,
  returnOrderTotalAmount: internal.returnOrderTotalAmount,
  masterChildCountForReturnFallback: internal.masterChildCountForReturnFallback
};
