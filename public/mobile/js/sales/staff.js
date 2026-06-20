export function normalizeSalesStaffToken(value = '') {
  return String(value || '').trim().toLowerCase();
}

export function currentSalesStaffCode(user = {}) {
  return String(
    user.salesStaffCode || user.salesmanCode || user.nvbhCode || user.maNVBH || user.staffCode || user.code || ''
  ).trim();
}

export function orderSalesStaffCode(order = {}) {
  return String(
    order.salesStaffCode || order.salesPersonCode || order.salesmanCode || order.nvbhCode || order.maNVBH || order.salesStaff?.code || ''
  ).trim();
}

export function filterOrdersForCurrentSalesUser(items = [], user = {}) {
  const rows = Array.isArray(items) ? items : [];
  if (String(user.role || '') !== 'sales') return rows;
  const code = normalizeSalesStaffToken(currentSalesStaffCode(user));
  if (!code) return [];
  return rows.filter((order) => normalizeSalesStaffToken(orderSalesStaffCode(order)) === code);
}
