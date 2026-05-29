/*
 * Phase 3.6 - Catalog Lazy Search Service
 * Không preload toàn bộ catalog. Gõ đến đâu gọi server tìm đến đó, trả tối đa 50 kết quả,
 * cache theo từ khóa để lần gõ lại không gọi API nữa.
 */
(function(){
  'use strict';

  const TTL = 5 * 60 * 1000;
  const MAX_LIMIT = 50;
  const state = {
    products: [],
    customers: [],
    productLoadedAt: 0,
    customerLoadedAt: 0,
    productSearchCache: new Map(),
    customerSearchCache: new Map(),
    pending: new Map()
  };

  function normalizeText(value){
    return String(value ?? '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g,'')
      .replace(/đ/g,'d')
      .trim();
  }

  function toNumber(value){
    const n = Number(value || 0);
    return Number.isFinite(n) ? n : 0;
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

  function endpoint(type){
    const custom = window.CATALOG_CACHE_ENDPOINTS || {};
    if(type === 'products') return custom.productSearch || custom.productsSearch || '/api/catalog/products/search';
    if(type === 'customers') return custom.customerSearch || custom.customersSearch || '/api/catalog/customers/search';
    return '';
  }

  function listEndpoint(type){
    const custom = window.CATALOG_CACHE_ENDPOINTS || {};
    if(type === 'products') return custom.productsList || custom.products || '/api/products';
    if(type === 'customers') return custom.customersList || custom.customers || '/api/customers';
    return '';
  }

  function authHeaders(){
    const token = localStorage.getItem('v43_mobile_token') || localStorage.getItem('mobile_token') || '';
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async function fetchJson(url){
    const sep = url.includes('?') ? '&' : '?';
    const res = await fetch(`${url}${sep}_t=${Date.now()}`, { headers: authHeaders() });
    const json = await res.json();
    if(!json.ok) throw new Error(json.message || 'Không tải được dữ liệu');
    return json;
  }

  function cacheKey(keyword, options = {}){
    const q = normalizeText(keyword || '');
    const limit = Math.min(MAX_LIMIT, Math.max(1, Number(options.limit || MAX_LIMIT)));
    const extra = options.mobile ? 'mobile' : '';
    return `${q}|${limit}|${extra}`;
  }

  function getCached(map, key){
    const item = map.get(key);
    if(!item) return null;
    if(Date.now() - item.at > TTL){
      map.delete(key);
      return null;
    }
    return item.rows.slice();
  }

  function setCached(map, key, rows){
    map.set(key, { at: Date.now(), rows: rows || [] });
  }

  function syncGlobals(type, rows){
    try{
      if(type === 'products'){
        const merged = dedupe([...(state.products || []), ...(rows || [])], ['code','productCode','sku','id']);
        state.products = merged;
        if(typeof productsCache !== 'undefined') productsCache = merged;
        if(typeof salesProductsCache !== 'undefined') salesProductsCache = merged;
        if(window.UnifiedProductSearch && typeof window.UnifiedProductSearch.sync === 'function') window.UnifiedProductSearch.sync(rows || []);
      }
      if(type === 'customers'){
        const merged = dedupe([...(state.customers || []), ...(rows || [])], ['code','customerCode','id']);
        state.customers = merged;
        if(typeof customersCache !== 'undefined') customersCache = merged;
      }
    }catch(err){
      console.warn('CatalogLazyCache syncGlobals:', err.message || err);
    }
  }

  async function searchProducts(keyword = '', options = {}){
    const limit = Math.min(MAX_LIMIT, Math.max(1, Number(options.limit || MAX_LIMIT)));
    const q = String(keyword || '').trim();
    const key = cacheKey(q, { limit });
    const cached = getCached(state.productSearchCache, key);
    if(cached) return cached;
    const pendingKey = `products:${key}`;
    if(state.pending.has(pendingKey)) return state.pending.get(pendingKey);

    const url = `${endpoint('products')}?q=${encodeURIComponent(q)}&limit=${limit}&includeStock=1&activeOnly=1`;
    const promise = fetchJson(url).then(json => {
      const rows = dedupe(json.products || json.items || [], ['code','productCode','sku','id']);
      setCached(state.productSearchCache, key, rows);
      syncGlobals('products', rows);
      return rows;
    }).finally(() => state.pending.delete(pendingKey));
    state.pending.set(pendingKey, promise);
    return promise;
  }

  async function searchCustomers(keyword = '', options = {}){
    const limit = Math.min(MAX_LIMIT, Math.max(1, Number(options.limit || MAX_LIMIT)));
    const q = String(keyword || '').trim();
    const key = cacheKey(q, { limit, mobile: options.mobile });
    const cached = getCached(state.customerSearchCache, key);
    if(cached) return cached;
    const pendingKey = `customers:${key}`;
    if(state.pending.has(pendingKey)) return state.pending.get(pendingKey);

    const mobile = options.mobile ? '&mobile=1&includeMetrics=1' : '';
    const url = `${endpoint('customers')}?q=${encodeURIComponent(q)}&limit=${limit}&activeOnly=1${mobile}`;
    const promise = fetchJson(url).then(json => {
      const rows = dedupe(json.customers || json.items || [], ['code','customerCode','id']);
      setCached(state.customerSearchCache, key, rows);
      syncGlobals('customers', rows);
      return rows;
    }).finally(() => state.pending.delete(pendingKey));
    state.pending.set(pendingKey, promise);
    return promise;
  }

  // Giữ API cũ để không vỡ code, nhưng Phase 3.6 không preload toàn bộ nữa.
  async function preloadProducts(options = {}){
    return searchProducts(options.keyword || '', { limit: options.limit || MAX_LIMIT });
  }

  async function preloadCustomers(options = {}){
    return searchCustomers(options.keyword || '', { limit: options.limit || MAX_LIMIT, mobile: options.mobile });
  }

  async function preloadAll(){
    return { products: [], customers: [] };
  }

  async function listProducts(options = {}){
    const limit = Math.max(1, Number(options.limit || 100));
    const page = Math.max(1, Number(options.page || 1));
    const q = String(options.q || options.search || '').trim();
    const url = `${listEndpoint('products')}?page=${page}&limit=${limit}${q ? `&q=${encodeURIComponent(q)}` : ''}`;
    const json = await fetchJson(url);
    const rows = dedupe(json.products || json.items || [], ['code','productCode','sku','id']);
    syncGlobals('products', rows);
    return { rows, meta: json.meta || null };
  }

  async function listCustomers(options = {}){
    const limit = Math.max(1, Number(options.limit || 100));
    const page = Math.max(1, Number(options.page || 1));
    const q = String(options.q || options.search || '').trim();
    const url = `${listEndpoint('customers')}?page=${page}&limit=${limit}${q ? `&q=${encodeURIComponent(q)}` : ''}`;
    const json = await fetchJson(url);
    const rows = dedupe(json.customers || json.items || [], ['code','customerCode','id']);
    syncGlobals('customers', rows);
    return { rows, meta: json.meta || null };
  }

  function getProducts(){ return state.products.slice(); }
  function getCustomers(){ return state.customers.slice(); }

  function invalidate(type){
    if(!type || type === 'products'){
      state.products = [];
      state.productSearchCache.clear();
      state.productLoadedAt = 0;
    }
    if(!type || type === 'customers'){
      state.customers = [];
      state.customerSearchCache.clear();
      state.customerLoadedAt = 0;
    }
  }

  window.CatalogCache = {
    normalizeText,
    preloadProducts,
    preloadCustomers,
    preloadAll,
    listProducts,
    listCustomers,
    getProducts,
    getCustomers,
    searchProducts,
    searchCustomers,
    invalidate,
    syncProducts: rows => { syncGlobals('products', rows || []); return state.products; },
    syncCustomers: rows => { syncGlobals('customers', rows || []); return state.customers; }
  };
})();
