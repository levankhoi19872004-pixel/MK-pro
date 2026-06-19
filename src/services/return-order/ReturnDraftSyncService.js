'use strict';
const legacy = require('../returnOrderLegacy.service');
module.exports = {
  ensureReturnDraftForSalesOrder: legacy.ensureReturnDraftForSalesOrder,
  syncReturnDraftWithSalesOrder: legacy.syncReturnDraftWithSalesOrder,
  cancelReturnDraftForSalesOrder: legacy.cancelReturnDraftForSalesOrder,
  restoreReturnDraftForSalesOrder: legacy.restoreReturnDraftForSalesOrder,
  attachMasterOrderToReturnDrafts: legacy.attachMasterOrderToReturnDrafts,
  detachMasterOrderFromReturnDrafts: legacy.detachMasterOrderFromReturnDrafts
};
