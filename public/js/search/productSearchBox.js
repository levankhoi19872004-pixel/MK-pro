/*
 * V45 Unified Product Search Box
 * Phase 3.6: server-side search + lazy cache. Không tải toàn bộ catalog khi mở app.
 */
(function(){
  'use strict';
  const common = window.V45Common || {};
  const normalizeText = common.normalizeText;
  const toNumber = common.toNumber;
  const escapeHtml = common.escapeHtml;


  const state = { catalog: [] };

  function catalogCache(){ return window.CatalogCache || null; }
  
function numericDigits(value){ return String(value ?? '').replace(/\D/g,''); }
  function productKey(product){ return String(product?.code || product?.productCode || product?.sku || product?.id || product?._id || '').trim(); }
  function availableQty(product){
    if(typeof window.productAvailableQty === 'function') return window.productAvailableQty(product);
    return toNumber(product?._availableQty ?? product?.availableQty ?? product?.availableStock ?? product?.openSaleQty ?? product?.stockQuantity ?? product?.quantity ?? product?.openingStock);
  }
  function stockSlash(product){
    const rate = Math.max(1, toNumber(product?.conversionRate || product?.unitsPerCase || 1));
    const qty = Math.max(0, availableQty(product));
    if(qty > 0 || !product?.stockDisplay) return `${Math.floor(qty / rate)}/${qty % rate}`;

    const rawDisplay = String(product?.stockDisplay || '').trim()
      .replace(/^Tồn\s*:?\s*/i, '')
      .replace(/^Hết tồn\s*·\s*Tồn\s*:?\s*/i, '')
      .trim();
    if(/^\d+\s*\/\s*\d+$/.test(rawDisplay)) return rawDisplay.replace(/\s+/g, '');

    const cases = Number((rawDisplay.match(/(\d+)\s*thùng/i) || [])[1] || 0);
    const loose = Number((rawDisplay.match(/(\d+)\s*lẻ/i) || [])[1] || 0);
    if(cases || loose) return `${cases}/${loose}`;

    if(typeof window.productStockDisplay === 'function') {
      const text = String(window.productStockDisplay(product) || '').trim();
      if(/^\d+\s*\/\s*\d+$/.test(text)) return text.replace(/\s+/g, '');
    }
    return '0/0';
  }
  function stockText(product){
    return `Tồn: ${stockSlash(product)}`;
  }
  function hasAppQuotaInfo(product){
    return Boolean(product && (
      Object.prototype.hasOwnProperty.call(product, 'maxOrderQty') ||
      (product.internalSaleQuota && typeof product.internalSaleQuota === 'object')
    ));
  }
  function appQuotaSlash(product){
    const rate = Math.max(1, toNumber(product?.conversionRate || product?.unitsPerCase || 1));
    const qty = Math.max(0, toNumber(product?.maxOrderQty ?? product?.internalSaleQuota?.currentlyAllowedQty ?? product?.internalSaleQuota?.remainingQty ?? 0));
    return `${Math.floor(qty / rate)}/${qty % rate}`;
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
    const costPrice = toNumber(product?.costPrice ?? product?.importPrice ?? product?.purchasePrice ?? product?.lastCostPrice ?? 0);
    const salePrice = toNumber(product?.salePrice ?? product?.price ?? product?.sellPrice ?? product?.retailPrice ?? 0);
    return { ...product, code, productCode: product?.productCode || code, sku: product?.sku || code, id: product?.id || code, name, productName: product?.productName || name, costPrice, salePrice, _productSearchKey: searchKey, _packingText: packing, _availableQty: availableQty(product) };
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

    // Không ghi vào productsCache/salesProductsCache toàn cục.
    // productsCache thuộc bảng Danh sách sản phẩm; nếu autocomplete ghi vào đây,
    // bảng có thể bị render lại bằng dữ liệu gợi ý thay vì dữ liệu /api/products.
    return state.catalog;
  }
  async function preload(options = {}){
    // Giữ tương thích tên hàm cũ. Phase 3.6 chỉ tải 50 dòng gợi ý đầu, không preload toàn bộ.
    return search(options.keyword || '', { limit: options.limit || 50, mode: options.mode });
  }
  function getCatalog(){
    // Autocomplete chỉ đọc cache riêng của chính nó.
    // Không đọc productsCache của bảng danh sách sản phẩm để tránh lẫn luồng dữ liệu.
    return dedupe([...(state.catalog || [])]);
  }
  function scoreProduct(product, q){
    if(!q) return 0;
    const code=normalizeText(product.code||product.productCode||product.sku);
    const barcode=normalizeText(product.barcode);
    const name=normalizeText(product.name||product.productName);
    const qDigits=numericDigits(q);
    const priceDigits=numericDigits(Math.round(toNumber(product.salePrice || product.price || product.sellPrice || product.retailPrice)));
    if(code===q || barcode===q) return 1000;
    if(code.startsWith(q) || barcode.startsWith(q)) return 800;
    if(name.startsWith(q)) return 600;
    if(code.includes(q) || barcode.includes(q)) return 400;
    if(qDigits.length>=4 && priceDigits){
      if(priceDigits===qDigits) return 550;
      if(priceDigits.startsWith(qDigits)) return 450;
      if(priceDigits.includes(qDigits)) return 250;
    }
    if(name.includes(q)) return 300;
    if(product._productSearchKey?.includes(q)) return 100;
    return -1;
  }
  function searchLocal(keyword='', options={}){
    const q=normalizeText(keyword);
    const limit=Math.min(50, Math.max(1, Number(options.limit||20)));
    return getCatalog()
      .filter(p=>p.isActive!==false && availableQty(p) > 0)
      .map(product=>({product,score:scoreProduct(product,q)}))
      .filter(row=>!q || row.score>=0)
      .sort((a,b)=>(b.score-a.score)||String(a.product.code||'').localeCompare(String(b.product.code||'')))
      .slice(0,limit)
      .map(row=>row.product);
  }
  async function search(keyword='', options={}){
    const limit=Math.min(50, Math.max(1, Number(options.limit||20)));
    const q=String(keyword||'').trim();
    if(q.length < 2) return [];
    const cache=catalogCache();
    if(cache && typeof cache.searchProducts === 'function'){
      const rows = await cache.searchProducts(q, { limit, mode: options.mode || 'sales' });
      sync(rows || []);
      return (rows || []).filter(p => p.isActive !== false && availableQty(p) > 0).slice(0, limit);
    }
    // Fallback nếu CatalogCache chưa nhúng.
    if(q || !getCatalog().length){
      const res = await fetch(`/api/catalog/products/search?q=${encodeURIComponent(q)}&limit=${limit}&includeStock=1&activeOnly=1&inStockOnly=1&_t=${Date.now()}`);
      const json = await res.json();
      if(json.ok === false || json.success === false) throw new Error(json.message || 'Không tìm được sản phẩm');
      const rows = json.products || json.items || json.data || [];
      sync(rows);
      return rows.filter(p => availableQty(p) > 0).slice(0, limit);
    }
    return searchLocal(q, { limit });
  }
  function label(product, mode='sales'){
    const code = product.code || product.productCode || product.sku || '';
    const name = product.name || product.productName || '';
    const price = mode === 'import' ? product.costPrice : product.salePrice;
    const priceValue = toNumber(price);

    // V45 mobile sales compact format:
    // 62674330 | SUNLIGHT Lau Kính 520ml/12 chai
    // 📦 79/2     💰 24.750
    // Tên sản phẩm đã có quy cách nên không hiển thị thêm QC/packing để NVBH đọc nhanh hơn.
    if(mode === 'sales'){
      const priceLabel = priceValue ? priceValue.toLocaleString('vi-VN') : '0';
      return `${code} | ${name}\n📦 Tồn ${stockSlash(product)} · App ${appQuotaSlash(product)}     💰 ${priceLabel}`;
    }

    const packing = product._packingText || packingText(product);
    const priceLabel = priceValue ? ` · ${mode === 'import' ? 'Giá nhập' : 'Giá bán'}: ${priceValue.toLocaleString('vi-VN')}` : '';
    const packingLabel = packing ? ` · ${packing}` : '';
    return `${code} - ${name}${packingLabel} · ${stockText(product)}${priceLabel}`;
  }

  
function labelHtml(product, mode='sales'){
    const code = product.code || product.productCode || product.sku || '';
    const name = product.name || product.productName || '';
    const price = mode === 'import' ? product.costPrice : product.salePrice;
    const priceValue = toNumber(price);
    if(mode === 'sales'){
      const priceLabel = priceValue ? priceValue.toLocaleString('vi-VN') : '0';
      const quotaBadge = hasAppQuotaInfo(product)
        ? `<span class="stock-badge app-quota-badge">App ${escapeHtml(appQuotaSlash(product))}</span>`
        : '';
      return `<div class="product-suggest-title">${escapeHtml(code)} | ${escapeHtml(name)}</div>`
        + `<div class="product-suggest-meta"><span class="stock-badge">📦 Tồn ${escapeHtml(stockSlash(product))}</span>${quotaBadge}<span class="price-badge">💰 ${escapeHtml(priceLabel)}</span></div>`;
    }
    return escapeHtml(label(product, mode));
  }

  window.UnifiedProductSearch = { normalizeText, sync, preload, getCatalog, search, searchLocal, label, labelHtml, availableQty, productKey, stockSlash };
})();
