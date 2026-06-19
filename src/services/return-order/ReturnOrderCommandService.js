'use strict';
const legacy = require('../returnOrderLegacy.service');
module.exports = {
  createReturnOrder: legacy.createReturnOrder,
  createPendingReturnOrder: legacy.createPendingReturnOrder,
  upsertDeliveryReturnOrder: legacy.upsertDeliveryReturnOrder,
  buildCanonicalReturnCode: legacy.buildCanonicalReturnCode,
  cancelDuplicateReturnOrders: legacy.cancelDuplicateReturnOrders,
  cancelReturnOrderById: legacy.cancelReturnOrderById,
  updateReturnDraftItemsBySalesOrder: legacy.updateReturnDraftItemsBySalesOrder,
  updateReturnDraftItems: legacy.updateReturnDraftItems
};
