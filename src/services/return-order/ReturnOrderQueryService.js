'use strict';
const legacy = require('../returnOrderLegacy.service');
module.exports = {
  listReturnOrders: legacy.listReturnOrders,
  getReturnOrderBySalesOrderKey: legacy.getReturnOrderBySalesOrderKey,
  findExistingReturnOrderForSalesOrder: legacy.findExistingReturnOrderForSalesOrder,
  toClient: legacy.toClient
};
