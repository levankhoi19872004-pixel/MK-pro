'use strict';

const legacy = require('../returnOrderLegacy.service');
const {
  hydrateReturnOrderDeliveryStaff,
  normalizeReturnOrderDeliveryStaff
} = require('./ReturnOrderDeliveryStaffHydrator');

async function listReturnOrders(query = {}) {
  const rows = await legacy.listReturnOrders(query);
  return hydrateReturnOrderDeliveryStaff(rows);
}

function toClient(order = {}) {
  return normalizeReturnOrderDeliveryStaff(legacy.toClient(order));
}

module.exports = {
  listReturnOrders,
  getReturnOrderBySalesOrderKey: legacy.getReturnOrderBySalesOrderKey,
  findExistingReturnOrderForSalesOrder: legacy.findExistingReturnOrderForSalesOrder,
  toClient
};
