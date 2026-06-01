/*
 * V45 Unified Search Engine
 * Nguồn chuẩn:
 * - Khách hàng: customers
 * - Sản phẩm: products + inventories/inventorySnapshots
 * - NVBH: users/staffs role sales
 * - NVGH: users/staffs role delivery
 * - Đơn bán: orders
 * - Đơn tổng: master_orders
 * - Công nợ: AR Ledger (journals)
 *
 * Không màn hình nào tự load toàn bộ catalog để tìm kiếm.
 */
(function () {
  'use strict';

  const MAX_LIMIT = 50;
  const DEFAULT_LIMIT = 20;

  function normalizeText(value) {
    return String(value ?? '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .trim();
  }

  function normalizeLimit(value, fallback = DEFAULT_LIMIT) {
    const n = Number.parseInt(value, 10);
    return Math.min(MAX_LIMIT, Math.max(1, Number.isFinite(n) ? n : fallback));
  }

  function toNumber(value) {
    const n = Number(value || 0);
    return Number.isFinite(n) ? n : 0;
  }

  function includesAny(item, keyword, fields) {
    const q = normalizeText(keyword);
    if (!q) return true;
    return (fields || []).some(function (field) {
      return normalizeText(item && item[field]).includes(q);
    });
  }

  async function requestSearch(path, keyword = '', options = {}) {
    const q = String(keyword || '').trim();
    const minChars = Number(options.minChars || 2);
    if (q.length < minChars) return [];

    const params = new URLSearchParams();
    params.set('q', q);
    params.set('limit', String(normalizeLimit(options.limit, DEFAULT_LIMIT)));
    params.set('activeOnly', options.activeOnly === false ? '0' : '1');

    Object.keys(options || {}).forEach(function (key) {
      if (['limit', 'minChars', 'activeOnly'].includes(key)) return;
      const value = options[key];
      if (value === undefined || value === null || value === '') return;
      params.set(key, String(value));
    });

    const res = await fetch(`/api/search/${path}?${params.toString()}`, {
      headers: { Accept: 'application/json' }
    });
    const json = await res.json().catch(function () { return {}; });
    if (!res.ok || json.ok === false) throw new Error(json.message || 'Không tìm được dữ liệu');
    return json.items || json.products || json.customers || json.users || json.staffs || json.orders || json.masterOrders || json.arLedger || json.debts || [];
  }

  function searchCustomer(keyword = '', options = {}) {
    return requestSearch('customers', keyword, { ...options, limit: normalizeLimit(options.limit, 20) });
  }

  function searchProduct(keyword = '', options = {}) {
    return requestSearch('products', keyword, {
      ...options,
      limit: normalizeLimit(options.limit, 20),
      includeStock: options.includeStock ?? '1',
      inStockOnly: options.inStockOnly ? '1' : ''
    }).then(function (rows) {
      if (!options.inStockOnly) return rows;
      return (rows || []).filter(function (p) {
        return toNumber(p.availableQty || p.availableStock || p.stockQuantity || p.stock || p.quantity || p.openSaleQty) > 0;
      });
    });
  }

  function searchSalesStaff(keyword = '', options = {}) {
    return requestSearch('sales-staff', keyword, { ...options, limit: normalizeLimit(options.limit, 20) });
  }

  function searchDeliveryStaff(keyword = '', options = {}) {
    return requestSearch('delivery-staff', keyword, { ...options, limit: normalizeLimit(options.limit, 20) });
  }

  function searchOrder(keyword = '', options = {}) {
    return requestSearch('orders', keyword, { ...options, limit: normalizeLimit(options.limit, 20) });
  }

  function searchMasterOrder(keyword = '', options = {}) {
    return requestSearch('master-orders', keyword, { ...options, limit: normalizeLimit(options.limit, 20) });
  }

  function searchDebt(keyword = '', options = {}) {
    return requestSearch('ar-ledger', keyword, { ...options, limit: normalizeLimit(options.limit, 20) });
  }

  // Giữ hàm này để frontend cũ không vỡ, nhưng không còn dùng cache làm nguồn tìm kiếm.
  function getCatalog() {
    return { customers: [], products: [], staffs: [], users: [] };
  }

  window.UnifiedSearchEngine = {
    normalizeText,
    includesAny,
    getCatalog,
    searchCustomer,
    searchProduct,
    searchSalesStaff,
    searchDeliveryStaff,
    searchOrder,
    searchMasterOrder,
    searchDebt
  };
})();
