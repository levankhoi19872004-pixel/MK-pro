'use strict';
const implementation = require('./masterOrderCommand.impl');
module.exports = {
  createMasterOrder: implementation.createMasterOrder,
  updateMasterOrder: implementation.updateMasterOrder,
  cancelMasterOrder: implementation.cancelMasterOrder,
  deleteMasterOrder: implementation.deleteMasterOrder
};
