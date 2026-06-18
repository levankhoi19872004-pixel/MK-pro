'use strict';

const legacyImplementation = require('./deliveryAccountingCommand.impl');
const DeliverySettlementService = require('../../domain/settlement/DeliverySettlementService');

function useNewDeliverySettlement() {
  return String(process.env.USE_NEW_DELIVERY_SETTLEMENT || '').toLowerCase() === 'true';
}

async function confirmDeliveryAccounting(...args) {
  return useNewDeliverySettlement()
    ? DeliverySettlementService.confirmAccounting(...args)
    : legacyImplementation.confirmDeliveryAccounting(...args);
}

async function adminUnlockDeliveryAccounting(...args) {
  return useNewDeliverySettlement()
    ? DeliverySettlementService.unlockAccounting(...args)
    : legacyImplementation.adminUnlockDeliveryAccounting(...args);
}

module.exports = { confirmDeliveryAccounting, adminUnlockDeliveryAccounting, useNewDeliverySettlement };
