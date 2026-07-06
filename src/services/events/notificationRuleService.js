'use strict';

const { EVENT_TYPES } = require('./domainEventTypes');

const RULES = Object.freeze({
  [EVENT_TYPES.ORDER_AMOUNT_CHANGED]: { recipients: [{ role: 'admin' }, { role: 'accountant' }] },
  [EVENT_TYPES.ORDER_DELETED]: { recipients: [{ role: 'admin' }, { role: 'accountant' }, { related: 'salesStaffCode' }, { related: 'deliveryStaffCode' }] },
  [EVENT_TYPES.ORDER_DELIVERY_STAFF_CHANGED]: { recipients: [{ role: 'admin' }, { role: 'accountant' }, { related: 'oldDeliveryStaffCode' }, { related: 'deliveryStaffCode' }] },
  [EVENT_TYPES.ORDER_SALES_STAFF_CHANGED]: { recipients: [{ role: 'admin' }, { role: 'accountant' }, { related: 'oldSalesStaffCode' }, { related: 'salesStaffCode' }] },
  [EVENT_TYPES.DELIVERY_CLOSEOUT_ADJUSTED]: { recipients: [{ role: 'admin' }, { role: 'accountant' }, { related: 'deliveryStaffCode' }] },
  [EVENT_TYPES.DELIVERY_CLOSEOUT_LOCKED]: { recipients: [{ role: 'admin' }, { role: 'accountant' }, { related: 'deliveryStaffCode' }] },
  [EVENT_TYPES.DELIVERY_ACCOUNTING_CONFIRMED]: { recipients: [{ role: 'admin' }, { role: 'accountant' }, { related: 'deliveryStaffCode' }] },
  [EVENT_TYPES.AR_RECEIPT_CONFIRMED]: { recipients: [{ role: 'admin' }, { role: 'accountant' }, { related: 'deliveryStaffCode' }, { related: 'salesStaffCode' }] },
  [EVENT_TYPES.AR_LEDGER_CREATED_MANUAL]: { recipients: [{ role: 'admin' }, { role: 'accountant' }] },
  [EVENT_TYPES.AR_LEDGER_REVERSED]: { recipients: [{ role: 'admin' }, { role: 'accountant' }] },
  [EVENT_TYPES.RETURN_ORDER_WAREHOUSE_CHECKED]: { recipients: [{ role: 'admin' }, { role: 'accountant' }] },
  [EVENT_TYPES.RETURN_ORDER_STOCK_IMPORTED]: { recipients: [{ role: 'admin' }, { role: 'accountant' }, { role: 'warehouse' }] },
  [EVENT_TYPES.STOCK_ADJUSTED]: { recipients: [{ role: 'admin' }, { role: 'warehouse' }, { role: 'accountant' }] },
  [EVENT_TYPES.FUND_LEDGER_CREATED]: { recipients: [{ role: 'admin' }, { role: 'accountant' }] },
  [EVENT_TYPES.IMPORT_COMPLETED_WITH_ERRORS]: { recipients: [{ actor: true }, { role: 'admin' }] },
  [EVENT_TYPES.IMPORT_FAILED]: { recipients: [{ actor: true }, { role: 'admin' }] },
  [EVENT_TYPES.USER_ROLE_CHANGED]: { recipients: [{ role: 'admin' }], excludeActor: false },
  [EVENT_TYPES.USER_DISABLED]: { recipients: [{ role: 'admin' }], excludeActor: false }
});

function getRule(eventType = '') {
  return RULES[String(eventType || '').trim().toUpperCase()] || { recipients: [{ role: 'admin' }] };
}

module.exports = { RULES, getRule };
