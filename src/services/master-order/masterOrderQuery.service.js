'use strict';
const implementation = require('./masterOrderQuery.impl');
module.exports = {
  getMasterOrder: implementation.getMasterOrder,
  getMasterOrders: implementation.getMasterOrders,
  listMasterOrders: implementation.listMasterOrders,
  listUnmergedChildOrders: implementation.listUnmergedChildOrders
};
