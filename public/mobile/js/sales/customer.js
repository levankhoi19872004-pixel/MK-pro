export function cleanCustomerText(value, fallback = '') {
  const text = String(value ?? '').trim();
  return text && text !== 'undefined' && text !== 'null' ? text : fallback;
}

export function customerCodeValue(customer = {}) {
  return cleanCustomerText(customer.code || customer.customerCode || customer.customerId || customer.id || '');
}

export function customerNameValue(customer = {}) {
  return cleanCustomerText(customer.name || customer.customerName || customer.fullName || '');
}

export function customerPhoneValue(customer = {}) {
  return cleanCustomerText(
    customer.phone || customer.customerPhone || customer.mobile || customer.tel || customer.telephone || customer.contactPhone || customer.sdt || '',
    'Chưa có SĐT'
  );
}

export function customerAddressValue(customer = {}) {
  return cleanCustomerText(
    customer.address || customer.customerAddress || customer.fullAddress || customer.diaChi || customer.routeAddress || '',
    'Chưa có địa chỉ'
  );
}

export function customerDebtValue(customer = {}) {
  return Number(customer.debtAmount ?? customer.currentDebt ?? customer.debt ?? customer.arDebt ?? 0);
}

export function customerAvailableDebtValue(customer = {}) {
  return Number(customer.availableDebtAmount ?? customer.availableDebt ?? customer.debtAmount ?? customer.debt ?? 0);
}

export function customerPendingCollectedValue(customer = {}) {
  return Number(customer.pendingCollectedAmount ?? customer.pendingCollected ?? 0);
}

export function customerSalesValue(customer = {}) {
  return Number(customer.monthRevenue ?? customer.monthSales ?? customer.salesAmount ?? 0);
}

export function normalizeSelectedCustomerForSubmit(customer = {}) {
  const code = customerCodeValue(customer);
  const name = customerNameValue(customer);
  const id = cleanCustomerText(customer.id || customer._id || customer.customerId || '');
  const phone = cleanCustomerText(customer.phone || customer.customerPhone || customer.mobile || customer.tel || customer.telephone || customer.contactPhone || customer.sdt || '');
  const address = cleanCustomerText(customer.address || customer.customerAddress || customer.fullAddress || customer.diaChi || customer.routeAddress || '');
  return {
    ...customer,
    id,
    customerId: cleanCustomerText(customer.customerId || id || code),
    code,
    customerCode: code,
    name,
    customerName: name,
    phone,
    customerPhone: phone,
    address,
    customerAddress: address
  };
}

export function debtClassName(customer = {}) {
  const debt = customerDebtValue(customer);
  if (debt > 10000000) return 'debt-high';
  if (debt >= 3000000) return 'debt-mid';
  if (debt > 0) return 'debt-low';
  return 'debt-zero';
}

export function uniqueCustomerIdentityKeys(customer = {}) {
  const pairs = [
    ['id', customer.id],
    ['id', customer._id],
    ['id', customer.customerId],
    ['code', customer.code],
    ['code', customer.customerCode]
  ];
  return Array.from(new Set(pairs
    .map(([kind, value]) => [kind, String(value || '').trim().toLowerCase()])
    .filter(([, value]) => Boolean(value))
    .map(([kind, value]) => `${kind}:${value}`)));
}

export function legacyCustomerNameKey(customer = {}) {
  const name = String(customer.name || customer.customerName || '').trim().toLowerCase();
  return name ? `name:${name}` : '';
}

export function buildDebtLookup(rows = []) {
  const map = new Map();
  const legacyNameRows = new Map();
  const ambiguousNames = new Set();
  (Array.isArray(rows) ? rows : []).forEach((item) => {
    const stableKeys = uniqueCustomerIdentityKeys(item);
    stableKeys.forEach((key) => map.set(key, item));
    if (stableKeys.length) return;
    const nameKey = legacyCustomerNameKey(item);
    if (!nameKey) return;
    if (legacyNameRows.has(nameKey)) {
      legacyNameRows.delete(nameKey);
      ambiguousNames.add(nameKey);
    } else if (!ambiguousNames.has(nameKey)) {
      legacyNameRows.set(nameKey, item);
    }
  });
  legacyNameRows.forEach((item, key) => map.set(key, item));
  return map;
}

export function mergeCustomerDebt(customer = {}, debtLookup = new Map()) {
  const stableKeys = uniqueCustomerIdentityKeys(customer);
  let matched = stableKeys.map((key) => debtLookup.get(key)).find(Boolean);
  if (!matched && !stableKeys.length) matched = debtLookup.get(legacyCustomerNameKey(customer));
  if (!matched) return { ...customer, debtAmount: customerDebtValue(customer) };
  return {
    ...customer,
    debtAmount: Number(matched.debtAmount || 0),
    orderCount: Number(matched.orderCount || 0),
    oldestDebtDate: matched.oldestDebtDate || customer.oldestDebtDate || ''
  };
}

export function mergeCustomerPages(current = [], incoming = []) {
  const map = new Map();
  [...current, ...incoming].forEach((customer) => {
    const key = uniqueCustomerIdentityKeys(customer)[0] || `ROW:${map.size}`;
    map.set(key, { ...(map.get(key) || {}), ...customer });
  });
  return [...map.values()];
}
