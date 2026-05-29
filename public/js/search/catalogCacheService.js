/*
 * Phase 3.5 - Catalog Cache Service
 * Nạp catalog sản phẩm/khách hàng một lần, dùng chung cho bảng danh mục và autocomplete.
 */
(function(){
  'use strict';

  const TTL = 5 * 60 * 1000;
  const state = {
    products: [],
    customers: [],
    productLoadedAt: 0,
    customerLoadedAt: 0,
    productPromise: null,
    customerPromise: null
  };

  function normalizeText(value){
    return String(value ?? '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g,'')
      .replace(/đ/g,'d')
      .trim();
  }

  function dedupe(rows, keys){
    const map = new Map();
    (rows || []).forEach(row => {
      if(!row) return;
      const key = keys.map(k => String(row[k] || '').trim()).find(Boolean) || String(row._id || row.id || '').trim();
      if(!key) return;
      map.set(key, { ...(map.get(key) || {}), ...row });
    });
    return [...map.values()];
  }

  function syncGlobals(type, rows){
    try{
      if(type === 'products'){
        if(typeof productsCache !== 'undefined') productsCache = rows;
        if(typeof salesProductsCache !== 'undefined') salesProductsCache = rows;
        if(window.UnifiedProductSearch && typeof window.UnifiedProductSearch.sync === 'function') window.UnifiedProductSearch.sync(rows);
      }
      if(type === 'customers'){
        if(typeof customersCache !== 'undefined') customersCache = rows;
      }
    }catch(err){
      console.warn('CatalogCache syncGlobals:', err.message || err);
    }
  }

  function endpoint(type){
    const custom = window.CATALOG_CACHE_ENDPOINTS || {};
    if(type === 'products') return custom.products || '/api/products?all=true';
    if(type === 'customers') return custom.customers || '/api/customers?all=true';
    return '';
  }

  function authHeaders(){
    const token = localStorage.getItem('v43_mobile_token') || localStorage.getItem('mobile_token') || '';
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async function fetchJson(url){
    const res = await fetch(`${url}${url.includes('?') ? '&' : '?'}_t=${Date.now()}`, { headers: authHeaders() });
    const json = await res.json();
    if(!json.ok) throw new Error(json.message || 'Không tải được catalog');
    return json;
  }

  async function preloadProducts(options = {}){
    const force = options.force === true;
    const maxAgeMs = Number(options.maxAgeMs || TTL);
    if(!force && state.products.length && Date.now() - state.productLoadedAt < maxAgeMs) return state.products;
    if(state.productPromise && !force) return state.productPromise;

    state.productPromise = fetchJson(endpoint('products'))
      .then(json => {
        state.products = dedupe(json.products || json.items || [], ['code','productCode','sku','id']);
        state.productLoadedAt = Date.now();
        syncGlobals('products', state.products);
        return state.products;
      })
      .finally(() => { state.productPromise = null; });
    return state.productPromise;
  }

  async function preloadCustomers(options = {}){
    const force = options.force === true;
    const maxAgeMs = Number(options.maxAgeMs || TTL);
    if(!force && state.customers.length && Date.now() - state.customerLoadedAt < maxAgeMs) return state.customers;
    if(state.customerPromise && !force) return state.customerPromise;

    state.customerPromise = fetchJson(endpoint('customers'))
      .then(json => {
        state.customers = dedupe(json.customers || json.items || [], ['code','customerCode','id']);
        state.customerLoadedAt = Date.now();
        syncGlobals('customers', state.customers);
        return state.customers;
      })
      .finally(() => { state.customerPromise = null; });
    return state.customerPromise;
  }

  function getProducts(){
    return state.products.slice();
  }

  function getCustomers(){
    return state.customers.slice();
  }

  function match(row, keyword, fields){
    const q = normalizeText(keyword);
    if(!q) return true;
    return fields.some(field => normalizeText(row?.[field]).includes(q));
  }

  function searchProducts(keyword = '', options = {}){
    const limit = Math.max(1, Number(options.limit || 50));
    return state.products
      .filter(p => p.isActive !== false)
      .filter(p => match(p, keyword, ['code','productCode','sku','barcode','name','productName','category','brand','packing','unit','baseUnit']))
      .slice(0, limit);
  }

  function searchCustomers(keyword = '', options = {}){
    const limit = Math.max(1, Number(options.limit || 50));
    return state.customers
      .filter(c => c.isActive !== false)
      .filter(c => match(c, keyword, ['code','customerCode','name','customerName','phone','address','area','route','staffCode','staffName']))
      .slice(0, limit);
  }

  async function preloadAll(options = {}){
    const [products, customers] = await Promise.all([
      preloadProducts(options),
      preloadCustomers(options)
    ]);
    return { products, customers };
  }

  function invalidate(type){
    if(!type || type === 'products'){
      state.products = [];
      state.productLoadedAt = 0;
    }
    if(!type || type === 'customers'){
      state.customers = [];
      state.customerLoadedAt = 0;
    }
  }

  window.CatalogCache = {
    normalizeText,
    preloadProducts,
    preloadCustomers,
    preloadAll,
    getProducts,
    getCustomers,
    searchProducts,
    searchCustomers,
    invalidate,
    syncProducts: rows => { state.products = dedupe(rows || [], ['code','productCode','sku','id']); syncGlobals('products', state.products); return state.products; },
    syncCustomers: rows => { state.customers = dedupe(rows || [], ['code','customerCode','id']); syncGlobals('customers', state.customers); return state.customers; }
  };
})();
