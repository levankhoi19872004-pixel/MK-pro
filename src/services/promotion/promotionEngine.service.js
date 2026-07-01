'use strict';

const { toNumber } = require('../../utils/common.util');

const PROMOTION_TYPES = Object.freeze({
  QUANTITY_GROUP_PERCENT_DISCOUNT: 'QUANTITY_GROUP_PERCENT_DISCOUNT',
  CUSTOMER_ORDER_VALUE_EXTRA_PERCENT: 'CUSTOMER_ORDER_VALUE_EXTRA_PERCENT'
});

function clean(value) { return String(value ?? '').trim(); }
function codeSet(values = []) { return new Set((Array.isArray(values) ? values : clean(values).split(/[\n,;]+/)).map(clean).filter(Boolean)); }
function dateOnly(value) {
  if (!value) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const text = clean(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const match = text.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/);
  if (match) return `${match[3]}-${String(match[2]).padStart(2, '0')}-${String(match[1]).padStart(2, '0')}`;
  return '';
}
function isActiveRule(rule = {}, orderDate = '') {
  if (rule.isActive === false || rule.active === false) return false;
  const target = dateOnly(orderDate);
  const start = dateOnly(rule.startDate);
  const end = dateOnly(rule.endDate);
  if (target && start && target < start) return false;
  if (target && end && target > end) return false;
  return true;
}
function normalizeDiscountPercent(value) {
  const raw = toNumber(value);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  if (raw <= 1) return Math.round(raw * 10000) / 100;
  return Math.min(100, Math.round(raw * 100) / 100);
}
function normalizeLine(item = {}) {
  const quantity = toNumber(item.baseQty ?? item.quantity ?? item.qty);
  const salePrice = toNumber(item.salePrice ?? item.price ?? item.catalogSalePrice ?? item.grossPrice);
  const lineAmount = toNumber(item.lineAmount ?? item.amount ?? item.promotionBaseAmount ?? Math.round(quantity * salePrice));
  return {
    ...item,
    productCode: clean(item.productCode || item.code),
    productName: clean(item.productName || item.name),
    quantity,
    baseQty: quantity,
    salePrice,
    lineAmount: Math.max(0, lineAmount),
    discountAmount: Math.max(0, toNumber(item.discountAmount ?? item.totalDiscountAmount)),
    appliedPromotions: Array.isArray(item.appliedPromotions) ? item.appliedPromotions.slice() : []
  };
}
function makePromotionRow(rule = {}, extra = {}) {
  const promotionCode = clean(rule.code || rule.programCode || rule.id);
  return {
    promotionCode,
    code: promotionCode,
    promotionName: clean(rule.name || rule.programName || rule.productGroupName || promotionCode),
    description: clean(rule.name || rule.programName || rule.productGroupName || promotionCode),
    discountPercent: normalizeDiscountPercent(rule.discountPercent),
    promotionType: clean(rule.promotionType || rule.type),
    stackPolicy: clean(rule.stackPolicy || 'stackable'),
    ...extra
  };
}
function pushLinePromotion(line, row) {
  if (!line || !row || !row.promotionCode) return false;
  const exists = (line.appliedPromotions || []).some((p) => clean(p.promotionCode || p.code) === row.promotionCode);
  if (exists) return false;
  line.appliedPromotions.push(row);
  return true;
}
function calcQuantityGroupRules(lines = [], rules = [], context = {}) {
  const appliedPromotions = [];
  const warnings = [];
  const byCode = new Map(lines.map((line) => [line.productCode, line]));

  for (const rule of rules || []) {
    if (!isActiveRule(rule, context.orderDate)) continue;
    const productCodes = codeSet(rule.productCodes);
    if (!productCodes.size) { warnings.push(`CTKM ${clean(rule.code || rule.programCode)} thiếu danh sách sản phẩm.`); continue; }
    const eligibleLines = lines.filter((line) => productCodes.has(line.productCode) && byCode.has(line.productCode));
    if (!eligibleLines.length) continue;
    const totalQty = eligibleLines.reduce((sum, line) => sum + toNumber(line.baseQty ?? line.quantity), 0);
    const minQty = toNumber(rule.minQty ?? rule.quantityThreshold ?? rule.requiredQty);
    const discountPercent = normalizeDiscountPercent(rule.discountPercent);
    if (minQty <= 0 || discountPercent <= 0) continue;
    if (totalQty < minQty) continue;

    const promotionRowBase = makePromotionRow(rule, {
      scope: clean(rule.applyScope || 'eligible_lines'),
      productGroupCode: clean(rule.productGroupCode || rule.groupCode),
      productGroupName: clean(rule.productGroupName || rule.groupName),
      qualifiedQuantity: totalQty,
      minQty,
      qtyUnit: clean(rule.qtyUnit || 'baseQty')
    });
    const alreadyApplied = new Set();
    for (const line of eligibleLines) {
      if (alreadyApplied.has(`${promotionRowBase.promotionCode}:${line.productCode}`)) continue;
      const discountAmount = Math.round(toNumber(line.lineAmount) * discountPercent / 100);
      if (discountAmount <= 0) continue;
      const row = makePromotionRow(rule, {
        ...promotionRowBase,
        qualifiedAmount: toNumber(line.lineAmount),
        discountBeforeTax: Math.round(discountAmount / 1.08),
        discountAfterTax: discountAmount,
        discountAmount,
        scope: 'eligible_lines',
        productCode: line.productCode,
        productName: line.productName
      });
      if (pushLinePromotion(line, row)) {
        line.discountAmount += discountAmount;
        alreadyApplied.add(`${promotionRowBase.promotionCode}:${line.productCode}`);
      }
    }
    appliedPromotions.push({ ...promotionRowBase, qualifiedQuantity: totalQty });
  }
  return { lines, appliedPromotions, warnings };
}
function calcCustomerOrderValueRules(lines = [], rules = [], context = {}) {
  const orderDiscounts = [];
  const appliedPromotions = [];
  const warnings = [];
  const customerCode = clean(context.customerCode);
  if (!customerCode) return { lines, orderDiscounts, appliedPromotions, warnings };

  for (const rule of rules || []) {
    if (!isActiveRule(rule, context.orderDate)) continue;
    const customers = codeSet(rule.customerCodes);
    if (!customers.size || !customers.has(customerCode)) continue;
    const minOrderAmount = toNumber(rule.minOrderAmount ?? rule.minAmount ?? rule.requiredAmount);
    const discountPercent = normalizeDiscountPercent(rule.discountPercent);
    if (minOrderAmount <= 0 || discountPercent <= 0) continue;
    const grossAmount = lines.reduce((sum, line) => sum + toNumber(line.lineAmount), 0);
    const lineDiscountAmount = lines.reduce((sum, line) => sum + toNumber(line.discountAmount), 0);
    const baseAmountMode = clean(rule.baseAmountMode || 'after_line_promotions');
    const baseAmount = baseAmountMode === 'before_promotions' ? grossAmount : Math.max(0, grossAmount - lineDiscountAmount);
    if (baseAmount < minOrderAmount) continue;
    const orderDiscountAmount = Math.round(baseAmount * discountPercent / 100);
    if (orderDiscountAmount <= 0) continue;

    const promotionRow = makePromotionRow(rule, {
      scope: clean(rule.applyScope || 'whole_order'),
      baseAmountMode,
      qualifiedAmount: baseAmount,
      minOrderAmount,
      discountAmount: orderDiscountAmount,
      discountBeforeTax: Math.round(orderDiscountAmount / 1.08),
      discountAfterTax: orderDiscountAmount,
      customerCode
    });
    orderDiscounts.push(promotionRow);
    appliedPromotions.push(promotionRow);

    // Tương thích luồng đơn hiện tại: phân bổ CK cấp đơn về từng dòng để create/edit order
    // đang chỉ đọc line discount vẫn giảm đúng, nhưng vẫn giữ orderDiscounts để reconcile.
    let remaining = orderDiscountAmount;
    const baseByLine = lines.map((line) => ({ line, base: Math.max(0, toNumber(line.lineAmount) - toNumber(line.discountAmount)) }));
    const totalBase = baseByLine.reduce((sum, row) => sum + row.base, 0);
    baseByLine.forEach((row, index) => {
      if (row.base <= 0 || totalBase <= 0) return;
      const allocated = index === baseByLine.length - 1 ? remaining : Math.min(remaining, Math.round(orderDiscountAmount * row.base / totalBase));
      remaining -= allocated;
      if (allocated <= 0) return;
      const linePromotionRow = { ...promotionRow, allocatedDiscountAmount: allocated, productCode: row.line.productCode, productName: row.line.productName };
      if (pushLinePromotion(row.line, linePromotionRow)) row.line.discountAmount += allocated;
    });
  }
  return { lines, orderDiscounts, appliedPromotions, warnings };
}
function calculatePromotionEngine({ customerCode = '', orderDate = '', items = [], rules = [] } = {}) {
  const lines = (items || []).map(normalizeLine);
  const activeRules = (rules || []).filter((rule) => isActiveRule(rule, orderDate));
  const quantityRules = activeRules
    .filter((rule) => clean(rule.promotionType || rule.type) === PROMOTION_TYPES.QUANTITY_GROUP_PERCENT_DISCOUNT)
    .sort((a, b) => toNumber(a.priority) - toNumber(b.priority));
  const customerRules = activeRules
    .filter((rule) => clean(rule.promotionType || rule.type) === PROMOTION_TYPES.CUSTOMER_ORDER_VALUE_EXTRA_PERCENT)
    .sort((a, b) => toNumber(a.priority) - toNumber(b.priority));

  const q = calcQuantityGroupRules(lines, quantityRules, { orderDate });
  const c = calcCustomerOrderValueRules(q.lines, customerRules, { orderDate, customerCode });
  const grossAmount = c.lines.reduce((sum, line) => sum + toNumber(line.lineAmount), 0);
  const lineDiscountAmount = c.lines.reduce((sum, line) => sum + toNumber(line.discountAmount), 0);
  const orderDiscountAmount = c.orderDiscounts.reduce((sum, item) => sum + toNumber(item.discountAmount), 0);
  return {
    items: c.lines.map((line) => ({ ...line, finalLineAmount: Math.max(0, toNumber(line.lineAmount) - toNumber(line.discountAmount)) })),
    orderDiscounts: c.orderDiscounts,
    appliedPromotions: [...q.appliedPromotions, ...c.appliedPromotions],
    summary: {
      grossAmount,
      lineDiscountAmount,
      orderDiscountAmount,
      finalAmount: Math.max(0, grossAmount - lineDiscountAmount)
    },
    warnings: [...q.warnings, ...c.warnings]
  };
}

module.exports = {
  PROMOTION_TYPES,
  normalizeDiscountPercent,
  calculatePromotionEngine
};
