export function mobileProductQuotaDate(product = {}, { formatDisplayDate } = {}) {
  const value = product.internalSaleQuota?.snapshotDate || product.internalSaleQuota?.date || product.internalSaleQuota?.importDate || '';
  return value && typeof formatDisplayDate === 'function' ? formatDisplayDate(value) : (value || 'chưa cập nhật');
}

export function buildMobileProductMetrics(product = {}, utils = {}) {
  const formatStockTL = typeof utils.formatStockTL === 'function' ? utils.formatStockTL : (qty) => String(qty ?? 0);
  const money = typeof utils.money === 'function' ? utils.money : (value) => String(value ?? 0);
  const price = Number(product.finalPrice || product.unitPrice || product.salePrice || product.price || 0);
  const originalPrice = Number(product.originalPrice || product.grossPrice || product.catalogSalePrice || product.salePrice || product.price || 0);
  const priceLabel = originalPrice > price && price > 0 ? `Giá KM ${money(price)} · Gốc ${money(originalPrice)}` : `Giá ${money(price)}`;
  return [
    { label: 'Tồn thực tế ', value: product.stockDisplay || formatStockTL(product.availableQty, product.conversionRate) },
    { label: 'Được bán App ', value: formatStockTL(product.maxOrderQty, product.conversionRate) },
    { label: '', value: priceLabel },
    { label: 'DMS ', value: mobileProductQuotaDate(product, utils) }
  ];
}

export function mobileProductMetaLine(product = {}, utils = {}) {
  return buildMobileProductMetrics(product, utils).map((metric) => `${metric.label}${metric.value}`.trim()).join(' · ');
}

export function installMobileSalesProductLabel(options = {}) {
  const root = options.root || window;
  const search = root.UnifiedProductSearch;
  if (!search || search.__mobileSalesCompactLabel === true) return;
  const originalLabelHtml = search.labelHtml;
  const toMobileProduct = typeof options.toMobileProduct === 'function' ? options.toMobileProduct : (product) => product || {};
  const escapeHtml = typeof options.escapeHtml === 'function' ? options.escapeHtml : (value) => String(value ?? '');
  const metaLine = typeof options.mobileProductMetaLine === 'function' ? options.mobileProductMetaLine : mobileProductMetaLine;
  search.labelHtml = (product = {}, mode = 'sales') => {
    if (mode !== 'sales') return typeof originalLabelHtml === 'function' ? originalLabelHtml(product, mode) : escapeHtml(String(product.label || ''));
    const p = toMobileProduct(product);
    const title = [p.code, p.name].filter(Boolean).join(' · ');
    return `<div class="mobile-product-suggest-title">${escapeHtml(title)}</div>`
      + `<div class="mobile-product-suggest-meta">${escapeHtml(metaLine(p))}</div>`;
  };
  search.__mobileSalesCompactLabel = true;
}
