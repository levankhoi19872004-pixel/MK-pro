function defaultData() {
  return {
    products: [],
    orders: [],
    customers: [],
    customerGroups: [],
    staff: [],
    deliveryStaff: [],
    users: [],
    receipts: [],
    masterOrders: [],
    debts: [],
    payments: [],
    promotions: [],
    productPromotions: [],
    groupPromotions: [],
    customerGroupPromotions: [],
    productGroups: [],
    categoryGroups: [],
    shortageReports: [],
    returns: [],
    deliveryReports: [],
    dmsStocks: [],
    dmsAllocations: [],
    dmsHistory: [],
    dmsAllowSales: [],
    cashFunds: []
  };
}

function normalizeData(data) {
  const base = defaultData();
  const src = data && typeof data === 'object' ? data : {};

  Object.keys(base).forEach(key => {
    base[key] = Array.isArray(src[key]) ? src[key] : [];
  });

  return base;
}

module.exports = { defaultData, normalizeData };
