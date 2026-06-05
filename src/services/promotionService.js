'use strict';

const dateUtil = require('../utils/date.util');
const promotionRepository = require('../repositories/promotionRepository');
const Product = require('../models/Product');
const PromotionProductRule = require('../models/PromotionProductRule');
const PromotionGroupItem = require('../models/PromotionGroupItem');
const PromotionGroupRule = require('../models/PromotionGroupRule');
const { makeId, toNumber } = require('../utils/common.util');

function clean(value) { return String(value ?? '').trim(); }
function rx(q) { return new RegExp(String(q || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'); }

function normalizeProductCodes(value) {
  if (Array.isArray(value)) return value.map((item) => clean(item)).filter(Boolean);
  return clean(value).split(/[\n,;]+/).map((item) => item.trim()).filter(Boolean);
}

async function listPromotions(query = {}) { return promotionRepository.findAll(query); }

async function savePromotion(body = {}) {
  const now = dateUtil.nowIso();
  const payload = {
    ...body,
    id: clean(body.id || makeId('PR')),
    code: clean(body.code),
    name: clean(body.name),
    type: clean(body.type || 'discount'),
    productCodes: normalizeProductCodes(body.productCodes),
    conditionText: clean(body.conditionText),
    discountText: clean(body.discountText),
    displayReward: clean(body.displayReward),
    couponText: clean(body.couponText),
    ontopText: clean(body.ontopText),
    startDate: dateUtil.toDateOnly(body.startDate),
    endDate: dateUtil.toDateOnly(body.endDate),
    note: clean(body.note),
    isActive: body.isActive !== false && body.isActive !== 'false',
    updatedAt: now
  };
  if (!payload.code) return { error: 'Thiếu mã CTKM', status: 400 };
  if (!payload.name) return { error: 'Thiếu tên/nội dung chương trình', status: 400 };
  if (!payload.createdAt) payload.createdAt = now;
  const promotion = await promotionRepository.upsert(payload);
  return { promotion };
}

async function deletePromotion(id) {
  const deleted = await promotionRepository.remove(id);
  if (!deleted) return { error: 'Không tìm thấy chương trình khuyến mại', status: 404 };
  return { deleted: true };
}

async function findProduct(productCode) {
  const code = clean(productCode);
  if (!code) return null;
  return Product.findOne({ $or: [{ code }, { productCode: code }, { sku: code }, { barcode: code }, { id: code }] }).lean();
}

async function hydrateProduct(productCode) {
  const product = await findProduct(productCode);
  return {
    product,
    productCode: clean(product?.code || product?.productCode || productCode),
    productName: clean(product?.name || '')
  };
}

async function listProductRules(query = {}) {
  const q = clean(query.q);
  const filter = q ? { $or: [{ programCode: rx(q) }, { programName: rx(q) }, { productCode: rx(q) }, { productName: rx(q) }] } : {};
  return PromotionProductRule.find(filter).sort({ programCode: 1, productCode: 1 }).lean();
}

async function saveProductRule(body = {}) {
  const programCode = clean(body.programCode || body.code);
  const programName = clean(body.programName || body.name || body.content || body.programContent);
  const discountPercent = toNumber(body.discountPercent ?? body.discount ?? body.ck);
  const { product, productCode, productName } = await hydrateProduct(body.productCode || body.codeProduct);
  if (!programCode) return { error: 'Thiếu mã chương trình', status: 400 };
  if (!programName) return { error: 'Thiếu nội dung chương trình', status: 400 };
  if (!productCode) return { error: 'Thiếu mã sản phẩm', status: 400 };
  if (!product) return { error: `Không tìm thấy sản phẩm ${productCode} trong danh mục`, status: 400 };
  if (discountPercent < 0) return { error: 'Chiết khấu không được âm', status: 400 };
  const now = dateUtil.nowIso();
  const id = clean(body.id) || `${programCode}__${productCode}`;
  const existing = await PromotionProductRule.findOne({ $or: [{ id }, { programCode, productCode }] });
  const payload = { id, programCode, programName, productCode, productName, discountPercent, isActive: body.isActive !== false && body.isActive !== 'false', updatedAt: now };
  if (existing) { Object.assign(existing, payload); return { rule: await existing.save() }; }
  return { rule: await PromotionProductRule.create({ ...payload, createdAt: now }) };
}

async function deleteProductRule(id) {
  const value = clean(id);
  const result = await PromotionProductRule.deleteOne({ $or: [{ id: value }, { _id: /^[a-f0-9]{24}$/i.test(value) ? value : null }] });
  return { deleted: result.deletedCount > 0 };
}

async function listGroupItems(query = {}) {
  const q = clean(query.q);
  const filter = q ? { $or: [{ programCode: rx(q) }, { productCode: rx(q) }, { productName: rx(q) }] } : {};
  return PromotionGroupItem.find(filter).sort({ programCode: 1, productCode: 1 }).lean();
}

async function saveGroupItem(body = {}) {
  const programCode = clean(body.programCode || body.groupCode || body.code);
  const { product, productCode, productName } = await hydrateProduct(body.productCode || body.codeProduct);
  if (!programCode) return { error: 'Thiếu mã chương trình KM / mã nhóm', status: 400 };
  if (!productCode) return { error: 'Thiếu mã sản phẩm', status: 400 };
  if (!product) return { error: `Không tìm thấy sản phẩm ${productCode} trong danh mục`, status: 400 };
  const now = dateUtil.nowIso();
  const id = clean(body.id) || `${programCode}__${productCode}`;
  const existing = await PromotionGroupItem.findOne({ $or: [{ id }, { programCode, productCode }] });
  const payload = { id, programCode, productCode, productName, isActive: body.isActive !== false && body.isActive !== 'false', updatedAt: now };
  if (existing) { Object.assign(existing, payload); return { item: await existing.save() }; }
  return { item: await PromotionGroupItem.create({ ...payload, createdAt: now }) };
}

async function deleteGroupItem(id) {
  const value = clean(id);
  const result = await PromotionGroupItem.deleteOne({ $or: [{ id: value }, { _id: /^[a-f0-9]{24}$/i.test(value) ? value : null }] });
  return { deleted: result.deletedCount > 0 };
}

async function listGroupRules(query = {}) {
  const q = clean(query.q);
  const filter = q ? { $or: [{ programCode: rx(q) }, { programName: rx(q) }] } : {};
  return PromotionGroupRule.find(filter).sort({ programCode: 1, minAmount: 1 }).lean();
}

async function saveGroupRule(body = {}) {
  const programCode = clean(body.programCode || body.groupCode || body.code);
  const programName = clean(body.programName || body.name || body.content || body.programContent);
  const minAmount = toNumber(body.minAmount ?? body.requiredAmount ?? body.salesAmount);
  const discountPercent = toNumber(body.discountPercent ?? body.discount ?? body.ck);
  if (!programCode) return { error: 'Thiếu mã nhóm sản phẩm / mã chương trình', status: 400 };
  if (!programName) return { error: 'Thiếu nội dung chương trình KM', status: 400 };
  if (minAmount <= 0) return { error: 'Mức doanh số cần lấy phải lớn hơn 0', status: 400 };
  if (discountPercent < 0) return { error: 'Chiết khấu không được âm', status: 400 };
  const now = dateUtil.nowIso();
  const id = clean(body.id) || `${programCode}__${minAmount}`;
  const existing = await PromotionGroupRule.findOne({ $or: [{ id }, { programCode, minAmount }] });
  const payload = { id, programCode, programName, minAmount, discountPercent, isActive: body.isActive !== false && body.isActive !== 'false', updatedAt: now };
  if (existing) { Object.assign(existing, payload); return { rule: await existing.save() }; }
  return { rule: await PromotionGroupRule.create({ ...payload, createdAt: now }) };
}

async function deleteGroupRule(id) {
  const value = clean(id);
  const result = await PromotionGroupRule.deleteOne({ $or: [{ id: value }, { _id: /^[a-f0-9]{24}$/i.test(value) ? value : null }] });
  return { deleted: result.deletedCount > 0 };
}

async function calculatePromotions(items = []) {
  const productCodes = Array.from(new Set((items || []).map((i) => clean(i.productCode || i.code)).filter(Boolean)));
  const products = productCodes.length ? await Product.find({ $or: [{ code: { $in: productCodes } }, { productCode: { $in: productCodes } }, { sku: { $in: productCodes } }] }).lean() : [];
  const productMap = new Map(products.map((p) => [clean(p.code || p.productCode || p.sku), p]));
  const productRules = await PromotionProductRule.find({ isActive: { $ne: false }, productCode: { $in: productCodes } }).lean();
  const productRuleMap = new Map(productRules.map((r) => [clean(r.productCode), r]));
  const groupItems = await PromotionGroupItem.find({ isActive: { $ne: false }, productCode: { $in: productCodes } }).lean();
  const groupCodes = Array.from(new Set(groupItems.map((i) => clean(i.programCode)).filter(Boolean)));
  const groupRules = groupCodes.length ? await PromotionGroupRule.find({ isActive: { $ne: false }, programCode: { $in: groupCodes } }).sort({ minAmount: 1 }).lean() : [];
  const groupByProduct = new Map(groupItems.map((item) => [clean(item.productCode), clean(item.programCode)]));
  const groupTotals = new Map();

  const lines = (items || []).map((item) => {
    const productCode = clean(item.productCode || item.code);
    const product = productMap.get(productCode) || {};
    const quantity = toNumber(item.quantity ?? item.qty);
    // Quy tắc khóa cứng: mọi CTKM tính theo giá bán lưu trong danh mục sản phẩm.
    const catalogSalePrice = toNumber(product.salePrice ?? product.price);
    const promotionBaseAmount = Math.round(quantity * catalogSalePrice);
    const groupCode = groupByProduct.get(productCode) || '';
    if (groupCode) groupTotals.set(groupCode, toNumber(groupTotals.get(groupCode)) + promotionBaseAmount);
    const directRule = productRuleMap.get(productCode);
    return { ...item, productCode, productName: clean(item.productName || product.name), quantity, catalogSalePrice, promotionBaseAmount, directDiscountPercent: toNumber(directRule?.discountPercent), groupCode };
  });

  const bestGroupRule = new Map();
  for (const groupCode of groupCodes) {
    const total = toNumber(groupTotals.get(groupCode));
    const matched = groupRules.filter((rule) => clean(rule.programCode) === groupCode && total >= toNumber(rule.minAmount)).sort((a, b) => toNumber(b.minAmount) - toNumber(a.minAmount))[0];
    if (matched) bestGroupRule.set(groupCode, matched);
  }

  const resultLines = lines.map((line) => {
    const groupRule = bestGroupRule.get(line.groupCode);
    const groupDiscountPercent = toNumber(groupRule?.discountPercent);
    const directDiscountAmount = Math.round(line.promotionBaseAmount * line.directDiscountPercent / 100);
    const groupDiscountAmount = Math.round(line.promotionBaseAmount * groupDiscountPercent / 100);
    return { ...line, groupDiscountPercent, groupDiscountAmount, directDiscountAmount, totalDiscountAmount: directDiscountAmount + groupDiscountAmount };
  });

  return {
    lines: resultLines,
    groupTotals: Object.fromEntries(groupTotals.entries()),
    totalDirectDiscount: resultLines.reduce((s, i) => s + toNumber(i.directDiscountAmount), 0),
    totalGroupDiscount: resultLines.reduce((s, i) => s + toNumber(i.groupDiscountAmount), 0),
    totalDiscount: resultLines.reduce((s, i) => s + toNumber(i.totalDiscountAmount), 0)
  };
}

module.exports = {
  listPromotions, savePromotion, deletePromotion,
  listProductRules, saveProductRule, deleteProductRule,
  listGroupItems, saveGroupItem, deleteGroupItem,
  listGroupRules, saveGroupRule, deleteGroupRule,
  calculatePromotions
};
