'use strict';

const legacyImplementation = require('./deliveryAccountingCommand.impl');
const DeliverySettlementService = require('../../domain/settlement/DeliverySettlementService');

function envEnabled(name) {
  return String(process.env[name] || '').toLowerCase() === 'true';
}

function useNewDeliverySettlement() {
  return String(process.env.USE_NEW_DELIVERY_SETTLEMENT || '').toLowerCase() === 'true';
}

function isProductionEnv() {
  return String(process.env.NODE_ENV || '').toLowerCase() === 'production';
}

function assertLegacyDeliveryAccountingAllowed() {
  if (!envEnabled('USE_LEGACY_DELIVERY_ACCOUNTING')) return false;
  if (isProductionEnv() && !envEnabled('ALLOW_UNSAFE_LEGACY_AR_ROLLBACK')) {
    const err = new Error('USE_LEGACY_DELIVERY_ACCOUNTING không được bật ở production vì có thể sinh AR-SALE/AR-RETURN/AR-RECEIPT legacy. Muốn rollback khẩn cấp phải bật ALLOW_UNSAFE_LEGACY_AR_ROLLBACK=true và chịu cảnh báo P0.');
    err.code = 'UNSAFE_LEGACY_DELIVERY_ACCOUNTING_BLOCKED_IN_PRODUCTION';
    err.severity = 'P0';
    throw err;
  }
  if (isProductionEnv() && envEnabled('ALLOW_UNSAFE_LEGACY_AR_ROLLBACK')) {
    console.error('[P0][UNSAFE_LEGACY_AR_ROLLBACK] Legacy delivery accounting rollback is enabled in production. This path may post AR-SALE/AR-RETURN/AR-RECEIPT and must be temporary.');
  }
  return true;
}

function useLegacyDeliveryAccounting() {
  return assertLegacyDeliveryAccountingAllowed();
}

async function confirmDeliveryAccounting(...args) {
  // Phase88 default is the strict closeout path. Legacy remains only as an
  // explicitly acknowledged emergency rollback and is blocked in production by default.
  return (useLegacyDeliveryAccounting() && !useNewDeliverySettlement())
    ? legacyImplementation.confirmDeliveryAccounting(...args)
    : DeliverySettlementService.confirmAccounting(...args);
}

async function adminUnlockDeliveryAccounting(...args) {
  return (useLegacyDeliveryAccounting() && !useNewDeliverySettlement())
    ? legacyImplementation.adminUnlockDeliveryAccounting(...args)
    : DeliverySettlementService.unlockAccounting(...args);
}

module.exports = {
  confirmDeliveryAccounting,
  adminUnlockDeliveryAccounting,
  useNewDeliverySettlement,
  useLegacyDeliveryAccounting,
  assertLegacyDeliveryAccountingAllowed,
  isProductionEnv
};
