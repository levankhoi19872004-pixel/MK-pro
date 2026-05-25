const ROLE_DEFINITIONS = {
  admin: {
    label: 'Quản trị',
    pages: '*',
    permissions: ['*']
  },
  manager: {
    label: 'Quản lý',
    pages: '*',
    permissions: ['data:view','data:save','order:*','master:*','customer:*','product:*','stock:*','receive:*','promotion:*','debt:*','fund:*','report:view','import:*','print:*']
  },
  sales: {
    label: 'Bán hàng',
    pages: ['dashboard','salesApp','orders','customers','stock','reports'],
    permissions: ['data:view','data:save','order:view','order:create','customer:view','stock:view','report:view','salesApp:use']
  },
  delivery: {
    label: 'Giao hàng',
    pages: ['dashboard','deliveryApp','masterOrders','debts','reports'],
    permissions: ['data:view','data:save','master:view','deliveryApp:use','delivery:complete','debt:view','debt:collect','report:view']
  },
  accountant: {
    label: 'Kế toán',
    pages: ['dashboard','orders','dmsOrders','customers','debts','cashFund','reports','receive','stock','products','promotions'],
    permissions: ['data:view','data:save','order:*','customer:*','debt:*','fund:*','receive:*','stock:*','product:view','promotion:view','report:view','import:*','print:*']
  },
  cashier: {
    label: 'Thủ quỹ',
    pages: ['dashboard','cashFund','debts','reports'],
    permissions: ['data:view','data:save','fund:*','debt:view','debt:collect','report:view']
  }
};

function normalizeRole(role){
  return String(role || 'sales').trim().toLowerCase();
}
function roleDef(role){
  return ROLE_DEFINITIONS[normalizeRole(role)] || ROLE_DEFINITIONS.sales;
}
function isAdmin(user){
  return normalizeRole(user && user.role) === 'admin' || normalizeRole(user && user.username) === 'admin';
}
function matchPermission(owned, permission){
  if (!owned) return false;
  if (owned === '*' || owned === permission) return true;
  if (owned.endsWith(':*')) return permission.startsWith(owned.slice(0, -1));
  return false;
}
function hasPermission(user, permission){
  if (isAdmin(user)) return true;
  const permissions = Array.isArray(user && user.permissions) && user.permissions.length ? user.permissions : roleDef(user && user.role).permissions;
  return permissions.some(p => matchPermission(p, permission));
}
function allowedPages(user){
  if (isAdmin(user)) return '*';
  return roleDef(user && user.role).pages;
}
function canOpenPage(user, page){
  const pages = allowedPages(user);
  return pages === '*' || pages.includes(page);
}
function publicProfile(user){
  const role = normalizeRole(user && user.role);
  const def = roleDef(role);
  return {
    id: user && (user.id || user._id),
    username: user && user.username,
    name: user && user.name,
    code: user && user.code,
    role,
    roleLabel: def.label,
    pages: isAdmin(user) ? '*' : def.pages,
    permissions: isAdmin(user) ? ['*'] : def.permissions
  };
}

module.exports = { ROLE_DEFINITIONS, normalizeRole, roleDef, isAdmin, hasPermission, allowedPages, canOpenPage, publicProfile };
