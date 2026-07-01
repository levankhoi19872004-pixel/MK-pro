'use strict';

const dateUtil = require('../utils/date.util');
const promotionRepository = require('../repositories/promotionRepository');
const Promotion = require('../models/Promotion');
const Customer = require('../models/Customer');
const Product = require('../models/Product');
const PromotionProductRule = require('../models/PromotionProductRule');
const PromotionGroupItem = require('../models/PromotionGroupItem');
const PromotionGroupRule = require('../models/PromotionGroupRule');
const { makeId, toNumber } = require('../utils/common.util');
const { PROMOTION_TYPES, calculatePromotionEngine } = require('./promotion/promotionEngine.service');

const PROMOTION_PROGRAM_CACHE_TTL_MS = Math.max(0, Number(process.env.PROMOTION_PROGRAM_CACHE_TTL_MS || 30000));
const promotionProgramCache = new Map();
const PROMOTION_PRODUCT_RULE_PROJECTION = 'id code programCode programName productCode productName discountPercent startDate endDate isActive source updatedAt';
const PROMOTION_GROUP_ITEM_PROJECTION = 'id code programCode groupCode programName productCode productName startDate endDate isActive source updatedAt';
const PROMOTION_GROUP_RULE_PROJECTION = 'id code programCode groupCode programName minAmount discountPercent startDate endDate isActive source updatedAt';
const PROMOTION_PROGRAM_LIST_PROJECTION = 'id code programCode groupCode programName name content programContent description productCode productCodes customerCodes productGroupCode productGroupName startDate endDate isActive active source promotionType type minQty minOrderAmount discountPercent';

function clearPromotionProgramCache() { promotionProgramCache.clear(); }

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

function normalizeCodeList(value) {
  if (Array.isArray(value)) return Array.from(new Set(value.map((item) => clean(item)).filter(Boolean)));
  return Array.from(new Set(clean(value).split(/[\n,;]+/).map((item) => clean(item)).filter(Boolean)));
}

function normalizePositiveNumber(value) {
  const n = toNumber(value);
  return Number.isFinite(n) ? n : 0;
}

function promotionIdentity(value) {
  return clean(value || '').toUpperCase();
}

function isPromotionModelType(type) {
  return ['quantityGroupDiscounts', 'customerOrderValueDiscounts'].includes(type);
}

function normalizePromotionDoc(row = {}) {
  const code = promotionIdentity(row.programCode || row.code || row.id);
  return {
    ...row,
    id: clean(row.id || code),
    code,
    programCode: code,
    name: clean(row.name || row.programName || ''),
    programName: clean(row.programName || row.name || ''),
    isActive: row.isActive !== false && row.active !== false,
    active: row.isActive !== false && row.active !== false
  };
}


function normalizeProgramCode(value) {
  return clean(value || '').toUpperCase();
}


