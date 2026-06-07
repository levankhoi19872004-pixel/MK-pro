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

function normalizeDiscountPercent(value) {
  const raw = toNumber(value);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  if (raw <= 1) return Math.round(raw * 10000) / 100;
  return Math.round(raw * 100) / 100;
}

function normalizeProductCodes(value) {
  if (Array.isArray(value)) return value.map((item) => clean(item)).filter(Boolean);
  return clean(value).split(/[\n,;]+/).map((item) => item.trim()).filter(Boolean);
}


function normalizeProgramCode(value) {
  return clean(value || '').toUpperCase();
}


function exactProgramCodeFilter(programCode) {
  const code = clean(programCode);
  return { programCode: new RegExp(`^${code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') };
}

function normalizeActive(value) {
  return value !== false && value !== 'false' && value !== '0' && value !== 0;
}

function normalizeProgramDates(body = {}) {
  return {
    startDate: dateUtil.toDateOnly(body.startDate || body.fromDate || body.dateFrom || ''),
    endDate: dateUtil.toDateOnly(body.endDate || body.toDate || body.dateTo || '')
  };
}

function isRuleActiveByDate(rule = {}, targetDate = '') {
  if (rule.isActive === false) return false;
  const date = dateUtil.toDateOnly(targetDate || '');
  if (!date) return true;
  const startDate = dateUtil.toDateOnly(rule.startDate || '');
  const endDate = dateUtil.toDateOnly(rule.endDate || '');
  if (startDate && date < startDate) return false;
  if (endDate && date > endDate) return false;
  return true;
}

function mergeProgramMeta(target, row = {}, source = '') {
  const programCode = normalizeProgramCode(row.programCode || row.code || row.groupCode);
  if (!programCode) return;
  if (!target.programCode) target.programCode = programCode;
  if (!target.programName) target.programName = clean(row.programName || row.name || row.content || row.programContent || row.description);
  const startDate = dateUtil.toDateOnly(row.startDate || '');
  const endDate = dateUtil.toDateOnly(row.endDate || '');
  if (startDate && (!target.startDate || startDate < target.startDate)) target.startDate = startDate;
  if (endDate && (!target.endDate || endDate > target.endDate)) target.endDate = endDate;
  target.isActive = target.isActive !== false && row.isActive !== false;
  target.sources.add(source);
  target.lineCount += 1;
}

function programStatus(program = {}) {
  if (program.isActive === false) return 'Không hoạt động';
  const today = dateUtil.toDateOnly(new Date());
  if (program.startDate && today < program.startDate) return 'Chưa tới hạn';
  if (program.endDate && today > program.endDate) return 'Hết hạn';
  return 'Hoạt động';
}

function toProgramSummary(group) {
  const productCodes = Array.from(group.productCodes).filter(Boolean);
  return {
    programCode: group.programCode,
    programName: group.programName || group.programCode,
    content: group.programName || group.programCode,
    startDate: group.startDate || '',
    endDate: group.endDate || '',
    timeText: [group.startDate || '', group.endDate || ''].filter(Boolean).join(' - '),
    isActive: group.isActive !== false,
    statusText: programStatus(group),
    productCount: productCodes.length,
    productCodes,
    lineCount: group.lineCount,
    sources: Array.from(group.sources)
  };
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
  const programCode = normalizeProgramCode(body.programCode || body.code);
  const programName = clean(body.programName || body.name || body.content || body.programContent);
  const discountPercent = normalizeDiscountPercent(body.discountPercent ?? body.discount ?? body.ck ?? body['Chiết khấu'] ?? body['Chiet khau'] ?? body['CK']);
  const { product, productCode, productName: catalogProductName } = await hydrateProduct(body.productCode || body.codeProduct || body['Mã sản phẩm'] || body['Ma san pham']);
  const productName = clean(catalogProductName || body.productName || body['Tên sản phẩm'] || body['Ten san pham'] || '');
  if (!programCode) return { error: 'Thiếu mã chương trình', status: 400 };
  if (!programName) return { error: 'Thiếu nội dung chương trình', status: 400 };
  if (!productCode) return { error: 'Thiếu mã sản phẩm', status: 400 };
  const now = dateUtil.nowIso();
  const { startDate, endDate } = normalizeProgramDates(body);
  const id = clean(body.id) || `${programCode}__${productCode}`;
  const existing = await PromotionProductRule.findOne({ $or: [{ id }, { programCode, productCode }] });
  const payload = {
    id,
    programCode,
    programName,
    productCode,
    productName,
    discountPercent,
    productMatched: Boolean(product),
    missingProduct: !product,
    source: clean(body.source || body.importSource || 'excel-import'),
    startDate,
    endDate,
    isActive: normalizeActive(body.isActive),
    updatedAt: now
  };
  if (existing) { Object.assign(existing, payload); return { rule: await existing.save(), warning: product ? '' : `Mã sản phẩm ${productCode} chưa có trong danh mục` }; }
  return { rule: await PromotionProductRule.create({ ...payload, createdAt: now }), warning: product ? '' : `Mã sản phẩm ${productCode} chưa có trong danh mục` };
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
  const programCode = normalizeProgramCode(body.programCode || body.groupCode || body.code);
  const { product, productCode, productName: catalogProductName } = await hydrateProduct(body.productCode || body.codeProduct || body['Mã sản phẩm'] || body['Ma san pham']);
  const productName = clean(catalogProductName || body.productName || body['Tên sản phẩm'] || body['Ten san pham'] || '');
  if (!programCode) return { error: 'Thiếu mã chương trình KM / mã nhóm', status: 400 };
  if (!productCode) return { error: 'Thiếu mã sản phẩm', status: 400 };
  const now = dateUtil.nowIso();
  const { startDate, endDate } = normalizeProgramDates(body);
  const id = clean(body.id) || `${programCode}__${productCode}`;
  const existing = await PromotionGroupItem.findOne({ $or: [{ id }, { programCode, productCode }] });
  const payload = {
    id,
    programCode,
    productCode,
    productName,
    productMatched: Boolean(product),
    missingProduct: !product,
    source: clean(body.source || body.importSource || 'excel-import'),
    startDate,
    endDate,
    isActive: normalizeActive(body.isActive),
    updatedAt: now
  };
  if (existing) { Object.assign(existing, payload); return { item: await existing.save(), warning: product ? '' : `Mã sản phẩm ${productCode} chưa có trong danh mục` }; }
  return { item: await PromotionGroupItem.create({ ...payload, createdAt: now }), warning: product ? '' : `Mã sản phẩm ${productCode} chưa có trong danh mục` };
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
  const programCode = normalizeProgramCode(body.programCode || body.groupCode || body.code);
  const programName = clean(body.programName || body.name || body.content || body.programContent);
  const minAmount = toNumber(body.minAmount ?? body.requiredAmount ?? body.salesAmount);
  const discountPercent = normalizeDiscountPercent(body.discountPercent ?? body.discount ?? body.ck ?? body['Chiết khấu'] ?? body['Chiet khau'] ?? body['CK']);
  if (!programCode) return { error: 'Thiếu mã nhóm sản phẩm / mã chương trình', status: 400 };
  if (!programName) return { error: 'Thiếu nội dung chương trình KM', status: 400 };
  if (minAmount <= 0) return { error: 'Mức doanh số cần lấy phải lớn hơn 0', status: 400 };
  if (discountPercent < 0) return { error: 'Chiết khấu không được âm', status: 400 };
  const now = dateUtil.nowIso();
  const { startDate, endDate } = normalizeProgramDates(body);
  const id = clean(body.id) || `${programCode}__${minAmount}`;
  const existing = await PromotionGroupRule.findOne({ $or: [{ id }, { programCode, minAmount }] });
  const payload = { id, programCode, programName, minAmount, discountPercent, startDate, endDate, isActive: normalizeActive(body.isActive), updatedAt: now };
  if (existing) { Object.assign(existing, payload); return { rule: await existing.save() }; }
  return { rule: await PromotionGroupRule.create({ ...payload, createdAt: now }) };
}

async function deleteGroupRule(id) {
  const value = clean(id);
  const result = await PromotionGroupRule.deleteOne({ $or: [{ id: value }, { _id: /^[a-f0-9]{24}$/i.test(value) ? value : null }] });
  return { deleted: result.deletedCount > 0 };
}


function normalizeProgramType(value) {
  const type = clean(value || 'productRules');
  if (['productRules', 'groupItems', 'groupRules'].includes(type)) return type;
  return 'productRules';
}

function promotionTypeConfig(typeValue) {
  const type = normalizeProgramType(typeValue);
  if (type === 'groupItems') {
    return {
      type,
      source: 'promotionGroupItems',
      Model: PromotionGroupItem,
      sort: { programCode: 1, productCode: 1 },
      searchFields: ['programCode', 'programName', 'productCode', 'productName']
    };
  }
  if (type === 'groupRules') {
    return {
      type,
      source: 'promotionGroupRules',
      Model: PromotionGroupRule,
      sort: { programCode: 1, minAmount: 1 },
      searchFields: ['programCode', 'programName']
    };
  }
  return {
    type,
    source: 'promotionProductRules',
    Model: PromotionProductRule,
    sort: { programCode: 1, productCode: 1 },
    searchFields: ['programCode', 'programName', 'productCode', 'productName']
  };
}

function buildProgramSearchFilter(query = {}, cfg) {
  const q = clean(query.q);
  if (!q) return {};
  return { $or: (cfg.searchFields || ['programCode']).map((field) => ({ [field]: rx(q) })) };
}

function programNameFromRow(row = {}, fallback = '') {
  return clean(row.programName || row.name || row.content || row.programContent || row.description || fallback);
}

async function listPromotionPrograms(query = {}) {
  const cfg = promotionTypeConfig(query.type);
  const rows = await cfg.Model.find(buildProgramSearchFilter(query, cfg)).sort(cfg.sort).lean();
  const groups = new Map();
  function ensure(code) {
    const programCode = normalizeProgramCode(code);
    if (!programCode) return null;
    if (!groups.has(programCode)) {
      groups.set(programCode, { programCode, programName: '', startDate: '', endDate: '', isActive: true, productCodes: new Set(), sources: new Set(), lineCount: 0 });
    }
    return groups.get(programCode);
  }
  for (const row of rows) {
    const group = ensure(row.programCode || row.groupCode || row.code);
    if (!group) continue;
    mergeProgramMeta(group, row, cfg.source);
    if (!group.programName && cfg.type === 'groupItems') group.programName = group.programCode;
    if (row.productCode) group.productCodes.add(clean(row.productCode));
  }
  return Array.from(groups.values()).map(toProgramSummary).sort((a, b) => String(a.programCode).localeCompare(String(b.programCode), 'vi'));
}

async function getPromotionProgramDetail(programCodeValue, query = {}) {
  const programCode = normalizeProgramCode(programCodeValue);
  if (!programCode) return { error: 'Thiếu mã chương trình', status: 400 };
  const cfg = promotionTypeConfig(query.type);
  const rows = await cfg.Model.find(exactProgramCodeFilter(programCode)).sort(cfg.sort).lean();
  if (!rows.length) return { error: 'Không tìm thấy chương trình khuyến mại', status: 404 };
  const group = { programCode, programName: '', startDate: '', endDate: '', isActive: true, productCodes: new Set(), sources: new Set(), lineCount: 0 };
  rows.forEach((row) => { mergeProgramMeta(group, row, cfg.source); if (row.productCode) group.productCodes.add(clean(row.productCode)); });
  if (!group.programName && cfg.type === 'groupItems') group.programName = programCode;
  return {
    type: cfg.type,
    program: toProgramSummary(group),
    productRules: cfg.type === 'productRules' ? rows : [],
    groupItems: cfg.type === 'groupItems' ? rows : [],
    groupRules: cfg.type === 'groupRules' ? rows : [],
    products: cfg.type === 'productRules' ? rows.map((row) => ({ source: 'CK sản phẩm', productCode: row.productCode, productName: row.productName, minAmount: '', discountPercent: row.discountPercent, isActive: row.isActive !== false }))
      : cfg.type === 'groupItems' ? rows.map((row) => ({ source: 'Nhóm sản phẩm', productCode: row.productCode, productName: row.productName, minAmount: '', discountPercent: '', isActive: row.isActive !== false }))
      : rows.map((row) => ({ source: 'Điều kiện nhóm', productCode: '', productName: '', minAmount: row.minAmount, discountPercent: row.discountPercent, isActive: row.isActive !== false }))
  };
}

async function updatePromotionProgram(programCodeValue, body = {}, query = {}) {
  const programCode = normalizeProgramCode(programCodeValue || body.programCode);
  if (!programCode) return { error: 'Thiếu mã chương trình', status: 400 };
  const cfg = promotionTypeConfig(query.type || body.type);
  const now = dateUtil.nowIso();
  const { startDate, endDate } = normalizeProgramDates(body);
  const set = { updatedAt: now };
  if (body.programName !== undefined || body.content !== undefined || body.name !== undefined) set.programName = clean(body.programName || body.content || body.name);
  if (body.isActive !== undefined) set.isActive = normalizeActive(body.isActive);
  if (body.status !== undefined) set.isActive = clean(body.status) === 'active' || clean(body.status) === 'Hoạt động';
  if (body.startDate !== undefined || body.fromDate !== undefined || body.dateFrom !== undefined) set.startDate = startDate;
  if (body.endDate !== undefined || body.toDate !== undefined || body.dateTo !== undefined) set.endDate = endDate;
  const result = await cfg.Model.updateMany(exactProgramCodeFilter(programCode), { $set: set });
  const matched = toNumber(result.matchedCount);
  if (!matched) return { error: 'Không tìm thấy chương trình khuyến mại', status: 404 };
  const detail = await getPromotionProgramDetail(programCode, { type: cfg.type });
  return { updated: toNumber(result.modifiedCount), type: cfg.type, program: detail.program };
}

async function cancelPromotionProgram(programCodeValue, query = {}) {
  const programCode = normalizeProgramCode(programCodeValue);
  if (!programCode) return { error: 'Thiếu mã chương trình', status: 400 };
  const cfg = promotionTypeConfig(query.type);
  const now = dateUtil.nowIso();
  const set = { isActive: false, cancelledAt: now, updatedAt: now };
  const result = await cfg.Model.updateMany(exactProgramCodeFilter(programCode), { $set: set });
  if (!toNumber(result.matchedCount)) return { error: 'Không tìm thấy chương trình khuyến mại', status: 404 };
  return { cancelled: true, type: cfg.type };
}

async function calculatePromotions(items = [], options = {}) {
  const productCodes = Array.from(new Set((items || []).map((i) => clean(i.productCode || i.code)).filter(Boolean)));
  const products = productCodes.length ? await Product.find({ $or: [{ code: { $in: productCodes } }, { productCode: { $in: productCodes } }, { sku: { $in: productCodes } }] }).lean() : [];
  const productMap = new Map(products.map((p) => [clean(p.code || p.productCode || p.sku), p]));
  const targetDate = dateUtil.toDateOnly(options.date || options.orderDate || options.saleDate || '');
  const productRules = (await PromotionProductRule.find({ isActive: { $ne: false }, productCode: { $in: productCodes } }).lean()).filter((rule) => isRuleActiveByDate(rule, targetDate));
  const productRuleMap = new Map(productRules.map((r) => [clean(r.productCode), r]));
  const groupItems = (await PromotionGroupItem.find({ isActive: { $ne: false }, productCode: { $in: productCodes } }).lean()).filter((rule) => isRuleActiveByDate(rule, targetDate));
  const groupCodes = Array.from(new Set(groupItems.map((i) => clean(i.programCode)).filter(Boolean)));
  const groupRules = groupCodes.length ? (await PromotionGroupRule.find({ isActive: { $ne: false }, programCode: { $in: groupCodes } }).sort({ minAmount: 1 }).lean()).filter((rule) => isRuleActiveByDate(rule, targetDate)) : [];
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
    const directPromotionRule = directRule ? {
      programCode: clean(directRule.programCode || directRule.code),
      programName: clean(directRule.programName || directRule.name || directRule.description || directRule.content),
      discountPercent: toNumber(directRule.discountPercent)
    } : null;
    return {
      ...item,
      productCode,
      productName: clean(item.productName || product.name),
      quantity,
      catalogSalePrice,
      promotionBaseAmount,
      directDiscountPercent: toNumber(directRule?.discountPercent),
      directPromotionRule,
      groupCode
    };
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
    const promotionRows = [];

    if (line.directPromotionRule && directDiscountAmount > 0) {
      promotionRows.push({
        promotionCode: line.directPromotionRule.programCode,
        code: line.directPromotionRule.programCode,
        description: line.directPromotionRule.programName,
        qualifiedAmount: line.promotionBaseAmount,
        discountPercent: line.directPromotionRule.discountPercent,
        discountBeforeTax: Math.round(directDiscountAmount / 1.08),
        discountAfterTax: directDiscountAmount,
        promotionType: 'product',
        scope: 'product',
        productCode: line.productCode,
        productName: line.productName
      });
    }

    if (groupRule && groupDiscountAmount > 0) {
      promotionRows.push({
        promotionCode: clean(groupRule.programCode || groupRule.code),
        code: clean(groupRule.programCode || groupRule.code),
        description: clean(groupRule.programName || groupRule.name || groupRule.description || groupRule.content),
        qualifiedAmount: toNumber(groupTotals.get(line.groupCode)),
        discountPercent: groupDiscountPercent,
        discountBeforeTax: Math.round(groupDiscountAmount / 1.08),
        discountAfterTax: groupDiscountAmount,
        promotionType: 'group',
        scope: 'group',
        productCode: line.productCode,
        productName: line.productName
      });
    }

    return {
      ...line,
      groupDiscountPercent,
      groupDiscountAmount,
      directDiscountAmount,
      totalDiscountAmount: directDiscountAmount + groupDiscountAmount,
      promotionRows
    };
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
  normalizeDiscountPercent,
  listPromotions, savePromotion, deletePromotion,
  listPromotionPrograms, getPromotionProgramDetail, updatePromotionProgram, cancelPromotionProgram,
  listProductRules, saveProductRule, deleteProductRule,
  listGroupItems, saveGroupItem, deleteGroupItem,
  listGroupRules, saveGroupRule, deleteGroupRule,
  calculatePromotions
};
