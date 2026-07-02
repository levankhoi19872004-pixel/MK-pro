/*
 * Configured Autocomplete Binder
 * Gắn toàn bộ autocomplete nghiệp vụ từ SEARCH_FIELD_CONFIGS qua UnifiedSearchEngine.
 */
(function () {
  'use strict';

  function getSuggestElement(rule, propId = 'targetId', propSelector = 'targetSelector') {
    if (!rule) return null;
    if (rule[propId]) return document.getElementById(rule[propId]);
    if (rule[propSelector]) return document.querySelector(rule[propSelector]);
    return null;
  }

  function getGlobalValue(name) {
    try {
      return (0, eval)(name);
    } catch (err) {
      return window[name];
    }
  }

  function callGlobal(name, fallback) {
    const fn = getGlobalValue(name);
    return typeof fn === 'function' ? fn : fallback;
  }

  function fallbackMatchSearch(value, terms) {
    const q = String(value || '').trim().toLowerCase();
    if (!q) return true;
    return (terms || []).some(function (term) {
      return String(term || '').toLowerCase().includes(q);
    });
  }

  function fallbackProductHasStock(item) {
    return Number(item && (item.availableStock || item.stock || item.quantity || item.qty || 0)) > 0;
  }

  function fallbackProductKey(item) {
    return String(item && (item.code || item.productCode || item.sku || item.id || '')).trim();
  }

  function fallbackProductLabel(item) {
    if (!item) return '';
    return [item.code || item.productCode || item.sku, item.name || item.productName, item.barcode].filter(Boolean).join(' - ');
  }

  function fallbackStaffLabel(item) {
    if (!item) return '';
    return [
      item.businessStaffCode || item.staffCode || item.code || item.salesStaffCode || item.salesmanCode || item.deliveryStaffCode || item.shipperCode,
      item.businessStaffName || item.fullName || item.name || item.salesStaffName || item.salesmanName || item.deliveryStaffName || item.shipperName,
      item.phone || item.mobile
    ].filter(Boolean).join(' - ');
  }

  function fallbackCustomerLabel(item) {
    if (!item) return '';
    return [item.code || item.customerCode, item.name || item.customerName, item.phone || item.mobile].filter(Boolean).join(' - ');
  }

  function fallbackDebtCustomerLabel(item) {
    if (!item) return '';
    const debt = Number(item.debtAmount || item.debt || item.availableDebtAmount || 0);
    return [item.customerCode, item.customerName, debt ? debt.toLocaleString('vi-VN') : ''].filter(Boolean).join(' - ');
  }

  function getConfiguredSource(config) {
    const input = getSuggestElement(config, 'inputId', 'inputSelector');
    const q = input ? input.value.trim() : '';

    if (window.UnifiedSearchEngine) {
      const limit = Number(config.limit || 50);
      if (config.type === 'product') {
        const mode = config.key === 'importProduct' ? 'import' : 'sales';
        return window.UnifiedSearchEngine.searchProduct(q, { limit, mode, inStockOnly: config.onlyInStock || mode === 'sales' });
      }
      if (config.type === 'customer') {
        return window.UnifiedSearchEngine.searchCustomer(q, { limit, minChars: 0, allowEmpty: '1', showOnFocus: '1' });
      }
      if (config.type === 'staff') {
        const roles = (config.roles || []).map(function (role) { return String(role).toLowerCase(); });
        const staffOptions = { limit, minChars: 0, allowEmpty: '1', showOnFocus: '1' };
        if (roles.includes('delivery')) return window.UnifiedSearchEngine.searchDeliveryStaff(q, staffOptions);
        return window.UnifiedSearchEngine.searchSalesStaff(q, staffOptions);
      }
    }

    const map = {
      products: getGlobalValue('productsCache'),
      customers: getGlobalValue('customersCache'),
      users: getGlobalValue('usersCache'),
      debts: getGlobalValue('debtsCache')
    };
    let rows = Array.isArray(map[config.source]) ? map[config.source] : [];
    const matchSearch = callGlobal('matchSearch', fallbackMatchSearch);
    const productHasStock = callGlobal('productHasStock', fallbackProductHasStock);

    if (config.onlyActive) rows = rows.filter(function (item) { return item.isActive !== false; });
    if (config.roles && config.roles.length) {
      const roles = config.roles.map(function (role) { return String(role).toLowerCase(); });
      rows = rows.filter(function (item) { return roles.includes(String(item.role || '').toLowerCase()); });
    }
    if (config.onlyInStock) rows = rows.filter(function (item) { return productHasStock(item); });
    if (config.source === 'debts') rows = rows.filter(function (item) { return Number(item.debt || item.debtAmount || 0) > 0; });
    rows = rows.filter(function (item) { return matchSearch(q, (config.searchKeys || []).map(function (key) { return item[key]; })); });
    return rows.slice(0, Number(config.limit || 10));
  }

  function getSuggestValue(item, valueType, config) {
    if (valueType === 'label') return getConfiguredLabel(item, config);
    if (valueType === 'id') return item.id || '';
    if (valueType === 'idOrCode') return callGlobal('getProductKey', fallbackProductKey)(item) || item.id || item.code || '';

    if (valueType === 'businessStaffCode') {
      return item.businessStaffCode ||
        item.staffCode ||
        item.code ||
        item.salesStaffCode ||
        item.salesmanCode ||
        item.deliveryStaffCode ||
        item.shipperCode ||
        '';
    }

    if (valueType === 'businessStaffName') {
      return item.businessStaffName ||
        item.fullName ||
        item.name ||
        item.salesStaffName ||
        item.salesmanName ||
        item.deliveryStaffName ||
        item.shipperName ||
        '';
    }

    if (valueType === 'customerIdOrCode') return item.customerId || item.customerCode || '';
    return item[valueType] ?? '';
  }

  function getConfiguredLabel(item, config) {
    if (!item) return '';
    if (config.type === 'product' && window.UnifiedProductSearch) return window.UnifiedProductSearch.label(item, config.key === 'importProduct' ? 'import' : 'sales');
    if (config.type === 'product') return callGlobal('productSuggestionLabel', fallbackProductLabel)(item);
    if (config.type === 'customer') return callGlobal('customerSuggestionLabel', fallbackCustomerLabel)(item);
    if (config.type === 'staff') return callGlobal('staffSuggestionLabel', fallbackStaffLabel)(item);
    if (config.type === 'debtCustomer') return callGlobal('debtCustomerSuggestionLabel', fallbackDebtCustomerLabel)(item);
    return [item.code, item.name, item.phone].filter(Boolean).join(' - ');
  }

  function runAfterSelect(config, item) {
    if (config.afterSelect === 'reloadProducts' && typeof getGlobalValue('loadProducts') === 'function') getGlobalValue('loadProducts')();
    if (config.afterSelect === 'reloadCustomers' && typeof getGlobalValue('loadCustomers') === 'function') getGlobalValue('loadCustomers')();
    if (config.afterSelect === 'setImportCostPrice' && getGlobalValue('importCostPrice')) getGlobalValue('importCostPrice').value = Number(item.costPrice ?? item.importPrice ?? item.purchasePrice ?? item.lastCostPrice ?? 0);
    if (config.afterSelect === 'setSalesPrice' && getGlobalValue('salesPrice')) getGlobalValue('salesPrice').value = Number(item.salePrice || 0);
    if (config.afterSelect === 'loadDeliveryToday' && typeof getGlobalValue('loadDeliveryToday') === 'function') getGlobalValue('loadDeliveryToday')();
    if (config.afterSelect === 'loadSalesOrders' && typeof getGlobalValue('loadSalesOrders') === 'function') getGlobalValue('loadSalesOrders')();
    if (config.afterSelect === 'loadDebts' && typeof getGlobalValue('loadDebts') === 'function') getGlobalValue('loadDebts')();
    if (config.afterSelect === 'loadUnmergedChildOrders' && typeof getGlobalValue('loadUnmergedChildOrders') === 'function') getGlobalValue('loadUnmergedChildOrders')();
    if (config.afterSelect === 'loadUnmergedReturnOrders' && typeof getGlobalValue('loadUnmergedReturnOrders') === 'function') getGlobalValue('loadUnmergedReturnOrders')();
    if (config.afterSelect === 'setCollectionAmount') {
      const collectionCustomerSelect = getGlobalValue('collectionCustomerSelect');
      const updateSelectedCustomerDebt = getGlobalValue('updateSelectedCustomerDebt');
      if (collectionCustomerSelect) collectionCustomerSelect.dataset.debt = String(item.debt || item.debtAmount || 0);
      if (typeof updateSelectedCustomerDebt === 'function') updateSelectedCustomerDebt();
    }
    if (config.afterSelect === 'setExternalDebtCustomerDefaults') {
      const fn = getGlobalValue('setExternalDebtCustomerDefaults');
      if (typeof fn === 'function') fn(item);
    }
  }

  function applyConfiguredSelect(config, item) {
    (config.fill || []).forEach(function (rule) {
      const target = getSuggestElement(rule);
      if (target) target.value = getSuggestValue(item, rule.value, config);
    });

    const input = getSuggestElement(config, 'inputId', 'inputSelector');
    if (input) {
      const itemCode = String(
        item.businessStaffCode ||
        item.code ||
        item.staffCode ||
        item.customerCode ||
        item.productCode ||
        item.sku ||
        item.salesStaffCode ||
        item.salesmanCode ||
        item.deliveryStaffCode ||
        ''
      ).trim();

      const itemName = String(
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

      const itemId = String(item.id || item._id || itemCode || '').trim();
      const itemType = String(item.type || config.type || '').trim();
      const itemLabel = getConfiguredLabel(item, config);

      input.dataset.selectedId = itemId;
      input.dataset.id = itemId;
      input.dataset.code = itemCode;
      input.dataset.name = itemName;
      input.dataset.type = itemType;
      input.dataset.label = itemLabel;
      input.dataset.selectedLabel = itemLabel;

      const hiddenRule = (config.fill || []).find(function (rule) { return rule.targetId && rule.targetId !== config.inputId; });
      if (hiddenRule) input.dataset.targetHidden = hiddenRule.targetId;
    }

    if (config.key === 'salesProduct' || config.inputId === 'salesProductSearch') {
      window.__selectedSalesProduct = item || null;
      if (window.UnifiedProductSearch && typeof window.UnifiedProductSearch.sync === 'function') window.UnifiedProductSearch.sync([item]);
    }
    if (config.key === 'importProduct' || config.inputId === 'importProductSearch') {
      window.__selectedImportProduct = item || null;
      if (window.UnifiedProductSearch && typeof window.UnifiedProductSearch.sync === 'function') window.UnifiedProductSearch.sync([item]);
    }

    runAfterSelect(config, item);
  }

  function ensureSuggestionBox(config) {
    const input = getSuggestElement(config, 'inputId', 'inputSelector');
    if (!input) return null;
    let box = config.boxId ? document.getElementById(config.boxId) : null;
    if (!box) {
      box = document.createElement('div');
      box.id = `${config.key || input.id || input.name}Suggestions`;
      box.className = 'suggestions';
      box.hidden = true;
      input.insertAdjacentElement('afterend', box);
    }
    return box;
  }

  function bindConfiguredAutocomplete(config) {
    const input = getSuggestElement(config, 'inputId', 'inputSelector');
    const box = ensureSuggestionBox(config);
    if (!input || !box || !window.SearchAutocomplete || typeof window.SearchAutocomplete.wire !== 'function') return;

    const shouldRequireKeyword = ['product', 'debtCustomer'].includes(config.type);

    window.SearchAutocomplete.wire({
      input,
      box,
      getItems: function () { return getConfiguredSource(config); },
      label: function (item) { return getConfiguredLabel(item, config); },
      select: function (item) { return applyConfiguredSelect(config, item); },
      emptyText: config.emptyText || 'Không tìm thấy dữ liệu',
      minChars: Number(config.minChars ?? (shouldRequireKeyword ? 2 : 0))
    });
  }

  function initConfiguredAutocomplete() {
    (window.SEARCH_FIELD_CONFIGS || []).forEach(bindConfiguredAutocomplete);
  }

  window.bindConfiguredAutocomplete = bindConfiguredAutocomplete;
  window.initConfiguredAutocomplete = initConfiguredAutocomplete;

  document.addEventListener('DOMContentLoaded', function () {
    if (typeof window.initConfiguredAutocomplete === 'function') {
      window.initConfiguredAutocomplete();
    }
  });
})();
