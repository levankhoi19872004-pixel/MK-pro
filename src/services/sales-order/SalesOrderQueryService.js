'use strict';
const legacy = require('../orderLegacy.service');
module.exports = {
  listOrders: legacy.listOrders,
  searchOrders: legacy.searchOrders,
  getOrder: legacy.getOrder,
  getMasterChildren: legacy.getMasterChildren,
  summarizeOrders: legacy.summarizeOrders,
  toClient: legacy.toClient
};
