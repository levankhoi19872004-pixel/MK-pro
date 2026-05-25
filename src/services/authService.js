const crypto = require('crypto');

const SECRET = process.env.AUTH_SECRET || 'KHO_PRO_V43_SECRET';

const ROLES = {
  ADMIN: 'ADMIN',
  ACCOUNTANT: 'ACCOUNTANT',
  WAREHOUSE: 'WAREHOUSE',
  CASHIER: 'CASHIER',
  SALES: 'SALES',
  VIEWER: 'VIEWER'
};

const PERMISSIONS = {
  PRODUCT_READ: 'PRODUCT_READ',
  PRODUCT_WRITE: 'PRODUCT_WRITE',
  WAREHOUSE_RECEIPT_READ: 'WAREHOUSE_RECEIPT_READ',
  WAREHOUSE_RECEIPT_WRITE: 'WAREHOUSE_RECEIPT_WRITE',
  WAREHOUSE_RECEIPT_CONFIRM: 'WAREHOUSE_RECEIPT_CONFIRM',
  STOCK_READ: 'STOCK_READ',
  SALES_ORDER_READ: 'SALES_ORDER_READ',
  SALES_ORDER_WRITE: 'SALES_ORDER_WRITE',
  SALES_ORDER_CONFIRM: 'SALES_ORDER_CONFIRM',
  RECEIVABLE_READ: 'RECEIVABLE_READ',
  RECEIVABLE_WRITE: 'RECEIVABLE_WRITE',
  CASH_READ: 'CASH_READ',
  CASH_WRITE: 'CASH_WRITE',
  REPORT_READ: 'REPORT_READ',
  SEARCH_READ: 'SEARCH_READ',
  DOCUMENT_REVERSE: 'DOCUMENT_REVERSE',
  LOCK_MANAGE: 'LOCK_MANAGE',
  USER_READ: 'USER_READ',
  USER_WRITE: 'USER_WRITE'
};

const ROLE_PERMISSIONS = {
  [ROLES.ADMIN]: Object.values(PERMISSIONS),
  [ROLES.ACCOUNTANT]: [
    PERMISSIONS.PRODUCT_READ,
    PERMISSIONS.WAREHOUSE_RECEIPT_READ,
    PERMISSIONS.STOCK_READ,
    PERMISSIONS.SALES_ORDER_READ,
    PERMISSIONS.RECEIVABLE_READ,
    PERMISSIONS.RECEIVABLE_WRITE,
    PERMISSIONS.CASH_READ,
    PERMISSIONS.REPORT_READ,
    PERMISSIONS.SEARCH_READ,
    PERMISSIONS.DOCUMENT_REVERSE
  ],
  [ROLES.WAREHOUSE]: [
    PERMISSIONS.PRODUCT_READ,
    PERMISSIONS.WAREHOUSE_RECEIPT_READ,
    PERMISSIONS.WAREHOUSE_RECEIPT_WRITE,
    PERMISSIONS.WAREHOUSE_RECEIPT_CONFIRM,
    PERMISSIONS.STOCK_READ,
    PERMISSIONS.SALES_ORDER_READ,
    PERMISSIONS.SEARCH_READ,
    PERMISSIONS.REPORT_READ
  ],
  [ROLES.CASHIER]: [
    PERMISSIONS.RECEIVABLE_READ,
    PERMISSIONS.RECEIVABLE_WRITE,
    PERMISSIONS.CASH_READ,
    PERMISSIONS.CASH_WRITE,
    PERMISSIONS.REPORT_READ,
    PERMISSIONS.SEARCH_READ
  ],
  [ROLES.SALES]: [
    PERMISSIONS.PRODUCT_READ,
    PERMISSIONS.STOCK_READ,
    PERMISSIONS.SALES_ORDER_READ,
    PERMISSIONS.SALES_ORDER_WRITE,
    PERMISSIONS.SEARCH_READ,
    PERMISSIONS.REPORT_READ
  ],
  [ROLES.VIEWER]: [
    PERMISSIONS.PRODUCT_READ,
    PERMISSIONS.STOCK_READ,
    PERMISSIONS.SALES_ORDER_READ,
    PERMISSIONS.RECEIVABLE_READ,
    PERMISSIONS.CASH_READ,
    PERMISSIONS.REPORT_READ,
    PERMISSIONS.SEARCH_READ
  ]
};