function exactProgramCodeFilter(programCode) {
  const code = clean(programCode);
  const re = new RegExp(`^${code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
  return { $or: [{ programCode: re }, { code: re }] };
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
  return PromotionProductRule.find(filter).select(PROMOTION_PRODUCT_RULE_PROJECTION).sort({ programCode: 1, productCode: 1 }).lean();
}

async function saveProductRule(body = {}) {
  clearPromotionProgramCache();
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
  clearPromotionProgramCache();
  const value = clean(id);
  const result = await PromotionProductRule.deleteOne({ $or: [{ id: value }, { _id: /^[a-f0-9]{24}$/i.test(value) ? value : null }] });
  return { deleted: result.deletedCount > 0 };
}

async function listGroupItems(query = {}) {
  const q = clean(query.q);
  const filter = q ? { $or: [{ programCode: rx(q) }, { productCode: rx(q) }, { productName: rx(q) }] } : {};
  return PromotionGroupItem.find(filter).select(PROMOTION_GROUP_ITEM_PROJECTION).sort({ programCode: 1, productCode: 1 }).lean();
}

async function saveGroupItem(body = {}) {
  clearPromotionProgramCache();
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
    programName: clean(body.programName || body.groupName || body.name || body.content || body.programContent || ''),
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
  clearPromotionProgramCache();
  const value = clean(id);
  const result = await PromotionGroupItem.deleteOne({ $or: [{ id: value }, { _id: /^[a-f0-9]{24}$/i.test(value) ? value : null }] });
  return { deleted: result.deletedCount > 0 };
}

async function listGroupRules(query = {}) {
  const q = clean(query.q);
  const filter = q ? { $or: [{ programCode: rx(q) }, { programName: rx(q) }] } : {};
  return PromotionGroupRule.find(filter).select(PROMOTION_GROUP_RULE_PROJECTION).sort({ programCode: 1, minAmount: 1 }).lean();
}

async function saveGroupRule(body = {}) {
  clearPromotionProgramCache();
  const programCode = normalizeProgramCode(body.programCode || body.groupCode || body.code);
  const programName = clean(body.programName || body.name || body.content || body.programContent);
  const groupCode = normalizeProgramCode(body.groupCode || body.applyGroupCode || body.selectedGroupCode || programCode);
  const minAmount = toNumber(body.minAmount ?? body.requiredAmount ?? body.salesAmount);
  const discountPercent = normalizeDiscountPercent(body.discountPercent ?? body.discount ?? body.ck ?? body['Chiết khấu'] ?? body['Chiet khau'] ?? body['CK']);
  if (!programCode) return { error: 'Thiếu mã chương trình', status: 400 };
  if (!programName) return { error: 'Thiếu nội dung chương trình KM', status: 400 };
  if (!groupCode) return { error: 'Thiếu nhóm sản phẩm áp dụng', status: 400 };
  if (minAmount <= 0) return { error: 'Mức doanh số cần lấy phải lớn hơn 0', status: 400 };
  if (discountPercent < 0) return { error: 'Chiết khấu không được âm', status: 400 };
  const now = dateUtil.nowIso();
  const { startDate, endDate } = normalizeProgramDates(body);
  const id = clean(body.id) || `${programCode}__${groupCode}__${minAmount}`;
  const existing = await PromotionGroupRule.findOne({ $or: [{ id }, { programCode, groupCode, minAmount }, { programCode, minAmount }] });
  const payload = { id, programCode, programName, groupCode, minAmount, discountPercent, startDate, endDate, isActive: normalizeActive(body.isActive), updatedAt: now };
  if (existing) { Object.assign(existing, payload); return { rule: await existing.save() }; }
  return { rule: await PromotionGroupRule.create({ ...payload, createdAt: now }) };
}

async function deleteGroupRule(id) {
  clearPromotionProgramCache();
  const value = clean(id);
  if (!value) return { error: 'Thiếu mã điều kiện nhóm KM cần xóa', status: 400 };
  const objectId = /^[a-f0-9]{24}$/i.test(value) ? value : null;
  const result = await PromotionGroupRule.deleteOne({
    $or: [
      { id: value },
      { code: value },
      { programCode: value },
      ...(objectId ? [{ _id: objectId }] : [])
    ]
  });
  if (!toNumber(result.deletedCount)) return { error: 'Không tìm thấy điều kiện nhóm KM', status: 404 };
  return { deleted: true };
}

async function hydrateCustomerCodes(customerCodes = []) {
  const codes = normalizeCodeList(customerCodes);
  if (!codes.length) return { codes, missing: [] };
  const customers = await Customer.find({ $or: [{ code: { $in: codes } }, { customerCode: { $in: codes } }, { id: { $in: codes } }] }).lean().catch(() => []);
  const found = new Set((customers || []).map((c) => clean(c.code || c.customerCode || c.id)).filter(Boolean));
  return { codes, missing: codes.filter((code) => !found.has(code)) };
}

async function saveQuantityGroupDiscount(body = {}) {
  clearPromotionProgramCache();
  const code = promotionIdentity(body.programCode || body.code);
  const name = clean(body.programName || body.name);
  const productGroupCode = promotionIdentity(body.productGroupCode || body.groupCode || code);
  const productGroupName = clean(body.productGroupName || body.groupName || name);
  const productCodes = normalizeCodeList(body.productCodes || body.products || body.productCode);
  const minQty = normalizePositiveNumber(body.minQty ?? body.quantityThreshold ?? body.requiredQty);
  const discountPercent = normalizeDiscountPercent(body.discountPercent ?? body.discount ?? body.ck);
  if (!code) return { error: 'Thiếu mã chương trình', status: 400 };
  if (!name) return { error: 'Thiếu tên chương trình', status: 400 };
  if (!productCodes.length) return { error: 'Cần chọn ít nhất 1 sản phẩm thuộc nhóm', status: 400 };
  if (minQty <= 0) return { error: 'Số lượng tối thiểu phải lớn hơn 0', status: 400 };
  if (discountPercent <= 0 || discountPercent > 100) return { error: 'Chiết khấu % phải lớn hơn 0 và không vượt 100', status: 400 };
  const now = dateUtil.nowIso();
  const { startDate, endDate } = normalizeProgramDates(body);
  const payload = normalizePromotionDoc({
    ...body,
    id: clean(body.id || code),
    code,
    programCode: code,
    name,
    programName: name,
    type: PROMOTION_TYPES.QUANTITY_GROUP_PERCENT_DISCOUNT,
    promotionType: PROMOTION_TYPES.QUANTITY_GROUP_PERCENT_DISCOUNT,
    productGroupCode,
    productGroupName,
    productCodes,
    minQty,
    qtyUnit: clean(body.qtyUnit || 'dây'),
    discountType: 'percent',
    discountPercent,
    applyScope: clean(body.applyScope || 'eligible_lines'),
    priority: toNumber(body.priority || 100),
    stackPolicy: clean(body.stackPolicy || 'stackable'),
    startDate,
    endDate,
    note: clean(body.note || ''),
    updatedAt: now
  });
  if (!payload.createdAt) payload.createdAt = now;
  const promotion = await promotionRepository.upsert(payload);
  return { promotion: promotion.toObject ? promotion.toObject() : promotion };
}

async function saveCustomerOrderValueDiscount(body = {}) {
  clearPromotionProgramCache();
  const code = promotionIdentity(body.programCode || body.code);
  const name = clean(body.programName || body.name);
  const { codes: customerCodes, missing } = await hydrateCustomerCodes(body.customerCodes || body.customers || body.customerCode);
  const minOrderAmount = normalizePositiveNumber(body.minOrderAmount ?? body.minAmount ?? body.requiredAmount);
  const discountPercent = normalizeDiscountPercent(body.discountPercent ?? body.discount ?? body.ck);
  if (!code) return { error: 'Thiếu mã chương trình', status: 400 };
  if (!name) return { error: 'Thiếu tên chương trình', status: 400 };
  if (!customerCodes.length) return { error: 'Cần chọn ít nhất 1 khách hàng áp dụng', status: 400 };
  if (missing.length) return { error: `Có mã khách hàng chưa tồn tại: ${missing.slice(0, 10).join(', ')}`, status: 400 };
  if (minOrderAmount <= 0) return { error: 'Doanh số đơn tối thiểu phải lớn hơn 0', status: 400 };
  if (discountPercent <= 0 || discountPercent > 100) return { error: 'Chiết khấu % phải lớn hơn 0 và không vượt 100', status: 400 };
  const now = dateUtil.nowIso();
  const { startDate, endDate } = normalizeProgramDates(body);
  const payload = normalizePromotionDoc({
    ...body,
    id: clean(body.id || code),
    code,
    programCode: code,
    name,
    programName: name,
    type: PROMOTION_TYPES.CUSTOMER_ORDER_VALUE_EXTRA_PERCENT,
    promotionType: PROMOTION_TYPES.CUSTOMER_ORDER_VALUE_EXTRA_PERCENT,
    customerCodes,
    minOrderAmount,
    discountType: 'percent',
    discountPercent,
    applyScope: clean(body.applyScope || 'whole_order'),
    baseAmountMode: clean(body.baseAmountMode || 'after_line_promotions'),
    priority: toNumber(body.priority || 200),
    stackPolicy: clean(body.stackPolicy || 'stackable'),
    startDate,
    endDate,
    note: clean(body.note || ''),
    updatedAt: now
  });
  if (!payload.createdAt) payload.createdAt = now;
  const promotion = await promotionRepository.upsert(payload);
  return { promotion: promotion.toObject ? promotion.toObject() : promotion };
}

async function listAdvancedPromotionRules(query = {}, promotionType) {
  const q = clean(query.q);
  const filter = { $or: [{ promotionType }, { type: promotionType }] };
  if (q) filter.$and = [{ $or: [{ code: rx(q) }, { programCode: rx(q) }, { name: rx(q) }, { programName: rx(q) }, { productGroupCode: rx(q) }, { productGroupName: rx(q) }, { customerCodes: rx(q) }] }];
  return Promotion.find(filter).sort({ priority: 1, code: 1 }).lean();
}

async function deleteAdvancedPromotionRule(id, promotionType) {
  clearPromotionProgramCache();
  const value = clean(id);
  const result = await Promotion.deleteOne({
    $and: [
      { $or: [{ promotionType }, { type: promotionType }] },
      { $or: [{ id: value }, { code: value }, { programCode: value }, { _id: /^[a-f0-9]{24}$/i.test(value) ? value : null }] }
    ]
  });
  if (!toNumber(result.deletedCount)) return { error: 'Không tìm thấy chương trình khuyến mại', status: 404 };
  return { deleted: true };
}


function normalizeProgramType(value) {
  const type = clean(value || 'productRules');
  if (['productRules', 'groupItems', 'groupRules', 'quantityGroupDiscounts', 'customerOrderValueDiscounts'].includes(type)) return type;
  if (type === PROMOTION_TYPES.QUANTITY_GROUP_PERCENT_DISCOUNT) return 'quantityGroupDiscounts';
  if (type === PROMOTION_TYPES.CUSTOMER_ORDER_VALUE_EXTRA_PERCENT) return 'customerOrderValueDiscounts';
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
  if (type === 'quantityGroupDiscounts') {
    return {
      type,
      source: 'promotions',
      Model: Promotion,
      sort: { code: 1 },
      searchFields: ['code', 'programCode', 'name', 'programName', 'productGroupCode', 'productGroupName'],
      promotionType: PROMOTION_TYPES.QUANTITY_GROUP_PERCENT_DISCOUNT
    };
  }
  if (type === 'customerOrderValueDiscounts') {
    return {
      type,
      source: 'promotions',
      Model: Promotion,
      sort: { code: 1 },
      searchFields: ['code', 'programCode', 'name', 'programName', 'customerCodes'],
      promotionType: PROMOTION_TYPES.CUSTOMER_ORDER_VALUE_EXTRA_PERCENT
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

function buildProgramSearchFilter(query = {}, cfg = {}) {
  const q = clean(query.q);
  const and = [];
  if (cfg.promotionType) and.push({ $or: [{ promotionType: cfg.promotionType }, { type: cfg.promotionType }] });
  if (q) and.push({ $or: (cfg.searchFields || ['programCode']).map((field) => ({ [field]: rx(q) })) });
  if (!and.length) return {};
  if (and.length === 1) return and[0];
  return { $and: and };
}

function programNameFromRow(row = {}, fallback = '') {
  return clean(row.programName || row.name || row.content || row.programContent || row.description || fallback);
}


function aggregateStringExpression(field) {
  return {
    $trim: {
      input: {
        $convert: {
          input: `$${field}`,
          to: 'string',
          onError: '',
          onNull: ''
        }
      }
    }
  };
}

function firstNonBlankAggregateExpression(fields = [], fallback = '') {
  return fields.reduceRight((next, field) => ({
    $let: {
      vars: { current: aggregateStringExpression(field) },
      in: {
        $cond: [
          { $gt: [{ $strLenCP: '$$current' }, 0] },
          '$$current',
          next
        ]
      }
    }
  }), fallback);
}

async function aggregatePromotionProgramSummaries(query = {}, cfg = promotionTypeConfig(query.type)) {
  const rows = await cfg.Model.aggregate([
    { $match: buildProgramSearchFilter(query, cfg) },
    {
      $project: {
        programCode: { $toUpper: firstNonBlankAggregateExpression(['programCode', 'groupCode', 'code']) },
        programName: firstNonBlankAggregateExpression(['programName', 'name', 'content', 'programContent', 'description']),
        startDate: firstNonBlankAggregateExpression(['startDate']),
        endDate: firstNonBlankAggregateExpression(['endDate']),
        productCode: firstNonBlankAggregateExpression(['productCode', 'codeProduct']),
        isActiveRow: { $cond: [{ $eq: ['$isActive', false] }, 0, 1] }
      }
    },
    { $match: { programCode: { $gt: '' } } },
    { $sort: { programCode: 1, productCode: 1, startDate: 1 } },
    {
      $group: {
        _id: '$programCode',
        programName: { $first: '$programName' },
        startDate: { $min: '$startDate' },
        endDate: { $max: '$endDate' },
        productCodes: { $addToSet: '$productCode' },
        isActiveValue: { $min: '$isActiveRow' },
        lineCount: { $sum: 1 }
      }
    },
    {
      $project: {
        _id: 0,
        programCode: '$_id',
        programName: 1,
        startDate: 1,
        endDate: 1,
        productCodes: {
          $filter: {
            input: '$productCodes',
            as: 'code',
            cond: { $gt: ['$$code', ''] }
          }
        },
        isActive: { $eq: ['$isActiveValue', 1] },
        lineCount: 1
      }
    },
    { $sort: { programCode: 1 } }
  ]).allowDiskUse(true).exec();
  return rows.map((row) => ({ ...row, sources: [cfg.source] }));
}

async function listPromotionPrograms(query = {}) {
  const cfg = promotionTypeConfig(query.type);
  const cacheKey = JSON.stringify({ type: cfg.type, q: clean(query.q) });
  const cached = promotionProgramCache.get(cacheKey);
  if (PROMOTION_PROGRAM_CACHE_TTL_MS > 0 && cached && cached.expiresAt > Date.now()) return cached.value;

  const rows = await aggregatePromotionProgramSummaries(query, cfg);
  const result = rows.map((row) => {
    const group = {
      programCode: row.programCode,
      programName: row.programName || (cfg.type === 'groupItems' ? row.programCode : ''),
      startDate: row.startDate || '',
      endDate: row.endDate || '',
      isActive: row.isActive !== false,
      productCodes: row.productCodes || [],
      sources: row.sources || [cfg.source],
      lineCount: row.lineCount || 0
    };
    return toProgramSummary(group);
  }).sort((a, b) => String(a.programCode).localeCompare(String(b.programCode), 'vi'));
  if (PROMOTION_PROGRAM_CACHE_TTL_MS > 0) promotionProgramCache.set(cacheKey, { expiresAt: Date.now() + PROMOTION_PROGRAM_CACHE_TTL_MS, value: result });
  return result;
}

async function listPromotionProgramsByType(query = {}) {
  const q = clean(query.q);
  const cacheKey = JSON.stringify({ type: 'all', q });
  const cached = promotionProgramCache.get(cacheKey);
  if (PROMOTION_PROGRAM_CACHE_TTL_MS > 0 && cached && cached.expiresAt > Date.now()) return cached.value;
  const types = ['productRules', 'groupItems', 'groupRules', 'quantityGroupDiscounts', 'customerOrderValueDiscounts'];
  const entries = await Promise.all(types.map(async (type) => [type, await listPromotionPrograms({ ...query, type })]));
  const result = Object.fromEntries(entries);
  if (PROMOTION_PROGRAM_CACHE_TTL_MS > 0) promotionProgramCache.set(cacheKey, { expiresAt: Date.now() + PROMOTION_PROGRAM_CACHE_TTL_MS, value: result });
  return result;
}

async function getPromotionProgramDetail(programCodeValue, query = {}) {
  const programCode = normalizeProgramCode(programCodeValue);
  if (!programCode) return { error: 'Thiếu mã chương trình', status: 400 };
  const cfg = promotionTypeConfig(query.type);
  const identityFilter = exactProgramCodeFilter(programCode);
  const detailFilter = cfg.promotionType ? { $and: [identityFilter, { $or: [{ promotionType: cfg.promotionType }, { type: cfg.promotionType }] }] } : identityFilter;
  const rows = await cfg.Model.find(detailFilter).sort(cfg.sort).lean();
  if (!rows.length) return { error: 'Không tìm thấy chương trình khuyến mại', status: 404 };
  if (isPromotionModelType(cfg.type)) {
    const row = rows[0] || {};
    const program = {
      programCode: clean(row.programCode || row.code),
      programName: clean(row.programName || row.name),
      content: clean(row.programName || row.name),
      startDate: row.startDate || '',
      endDate: row.endDate || '',
      timeText: [row.startDate || '', row.endDate || ''].filter(Boolean).join(' - '),
      isActive: row.isActive !== false && row.active !== false,
      statusText: programStatus({ startDate: row.startDate, endDate: row.endDate, isActive: row.isActive !== false && row.active !== false }),
      productCount: Array.isArray(row.productCodes) ? row.productCodes.length : 0,
      customerCount: Array.isArray(row.customerCodes) ? row.customerCodes.length : 0,
      lineCount: 1,
      sources: ['promotions']
    };
    return {
      type: cfg.type,
      program,
      rule: { ...row, rowId: pickRowId(row) },
      quantityGroupDiscounts: cfg.type === 'quantityGroupDiscounts' ? [{ ...row, rowId: pickRowId(row) }] : [],
      customerOrderValueDiscounts: cfg.type === 'customerOrderValueDiscounts' ? [{ ...row, rowId: pickRowId(row) }] : [],
      products: cfg.type === 'quantityGroupDiscounts' ? (row.productCodes || []).map((productCode, index) => ({ rowId: `${program.programCode}__${productCode}`, source: 'SL nhóm SP', productCode, productName: '', minQty: row.minQty, discountPercent: row.discountPercent, isActive: row.isActive !== false }))
        : (row.customerCodes || []).map((customerCode, index) => ({ rowId: `${program.programCode}__${customerCode}`, source: 'CK thêm theo DS', customerCode, minOrderAmount: row.minOrderAmount, discountPercent: row.discountPercent, isActive: row.isActive !== false }))
    };
  }
  const group = { programCode, programName: '', startDate: '', endDate: '', isActive: true, productCodes: new Set(), sources: new Set(), lineCount: 0 };
  rows.forEach((row) => { mergeProgramMeta(group, row, cfg.source); if (row.productCode) group.productCodes.add(clean(row.productCode)); });
  if (!group.programName && cfg.type === 'groupItems') group.programName = programCode;
  const availableGroups = cfg.type === 'groupRules' ? await listPromotionPrograms({ type: 'groupItems' }) : [];
  const normalizedRows = rows.map((row) => ({ ...row, rowId: pickRowId(row) }));
  return {
    type: cfg.type,
    program: toProgramSummary(group),
    selectedGroupCode: clean(rows[0]?.groupCode || rows[0]?.programCode || ''),
    availableGroups,
    productRules: cfg.type === 'productRules' ? normalizedRows : [],
    groupItems: cfg.type === 'groupItems' ? normalizedRows : [],
    groupRules: cfg.type === 'groupRules' ? normalizedRows : [],
    products: cfg.type === 'productRules' ? normalizedRows.map((row) => ({ rowId: row.rowId, source: 'CK sản phẩm', productCode: row.productCode, productName: row.productName, minAmount: '', discountPercent: row.discountPercent, isActive: row.isActive !== false }))
      : cfg.type === 'groupItems' ? normalizedRows.map((row) => ({ rowId: row.rowId, source: 'Nhóm sản phẩm', productCode: row.productCode, productName: row.productName, minAmount: '', discountPercent: '', isActive: row.isActive !== false }))
      : normalizedRows.map((row) => ({ rowId: row.rowId, source: 'Điều kiện nhóm', groupCode: row.groupCode || row.programCode, productCode: '', productName: '', minAmount: row.minAmount, discountPercent: row.discountPercent, isActive: row.isActive !== false }))
  };
}

async function updatePromotionProgram(programCodeValue, body = {}, query = {}) {
  clearPromotionProgramCache();
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
  const updateFilter = cfg.promotionType ? { $and: [exactProgramCodeFilter(programCode), { $or: [{ promotionType: cfg.promotionType }, { type: cfg.promotionType }] }] } : exactProgramCodeFilter(programCode);
  const result = await cfg.Model.updateMany(updateFilter, { $set: set });
  const matched = toNumber(result.matchedCount);
  if (!matched) return { error: 'Không tìm thấy chương trình khuyến mại', status: 404 };
  const detail = await getPromotionProgramDetail(programCode, { type: cfg.type });
  return { updated: toNumber(result.modifiedCount), type: cfg.type, program: detail.program };
}

async function cancelPromotionProgram(programCodeValue, query = {}) {
  clearPromotionProgramCache();
  const programCode = normalizeProgramCode(programCodeValue);
  if (!programCode) return { error: 'Thiếu mã chương trình', status: 400 };
  const cfg = promotionTypeConfig(query.type);
  const now = dateUtil.nowIso();
  const set = { isActive: false, cancelledAt: now, updatedAt: now };
  const updateFilter = cfg.promotionType ? { $and: [exactProgramCodeFilter(programCode), { $or: [{ promotionType: cfg.promotionType }, { type: cfg.promotionType }] }] } : exactProgramCodeFilter(programCode);
  const result = await cfg.Model.updateMany(updateFilter, { $set: set });
  if (!toNumber(result.matchedCount)) return { error: 'Không tìm thấy chương trình khuyến mại', status: 404 };
  return { cancelled: true, type: cfg.type };
}


function mongoIdFilter(value) {
  const id = clean(value);
  if (!id) return null;
  return /^[a-f0-9]{24}$/i.test(id) ? id : null;
}

function rowIdFilter(programCode, rowId) {
  const value = clean(rowId);
  const filter = { ...exactProgramCodeFilter(programCode), $or: [{ id: value }] };
  const objectId = mongoIdFilter(value);
  if (objectId) filter.$or.push({ _id: objectId });
  return filter;
}

function pickRowId(row = {}) {
  return clean(row.id || row._id || '');
}

async function addProductToPromotion(programCodeValue, body = {}) {
  clearPromotionProgramCache();
  const programCode = normalizeProgramCode(programCodeValue || body.programCode);
  if (!programCode) return { error: 'Thiếu mã chương trình', status: 400 };
  return saveProductRule({ ...body, programCode, source: clean(body.source || 'manual-ui') });
}

async function updatePromotionProduct(programCodeValue, rowId, body = {}) {
  clearPromotionProgramCache();
  const programCode = normalizeProgramCode(programCodeValue || body.programCode);
  if (!programCode) return { error: 'Thiếu mã chương trình', status: 400 };
  const value = clean(rowId);
  if (!value) return { error: 'Thiếu dòng sản phẩm cần sửa', status: 400 };
  const current = await PromotionProductRule.findOne(rowIdFilter(programCode, value));
  if (!current) return { error: 'Không tìm thấy dòng sản phẩm trong CTKM', status: 404 };
  const now = dateUtil.nowIso();
  const nextProductInput = body.productCode || body.codeProduct || current.productCode;
  const { product, productCode, productName: catalogProductName } = await hydrateProduct(nextProductInput);
  current.productCode = productCode;
  current.productName = clean(catalogProductName || body.productName || current.productName || '');
  if (body.discountPercent !== undefined || body.discount !== undefined || body.ck !== undefined) current.discountPercent = normalizeDiscountPercent(body.discountPercent ?? body.discount ?? body.ck);
  if (body.programName !== undefined) current.programName = clean(body.programName);
  if (body.startDate !== undefined || body.fromDate !== undefined) current.startDate = normalizeProgramDates(body).startDate;
  if (body.endDate !== undefined || body.toDate !== undefined) current.endDate = normalizeProgramDates(body).endDate;
  if (body.isActive !== undefined) current.isActive = normalizeActive(body.isActive);
  current.productMatched = Boolean(product);
  current.missingProduct = !product;
  current.updatedAt = now;
  const saved = await current.save();
  return { rule: saved, warning: product ? '' : `Mã sản phẩm ${productCode} chưa có trong danh mục` };
}

async function removePromotionProduct(programCodeValue, rowId) {
  clearPromotionProgramCache();
  const programCode = normalizeProgramCode(programCodeValue);
  if (!programCode) return { error: 'Thiếu mã chương trình', status: 400 };
  const result = await PromotionProductRule.deleteOne(rowIdFilter(programCode, rowId));
  if (!toNumber(result.deletedCount)) return { error: 'Không tìm thấy dòng sản phẩm cần xóa', status: 404 };
  return { deleted: true };
}

async function addProductToGroup(programCodeValue, body = {}) {
  clearPromotionProgramCache();
  const programCode = normalizeProgramCode(programCodeValue || body.programCode || body.groupCode);
  if (!programCode) return { error: 'Thiếu mã nhóm sản phẩm', status: 400 };
  return saveGroupItem({ ...body, programCode, groupCode: programCode, source: clean(body.source || 'manual-ui') });
}

async function updateGroupProduct(programCodeValue, rowId, body = {}) {
  clearPromotionProgramCache();
  const programCode = normalizeProgramCode(programCodeValue || body.programCode || body.groupCode);
  if (!programCode) return { error: 'Thiếu mã nhóm sản phẩm', status: 400 };
  const current = await PromotionGroupItem.findOne(rowIdFilter(programCode, rowId));
  if (!current) return { error: 'Không tìm thấy sản phẩm trong nhóm', status: 404 };
  const { product, productCode, productName: catalogProductName } = await hydrateProduct(body.productCode || body.codeProduct || current.productCode);
  current.productCode = productCode;
  current.productName = clean(catalogProductName || body.productName || current.productName || '');
  if (body.programName !== undefined || body.groupName !== undefined) current.programName = clean(body.programName || body.groupName);
  if (body.startDate !== undefined || body.fromDate !== undefined) current.startDate = normalizeProgramDates(body).startDate;
  if (body.endDate !== undefined || body.toDate !== undefined) current.endDate = normalizeProgramDates(body).endDate;
  if (body.isActive !== undefined) current.isActive = normalizeActive(body.isActive);
  current.productMatched = Boolean(product);
  current.missingProduct = !product;
  current.updatedAt = dateUtil.nowIso();
  const saved = await current.save();
  return { item: saved, warning: product ? '' : `Mã sản phẩm ${productCode} chưa có trong danh mục` };
}

async function removeGroupProduct(programCodeValue, rowId) {
  clearPromotionProgramCache();
  const programCode = normalizeProgramCode(programCodeValue);
  if (!programCode) return { error: 'Thiếu mã nhóm sản phẩm', status: 400 };
  const result = await PromotionGroupItem.deleteOne(rowIdFilter(programCode, rowId));
  if (!toNumber(result.deletedCount)) return { error: 'Không tìm thấy sản phẩm trong nhóm cần xóa', status: 404 };
  return { deleted: true };
}

async function addPromotionTier(programCodeValue, body = {}) {
  clearPromotionProgramCache();
  const programCode = normalizeProgramCode(programCodeValue || body.programCode);
  if (!programCode) return { error: 'Thiếu mã CTKM', status: 400 };
  return saveGroupRule({ ...body, programCode, source: clean(body.source || 'manual-ui') });
}

async function updatePromotionTier(programCodeValue, rowId, body = {}) {
  clearPromotionProgramCache();
  const programCode = normalizeProgramCode(programCodeValue || body.programCode);
  if (!programCode) return { error: 'Thiếu mã CTKM', status: 400 };
  const current = await PromotionGroupRule.findOne(rowIdFilter(programCode, rowId));
  if (!current) return { error: 'Không tìm thấy điều kiện khuyến mại', status: 404 };
  if (body.programName !== undefined || body.content !== undefined || body.name !== undefined) current.programName = clean(body.programName || body.content || body.name);
  if (body.groupCode !== undefined) current.groupCode = normalizeProgramCode(body.groupCode);
  if (body.minAmount !== undefined || body.requiredAmount !== undefined || body.salesAmount !== undefined) current.minAmount = toNumber(body.minAmount ?? body.requiredAmount ?? body.salesAmount);
  if (body.discountPercent !== undefined || body.discount !== undefined || body.ck !== undefined) current.discountPercent = normalizeDiscountPercent(body.discountPercent ?? body.discount ?? body.ck);
  if (body.startDate !== undefined || body.fromDate !== undefined) current.startDate = normalizeProgramDates(body).startDate;
  if (body.endDate !== undefined || body.toDate !== undefined) current.endDate = normalizeProgramDates(body).endDate;
  if (body.isActive !== undefined) current.isActive = normalizeActive(body.isActive);
  current.updatedAt = dateUtil.nowIso();
  return { rule: await current.save() };
}

async function removePromotionTier(programCodeValue, rowId) {
  clearPromotionProgramCache();
  const programCode = normalizeProgramCode(programCodeValue);
  if (!programCode) return { error: 'Thiếu mã CTKM', status: 400 };
  const result = await PromotionGroupRule.deleteOne(rowIdFilter(programCode, rowId));
  if (!toNumber(result.deletedCount)) return { error: 'Không tìm thấy điều kiện cần xóa', status: 404 };
  return { deleted: true };
}

async function loadAdvancedPromotionRules(targetDate = '') {
  const rules = await Promotion.find({
    isActive: { $ne: false },
    $or: [
      { promotionType: PROMOTION_TYPES.QUANTITY_GROUP_PERCENT_DISCOUNT },
      { type: PROMOTION_TYPES.QUANTITY_GROUP_PERCENT_DISCOUNT },
      { promotionType: PROMOTION_TYPES.CUSTOMER_ORDER_VALUE_EXTRA_PERCENT },
      { type: PROMOTION_TYPES.CUSTOMER_ORDER_VALUE_EXTRA_PERCENT }
    ]
  }).sort({ priority: 1, code: 1 }).lean().catch(() => []);
  return (rules || []).filter((rule) => isRuleActiveByDate(rule, targetDate));
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
  const groupRules = groupCodes.length ? (await PromotionGroupRule.find({ isActive: { $ne: false }, $or: [{ programCode: { $in: groupCodes } }, { groupCode: { $in: groupCodes } }] }).sort({ minAmount: 1 }).lean()).filter((rule) => isRuleActiveByDate(rule, targetDate)) : [];
  const groupByProduct = new Map(groupItems.map((item) => [clean(item.productCode), clean(item.programCode)]));
  const groupTotals = new Map();

  const lines = (items || []).map((item) => {
    const productCode = clean(item.productCode || item.code);
    const product = productMap.get(productCode) || {};
    const quantity = toNumber(item.quantity ?? item.qty);
    // Quy tắc khóa cứng: mọi CTKM tính theo giá bán lưu trong danh mục sản phẩm.
    const catalogSalePrice = toNumber(product.salePrice ?? product.price ?? item.catalogSalePrice ?? item.salePrice ?? item.price);
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
      baseQty: toNumber(item.baseQty ?? quantity),
      catalogSalePrice,
      salePrice: catalogSalePrice,
      lineAmount: promotionBaseAmount,
      promotionBaseAmount,
      directDiscountPercent: toNumber(directRule?.discountPercent),
      directPromotionRule,
      groupCode
    };
  });

  const bestGroupRule = new Map();
  for (const groupCode of groupCodes) {
    const total = toNumber(groupTotals.get(groupCode));
    const matched = groupRules.filter((rule) => clean(rule.groupCode || rule.programCode) === groupCode && total >= toNumber(rule.minAmount)).sort((a, b) => toNumber(b.minAmount) - toNumber(a.minAmount))[0];
    if (matched) bestGroupRule.set(groupCode, matched);
  }

  const legacyLines = lines.map((line) => {
    const groupRule = bestGroupRule.get(line.groupCode);
    const groupDiscountPercent = toNumber(groupRule?.discountPercent);
    const directDiscountAmount = Math.round(line.promotionBaseAmount * line.directDiscountPercent / 100);
    const legacyGroupDiscountAmount = Math.round(line.promotionBaseAmount * groupDiscountPercent / 100);
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
        discountAmount: directDiscountAmount,
        promotionType: 'product',
        scope: 'product',
        productCode: line.productCode,
        productName: line.productName
      });
    }

    if (groupRule && legacyGroupDiscountAmount > 0) {
      promotionRows.push({
        promotionCode: clean(groupRule.programCode || groupRule.code),
        code: clean(groupRule.programCode || groupRule.code),
        description: clean(groupRule.programName || groupRule.name || groupRule.description || groupRule.content),
        qualifiedAmount: toNumber(groupTotals.get(line.groupCode)),
        discountPercent: groupDiscountPercent,
        discountBeforeTax: Math.round(legacyGroupDiscountAmount / 1.08),
        discountAfterTax: legacyGroupDiscountAmount,
        discountAmount: legacyGroupDiscountAmount,
        promotionType: 'group',
        scope: 'group',
        productCode: line.productCode,
        productName: line.productName
      });
    }

    return {
      ...line,
      groupDiscountPercent,
      legacyGroupDiscountAmount,
      groupDiscountAmount: legacyGroupDiscountAmount,
      directDiscountAmount,
      totalDiscountAmount: directDiscountAmount + legacyGroupDiscountAmount,
      promotionRows
    };
  });

  const advancedRules = await loadAdvancedPromotionRules(targetDate);
  const advancedInput = legacyLines.map((line) => ({
    productCode: line.productCode,
    productName: line.productName,
    quantity: line.quantity,
    baseQty: line.baseQty,
    salePrice: line.catalogSalePrice,
    lineAmount: line.promotionBaseAmount,
    discountAmount: line.totalDiscountAmount,
    appliedPromotions: line.promotionRows
  }));
  const engineResult = calculatePromotionEngine({
    customerCode: options.customerCode || options.customer?.code || options.customer?.customerCode || '',
    orderDate: targetDate,
    items: advancedInput,
    rules: advancedRules
  });
  const engineByProduct = new Map((engineResult.items || []).map((line) => [clean(line.productCode), line]));

  const resultLines = legacyLines.map((line) => {
    const advancedLine = engineByProduct.get(line.productCode) || {};
    const advancedTotalDiscount = toNumber(advancedLine.discountAmount);
    const legacyTotalDiscount = toNumber(line.directDiscountAmount) + toNumber(line.legacyGroupDiscountAmount);
    const advancedExtraDiscountAmount = Math.max(0, advancedTotalDiscount - legacyTotalDiscount);
    const finalGroupDiscountAmount = toNumber(line.legacyGroupDiscountAmount) + advancedExtraDiscountAmount;
    const promotionRows = Array.isArray(advancedLine.appliedPromotions) ? advancedLine.appliedPromotions : line.promotionRows;
    return {
      ...line,
      groupDiscountAmount: finalGroupDiscountAmount,
      advancedDiscountAmount: advancedExtraDiscountAmount,
      orderValueDiscountAllocatedAmount: promotionRows.reduce((sum, row) => sum + toNumber(row.allocatedDiscountAmount), 0),
      totalDiscountAmount: toNumber(line.directDiscountAmount) + finalGroupDiscountAmount,
      finalLineAmount: Math.max(0, toNumber(line.promotionBaseAmount) - toNumber(line.directDiscountAmount) - finalGroupDiscountAmount),
      promotionRows
    };
  });

  const totalDirectDiscount = resultLines.reduce((s, i) => s + toNumber(i.directDiscountAmount), 0);
  const totalGroupDiscount = resultLines.reduce((s, i) => s + toNumber(i.groupDiscountAmount), 0);
  const totalAdvancedDiscount = resultLines.reduce((s, i) => s + toNumber(i.advancedDiscountAmount), 0);
  const grossAmount = resultLines.reduce((s, i) => s + toNumber(i.promotionBaseAmount), 0);
  const totalDiscount = resultLines.reduce((s, i) => s + toNumber(i.totalDiscountAmount), 0);

  return {
    lines: resultLines,
    groupTotals: Object.fromEntries(groupTotals.entries()),
    orderDiscounts: engineResult.orderDiscounts || [],
    appliedPromotions: engineResult.appliedPromotions || [],
    summary: {
      grossAmount,
      lineDiscountAmount: totalDiscount,
      orderDiscountAmount: (engineResult.orderDiscounts || []).reduce((s, i) => s + toNumber(i.discountAmount), 0),
      finalAmount: Math.max(0, grossAmount - totalDiscount)
    },
    warnings: engineResult.warnings || [],
    totalDirectDiscount,
    totalGroupDiscount,
    totalAdvancedDiscount,
    totalDiscount
  };
}


module.exports = {
  normalizeDiscountPercent, PROMOTION_TYPES,
  listPromotions, savePromotion, deletePromotion,
  listAdvancedPromotionRules, saveQuantityGroupDiscount, saveCustomerOrderValueDiscount, deleteAdvancedPromotionRule,
  listPromotionPrograms, listPromotionProgramsByType, getPromotionProgramDetail, updatePromotionProgram, cancelPromotionProgram,
  addProductToPromotion, updatePromotionProduct, removePromotionProduct,
  addProductToGroup, updateGroupProduct, removeGroupProduct,
  addPromotionTier, updatePromotionTier, removePromotionTier,
  listProductRules, saveProductRule, deleteProductRule,
  listGroupItems, saveGroupItem, deleteGroupItem,
  listGroupRules, saveGroupRule, deleteGroupRule,
  calculatePromotions
};
