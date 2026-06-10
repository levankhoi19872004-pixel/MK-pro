'use strict';

function canEditDelivery(order = {}) {
  const status = String(order.deliveryStatus || order.status || '').toLowerCase();
  return !['delivered', 'cancelled', 'canceled', 'accounting_confirmed'].includes(status);
}

function requiresAccountingConfirmation(order = {}) {
  return String(order.deliveryStatus || '').toLowerCase() === 'delivered' && order.accountingConfirmed !== true;
}

module.exports = { canEditDelivery, requiresAccountingConfirmation };
