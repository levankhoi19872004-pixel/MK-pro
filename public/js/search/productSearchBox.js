/*
 * V45 Unified Product Search Box
 * Dùng chung cho Nhập kho, Bán hàng, App bán hàng: tải catalog 1 lần, tìm trong cache.
 */
(function(){
  'use strict';

  const state = {
    catalog: [],
    loadedAt: 0,
    loadingPromise: null
  };

  function catalogCache(){
    return window.CatalogCache || null;
  }

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

  function productKey(product){
    return String(product?.code || product?.productCode || product?.sku || product?.id || product?._id || '').trim();
  }

  function availableQty(product){
    if(typeof window.productAvailableQty === 'function') return window.productAvailableQty(product);
    return toNumber(product?.availableQty ?? product?.availableStock ?? product?.stockQuantity ?? product?.quantity ?? product?.openingStock);
  }

  function stockText(product){
    if(typeof window.productStockStatusText === 'function') return window.productStockStatusText(product);
    return `Tồn: ${availableQty(product)}`;
  }

  function packingText(product){
    if(product?.packing) return product.packing;
    if(product?.baseUnit && toNumber(product?.conversionRate) > 1) return `1 ${product.unit || ''} = ${product.conversionRate} ${product.baseUnit}`;
    return product?.unit || '';
  }

  function enrich(product){
    const code = productKey(product);
    const name = String(product?.name || product?.productName || '').trim();
    const packing = packingText(product);
    const searchKey = normalizeText([
      code,
      product?.sku,
      product?.productCode,
      product?.barcode,
      name,
      product?.category,
      product?.brand,
      packing,
      product?.unit,
      product?.baseUnit
    ].filter(Boolean).join(' '));
    return {
      ...product,
      code,
      productCode: product?.productCode || code,
      sku: product?.sku || code,
      name,
      _productSearchKey: searchKey,
      _packingText: packing,
      _availableQty: availableQty(product)
    };
  }

  function dedupe(rows){
    const map = new Map();
    (rows || []).forEach(row => {
      if(!row) return;
      const item = enrich(row);
      const key = productKey(item) || String(item._id || item.id || '');
      if(!key) return;
      map.set(key, { ...(map.get(key) || {}), ...item });
    });
    return [...map.values()];
  }

  function sync(rows){
    state.catalog = dedupe([...(state.catalog || []), ...(rows || [])]);
    const cache = catalogCache();
    if(cache && typeof cache.syncProducts === 'function') cache.syncProducts(state.catalog);
    try{
      if(typeof productsCache !== 'undefined') productsCache = state.catalog;
      if(typeof salesProductsCache !== 'undefined') salesProductsCache = state.catalog;
    }catch(err){}
    return state.catalog;
  }

  async function preload(options = {}){
    const force = options.force === true;
    const maxAgeMs = Number(options.maxAgeMs || 5 * 60 * 1000);
    if(!force && state.catalog.length && Date.now() - state.loadedAt < maxAgeMs) return state.catalog;
    if(state.loadingPromise && !force) return state.loadingPromise;

    const cache = catalogCache();
    if(cache && typeof cache.preloadProducts === 'function'){
      state.loadingPromise = cache.preloadProducts({force, maxAgeMs})
        .then(rows => {
          state.loadedAt = Date.now();
          state.catalog = dedupe(rows || []);
          return state.catalog;
        })
        .finally(() => { state.loadingPromise = null; });
      return state.loadingPromise;
    }

    state.loadingPromise = fetch(`/api/products?all=true&activeOnly=1&_t=${Date.now()}`)
      .then(async res => {
        const json = await res.json();
        if(!json.ok) throw new Error(json.message || 'Không tải được danh mục sản phẩm');
        state.loadedAt = Date.now();
        return sync(json.products || []);
      })
      .catch(err => {
        const fallback = dedupe([...(window.productsCache || []), ...(window.salesProductsCache || [])]);
        if(fallback.length){
          state.catalog = fallback;
          return state.catalog;
        }
        throw err;
      })
      .finally(() => { state.loadingPromise = null; });

    return state.loadingPromise;
  }

  function getCatalog(){
    const cache = catalogCache();
    if(cache && typeof cache.getProducts === 'function'){
      const rows = cache.getProducts();
      if(rows.length) return dedupe(rows);
    }
    let legacy = [];
    try{
      if(typeof salesProductsCache !== 'undefined') legacy = legacy.concat(salesProductsCache || []);
      if(typeof productsCache !== 'undefined') legacy = legacy.concat(productsCache || []);
    }catch(err){}
    return dedupe([...(state.catalog || []), ...legacy]);
  }

  function scoreProduct(product, q){
    if(!q) return 0;
    const code = normalizeText(product.code || product.productCode || product.sku);
    const barcode = normalizeText(product.barcode);
    const name = normalizeText(product.name || product.productName);
    if(code === q || barcode === q) return 1000;
    if(code.startsWith(q) || barcode.startsWith(q)) return 800;
    if(name.startsWith(q)) return 600;
    if(code.includes(q) || barcode.includes(q)) return 400;
    if(name.includes(q)) return 300;
    if(product._productSearchKey?.includes(q)) return 100;
    return -1;
  }

  function search(keyword = '', options = {}){
    const q = normalizeText(keyword);
    const limit = Math.max(1, Number(options.limit || 50));
    const rows = getCatalog()
      .filter(product => product.isActive !== false)
      .map(product => ({ product, score: scoreProduct(product, q) }))
      .filter(row => !q || row.score >= 0)
      .sort((a,b) => (b.score - a.score) || String(a.product.code || '').localeCompare(String(b.product.code || '')))
      .slice(0, limit)
      .map(row => row.product);
    return rows;
  }

  function label(product, mode = 'sales'){
    const code = product.code || product.productCode || product.sku || '';
    const name = product.name || product.productName || '';
    const packing = product._packingText || packingText(product);
    const price = mode === 'import' ? product.costPrice : product.salePrice;
    const priceLabel = price ? ` · ${mode === 'import' ? 'Giá nhập gần nhất' : 'Giá bán'}: ${toNumber(price).toLocaleString('vi-VN')}` : '';
    const packingLabel = packing ? ` · ${packing}` : '';
    return `${code} - ${name}${packingLabel} · ${stockText(product)}${priceLabel}`;
  }

  window.UnifiedProductSearch = {
    normalizeText,
    sync,
    preload,
    getCatalog,
    search,
    label,
    availableQty,
    productKey
  };
})();
