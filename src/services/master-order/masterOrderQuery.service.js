'use strict';
const implementation = require('./masterOrderQuery.impl');
module.exports = {
  getMasterOrder: implementation.getMasterOrder,
  listMasterOrders: implementation.listMasterOrders,
  listUnmergedChildOrders: implementation.listUnmergedChildOrders
};
