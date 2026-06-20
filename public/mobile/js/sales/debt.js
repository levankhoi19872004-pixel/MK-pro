import { customerAvailableDebtValue, customerDebtValue } from './customer.js';

export function parseMobileMoneyInput(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return 0;
  const multiplier = raw.endsWith('k') ? 1000 : (raw.endsWith('tr') ? 1000000 : 1);
  const cleaned = raw.replace(/tr|k/g, '').replace(/[^0-9,.-]/g, '').replace(/[.,](?=\d{3}(\D|$))/g, '').replace(',', '.');
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.max(0, Math.round(n * multiplier)) : 0;
}

export function debtCustomerKey(item = {}) {
  return String(item.customerId || item.customerCode || item.code || item.id || item._id || item.customerName || '').trim();
}

export function mergeDebtPages(current = [], incoming = []) {
  const map = new Map();
  [...current, ...incoming].forEach((item) => {
    const key = debtCustomerKey(item) || `ROW:${map.size}`;
    const previous = map.get(key);
    map.set(key, previous ? { ...previous, ...item } : item);
  });
  return [...map.values()];
}

export function filterAndSortDebts(items = [], options = {}) {
  const keyword = String(options.keyword || '').trim().toLowerCase();
  const sortMode = String(options.sortMode || 'debt_desc');
  const formatDate = options.formatDate || String;
  const rows = (Array.isArray(items) ? items : [])
    .map((item, originalIndex) => ({ item, originalIndex }))
    .filter(({ item }) => !keyword || [item.customerCode, item.customerName, item.phone, item.customerPhone]
      .some((value) => String(value || '').toLowerCase().includes(keyword)));
  rows.sort((left, right) => {
    const a = left.item;
    const b = right.item;
    if (sortMode === 'available_desc') return customerAvailableDebtValue(b) - customerAvailableDebtValue(a);
    if (sortMode === 'oldest_asc') return formatDate(a.oldestDebtDate || '9999-12-31').localeCompare(formatDate(b.oldestDebtDate || '9999-12-31'));
    return customerDebtValue(b) - customerDebtValue(a);
  });
  return rows;
}
