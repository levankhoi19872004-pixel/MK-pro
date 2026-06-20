export const API_URL = window.API_URL || '';

export const STORAGE_KEYS = {
  token: 'v43_mobile_token',
  user: 'v43_mobile_user',
  refreshToken: 'v43_mobile_refresh_token'
};

export const MOBILE_ROUTES = {
  login: '/api/auth/login',
  me: '/api/auth/me',
  runtimeConfig: '/api/mobile/runtime-config',
  telemetry: '/api/mobile/telemetry',
  customers: '/api/mobile/customers',
  products: '/api/mobile/products',
  productGroups: '/api/mobile/product-groups',
  stock: '/api/mobile/stock',
  salesOrders: '/api/mobile/sales/orders',
  salesDebts: '/api/mobile/debts',
  debtCollections: '/api/mobile/debt-collections',
  deliveryOrders: '/api/delivery/orders',
  deliveryConfirm: '/api/delivery/confirm',
  deliveryReturns: '/api/delivery/returns',
  deliveryReturn: '/api/delivery/return',
  deliveryPayment: '/api/delivery/payment',
  deliveryCustomerDebts: '/api/mobile/delivery/customer-debts',
  cashSubmit: '/api/mobile/cash/submit',
  refresh: '/api/auth/refresh'
};

const runtime = {
  onlineFirst: true,
  offlineQueueEnabled: false,
  legacySyncDrainEnabled: true,
  legacySyncDrainUntil: '',
  clientTelemetryEnabled: true,
  clientTelemetrySampleRate: 1,
  clientTelemetryBatchSize: 20,
  clientTelemetryFlushMs: 60000,
  apiTimeoutMs: Math.max(3000, Number(window.MOBILE_API_TIMEOUT_MS || 15000)),
  commandTimeoutMs: 30000,
  ...(window.MKPRO_MOBILE_RUNTIME || {})
};

function booleanValue(value, fallback = false) {
  if (value === undefined || value === null || value === '') return Boolean(fallback);
  return ['1', 'true', 'yes', 'on', 'enabled'].includes(String(value).trim().toLowerCase());
}

function numberValue(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export function applyMobileRuntimeConfig(input = {}) {
  runtime.onlineFirst = booleanValue(input.onlineFirst, runtime.onlineFirst);
  runtime.offlineQueueEnabled = booleanValue(input.offlineQueueEnabled, false);
  runtime.legacySyncDrainEnabled = booleanValue(input.legacySyncDrainEnabled, runtime.legacySyncDrainEnabled);
  runtime.legacySyncDrainUntil = String(input.legacySyncDrainUntil || '').trim();
  runtime.clientTelemetryEnabled = booleanValue(input.clientTelemetryEnabled, runtime.clientTelemetryEnabled);
  runtime.clientTelemetrySampleRate = numberValue(input.clientTelemetrySampleRate, runtime.clientTelemetrySampleRate, 0, 1);
  runtime.clientTelemetryBatchSize = Math.round(numberValue(input.clientTelemetryBatchSize, runtime.clientTelemetryBatchSize, 5, 50));
  runtime.clientTelemetryFlushMs = Math.round(numberValue(input.clientTelemetryFlushMs, runtime.clientTelemetryFlushMs, 10000, 300000));
  runtime.apiTimeoutMs = Math.round(numberValue(input.apiTimeoutMs, runtime.apiTimeoutMs, 3000, 60000));
  runtime.commandTimeoutMs = Math.round(numberValue(input.commandTimeoutMs, runtime.commandTimeoutMs, 5000, 120000));
  window.MKPRO_MOBILE_RUNTIME = { ...runtime };
  window.dispatchEvent(new CustomEvent('mkpro:mobile-runtime-config', { detail: { ...runtime } }));
  return { ...runtime };
}

export function getMobileRuntimeConfig() {
  return { ...runtime };
}

export function isOfflineQueueEnabled() {
  return runtime.offlineQueueEnabled === true;
}

export function isLegacySyncDrainEnabled() {
  if (!runtime.legacySyncDrainEnabled) return false;
  if (!runtime.legacySyncDrainUntil) return true;
  const expiry = Date.parse(runtime.legacySyncDrainUntil);
  return !Number.isFinite(expiry) || expiry > Date.now();
}
