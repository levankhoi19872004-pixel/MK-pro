'use strict';
const legacy = require('./masterOrderLegacy.service');
module.exports = {
  createMasterOrder: (...args) => legacy.createMasterOrder(...args),
  updateMasterOrder: (...args) => legacy.updateMasterOrder(...args),
  cancelMasterOrder: (...args) => legacy.cancelMasterOrder(...args),
  deleteMasterOrder: (...args) => legacy.deleteMasterOrder(...args)
};
