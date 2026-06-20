import { API_URL, STORAGE_KEYS, MOBILE_ROUTES, applyMobileRuntimeConfig, getMobileRuntimeConfig } from './config.js?v=phase86-production-hardening-v1';

const DEFAULT_TIMEOUT_MS = 15000;
const MAX_TELEMETRY_ROWS = 100;
const activeRequestControllers = new Map();
const telemetryRows = [];
const pendingTelemetryRows = [];
let telemetryFlushTimer = null;
let telemetryFlushInFlight = null;
let telemetrySampled = true;

function defaultTimeoutMs() {
  return Math.max(3000, Number(getMobileRuntimeConfig().apiTimeoutMs || window.MOBILE_API_TIMEOUT_MS || DEFAULT_TIMEOUT_MS));
}

function sanitizeTelemetryPath(value = '') {
  const raw = String(value || '').split('?')[0].split('#')[0];
  return raw.startsWith('/api/') ? raw : '';
}

function connectionSnapshot() {
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection || {};
  return {
    networkType: navigator.onLine ? 'online' : 'offline',
    effectiveType: String(connection.effectiveType || '')
  };
}

export function getToken() {
  return '';
}

export function setToken() {
  localStorage.removeItem(STORAGE_KEYS.token);
  localStorage.removeItem(STORAGE_KEYS.refreshToken);
}

export function getRefreshToken() {
  return '';
}

export function clearToken() {
  localStorage.removeItem(STORAGE_KEYS.token);
  localStorage.removeItem(STORAGE_KEYS.refreshToken);
  localStorage.removeItem(STORAGE_KEYS.user);
}

export function setUser(user) {
  localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(user || {}));
}

export function getUser() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.user) || '{}');
  } catch {
    return {};
  }
}

