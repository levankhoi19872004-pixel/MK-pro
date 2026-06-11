'use strict';

// Strangler facade for delivery accounting.
// Default path remains legacy for production safety. The new domain boundary can be
// enabled with USE_NEW_DELIVERY_SETTLEMENT=true without changing route/controller code.
const legacy = require('./masterOrderLegacy.service');
const DeliverySettlementService = require('../../domain/settlement/DeliverySettlementService');

function useNewDeliverySettlement() {
  return String(process.env.USE_NEW_DELIVERY_SETTLEMENT || '').toLowerCase() === 'true';
}

async function confirmDeliveryAccounting(...args) {
  if (useNewDeliverySettlement()) {
    return DeliverySettlementService.confirmAccounting(...args);
  }
  return legacy.confirmDeliveryAccounting(...args);
}

async function adminUnlockDeliveryAccounting(...args) {
  if (useNewDeliverySettlement()) {
    return DeliverySettlementService.unlockAccounting(...args);
  }
  return legacy.adminUnlockDeliveryAccounting(...args);
}

module.exports = {
  confirmDeliveryAccounting,
  adminUnlockDeliveryAccounting
};
