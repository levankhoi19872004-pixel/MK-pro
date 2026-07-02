'use strict';

// Legacy-only compatibility layer. New orders must persist appliedPromotionRows.
// This service never overwrites historical price/pack/warehouse snapshots.
const PromotionProductRule = require('../../models/PromotionProductRule');
const PromotionGroupItem = require('../../models/PromotionGroupItem');
const PromotionGroupRule = require('../../models/PromotionGroupRule');
const { toNumber } = require('../../utils/common.util');
const { cleanText } = require('./PrintContract');
const { normalizeLine } = require('./PrintLineNormalizer');
const PrintPromotionPolicy = require('./PrintPromotionPolicy');

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function promotionRowsOf(item = {}) {
  return asArray(item.appliedPromotionRows).length
    ? asArray(item.appliedPromotionRows)
    : asArray(item.promotionRows).length
      ? asArray(item.promotionRows)
      : asArray(item.appliedPromotions).length
        ? asArray(item.appliedPromotions)
        : [];
}

function codeOf(rule = {}) {
  return cleanText(rule.programCode || rule.promotionCode || rule.code || rule.maCTKM || rule.maChuongTrinh);
}

function nameOf(rule = {}) {
  return cleanText(rule.programName || rule.promotionName || rule.name || rule.description || rule.content || rule.noiDungChuongTrinh);
}

function addToMapList(map, key, value) {
  const normalized = cleanText(key);
  if (!normalized) return;
  if (!map.has(normalized)) map.set(normalized, []);
  map.get(normalized).push(value);
}

function normalizeBasis(rule = {}) {
  const raw = cleanText(rule.basis || rule.calculationBasis || 'ORDER_VALUE').toUpperCase();
  return raw === 'QUANTITY' ? 'QUANTITY' : 'ORDER_VALUE';
}

function bestGroupRule(rules = [], totalAmount = 0, totalQty = 0) {
  return rules
    .filter((rule) => (normalizeBasis(rule) === 'QUANTITY' ? totalQty : totalAmount) >= toNumber(rule.minAmount))
    .sort((a, b) => toNumber(b.minAmount) - toNumber(a.minAmount))[0] || null;
}

function productCodeOf(item = {}) {
  return cleanText(item.productCode || item.code || item.sku || item.productId || item.productSnapshot?.code);
}

function productFor(productMap, code) {
  return productMap instanceof Map ? (productMap.get(code) || {}) : {};
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== '');
}

function lineAmounts(item = {}, order = {}, product = {}) {
  const line = normalizeLine(item, { parent: order, product, mode: 'sale' });
  // Snapshot/catalog fields win. For genuinely legacy rows without catalog snapshot,
  // current product.salePrice is only a compatibility fallback for promotion display.
  const promotionCatalogPrice = toNumber(firstDefined(
    item.catalogSalePriceAtOrder,
    item.productSnapshot?.salePrice,
    item.catalogSalePrice,
    item.grossPrice,
    item.priceAfterTaxBeforePromotion,
    item.priceAfterVatBeforeDiscount,
    product.salePrice,
    product.price,
    item.salePrice,
    item.price,
    0
  ));
  const grossAfterTax = Math.round(toNumber(line.quantity) * promotionCatalogPrice);
  return {
    line: { ...line, catalogPrice: promotionCatalogPrice || line.catalogPrice },
    grossAfterTax,
    beforeTax: Math.round(grossAfterTax / 1.08)
  };
}

async function loadRuleContext(productCodes = []) {
  const codes = [...new Set(productCodes.map(cleanText).filter(Boolean))];
  if (!codes.length) {
    return { productRuleMap: new Map(), groupItemMap: new Map(), groupRuleMap: new Map() };
  }

  const [productRules, groupItems] = await Promise.all([
    PromotionProductRule.find({
      isActive: { $ne: false },
      productCode: { $in: codes }
    }).lean(),
    PromotionGroupItem.find({
      isActive: { $ne: false },
      productCode: { $in: codes }
    }).lean()
  ]);

  const productRuleMap = new Map();
  for (const rule of productRules) addToMapList(productRuleMap, rule.productCode, rule);

  const groupItemMap = new Map();
  const groupCodes = new Set();
  for (const row of groupItems) {
    addToMapList(groupItemMap, row.productCode, row);
    const programCode = codeOf(row);
    if (programCode) groupCodes.add(programCode);
  }

  const groupRules = groupCodes.size
    ? await PromotionGroupRule.find({
      isActive: { $ne: false },
      programCode: { $in: Array.from(groupCodes) }
    }).lean()
    : [];

  const groupRuleMap = new Map();
  for (const rule of groupRules) addToMapList(groupRuleMap, codeOf(rule), rule);

  return { productRuleMap, groupItemMap, groupRuleMap };
}

