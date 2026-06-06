export const API_URL = window.API_URL || '';

export const STORAGE_KEYS = {
  token: 'v43_mobile_token',
  user: 'v43_mobile_user',
  refreshToken: 'v43_mobile_refresh_token'
};

export const MOBILE_ROUTES = {
  login: '/api/auth/login',
  me: '/api/auth/me',
  customers: '/api/mobile/customers',
  products: '/api/mobile/products',
  stock: '/api/mobile/stock',
  salesOrders: '/api/mobile/sales/orders',
  deliveryOrders: '/api/delivery/orders',
  deliveryConfirm: '/api/delivery/confirm',
  deliveryReturns: '/api/delivery/returns',
  deliveryReturn: '/api/delivery/return',
  deliveryPayment: '/api/delivery/payment',
  deliveryCustomerDebts: '/api/mobile/delivery/customer-debts',
  cashSubmit: '/api/mobile/cash/submit',
  refresh: '/api/auth/refresh'
};