function ensureUsers(data) {
  if (!data.users) data.users = [];
  if (!data.users.length) {
    data.users.push({
      id: 'USR_ADMIN',
      username: 'admin',
      password: '123456',
      name: 'Quản trị hệ thống',
      role: ROLES.ADMIN,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }
  return data.users;
}

function normalize(value) {
  return String(value || '').trim();
}

function getRolePermissions(role) {
  return ROLE_PERMISSIONS[role] || [];
}

function getUserPermissions(user) {
  const fromRole = getRolePermissions(user && user.role);
  const extra = Array.isArray(user && user.permissions) ? user.permissions : [];
  const denied = Array.isArray(user && user.deniedPermissions) ? user.deniedPermissions : [];
  return Array.from(new Set([...fromRole, ...extra])).filter(p => !denied.includes(p));
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    isActive: user.isActive !== false,
    permissions: getUserPermissions(user),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

function signToken(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifyToken(token) {
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig) return null;
  const expected = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch (error) {
    return null;
  }
}

function login(data, username, password) {
  const users = ensureUsers(data);
  const user = users.find(u => normalize(u.username).toLowerCase() === normalize(username).toLowerCase());
  if (!user || user.isActive === false || String(user.password) !== String(password)) {
    throw new Error('Sai tài khoản hoặc mật khẩu');
  }

  const safeUser = publicUser(user);
  const token = signToken({
    sub: user.id,
    username: user.username,
    role: user.role,
    permissions: safeUser.permissions,
    iat: Date.now(),
    exp: Date.now() + 1000 * 60 * 60 * 24
  });

  return { token, user: safeUser };
}

function findUserById(data, id) {
  return ensureUsers(data).find(u => String(u.id) === String(id)) || null;
}

function listUsers(data) {
  return ensureUsers(data).map(publicUser);
}

function createUser(data, input = {}) {
  const users = ensureUsers(data);
  const username = normalize(input.username).toLowerCase();
  if (!username) throw new Error('Tên đăng nhập không được để trống');
  if (!input.password) throw new Error('Mật khẩu không được để trống');
  if (users.some(u => normalize(u.username).toLowerCase() === username)) {
    throw new Error(`Tài khoản ${username} đã tồn tại`);
  }
  const now = new Date().toISOString();
  const user = {
    id: input.id || `USR_${Date.now()}`,
    username,
    password: String(input.password),
    name: normalize(input.name || username),
    role: input.role || ROLES.VIEWER,
    permissions: Array.isArray(input.permissions) ? input.permissions : [],
    deniedPermissions: Array.isArray(input.deniedPermissions) ? input.deniedPermissions : [],
    isActive: input.isActive !== false,
    createdAt: now,
    updatedAt: now
  };
  users.push(user);
  return publicUser(user);
}

function updateUser(data, id, input = {}) {
  const user = findUserById(data, id);
  if (!user) throw new Error('Không tìm thấy tài khoản');
  if (input.username && normalize(input.username).toLowerCase() !== normalize(user.username).toLowerCase()) {
    const exists = ensureUsers(data).some(u => String(u.id) !== String(id) && normalize(u.username).toLowerCase() === normalize(input.username).toLowerCase());
    if (exists) throw new Error(`Tài khoản ${input.username} đã tồn tại`);
    user.username = normalize(input.username).toLowerCase();
  }
  if (input.password !== undefined && input.password !== '') user.password = String(input.password);
  if (input.name !== undefined) user.name = normalize(input.name);
  if (input.role !== undefined) user.role = input.role;
  if (Array.isArray(input.permissions)) user.permissions = input.permissions;
  if (Array.isArray(input.deniedPermissions)) user.deniedPermissions = input.deniedPermissions;
  if (input.isActive !== undefined) user.isActive = input.isActive !== false;
  user.updatedAt = new Date().toISOString();
  return publicUser(user);
}

module.exports = {
  ROLES,
  PERMISSIONS,
  ROLE_PERMISSIONS,
  ensureUsers,
  getUserPermissions,
  login,
  verifyToken,
  findUserById,
  listUsers,
  createUser,
  updateUser,
  publicUser
};
