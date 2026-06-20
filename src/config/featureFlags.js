'use strict';

const TRUTHY = new Set(['1', 'true', 'yes', 'on', 'enabled']);

function readBoolean(name, fallback = false) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || raw === '') return Boolean(fallback);
  return TRUTHY.has(String(raw).trim().toLowerCase());
}

const FLAGS = Object.freeze({
  enterpriseCore: () => readBoolean('ENABLE_ENTERPRISE_CORE', true),
  purchasing: () => readBoolean('ENABLE_PURCHASING', false),
  warehouseAdvanced: () => readBoolean('ENABLE_WAREHOUSE_ADVANCED', false),
  analyticsProjections: () => readBoolean('ENABLE_ANALYTICS_PROJECTIONS', false),
  mobileOfflineSync: () => readBoolean('ENABLE_MOBILE_OFFLINE_SYNC', false),
  mobileOfflineQueue: () => readBoolean('ENABLE_MOBILE_OFFLINE_QUEUE', false),
  mobileLegacySyncDrain: () => readBoolean('ENABLE_MOBILE_LEGACY_SYNC_DRAIN', true),
  fieldOperations: () => readBoolean('ENABLE_FIELD_OPERATIONS', false),
  deliveryPlanning: () => readBoolean('ENABLE_DELIVERY_PLANNING', false),
  integrations: () => readBoolean('ENABLE_INTEGRATIONS', false),
  multiTenant: () => String(process.env.TENANT_MODE || 'single').trim().toLowerCase() === 'multi'
});

function snapshot() {
  return Object.fromEntries(Object.entries(FLAGS).map(([key, getter]) => [key, getter()]));
}

module.exports = { readBoolean, FLAGS, snapshot };
