import { normalizePackingRate } from './product.js';

export function calculateCartTotals(cart = []) {
  return (Array.isArray(cart) ? cart : []).reduce((totals, item) => {
    const quantity = Math.max(0, Number(item.quantity || 0));
    const grossPrice = Math.max(0, Number(item.originalPrice || item.grossPrice || item.catalogSalePrice || item.salePrice || item.price || 0));
    const grossAmount = Math.max(0, Number(item.grossAmount || Math.round(quantity * grossPrice)));
    const payable = Math.max(0, Number(item.amount ?? item.netAmount ?? Math.round(quantity * Number(item.unitPrice || item.salePrice || item.price || 0))));
    const discount = Math.max(0, Number(item.discountAmount || item.promotionAmount || Math.max(0, grossAmount - payable)));
    totals.gross += grossAmount;
    totals.discount += Math.min(grossAmount, discount);
    totals.payable += payable;
    return totals;
  }, { gross: 0, discount: 0, payable: 0 });
}

export function cartQuantityFromInputs(item = {}, caseQty = 0, looseQty = 0) {
  const rate = normalizePackingRate(item);
  const cases = Math.max(0, Number(caseQty || 0));
  const loose = Math.max(0, Number(looseQty || 0));
  return { rate, quantity: (cases * rate) + loose };
}

export function validateCartQuantity(item = {}, quantity = 0) {
  if (!Number.isFinite(quantity) || quantity <= 0) return { ok: false, code: 'INVALID_QUANTITY' };
  const availableQty = Math.max(0, Number(item.availableQty || 0));
  const maxOrderQty = Math.max(0, Number(item.maxOrderQty || 0));
  if (availableQty > 0 && quantity > availableQty) return { ok: false, code: 'OVER_STOCK', availableQty };
  if (maxOrderQty > 0 && quantity > maxOrderQty) return { ok: false, code: 'OVER_APP_QUOTA', maxOrderQty };
  return { ok: true, availableQty, maxOrderQty };
}

export function buildOrderPayloadItems(cart = []) {
  return (Array.isArray(cart) ? cart : []).map((item) => ({
    ...item,
    grossPrice: Number(item.grossPrice || item.originalPrice || item.catalogSalePrice || item.salePrice || item.price || 0),
    originalPrice: Number(item.originalPrice || item.grossPrice || item.catalogSalePrice || item.salePrice || item.price || 0),
    unitPrice: Number(item.unitPrice || item.finalPrice || item.salePrice || item.price || 0),
    salePrice: Number(item.salePrice || item.unitPrice || item.finalPrice || item.price || 0),
    finalPrice: Number(item.finalPrice || item.unitPrice || item.salePrice || item.price || 0),
    discountAmount: Number(item.discountAmount || item.promotionAmount || item.totalDiscountAmount || 0),
    amount: Number(item.amount || 0),
    saleMode: 'promotion',
    saleMethod: 'promotion',
    pricingMode: 'promotion',
    priceLocked: true
  }));
}
