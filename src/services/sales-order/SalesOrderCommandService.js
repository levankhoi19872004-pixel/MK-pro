'use strict';
const legacy = require('../orderLegacy.service');
module.exports = {
  createOrder: legacy.createOrder,
  updateOrder: legacy.updateOrder,
  updateVatInvoiceSetting: legacy.updateVatInvoiceSetting,
  cancelOrder: legacy.cancelOrder,
  deleteOrder: legacy.deleteOrder,
  syncMasterOrderSummary: legacy.syncMasterOrderSummary
};
