export const API_URL = window.API_URL || '';

export const STORAGE_KEYS = {
  token: 'v43_mobile_token',
  user: 'v43_mobile_user',
  refreshToken: 'v43_mobile_refresh_token'
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
  deliveryReturn: '/api/mobile/delivery/return',
  deliveryPayment: '/api/mobile/delivery/payment',
  deliveryCustomerDebts: '/api/mobile/delivery/customer-debts',
  cashSubmit: '/api/mobile/cash/submit',
  refresh: '/api/mobile/refresh'
};
