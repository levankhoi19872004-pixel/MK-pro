'use strict';
const legacy = require('./masterOrderLegacy.service');
module.exports = {
  getMasterOrder: (...args) => legacy.getMasterOrder(...args),
  listMasterOrders: (...args) => legacy.listMasterOrders(...args),
  listUnmergedChildOrders: (...args) => legacy.listUnmergedChildOrders(...args)
};
