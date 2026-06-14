'use strict';

const legacy = require('./masterOrderLegacy.service');
const DeliverySettlementService = require('../../domain/settlement/DeliverySettlementService');

function useNewDeliverySettlement() {
  return String(process.env.USE_NEW_DELIVERY_SETTLEMENT || '').toLowerCase() === 'true';
}

async function confirmDeliveryAccounting(...args) {
  return useNewDeliverySettlement()
    ? DeliverySettlementService.confirmAccounting(...args)
    : legacy.confirmDeliveryAccounting(...args);
}

async function adminUnlockDeliveryAccounting(...args) {
  return useNewDeliverySettlement()
    ? DeliverySettlementService.unlockAccounting(...args)
    : legacy.adminUnlockDeliveryAccounting(...args);
}

module.exports = { confirmDeliveryAccounting, adminUnlockDeliveryAccounting, useNewDeliverySettlement };
