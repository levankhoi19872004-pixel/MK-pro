/* Phân quyền giao diện theo vai trò: admin, kế toán, thủ kho, bán hàng, giao hàng, thủ quỹ. */
(function(){
  const ROLE_PERMISSIONS = {
    admin: ['*'], accountant: ['orders:view','debt:*','cash:view','reports:*','print:*'],
    warehouse: ['products:view','inventory:*','receive:*','print:warehouse'],
    sales: ['orders:create','orders:view-own','customers:view','inventory:open-sale'],
    delivery: ['delivery:*','debt:collect-own'], cashier: ['cash:*','debt:view']
  };
  window.KHO_PERMISSION_UI = {
    ROLE_PERMISSIONS,
    can(role, permission){ const list = ROLE_PERMISSIONS[role] || []; return list.includes('*') || list.includes(permission) || list.some(p => p.endsWith(':*') && permission.startsWith(p.replace(':*', ':'))); }
  };
})();
