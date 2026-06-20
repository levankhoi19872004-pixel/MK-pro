export function orderStatusFilterValue(element) {
  return String(element?.value || 'all');
}

export function orderMatchesDisplayFilter(order = {}, filter = 'all') {
  if (filter === 'pending_sync') return order.pendingSync === true;
  if (filter === 'editable') return order.pendingSync !== true && order.canEdit === true;
  if (filter === 'locked') return order.pendingSync !== true && order.canEdit !== true;
  return true;
}

export function orderMatchesSearchText(order = {}, keyword = '') {
  const query = String(keyword || '').trim().toLowerCase();
  if (!query) return true;
  return [order.code, order.customerCode, order.customerName].some((value) => String(value || '').toLowerCase().includes(query));
}

export function buildOrderQueryKey({ date = '', q = '' } = {}) {
  return JSON.stringify({ date: String(date || ''), q: String(q || '').trim() });
}

export function mergeOrderPages(current = [], incoming = []) {
  const map = new Map();
  [...current, ...incoming].forEach((order) => {
    const key = String(order.id || order.code || `ROW:${map.size}`);
    map.set(key, { ...(map.get(key) || {}), ...order });
  });
  return [...map.values()];
}

export function normalizeEditableOrder(order = {}) {
  return {
    ...order,
    canEdit: order.canEdit !== false && !order.masterOrderId && !order.masterOrderCode && (order.mergeStatus || 'unmerged') !== 'merged',
    editLockReason: order.editLockReason || ''
  };
}

export function upsertOrder(rows = [], order = {}) {
  if (!order || !(order.id || order.code)) return rows;
  const next = [...rows];
  const normalized = normalizeEditableOrder(order);
  const key = String(order.id || order.code);
  const index = next.findIndex((item) => String(item.id || item.code) === key || String(item.code || '') === String(order.code || ''));
  if (index >= 0) next[index] = { ...next[index], ...normalized };
  else next.unshift(normalized);
  return next;
}
