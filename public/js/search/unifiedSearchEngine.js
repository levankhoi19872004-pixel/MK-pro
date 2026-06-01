/*
 * V45 Unified Search Engine
 * Một lớp trung gian duy nhất cho 4 nhóm tìm kiếm:
 * - searchCustomer()
 * - searchSalesStaff()
 * - searchDeliveryStaff()
 * - searchProduct()
 *
 * Các màn hình nghiệp vụ chỉ gọi file này, không tự filter catalog riêng.
 */
(function () {
  'use strict';

  const MAX_LIMIT = 50;

  function normalizeText(value) {
    return String(value ?? '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .trim();
  }

  function toNumber(value) {
    const n = Number(value || 0);
    return Number.isFinite(n) ? n : 0;
  }

  function normalizeLimit(value, fallback = 20) {
    return Math.min(MAX_LIMIT, Math.max(1, Number(value || fallback)));
  }

  function includesAny(item, keyword, fields) {
    const q = normalizeText(keyword);
    if (!q) return true;
    return (fields || []).some(function (field) {
      return normalizeText(item && item[field]).includes(q);
    });
  }

  function uniqueBy(rows, keys) {
    const map = new Map();
    (rows || []).forEach(function (row) {
      if (!row) return;
      const key = (keys || [])
        .map(function (k) { return String(row[k] || '').trim(); })
        .find(Boolean) || String(row._id || row.id || '').trim();
      if (!key) return;
      map.set(key, { ...(map.get(key) || {}), ...row });
    });
    return Array.from(map.values());
  }

  function getCatalog() {
    const cache = window.CatalogCache || null;
    const productSearch = window.UnifiedProductSearch || null;
    return {
      customers: cache && typeof cache.getCustomers === 'function'
        ? cache.getCustomers()
        : (window.customersCache || window.customers || []),
      products: productSearch && typeof productSearch.getCatalog === 'function'
        ? productSearch.getCatalog()
        : (cache && typeof cache.getProducts === 'function' ? cache.getProducts() : (window.productsCache || window.products || [])),
      staffs: window.staffsCache || window.staffs || [],
      users: window.usersCache || window.users || []
    };
  }

  function staffRoleText(staff) {
    return normalizeText([
      staff && staff.role,
      staff && staff.roleLabel,
      staff && staff.type,
      staff && staff.position,
      staff && staff.title,
      staff && staff.group
    ].filter(Boolean).join(' '));
  }

  function isSalesStaff(staff) {
    if (!staff || staff.isActive === false) return false;
    if (staff.isSalesStaff === true || staff.salesStaff === true) return true;
    const role = staffRoleText(staff);
    return role.includes('sales') || role.includes('nvbh') || role.includes('ban hang') || role === 'admin';
  }

  function isDeliveryStaff(staff) {
    if (!staff || staff.isActive === false) return false;
    if (staff.isDeliveryStaff === true || staff.deliveryStaff === true) return true;
    const role = staffRoleText(staff);
    return role.includes('delivery') || role.includes('nvgh') || role.includes('giao hang') || role === 'admin';
  }

  async function searchCustomer(keyword = '', options = {}) {
    const limit = normalizeLimit(options.limit, 20);
    const q = String(keyword || '').trim();

    if (window.CatalogCache && typeof window.CatalogCache.searchCustomers === 'function') {
      return window.CatalogCache.searchCustomers(q, { limit, mobile: !!options.mobile });
    }

    return uniqueBy(getCatalog().customers, ['code', 'customerCode', 'id'])
      .filter(function (c) { return c.isActive !== false; })
      .filter(function (c) {
        return includesAny(c, q, ['code', 'customerCode', 'name', 'customerName', 'phone', 'address', 'area', 'route', 'staffName']);
      })
      .slice(0, limit);
  }

  function searchSalesStaff(keyword = '', options = {}) {
    const limit = normalizeLimit(options.limit, 20);
    const catalog = getCatalog();
    const rows = uniqueBy([...(catalog.staffs || []), ...(catalog.users || [])], ['code', 'staffCode', 'username', 'id']);
    return rows
      .filter(isSalesStaff)
      .filter(function (s) {
        return includesAny(s, keyword, ['code', 'staffCode', 'username', 'name', 'fullName', 'phone', 'roleLabel', 'role']);
      })
      .slice(0, limit);
  }

  function searchDeliveryStaff(keyword = '', options = {}) {
    const limit = normalizeLimit(options.limit, 20);
    const catalog = getCatalog();
    const rows = uniqueBy([...(catalog.staffs || []), ...(catalog.users || [])], ['code', 'staffCode', 'username', 'id']);
    return rows
      .filter(isDeliveryStaff)
      .filter(function (s) {
        return includesAny(s, keyword, ['code', 'staffCode', 'username', 'name', 'fullName', 'phone', 'roleLabel', 'role']);
      })
      .slice(0, limit);
  }

  async function searchProduct(keyword = '', options = {}) {
    const limit = normalizeLimit(options.limit, 50);
    const q = String(keyword || '').trim();

    if (window.UnifiedProductSearch && typeof window.UnifiedProductSearch.search === 'function') {
      const rows = await window.UnifiedProductSearch.search(q, {
        limit,
        mode: options.mode || 'sales'
      });
      return (rows || [])
        .filter(function (p) { return p.isActive !== false; })
        .filter(function (p) {
          if (!options.inStockOnly) return true;
          const qty = window.UnifiedProductSearch && typeof window.UnifiedProductSearch.availableQty === 'function'
            ? window.UnifiedProductSearch.availableQty(p)
            : toNumber(p.stock || p.totalStock || p.quantity || p.availableQty || p.availableStock);
          return qty > 0;
        })
        .slice(0, limit);
    }

    return uniqueBy(getCatalog().products, ['code', 'productCode', 'sku', 'id'])
      .filter(function (p) { return p.isActive !== false; })
      .filter(function (p) {
        if (!options.inStockOnly) return true;
        return toNumber(p.stock || p.totalStock || p.quantity || p.availableQty || p.availableStock) > 0;
      })
      .filter(function (p) {
        return includesAny(p, q, ['code', 'productCode', 'sku', 'barcode', 'name', 'productName', 'unit', 'baseUnit', 'packing', 'brand', 'category', 'salePrice', 'price']);
      })
      .slice(0, limit);
  }

  window.UnifiedSearchEngine = {
    normalizeText,
    includesAny,
    getCatalog,
    searchCustomer,
    searchSalesStaff,
    searchDeliveryStaff,
    searchProduct
  };
})();
