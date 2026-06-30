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
  const common = window.V45Common || {};
  const normalizeText = common.normalizeText;
  const toNumber = common.toNumber;

  'use strict';

  const MAX_LIMIT = 50;
  const DEFAULT_LIMIT = 20;

  

  function normalizeLimit(value, fallback = DEFAULT_LIMIT) {
    const n = Number.parseInt(value, 10);
    return Math.min(MAX_LIMIT, Math.max(1, Number.isFinite(n) ? n : fallback));
  }

  

  function includesAny(item, keyword, fields) {
    const q = normalizeText(keyword);
    if (!q) return true;
    return (fields || []).some(function (field) {
      return normalizeText(item && item[field]).includes(q);
    });
  }
  function suggestionParts(item) {
    return [
      item && item.code,
      item && item.customerCode,
      item && item.productCode,
      item && item.sku,
      item && item.salesStaffCode,
      item && item.salesmanCode,
      item && item.deliveryStaffCode,
      item && item.name,
      item && item.fullName,
      item && item.customerName,
      item && item.productName,
      item && item.phone,
      item && item.mobile
    ].filter(Boolean);
  }

  function normalizeSuggestion(item, fallbackType) {
    if (!item || typeof item !== 'object') return item;
    const code = String(
      item.businessStaffCode ||
      item.code ||
      item.customerCode ||
      item.productCode ||
      item.sku ||
      item.salesStaffCode ||
      item.salesmanCode ||
      item.deliveryStaffCode ||
      item.staffCode ||
      ''
    ).trim();
    const name = String(
      item.businessStaffName ||
      item.name ||
      item.fullName ||
      item.customerName ||
      item.productName ||
      item.displayName ||
      item.salesStaffName ||
      item.salesmanName ||
      item.deliveryStaffName ||
      ''
    ).trim();
    const phone = String(item.phone || item.mobile || item.customerPhone || '').trim();
    const type = item.type || fallbackType || '';
    const aliases = Array.isArray(item.aliases) && item.aliases.length
      ? item.aliases
      : suggestionParts({ ...item, code, name, phone });
    const label = item.label || [code, name, phone].filter(Boolean).join(' - ');
    return {
      ...item,
      type,
      id: String(item.id || item._id || code || '').trim(),
      code,
      name,
      phone,
      label,
      value: item.value || code,
      aliases,
      searchText: item.searchText || normalizeText(aliases.join(' '))
    };
  }

  function normalizeSuggestions(rows, fallbackType) {
    return (Array.isArray(rows) ? rows : []).map(function (item) {
      return normalizeSuggestion(item, fallbackType);
    });
  }


  async function requestSearch(path, keyword = '', options = {}) {
    const q = String(keyword || '').trim();
    const minChars = Number(options.minChars ?? 2);
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
    const rows = json.items || json.data || json.products || json.customers || json.users || json.staffs || json.orders || json.masterOrders || json.arLedger || json.debts || [];
    return normalizeSuggestions(rows, options.type || path);
  }

  function searchCustomer(keyword = '', options = {}) {
    return requestSearch('customers', keyword, {
      type: 'customer',
      minChars: 0,
      allowEmpty: '1',
      showOnFocus: '1',
      ...options,
      limit: normalizeLimit(options.limit, 20)
    });
  }

  function searchProduct(keyword = '', options = {}) {
    return requestSearch('products', keyword, {
      type: 'product',
      ...options,
      limit: normalizeLimit(options.limit, 20),
      includeStock: options.includeStock ?? '1',
      inStockOnly: options.inStockOnly ? '1' : ''
    }).then(function (rows) {
      let result = rows || [];
      if (options.inStockOnly) {
        result = result.filter(function (p) {
          return toNumber(p.availableQty || p.availableStock || p.stockQuantity || p.stock || p.quantity || p.openSaleQty) > 0;
        });
      }
      // Đồng bộ lại cache riêng của UnifiedProductSearch để màn Bán hàng có thể lấy đúng sản phẩm đã chọn.
      // Nếu không sync, ô input đã hiện label nhưng getSelectedSalesProduct() không tìm được trong catalog.
      if (window.UnifiedProductSearch && typeof window.UnifiedProductSearch.sync === 'function') {
        window.UnifiedProductSearch.sync(result);
      }
      return result;
    });
  }

  function searchSalesStaff(keyword = '', options = {}) {
    return requestSearch('sales-staff', keyword, {
      type: 'salesStaff',
      minChars: 0,
      allowEmpty: '1',
      ...options,
      limit: normalizeLimit(options.limit, 20)
    });
  }

  function searchDeliveryStaff(keyword = '', options = {}) {
    return requestSearch('delivery-staff', keyword, {
      type: 'deliveryStaff',
      minChars: 0,
      allowEmpty: '1',
      ...options,
      limit: normalizeLimit(options.limit, 20)
    });
  }

  function searchOrder(keyword = '', options = {}) {
    return requestSearch('orders', keyword, { type: 'order', ...options, limit: normalizeLimit(options.limit, 20) });
  }

  function searchMasterOrder(keyword = '', options = {}) {
    return requestSearch('master-orders', keyword, { type: 'masterOrder', ...options, limit: normalizeLimit(options.limit, 20) });
  }

  function searchDebt(keyword = '', options = {}) {
    return requestSearch('ar-ledger', keyword, { type: 'arLedger', ...options, limit: normalizeLimit(options.limit, 20) });
  }


  function search(options = {}) {
    const type = String(options.type || '').trim();
    const keyword = options.q ?? options.keyword ?? options.search ?? '';
    const rest = { ...options };
    delete rest.type;
    delete rest.q;
    delete rest.keyword;
    delete rest.search;
    if (['customer', 'customers'].includes(type)) return searchCustomer(keyword, rest);
    if (['product', 'products'].includes(type)) return searchProduct(keyword, rest);
    if (['salesStaff', 'sales-staff', 'sales_staff', 'sales'].includes(type)) return searchSalesStaff(keyword, rest);
    if (['deliveryStaff', 'delivery-staff', 'delivery_staff', 'delivery'].includes(type)) return searchDeliveryStaff(keyword, rest);
    if (['order', 'orders'].includes(type)) return searchOrder(keyword, rest);
    if (['masterOrder', 'master-orders', 'master_orders'].includes(type)) return searchMasterOrder(keyword, rest);
    if (['arLedger', 'debt', 'debts'].includes(type)) return searchDebt(keyword, rest);
    return requestSearch(type || 'customers', keyword, rest);
  }

  // Giữ hàm này để frontend cũ không vỡ, nhưng không còn dùng cache làm nguồn tìm kiếm.
  function getCatalog() {
    return { customers: [], products: [], staffs: [], users: [] };
  }

  window.UnifiedSearchEngine = {
    normalizeText,
    includesAny,
    getCatalog,
    search,
    normalizeSuggestion,
    searchCustomer,
    searchProduct,
    searchSalesStaff,
    searchDeliveryStaff,
    searchOrder,
    searchMasterOrder,
    searchDebt
  };
})();
