export function normalizePackingRate(source = {}) {
  const rate = Number(
    source.conversionRate ?? source.unitsPerCase ?? source.packingQty ?? source.packQty ?? source.pack ?? source.packageQty ?? 1
  );
  return Number.isFinite(rate) && rate > 0 ? rate : 1;
}

export function attachPackingRate(target = {}, source = {}) {
  const conversionRate = normalizePackingRate(source);
  target.conversionRate = conversionRate;
  target.packingQty = conversionRate;
  target.unitsPerCase = conversionRate;
  return target;
}

export function normalizeProductGroupName(value = '') {
  return String(value || '').trim();
}

export function normalizeProductSearchResponse(data) {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return [];
  const rows = data.items || data.products || data.rows || data.data || data.result || [];
  return Array.isArray(rows) ? rows : [];
}

export function toMobileProduct(product = {}, helpers = {}) {
  const availableQty = Number(product._availableQty ?? product.availableQty ?? product.availableStock ?? product.stockQuantity ?? product.stock ?? 0);
  const code = product.code || product.productCode || product.sku || '';
  const name = product.name || product.productName || '';
  const groupName = String(product.groupName || product.productGroupName || product.productGroup || product.group || product.categoryName || product.category || '').trim();
  const internalSaleQuota = product.internalSaleQuota && typeof product.internalSaleQuota === 'object' ? product.internalSaleQuota : {};
  const maxOrderQty = Math.max(0, Number(product.maxOrderQty ?? internalSaleQuota.currentlyAllowedQty ?? internalSaleQuota.remainingQty ?? 0));
  const rate = normalizePackingRate(product);
  const stockDisplay = typeof helpers.formatStock === 'function' ? helpers.formatStock(availableQty, rate) : String(availableQty);
  return {
    ...product,
    id: product.id || product._id || code,
    code,
    name,
    groupName,
    category: product.category || groupName,
    salePrice: Number(product.salePrice || product.price || 0),
    availableQty,
    stockQuantity: availableQty,
    conversionRate: rate,
    packingQty: rate,
    unitsPerCase: rate,
    stockDisplay,
    maxOrderQty,
    internalSaleQuota: {
      ...internalSaleQuota,
      remainingQty: Math.max(0, Number(internalSaleQuota.remainingQty || 0)),
      currentlyAllowedQty: maxOrderQty
    }
  };
}

export function buildPromotionCartPayloadItem(item = {}) {
  const price = Number(item.grossPrice || item.originalPrice || item.catalogSalePrice || item.salePrice || item.price || 0);
  return {
    productId: item.productId || item.id || item.productCode,
    productCode: item.productCode || item.code,
    productName: item.productName || item.name,
    quantity: Number(item.quantity || 0),
    conversionRate: normalizePackingRate(item),
    grossPrice: price,
    salePrice: price,
    price
  };
}

export function applyPromotionLines(cart = [], lines = []) {
  const byCode = new Map((Array.isArray(lines) ? lines : []).map((line) => [String(line.productCode || line.code || '').trim(), line]));
  return (Array.isArray(cart) ? cart : []).map((item) => {
    const code = String(item.productCode || item.code || '').trim();
    const line = byCode.get(code) || {};
    const quantity = Number(item.quantity || 0);
    const grossPrice = Number(line.catalogSalePrice || item.grossPrice || item.originalPrice || item.catalogSalePrice || item.salePrice || item.price || 0);
    const grossAmount = Math.round(quantity * grossPrice);
    const directDiscountAmount = Number(line.directDiscountAmount || 0);
    const groupDiscountAmount = Number(line.groupDiscountAmount || 0);
    const discountAmount = Math.min(grossAmount, Math.max(0, directDiscountAmount + groupDiscountAmount));
    const amount = Math.max(0, grossAmount - discountAmount);
    const finalPrice = quantity > 0 ? Math.round(amount / quantity) : grossPrice;
    const promotionRows = Array.isArray(line.promotionRows) ? line.promotionRows : [];
    const firstPromotion = promotionRows[0] || line.directPromotionRule || {};
    return attachPackingRate({
      ...item,
      originalPrice: grossPrice,
      grossPrice,
      catalogSalePrice: grossPrice,
      grossAmount,
      directDiscountPercent: Number(line.directDiscountPercent || 0),
      groupDiscountPercent: Number(line.groupDiscountPercent || 0),
      discountPercent: grossAmount > 0 ? (discountAmount / grossAmount) * 100 : 0,
      directDiscountAmount,
      groupDiscountAmount,
      discountAmount,
      promotionAmount: discountAmount,
      totalDiscountAmount: discountAmount,
      finalPrice,
      unitPrice: finalPrice,
      salePrice: finalPrice,
      price: finalPrice,
      amount,
      netAmount: amount,
      saleMethod: 'promotion',
      saleMode: 'promotion',
      pricingMode: 'promotion',
      priceLocked: true,
      lockedPrice: true,
      lockedPromotion: true,
      promotionCalculated: true,
      promotionCode: line.promotionCode || firstPromotion.promotionCode || firstPromotion.code || firstPromotion.programCode || '',
      promotionName: line.promotionName || firstPromotion.promotionName || firstPromotion.name || firstPromotion.programName || '',
      promotionRows
    }, item);
  });
}
