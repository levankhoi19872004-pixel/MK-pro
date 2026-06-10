'use strict';

const PRICING_MODES = Object.freeze({
  DIRECT_PRICE: 'DIRECT_PRICE',
  PROMOTION: 'PROMOTION'
});

function normalizePricingMode(value, fallback = PRICING_MODES.DIRECT_PRICE) {
  const raw = String(value || fallback || '').trim().toUpperCase();
  if (['PROMOTION', 'PROMO', 'KM', 'KHUYEN_MAI', 'KHUYENMAI', 'KHUYEN MAI'].includes(raw)) return PRICING_MODES.PROMOTION;
  if (raw.includes('PROMOTION') || raw.includes('PROMO') || raw.includes('KHUYEN') || raw === 'KM') return PRICING_MODES.PROMOTION;
  return PRICING_MODES.DIRECT_PRICE;
}

function isDirectPriceMode(value) {
  return normalizePricingMode(value) === PRICING_MODES.DIRECT_PRICE;
}

function isPromotionMode(value) {
  return normalizePricingMode(value) === PRICING_MODES.PROMOTION;
}

module.exports = {
  ...PRICING_MODES,
  PRICING_MODES,
  normalizePricingMode,
  isDirectPriceMode,
  isPromotionMode
};
