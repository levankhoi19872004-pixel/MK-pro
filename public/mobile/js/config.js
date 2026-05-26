export const API_URL = window.API_URL || '';

export const STORAGE_KEYS = {
  token: 'v43_mobile_token',
  user: 'v43_mobile_user'
};

export const MOBILE_ROUTES = {
  login: '/api/mobile/login',
  me: '/api/mobile/me',
  customers: '/api/mobile/customers',
  products: '/api/mobile/products',
  stock: '/api/mobile/stock',
  salesOrders: '/api/mobile/sales/orders',
  deliveryOrders: '/api/mobile/delivery/orders',
  deliveryConfirm: '/api/mobile/delivery/confirm',
  cashSubmit: '/api/mobile/cash/submit'
};
