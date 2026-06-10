'use strict';

const delivery = require('./masterOrderDelivery.service');
const returns = require('./masterOrderReturn.service');
const accounting = require('./masterOrderAccounting.service');
const print = require('./masterOrderPrint.service');

module.exports = {
  ...delivery,
  ...returns,
  ...accounting,
  ...print,
  _internal: {
    returnOrdersForSalesOrder: returns.returnOrdersForSalesOrder,
    returnAmountForSalesOrder: returns.returnAmountForSalesOrder,
    hydrateReturnOrdersForAccounting: returns.hydrateReturnOrdersForAccounting,
    directReturnOrdersForSalesOrder: returns.directReturnOrdersForSalesOrder,
    returnOrderTotalAmount: returns.returnOrderTotalAmount,
    masterChildCountForReturnFallback: returns.masterChildCountForReturnFallback
  }
};
