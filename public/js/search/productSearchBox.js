/*
 * V45 Unified Product Search Box
 * Phase 3.6: server-side search + lazy cache. Không tải toàn bộ catalog khi mở app.
 */
(function(){
  'use strict';

  const state = { catalog: [] };

  function catalogCache(){ return window.CatalogCache || null; }
  function normalizeText(value){
    return String(value ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').trim();
  }
  function toNumber(value){ const n=Number(value||0); return Number.isFinite(n)?n:0; }
  function productKey(product){ return String(product?.code || product?.productCode || product?.sku || product?.id || product?._id || '').trim(); }
  function availableQty(product){
    if(typeof window.productAvailableQty === 'function') return window.productAvailableQty(product);
    return toNumber(product?._availableQty ?? product?.availableQty ?? product?.availableStock ?? product?.openSaleQty ?? product?.stockQuantity ?? product?.quantity ?? product?.openingStock);
  }
  function stockText(product){
    if(typeof window.productStockStatusText === 'function') return window.productStockStatusText(product);
    return product?.stockDisplay ? `Tồn: ${product.stockDisplay}` : `Tồn: ${availableQty(product).toLocaleString('vi-VN')}`;
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
    const searchKey = normalizeText([code, product?.sku, product?.productCode, product?.barcode, name, product?.category, product?.brand, packing, product?.unit, product?.baseUnit].filter(Boolean).join(' '));
    return { ...product, code, productCode: product?.productCode || code, sku: product?.sku || code, id: product?.id || code, name, productName: product?.productName || name, _productSearchKey: searchKey, _packingText: packing, _availableQty: availableQty(product) };
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
    try{
      if(typeof productsCache !== 'undefined') productsCache = state.catalog;
      if(typeof salesProductsCache !== 'undefined') salesProductsCache = state.catalog;
    }catch(err){}
    return state.catalog;
  }
  async function preload(options = {}){
    // Giữ tương thích tên hàm cũ. Phase 3.6 chỉ tải 50 dòng gợi ý đầu, không preload toàn bộ.
    return search(options.keyword || '', { limit: options.limit || 50, mode: options.mode });
  }
  function getCatalog(){
    let legacy = [];
    try{
      if(typeof salesProductsCache !== 'undefined') legacy = legacy.concat(salesProductsCache || []);
      if(typeof productsCache !== 'undefined') legacy = legacy.concat(productsCache || []);
    }catch(err){}
    return dedupe([...(state.catalog || []), ...legacy]);
  }
  function scoreProduct(product, q){
    if(!q) return 0;
    const code=normalizeText(product.code||product.productCode||product.sku);
    const barcode=normalizeText(product.barcode);
    const name=normalizeText(product.name||product.productName);
    if(code===q || barcode===q) return 1000;
    if(code.startsWith(q) || barcode.startsWith(q)) return 800;
    if(name.startsWith(q)) return 600;
    if(code.includes(q) || barcode.includes(q)) return 400;
    if(name.includes(q)) return 300;
    if(product._productSearchKey?.includes(q)) return 100;
    return -1;
  }
  function searchLocal(keyword='', options={}){
    const q=normalizeText(keyword);
    const limit=Math.max(1, Number(options.limit||50));
    return getCatalog()
      .filter(p=>p.isActive!==false)
      .map(product=>({product,score:scoreProduct(product,q)}))
      .filter(row=>!q || row.score>=0)
      .sort((a,b)=>(b.score-a.score)||String(a.product.code||'').localeCompare(String(b.product.code||'')))
      .slice(0,limit)
      .map(row=>row.product);
  }
  async function search(keyword='', options={}){
    const limit=Math.min(50, Math.max(1, Number(options.limit||50)));
    const q=String(keyword||'').trim();
    const cache=catalogCache();
    if(cache && typeof cache.searchProducts === 'function'){
      const rows = await cache.searchProducts(q, { limit, mode: options.mode || 'sales' });
      return sync(rows || []).filter(p => p.isActive !== false).slice(0, limit);
    }
    // Fallback nếu CatalogCache chưa nhúng.
    if(q || !getCatalog().length){
      const res = await fetch(`/api/catalog/products/search?q=${encodeURIComponent(q)}&limit=${limit}&includeStock=1&activeOnly=1&_t=${Date.now()}`);
      const json = await res.json();
      if(!json.ok) throw new Error(json.message || 'Không tìm được sản phẩm');
      return sync(json.products || json.items || []).slice(0, limit);
    }
    return searchLocal(q, { limit });
  }
  function label(product, mode='sales'){
    const code=product.code||product.productCode||product.sku||'';
    const name=product.name||product.productName||'';
    const packing=product._packingText||packingText(product);
    const price=mode==='import'?product.costPrice:product.salePrice;
    const priceLabel=price?` · ${mode==='import'?'Giá nhập gần nhất':'Giá bán'}: ${toNumber(price).toLocaleString('vi-VN')}`:'';
    const packingLabel=packing?` · ${packing}`:'';
    return `${code} - ${name}${packingLabel} · ${stockText(product)}${priceLabel}`;
  }
  window.UnifiedProductSearch = { normalizeText, sync, preload, getCatalog, search, searchLocal, label, availableQty, productKey };
})();
