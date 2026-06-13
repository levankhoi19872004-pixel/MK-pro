'use strict';

// Canonical logical model keys used by backup/reset. Each entry must point to a
// different physical MongoDB collection. Legacy collections remain included
// during migration, but aliases such as stock/inventories, payments/journals
// and cashbook/cashbooks must never appear twice.
const APP_COLLECTION_KEYS = [
  'products',
  'customers',
  'staffs',
  'users',
  'warehouses',
  'suppliers',

  'inventories',
  'stockTransactions',

  'importOrders',
  'salesOrders',
  'masterOrders',
  'returnOrders',
  'masterReturnOrders',

  'arLedgers',
  'receipts',
  'journals',

  'fundLedgers',
  'cashbooks',
  'bankbooks',
  'debtCollections',
  'externalDebtOrders',
  'deliveryCashSubmissions',
  'expenseVouchers',
  'fundTransfers',

  'importLogs',
  'importSessions',
  'importSessionRows',
  'mobileLogs',
  'auditLogs',
  'settings',
  'reconciliationReports',

  'promotions',
  'promotionProductRules',
  'promotionGroupItems',
  'promotionGroupRules',
  'importTemplates',
  'roles',
  'permissions',
  'idempotencyRequests'
];

module.exports = { APP_COLLECTION_KEYS };