function buildOrderGroupTotals(order = {}, productMap = new Map(), context = {}) {
  const totals = new Map();
  for (const item of asArray(order.items)) {
    const productCode = productCodeOf(item);
    const product = productFor(productMap, productCode);
    const amounts = lineAmounts(item, order, product);
    for (const groupItem of asArray(context.groupItemMap?.get(productCode))) {
      const programCode = codeOf(groupItem);
      if (!programCode) continue;
      totals.set(programCode, toNumber(totals.get(programCode)) + amounts.beforeTax);
    }
  }
  return totals;
}

function buildOrderGroupQtyTotals(order = {}, context = {}) {
  const totals = new Map();
  for (const item of asArray(order.items)) {
    const productCode = productCodeOf(item);
    const { line } = lineAmounts(item, order, {});
    for (const groupItem of asArray(context.groupItemMap?.get(productCode))) {
      const programCode = codeOf(groupItem);
      if (!programCode) continue;
      totals.set(programCode, toNumber(totals.get(programCode)) + toNumber(line.quantity));
    }
  }
  return totals;
}

function buildLegacyRows(item = {}, order = {}, productMap = new Map(), context = {}, groupTotals = new Map(), groupQtyTotals = new Map()) {
  if (promotionRowsOf(item).length) return promotionRowsOf(item);

  const productCode = productCodeOf(item);
  const product = productFor(productMap, productCode);
  const { line, grossAfterTax, beforeTax } = lineAmounts(item, order, product);
  if (!productCode || line.quantity <= 0 || grossAfterTax <= 0) return [];

  const rows = [];
  for (const rule of asArray(context.productRuleMap?.get(productCode))) {
    const programCode = codeOf(rule);
    const percent = toNumber(rule.discountPercent || rule.percent || rule.rate);
    if (!programCode || percent <= 0) continue;
    const discountAfterTax = Math.round(grossAfterTax * percent / 100);
    if (discountAfterTax <= 0) continue;
    rows.push({
      promotionCode: programCode,
      code: programCode,
      description: nameOf(rule),
      qualifiedAmount: beforeTax,
      discountPercent: percent,
      discountBeforeTax: Math.round(discountAfterTax / 1.08),
      discountAfterTax,
      promotionType: 'product',
      scope: 'product',
      productCode,
      productName: line.productName
    });
  }

  for (const groupItem of asArray(context.groupItemMap?.get(productCode))) {
    const programCode = codeOf(groupItem);
    const groupTotal = toNumber(groupTotals.get(programCode));
    const groupQty = toNumber(groupQtyTotals.get(programCode));
    const rule = bestGroupRule(context.groupRuleMap?.get(programCode), groupTotal, groupQty);
    const percent = toNumber(rule?.discountPercent || rule?.percent || rule?.rate);
    if (!programCode || !rule || percent <= 0 || groupTotal <= 0) continue;
    const discountAfterTax = Math.round(grossAfterTax * percent / 100);
    if (discountAfterTax <= 0) continue;
    rows.push({
      promotionCode: programCode,
      code: programCode,
      description: nameOf(rule) || nameOf(groupItem),
      qualifiedAmount: beforeTax,
      groupQualifiedAmount: groupTotal,
      groupQualifiedQuantity: groupQty,
      basis: normalizeBasis(rule),
      calculationBasis: normalizeBasis(rule),
      discountPercent: percent,
      discountBeforeTax: Math.round(discountAfterTax / 1.08),
      discountAfterTax,
      promotionType: 'group',
      scope: 'group',
      productCode,
      productName: line.productName
    });
  }

  return rows;
}

async function enrichSalesOrders(orders = [], productMap = new Map()) {
  const documents = asArray(orders).map((order) => (
    PrintPromotionPolicy.shouldSuppressPromotionDetails(order)
      ? PrintPromotionPolicy.suppressPromotionDetails(order)
      : order
  ));

  const eligibleDocuments = documents.filter(PrintPromotionPolicy.shouldApplyLegacyPromotionFallback);
  const missingItems = eligibleDocuments.flatMap((order) => (
    asArray(order.items).filter((item) => !promotionRowsOf(item).length)
  ));
  const productCodes = missingItems.map(productCodeOf).filter(Boolean);
  if (!productCodes.length) return documents;

  const context = await loadRuleContext(productCodes);
  return documents.map((order) => {
    if (!PrintPromotionPolicy.shouldApplyLegacyPromotionFallback(order)) return order;

    const groupTotals = buildOrderGroupTotals(order, productMap, context);
    const groupQtyTotals = buildOrderGroupQtyTotals(order, context);
    let fallbackApplied = false;
    const items = asArray(order.items).map((item) => {
      if (promotionRowsOf(item).length) return item;
      const promotionRows = buildLegacyRows(item, order, productMap, context, groupTotals, groupQtyTotals);
      if (!promotionRows.length) return item;
      fallbackApplied = true;
      return { ...item, promotionRows, legacyPromotionFallback: true };
    });
    return fallbackApplied ? { ...order, items, legacyPromotionFallbackApplied: true } : order;
  });
}

module.exports = {
  enrichSalesOrders,
  promotionRowsOf,
  buildLegacyRows,
  buildOrderGroupTotals
};
