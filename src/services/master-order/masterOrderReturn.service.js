'use strict';

// Refactor phase 1: thin domain module over the preserved implementation.
// Business behavior is intentionally unchanged; routes continue through the facade.
const legacy = require('./masterOrderLegacy.service');

module.exports = {
  returnOrdersForSalesOrder: legacy._internal.returnOrdersForSalesOrder,
  returnAmountForSalesOrder: legacy._internal.returnAmountForSalesOrder,
  hydrateReturnOrdersForAccounting: legacy._internal.hydrateReturnOrdersForAccounting,
  directReturnOrdersForSalesOrder: legacy._internal.directReturnOrdersForSalesOrder,
  returnOrderTotalAmount: legacy._internal.returnOrderTotalAmount,
  masterChildCountForReturnFallback: legacy._internal.masterChildCountForReturnFallback,
};