function makeClientRequestId(prefix = 'mobile') {
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}:${Date.now()}:${random}`;
}

function withClientRequestId(payload = {}, prefix = 'mobile') {
  if (!payload || typeof payload !== 'object') return { idempotencyKey: makeClientRequestId(prefix) };
  return { ...payload, idempotencyKey: payload.idempotencyKey || payload.requestId || payload.clientRequestId || makeClientRequestId(prefix) };
}

function scheduleTelemetryFlush() {
  const config = getMobileRuntimeConfig();
  if (!config.clientTelemetryEnabled || !telemetrySampled || telemetryFlushTimer) return;
  telemetryFlushTimer = window.setTimeout(() => {
    telemetryFlushTimer = null;
    void flushMobileApiTelemetry();
  }, config.clientTelemetryFlushMs);
}

function recordTelemetry(row = {}) {
  const normalized = { at: new Date().toISOString(), ...row, path: sanitizeTelemetryPath(row.path) };
  telemetryRows.push(normalized);
  while (telemetryRows.length > MAX_TELEMETRY_ROWS) telemetryRows.shift();
  const config = getMobileRuntimeConfig();
  if (normalized.path && config.clientTelemetryEnabled && telemetrySampled && normalized.path !== MOBILE_ROUTES.telemetry) {
    pendingTelemetryRows.push(normalized);
    while (pendingTelemetryRows.length > MAX_TELEMETRY_ROWS) pendingTelemetryRows.shift();
    if (pendingTelemetryRows.length >= config.clientTelemetryBatchSize) void flushMobileApiTelemetry();
    else scheduleTelemetryFlush();
  }
  window.dispatchEvent(new CustomEvent('mkpro:mobile-api-perf', { detail: normalized }));
}

export async function flushMobileApiTelemetry() {
  if (telemetryFlushInFlight) return telemetryFlushInFlight;
  const config = getMobileRuntimeConfig();
  if (!config.clientTelemetryEnabled || !telemetrySampled || !pendingTelemetryRows.length) return { skipped: true };
  const events = pendingTelemetryRows.splice(0, Math.min(config.clientTelemetryBatchSize, pendingTelemetryRows.length));
  const connection = connectionSnapshot();
  telemetryFlushInFlight = fetch(`${API_URL}${MOBILE_ROUTES.telemetry}`, {
    method: 'POST',
    credentials: 'include',
    keepalive: true,
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
    body: JSON.stringify({
      appVersion: 'phase86-production-hardening-v1',
      deviceId: localStorage.getItem('mkpro_mobile_device_id') || '',
      ...connection,
      events
    })
  }).then(async (response) => {
    if (!response.ok) throw new Error(`Telemetry HTTP ${response.status}`);
    return response.json().catch(() => ({ ok: true }));
  }).catch(() => {
    pendingTelemetryRows.unshift(...events);
    while (pendingTelemetryRows.length > MAX_TELEMETRY_ROWS) pendingTelemetryRows.pop();
    return { ok: false };
  }).finally(() => {
    telemetryFlushInFlight = null;
    scheduleTelemetryFlush();
  });
  return telemetryFlushInFlight;
}

export async function loadMobileRuntimeConfig() {
  const data = await apiRequest(MOBILE_ROUTES.runtimeConfig, {
    requestKey: 'mobile-runtime-config',
    cancelPrevious: true,
    timeoutMs: 5000,
    skipTelemetry: true
  });
  const config = applyMobileRuntimeConfig(data.config || {});
  telemetrySampled = Math.random() <= Number(config.clientTelemetrySampleRate || 0);
  if (config.clientTelemetryEnabled && telemetrySampled) scheduleTelemetryFlush();
  return config;
}

export function getMobileApiTelemetry() {
  return telemetryRows.slice();
}

function createRequestAbortContext(options = {}, path = '') {
  const controller = new AbortController();
  const requestKey = String(options.requestKey || '').trim();
  const cancelPrevious = options.cancelPrevious === true && requestKey;
  const timeoutMs = Math.max(0, Number(options.timeoutMs ?? defaultTimeoutMs()));
  let timedOut = false;

  if (cancelPrevious) {
    activeRequestControllers.get(requestKey)?.abort('superseded');
    activeRequestControllers.set(requestKey, controller);
  }

  const externalSignal = options.signal;
  const onExternalAbort = () => controller.abort(externalSignal.reason || 'external-abort');
  if (externalSignal) {
    if (externalSignal.aborted) onExternalAbort();
    else externalSignal.addEventListener('abort', onExternalAbort, { once: true });
  }

  const timer = timeoutMs > 0
    ? window.setTimeout(() => {
      timedOut = true;
      controller.abort('timeout');
    }, timeoutMs)
    : null;

  return {
    signal: controller.signal,
    requestKey,
    timedOut: () => timedOut,
    cleanup() {
      if (timer) window.clearTimeout(timer);
      if (externalSignal) externalSignal.removeEventListener('abort', onExternalAbort);
      if (requestKey && activeRequestControllers.get(requestKey) === controller) activeRequestControllers.delete(requestKey);
    }
  };
}

function normalizeRequestError(error, abortContext) {
  if (error?.name !== 'AbortError') return error;
  const next = new Error(abortContext.timedOut() ? 'Yêu cầu quá thời gian chờ. Vui lòng thử lại.' : 'Yêu cầu trước đã được thay thế.');
  next.name = 'AbortError';
  next.code = abortContext.timedOut() ? 'REQUEST_TIMEOUT' : 'REQUEST_ABORTED';
  return next;
}

export async function apiRequest(path, options = {}) {
  const requestOptions = { ...options };
  const authRetried = Boolean(requestOptions.__authRetried);
  delete requestOptions.__authRetried;
  delete requestOptions.timeoutMs;
  delete requestOptions.requestKey;
  delete requestOptions.cancelPrevious;
  delete requestOptions.clientRequestId;
  delete requestOptions.skipTelemetry;

  const clientRequestId = String(options.clientRequestId || makeClientRequestId('api'));
  const headers = {
    'Content-Type': 'application/json',
    'X-Client-Request-Id': clientRequestId,
    ...(requestOptions.headers || {})
  };
  const abortContext = createRequestAbortContext(options, path);
  const clientStartedAt = performance.now();

  try {
    const res = await fetch(`${API_URL}${path}`, {
      ...requestOptions,
      credentials: requestOptions.credentials || 'include',
      headers,
      signal: abortContext.signal
    });
    const clientMs = Math.round(performance.now() - clientStartedAt);
    const data = await res.json().catch(() => ({}));
    const serverMs = Number(data.serverMs || data.ms || res.headers.get('X-Response-Time-Ms') || 0);
    data.__clientPerf = { path, clientMs, serverMs, perf: data.perf || null, status: res.status, requestId: clientRequestId };

    if (res.status === 401 && path !== MOBILE_ROUTES.login && path !== MOBILE_ROUTES.refresh && !authRetried) {
      const refreshed = await refreshSession().catch(() => null);
      if (refreshed?.token) return apiRequest(path, { ...options, __authRetried: true });
    }
    if (res.status === 401) {
      clearToken();
      window.location.href = './login.html';
      throw new Error('Phiên đăng nhập đã hết hạn');
    }
    if (!res.ok || data.ok === false) {
      const error = new Error(data.message || 'Có lỗi xảy ra');
      error.status = res.status;
      error.code = data.code || '';
      if (!options.skipTelemetry) {
        recordTelemetry({ ...data.__clientPerf, errorCode: error.code || `HTTP_${res.status}` });
        error.__telemetryRecorded = true;
      }
      throw error;
    }
    if (!options.skipTelemetry) recordTelemetry(data.__clientPerf);
    return data;
  } catch (error) {
    const normalized = normalizeRequestError(error, abortContext);
    if (!options.skipTelemetry && !normalized.__telemetryRecorded) recordTelemetry({
      path,
      clientMs: Math.round(performance.now() - clientStartedAt),
      serverMs: 0,
      status: normalized.status || 0,
      requestId: clientRequestId,
      errorCode: normalized.code || normalized.name || 'ERROR'
    });
    throw normalized;
  } finally {
    abortContext.cleanup();
  }
}

export async function refreshSession() {
  const res = await fetch(`${API_URL}${MOBILE_ROUTES.refresh}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: '{}'
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    clearToken();
    return null;
  }
  setToken(data.token);
  if (data.user) setUser(data.user);
  return data;
}

