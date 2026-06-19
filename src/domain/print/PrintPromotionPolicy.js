'use strict';

function text(value) {
  return String(value || '').trim();
}

function lower(value) {
  return text(value).toLowerCase();
}

function pricingModeOf(order = {}) {
  return lower(
    order.saleMethod ||
    order.saleMode ||
    order.pricingMode ||
    order.orderPricingMode ||
    order.priceMode
  );
}

function sourceTextOf(order = {}) {
  return [
    order.source,
    order.sourceType,
    order.orderSource,
    order.orderSourceName,
    order.importType,
    order.note
  ].map(lower).filter(Boolean).join(' ');
}

function isImportedOrder(order = {}) {
  if (order.isImported === true) return true;
  return /(^|[^a-z0-9])(dms|dms_import|excel|import)([^a-z0-9]|$)/i.test(sourceTextOf(order));
}

function isDirectPriceOrder(order = {}) {
  const mode = pricingModeOf(order).replace(/[\s-]+/g, '_');
  if (['direct', 'direct_price', 'fixed_price', 'manual_price', 'ban_thang', 'bán_thẳng'].includes(mode)) return true;
  return Boolean(order.priceLocked || order.lockedPrice)
    || order.promotionCalculated === false
    || order.isPromotionSale === false;
}

function isExplicitPromotionOrder(order = {}) {
  const mode = pricingModeOf(order).replace(/[\s-]+/g, '_');
  return ['promotion', 'promotion_price', 'promo', 'khuyen_mai', 'khuyến_mại'].includes(mode)
    || order.isPromotionSale === true
    || order.promotionCalculated === true;
}

function shouldSuppressPromotionDetails(order = {}) {
  // Quy tắc nghiệp vụ: đơn import/DMS bán thẳng không chạy engine khuyến mại
  // và không được sinh bảng chi tiết khuyến mại khi in.
  if (isImportedOrder(order)) return true;
  if (isExplicitPromotionOrder(order)) return false;
  return isDirectPriceOrder(order);
}

function shouldApplyLegacyPromotionFallback(order = {}) {
  return !shouldSuppressPromotionDetails(order);
}

function clearPromotionFieldsFromItem(item = {}) {
  return {
    ...item,
    promotionRows: [],
    appliedPromotionRows: [],
    appliedPromotions: [],
    promotions: [],
    promotionCode: '',
    promoCode: '',
    promotionDescription: '',
    promotionName: '',
    promotionText: '',
    discountPercent: 0,
    promotionDiscountPercent: 0
  };
}

function suppressPromotionDetails(order = {}) {
  if (!shouldSuppressPromotionDetails(order)) return order;
  return {
    ...order,
    promotions: [],
    promotionRows: [],
    discounts: [],
    totalPromotionAmount: 0,
    totalPromotionValue: 0,
    promotionAmount: 0,
    promotionValue: 0,
    discountAmount: 0,
    items: Array.isArray(order.items)
      ? order.items.map(clearPromotionFieldsFromItem)
      : []
  };
}

module.exports = {
  pricingModeOf,
  sourceTextOf,
  isImportedOrder,
  isDirectPriceOrder,
  isExplicitPromotionOrder,
  shouldSuppressPromotionDetails,
  shouldApplyLegacyPromotionFallback,
  clearPromotionFieldsFromItem,
  suppressPromotionDetails
};
