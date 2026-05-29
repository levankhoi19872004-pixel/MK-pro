import { API_URL, STORAGE_KEYS, MOBILE_ROUTES } from './config.js';

export function getToken() {
  return localStorage.getItem(STORAGE_KEYS.token) || '';
}

export function setToken(token, refreshToken = '') {
  localStorage.setItem(STORAGE_KEYS.token, token);
  if (refreshToken) localStorage.setItem(STORAGE_KEYS.refreshToken, refreshToken);
}

export function getRefreshToken() {
  return localStorage.getItem(STORAGE_KEYS.refreshToken) || '';
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

export async function apiRequest(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers
  });

  let data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== MOBILE_ROUTES.login && path !== MOBILE_ROUTES.refresh && getRefreshToken()) {
    const refreshed = await refreshSession().catch(() => null);
    if (refreshed?.token) {
      return apiRequest(path, options);
    }
  }
  if (res.status === 401) {
    clearToken();
    window.location.href = './login.html';
    throw new Error('Phiên đăng nhập đã hết hạn');
  }
  if (!res.ok || data.ok === false) {
    throw new Error(data.message || 'Có lỗi xảy ra');
  }
  return data;
}

export async function refreshSession() {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;
  const res = await fetch(`${API_URL}${MOBILE_ROUTES.refresh}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    clearToken();
    return null;
  }
  setToken(data.token, data.refreshToken);
  if (data.user) setUser(data.user);
  return data;
}

export const mobileApi = {
  login(payload) {
    return apiRequest(MOBILE_ROUTES.login, { method: 'POST', body: JSON.stringify(payload) });
  },
  me() {
    return apiRequest(MOBILE_ROUTES.me);
  },
  getCustomers(q = '') {
    return apiRequest(`${MOBILE_ROUTES.customers}?q=${encodeURIComponent(q)}`);
  },
  getProducts(q = '') {
    return apiRequest(`${MOBILE_ROUTES.products}?q=${encodeURIComponent(q)}`);
  },
  getStock(q = '') {
    return apiRequest(`${MOBILE_ROUTES.stock}?q=${encodeURIComponent(q)}`);
  },
  createSalesOrder(payload) {
    return apiRequest(MOBILE_ROUTES.salesOrders, { method: 'POST', body: JSON.stringify(payload) });
  },
  getSalesOrder(id) {
    return apiRequest(`${MOBILE_ROUTES.salesOrders}/${encodeURIComponent(id)}`);
  },
  updateSalesOrder(id, payload) {
    return apiRequest(`${MOBILE_ROUTES.salesOrders}/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(payload) });
  },
  getMySalesOrders() {
    return apiRequest(`${MOBILE_ROUTES.salesOrders}?mine=1`);
  },
  getDeliveryOrders(params = {}) {
    const query = new URLSearchParams(params);
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return apiRequest(`${MOBILE_ROUTES.deliveryOrders}${suffix}`);
  },
  confirmDelivery(payload) {
    return apiRequest(MOBILE_ROUTES.deliveryConfirm, { method: 'POST', body: JSON.stringify(payload) });
  },
  createDeliveryReturn(payload) {
    return apiRequest(MOBILE_ROUTES.deliveryReturn, { method: 'POST', body: JSON.stringify(payload) });
  },
  submitCash(payload) {
    return apiRequest(MOBILE_ROUTES.cashSubmit, { method: 'POST', body: JSON.stringify(payload) });
  }
};