function appendPageOptions(query, options = {}) {
  if (options.page) query.set('page', String(options.page));
  if (options.limit) query.set('limit', String(options.limit));
}

export const mobileApi = {
  login(payload) {
    return apiRequest(MOBILE_ROUTES.login, { method: 'POST', body: JSON.stringify(payload), timeoutMs: 15000 });
  },
  me() {
    return apiRequest(MOBILE_ROUTES.me);
  },
  getRuntimeConfig() {
    return loadMobileRuntimeConfig();
  },
  getCustomers(q = '', options = {}) {
    const query = new URLSearchParams();
    if (q) query.set('q', q);
    appendPageOptions(query, options);
    if (options.all) query.set('all', '1');
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return apiRequest(`${MOBILE_ROUTES.customers}${suffix}`, {
      requestKey: options.requestKey || 'mobile-customers',
      cancelPrevious: options.cancelPrevious !== false,
      timeoutMs: options.timeoutMs
    });
  },
  getProductGroups(options = {}) {
    return apiRequest(MOBILE_ROUTES.productGroups, {
      requestKey: 'mobile-product-groups',
      cancelPrevious: true,
      timeoutMs: options.timeoutMs
    });
  },
  getProducts(q = '', options = {}) {
    const query = new URLSearchParams();
    if (q) query.set('q', q);
    appendPageOptions(query, options);
    if (options.all) query.set('all', '1');
    const groupValue = options.group || options.groupName || options.category || options.categoryName || options.productGroup || options.productGroupName || '';
    if (groupValue) query.set('group', String(groupValue));
    if (options.inStockOnly !== undefined) query.set('inStockOnly', String(options.inStockOnly));
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return apiRequest(`${MOBILE_ROUTES.products}${suffix}`, {
      requestKey: options.requestKey || 'mobile-products',
      cancelPrevious: options.cancelPrevious !== false,
      timeoutMs: options.timeoutMs
    });
  },
  calculatePromotions(payload = {}) {
    return apiRequest('/api/promotions/calculate', { method: 'POST', body: JSON.stringify(payload) });
  },
  getStock(q = '') {
    return apiRequest(`${MOBILE_ROUTES.stock}?q=${encodeURIComponent(q)}`, { requestKey: `mobile-stock:${q}`, cancelPrevious: true });
  },
  createSalesOrder(payload) {
    return apiRequest(MOBILE_ROUTES.salesOrders, { method: 'POST', body: JSON.stringify(withClientRequestId(payload, 'sales-create')), timeoutMs: getMobileRuntimeConfig().commandTimeoutMs });
  },
  getSalesOrder(id) {
    return apiRequest(`${MOBILE_ROUTES.salesOrders}/${encodeURIComponent(id)}`);
  },
  updateSalesOrder(id, payload) {
    return apiRequest(`${MOBILE_ROUTES.salesOrders}/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(withClientRequestId(payload, 'sales-update')), timeoutMs: getMobileRuntimeConfig().commandTimeoutMs });
  },
  deleteSalesOrder(id) {
    return apiRequest(`${MOBILE_ROUTES.salesOrders}/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },
  getMySalesOrders(options = {}) {
    const query = new URLSearchParams({ mine: '1' });
    appendPageOptions(query, options);
    if (options.date) query.set('date', options.date);
    if (options.q) query.set('q', options.q);
    return apiRequest(`${MOBILE_ROUTES.salesOrders}?${query.toString()}`, {
      requestKey: options.requestKey || 'mobile-sales-orders',
      cancelPrevious: options.cancelPrevious !== false,
      timeoutMs: options.timeoutMs
    });
  },
  getSalesDebts(params = {}) {
    const query = new URLSearchParams();
    const requestOptionKeys = new Set(['requestKey', 'cancelPrevious', 'timeoutMs', 'signal', 'clientRequestId']);
    Object.entries(params || {}).forEach(([key, value]) => {
      if (requestOptionKeys.has(key)) return;
      if (value !== undefined && value !== null && value !== '') query.set(key, String(value));
    });
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return apiRequest(`${MOBILE_ROUTES.salesDebts}${suffix}`, {
      requestKey: params.requestKey || 'mobile-sales-debts',
      cancelPrevious: params.cancelPrevious !== false,
      timeoutMs: params.timeoutMs
    });
  },
  submitDebtCollection(payload = {}) {
    return apiRequest(MOBILE_ROUTES.debtCollections || '/api/mobile/debt-collections', { method: 'POST', body: JSON.stringify(withClientRequestId(payload, 'debt-collection')), timeoutMs: getMobileRuntimeConfig().commandTimeoutMs });
  },
  getDeliveryOrders(params = {}) {
    const query = new URLSearchParams(params);
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return apiRequest(`${MOBILE_ROUTES.deliveryOrders}${suffix}`);
  },
  confirmDelivery(payload) {
    return apiRequest(MOBILE_ROUTES.deliveryConfirm, { method: 'POST', body: JSON.stringify(withClientRequestId(payload, 'delivery-confirm')) });
  },
  getDeliveryReturns(params = {}) {
    const query = new URLSearchParams(params);
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return apiRequest(`${MOBILE_ROUTES.deliveryReturns || '/api/delivery/returns'}${suffix}`);
  },
  createDeliveryReturn(payload) {
    return apiRequest(MOBILE_ROUTES.deliveryReturn, { method: 'POST', body: JSON.stringify(withClientRequestId(payload, 'delivery-return')) });
  },
  submitDeliveryPayment(payload) {
    return apiRequest(MOBILE_ROUTES.deliveryPayment || MOBILE_ROUTES.deliveryConfirm, { method: 'POST', body: JSON.stringify(withClientRequestId(payload, 'delivery-payment')) });
  },
  getDeliveryCustomerDebts(params = {}) {
    const query = new URLSearchParams(params);
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return apiRequest(`${MOBILE_ROUTES.deliveryCustomerDebts}${suffix}`);
  },
  submitCash(payload) {
    return apiRequest(MOBILE_ROUTES.cashSubmit, { method: 'POST', body: JSON.stringify(withClientRequestId(payload, 'cash-submit')) });
  }
};

window.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') void flushMobileApiTelemetry();
});
window.addEventListener('pagehide', () => { void flushMobileApiTelemetry(); });
