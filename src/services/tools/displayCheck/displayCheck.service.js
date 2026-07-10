'use strict';

/**
 * Display Check Manager service.
 * This module is intentionally out-of-flow: it only reads MK-Pro catalog/DMS/promotion data
 * and writes display-check planning collections. It must not create orders/accounting/inventory rows.
 */

const Customer = require('../../../models/Customer');
const Product = require('../../../models/Product');
const Promotion = require('../../../models/Promotion');
const PromotionGroupItem = require('../../../models/PromotionGroupItem');
const PromotionGroupRule = require('../../../models/PromotionGroupRule');
const DisplayCheckGroup = require('../../../models/displayCheckGroup.model');
const DisplayCheckStoreSetup = require('../../../models/displayCheckStoreSetup.model');
const DisplayCheckPlan = require('../../../models/displayCheckPlan.model');
const dmsInventoryService = require('../../dmsInventoryReconciliation.service');
const dateUtil = require('../../../utils/date.util');

const DEFAULTS = {
  dmsGapType: 'dms_greater',
  toleranceAmount: 10000,
  maxOverAmount: 50000,
  allowOverTargetForDisplay: false,
  maxDmsPages: 20,
  dmsPageSize: 500
};

function nowIso() { return new Date().toISOString(); }
function todayVN() { return dateUtil.toDateOnly(dateUtil.todayVN ? dateUtil.todayVN() : new Date()); }
function dateOnly(value) { return dateUtil.toDateOnly(value || todayVN()) || todayVN(); }
function clean(value) { return String(value == null ? '' : value).trim(); }
function upper(value) { return clean(value).toUpperCase(); }
function number(value, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value && typeof value === 'object' && value.result != null) return number(value.result, fallback);
  if (value == null) return fallback;
  let raw = String(value).trim();
  if (!raw) return fallback;
  raw = raw.replace(/\s/g, '').replace(/₫|đ/gi, '');
  const commaCount = (raw.match(/,/g) || []).length;
  const dotCount = (raw.match(/\./g) || []).length;
  if (commaCount && dotCount) raw = raw.replace(/\./g, '').replace(/,/g, '.');
  else if (commaCount === 1 && !dotCount) raw = raw.replace(/,/g, '.');
  else raw = raw.replace(/,/g, '');
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}
function money(value) { return Math.round((Number(value) || 0) * 100) / 100; }
function int(value) { return Math.max(0, Math.trunc(number(value, 0))); }
function norm(value) {
  return clean(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, ' ').trim();
}
function normalizeDmsGapType(value) {
  const raw = norm(value || DEFAULTS.dmsGapType).replace(/\s+/g, '_');
  if (raw.includes('internal') || raw.includes('thuc_te') || raw.includes('noi_bo')) return 'internal_greater';
  return 'dms_greater';
}
function currentUserCode(req) {
  return clean(req?.user?.code || req?.user?.username || req?.user?.email || req?.headers?.['x-user-code'] || 'system');
}
function asLean(doc) {
  if (!doc) return null;
  if (typeof doc.toObject === 'function') return doc.toObject({ versionKey: false });
  return doc;
}
function groupLabel(group) {
  if (!group) return '';
  const type = group.conditionType === 'quantity'
    ? `Đủ SL: ${int(group.thresholdQty)}`
    : `Đủ tiền: ${money(group.thresholdAmount).toLocaleString('vi-VN')}đ`;
  return `${group.groupName || group.groupCode} · ${type}`;
}
function isActiveByDate(row = {}, targetDate = '') {
  if (row.isActive === false || row.active === false || row.cancelledAt) return false;
  const date = dateOnly(targetDate);
  const startDate = dateUtil.toDateOnly(row.startDate || '');
  const endDate = dateUtil.toDateOnly(row.endDate || '');
  if (startDate && date < startDate) return false;
  if (endDate && date > endDate) return false;
  return true;
}
function productCodeOf(product) { return upper(product?.code || product?.productCode || product?.sku); }
function productNameOf(product) { return clean(product?.name || product?.productName || product?.dmsProductName); }
function productGroupFields(product) {
  return [
    product?.category,
    product?.brand,
    product?.brandCode,
    product?.groupCode,
    product?.groupName,
    product?.productGroup,
    product?.productGroupCode,
    product?.productGroupName,
    product?.line,
    product?.family,
    product?.printGroup,
    product?.printGroupName
  ].filter(Boolean).map(clean);
}
function publicGroup(row) {
  return {
    id: String(row._id || row.id || ''),
    groupCode: clean(row.groupCode),
    groupName: clean(row.groupName),
    sourceType: clean(row.sourceType || 'custom'),
    sourceCode: clean(row.sourceCode),
    sourceName: clean(row.sourceName),
    conditionType: row.conditionType === 'quantity' ? 'quantity' : 'amount',
    thresholdAmount: number(row.thresholdAmount),
    thresholdQty: int(row.thresholdQty),
    productCodes: Array.isArray(row.productCodes) ? row.productCodes.map(upper).filter(Boolean) : [],
    isActive: row.isActive !== false,
    note: clean(row.note),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}
function publicSetup(row) {
  return {
    id: String(row._id || row.id || ''),
    workingDate: clean(row.workingDate),
    customerCode: upper(row.customerCode),
    customerName: clean(row.customerName),
    targetAmount: number(row.targetAmount),
    targetLineCount: Math.max(1, int(row.targetLineCount || 1)),
    selectedGroupCodes: Array.isArray(row.selectedGroupCodes) ? row.selectedGroupCodes.map(upper).filter(Boolean) : [],
    note: clean(row.note),
    status: clean(row.status || 'draft'),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}
function publicPlan(row) {
  return {
    id: String(row._id || row.id || ''),
    workingDate: clean(row.workingDate),
    planCode: clean(row.planCode),
    customerCode: upper(row.customerCode),
    customerName: clean(row.customerName),
    targetAmount: number(row.targetAmount),
    generatedAmount: number(row.generatedAmount),
    targetLineCount: Math.max(1, int(row.targetLineCount || 1)),
    actualLineCount: Math.max(0, int(row.actualLineCount || 0)),
    selectedGroups: Array.isArray(row.selectedGroups) ? row.selectedGroups : [],
    items: Array.isArray(row.items) ? row.items : [],
    sourceSnapshot: row.sourceSnapshot || {},
    status: clean(row.status || 'confirmed'),
    confirmedBy: clean(row.confirmedBy),
    confirmedAt: row.confirmedAt,
    cancelledBy: clean(row.cancelledBy),
    cancelledAt: row.cancelledAt,
    cancelReason: clean(row.cancelReason),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

async function findCustomerByCode(customerCode) {
  const code = upper(customerCode);
  if (!code) return null;
  return Customer.findOne({
    $or: [{ code }, { customerCode: code }, { maKhachHang: code }],
    isActive: { $ne: false }
  }).lean();
}

async function listProductGroupSources() {
  const rows = await Product.find({ isActive: { $ne: false } })
    .select('category brand brandCode groupCode groupName productGroup productGroupCode productGroupName line family printGroup printGroupName')
    .lean()
    .catch(() => []);
  const map = new Map();
  for (const product of rows || []) {
    for (const value of productGroupFields(product)) {
      const key = upper(value);
      if (!key) continue;
      if (!map.has(key)) map.set(key, { code: key, name: value, sourceType: 'product_group', productCount: 0 });
      map.get(key).productCount += 1;
    }
  }
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'vi'));
}

async function listPromotionSources(targetDate = todayVN()) {
  const [items, rules, promos] = await Promise.all([
    PromotionGroupItem.find({ isActive: { $ne: false } }).select('programCode programName groupCode source startDate endDate cancelledAt isActive').lean().catch(() => []),
    PromotionGroupRule.find({ isActive: { $ne: false } }).select('programCode programName groupCode basis calculationBasis minAmount minQty thresholdQty startDate endDate cancelledAt isActive').lean().catch(() => []),
    Promotion.find({ isActive: { $ne: false } }).select('code programCode name programName productGroupCode productGroupName minQty minOrderAmount conditions type promotionType startDate endDate isActive active').lean().catch(() => [])
  ]);
  const groupMap = new Map();
  const programMap = new Map();
  for (const row of [...(items || []), ...(rules || [])].filter((item) => isActiveByDate(item, targetDate))) {
    const groupCode = upper(row.groupCode || row.programCode);
    const programCode = upper(row.programCode || row.groupCode);
    const name = clean(row.programName || row.groupName || groupCode || programCode);
    if (groupCode) groupMap.set(groupCode, { code: groupCode, name, sourceType: 'promotion_group' });
    if (programCode) programMap.set(programCode, { code: programCode, name, sourceType: 'promotion_program' });
  }
  for (const promo of (promos || []).filter((item) => isActiveByDate(item, targetDate))) {
    const programCode = upper(promo.programCode || promo.code);
    const name = clean(promo.programName || promo.name || programCode);
    if (programCode) programMap.set(programCode, { code: programCode, name, sourceType: 'promotion_program' });
    const groupCode = upper(promo.productGroupCode);
    if (groupCode) groupMap.set(groupCode, { code: groupCode, name: clean(promo.productGroupName || groupCode), sourceType: 'promotion_group' });
  }
  return {
    promotionGroups: Array.from(groupMap.values()).sort((a, b) => a.name.localeCompare(b.name, 'vi')),
    promotionPrograms: Array.from(programMap.values()).sort((a, b) => a.name.localeCompare(b.name, 'vi'))
  };
}

async function bootstrap(query = {}) {
  const targetDate = dateOnly(query.date || query.workingDate || todayVN());
  const [productGroups, promotionSources, activeGroups] = await Promise.all([
    listProductGroupSources(),
    listPromotionSources(targetDate),
    DisplayCheckGroup.find({ isActive: { $ne: false } }).sort({ groupName: 1 }).lean().catch(() => [])
  ]);
  return {
    ok: true,
    workingDate: targetDate,
    productGroups,
    promotionGroups: promotionSources.promotionGroups,
    promotionPrograms: promotionSources.promotionPrograms,
    displayGroups: activeGroups.map(publicGroup)
  };
}

async function listGroups() {
  const rows = await DisplayCheckGroup.find({}).sort({ isActive: -1, groupName: 1 }).lean();
  return rows.map(publicGroup);
}

function validateGroupPayload(input = {}) {
  const conditionType = input.conditionType === 'quantity' ? 'quantity' : 'amount';
  const groupCode = upper(input.groupCode);
  const groupName = clean(input.groupName);
  if (!groupCode) throw new Error('Mã nhóm chấm là bắt buộc.');
  if (!groupName) throw new Error('Tên nhóm chấm là bắt buộc.');
  if (conditionType === 'amount' && number(input.thresholdAmount) <= 0) throw new Error('Nhóm điều kiện đủ tiền phải có ngưỡng tiền > 0.');
  if (conditionType === 'quantity' && int(input.thresholdQty) <= 0) throw new Error('Nhóm điều kiện đủ số lượng phải có ngưỡng số lượng > 0.');
  return {
    groupCode,
    groupName,
    sourceType: clean(input.sourceType || 'custom') || 'custom',
    sourceCode: upper(input.sourceCode),
    sourceName: clean(input.sourceName || input.sourceCode),
    conditionType,
    thresholdAmount: conditionType === 'amount' ? number(input.thresholdAmount) : 0,
    thresholdQty: conditionType === 'quantity' ? int(input.thresholdQty) : 0,
    productCodes: Array.isArray(input.productCodes) ? input.productCodes.map(upper).filter(Boolean) : [],
    isActive: input.isActive !== false && input.isActive !== 'false',
    note: clean(input.note)
  };
}

async function createGroup(input = {}, userCode = 'system') {
  const payload = validateGroupPayload(input);
  const duplicated = await DisplayCheckGroup.findOne({ groupCode: payload.groupCode }).lean();
  if (duplicated) throw new Error(`Mã nhóm chấm ${payload.groupCode} đã tồn tại.`);
  const doc = await DisplayCheckGroup.create({ ...payload, createdBy: userCode, updatedBy: userCode, createdAt: nowIso(), updatedAt: nowIso() });
  return publicGroup(asLean(doc));
}

async function updateGroup(id, input = {}, userCode = 'system') {
  const payload = validateGroupPayload(input);
  const duplicated = await DisplayCheckGroup.findOne({ groupCode: payload.groupCode, _id: { $ne: id } }).lean();
  if (duplicated) throw new Error(`Mã nhóm chấm ${payload.groupCode} đã tồn tại.`);
  const doc = await DisplayCheckGroup.findByIdAndUpdate(id, { ...payload, updatedBy: userCode, updatedAt: nowIso() }, { new: true });
  if (!doc) throw new Error('Không tìm thấy nhóm chấm cần sửa.');
  return publicGroup(asLean(doc));
}

async function deleteGroup(id, userCode = 'system') {
  const doc = await DisplayCheckGroup.findByIdAndUpdate(id, { isActive: false, updatedBy: userCode, updatedAt: nowIso() }, { new: true });
  if (!doc) throw new Error('Không tìm thấy nhóm chấm cần tắt.');
  return publicGroup(asLean(doc));
}

async function listStoreSetups(workingDate) {
  const date = dateOnly(workingDate);
  const rows = await DisplayCheckStoreSetup.find({ workingDate: date, status: { $ne: 'cancelled' } }).sort({ customerCode: 1 }).lean();
  return rows.map(publicSetup);
}

async function upsertStoreSetup(input = {}, userCode = 'system', id = '') {
  const workingDate = dateOnly(input.workingDate);
  const customerCode = upper(input.customerCode);
  if (!customerCode) throw new Error('Mã cửa hàng là bắt buộc.');
  const customer = await findCustomerByCode(customerCode);
  if (!customer) throw new Error(`Không tìm thấy cửa hàng ${customerCode} trong danh mục khách hàng MK-Pro.`);
  const targetAmount = number(input.targetAmount);
  const targetLineCount = Math.max(1, int(input.targetLineCount || 1));
  if (targetAmount <= 0) throw new Error('Doanh số cần chấm phải > 0.');
  const selectedGroupCodes = Array.isArray(input.selectedGroupCodes) ? input.selectedGroupCodes.map(upper).filter(Boolean) : [];
  if (selectedGroupCodes.length) {
    const activeCount = await DisplayCheckGroup.countDocuments({ groupCode: { $in: selectedGroupCodes }, isActive: { $ne: false } });
    if (activeCount !== selectedGroupCodes.length) throw new Error('Có nhóm trưng bày đã chọn không tồn tại hoặc đang tắt.');
  }
  const payload = {
    workingDate,
    customerCode,
    customerName: clean(customer.name || customer.customerName || input.customerName || customerCode),
    targetAmount,
    targetLineCount,
    selectedGroupCodes,
    note: clean(input.note),
    status: clean(input.status || 'draft') || 'draft',
    updatedBy: userCode,
    updatedAt: nowIso()
  };
  let doc;
  if (id) {
    doc = await DisplayCheckStoreSetup.findByIdAndUpdate(id, payload, { new: true });
    if (!doc) throw new Error('Không tìm thấy cấu hình cửa hàng cần sửa.');
  } else {
    doc = await DisplayCheckStoreSetup.findOneAndUpdate(
      { workingDate, customerCode },
      { $set: payload, $setOnInsert: { createdBy: userCode, createdAt: nowIso() } },
      { new: true, upsert: true }
    );
  }
  return publicSetup(asLean(doc));
}

async function cancelStoreSetup(id, userCode = 'system') {
  const doc = await DisplayCheckStoreSetup.findByIdAndUpdate(id, { status: 'cancelled', updatedBy: userCode, updatedAt: nowIso() }, { new: true });
  if (!doc) throw new Error('Không tìm thấy cấu hình cửa hàng cần hủy.');
  return publicSetup(asLean(doc));
}

async function loadConfirmedUsage(workingDate) {
  const rows = await DisplayCheckPlan.find({ workingDate: dateOnly(workingDate), status: 'confirmed' }).select('items').lean().catch(() => []);
  const used = new Map();
  for (const plan of rows || []) {
    for (const item of plan.items || []) {
      const code = upper(item.productCode);
      if (!code) continue;
      used.set(code, (used.get(code) || 0) + int(item.qty));
    }
  }
  return used;
}

async function loadDmsGapProducts({ workingDate, dmsGapType = DEFAULTS.dmsGapType, forceRefresh = false } = {}) {
  const type = normalizeDmsGapType(dmsGapType);
  const usedByDay = await loadConfirmedUsage(workingDate);
  const rows = [];
  let latestImport = null;
  let page = 1;
  while (page <= DEFAULTS.maxDmsPages) {
    const result = await dmsInventoryService.getLatest({ type, page, limit: DEFAULTS.dmsPageSize, forceRefresh: forceRefresh === true });
    if (!latestImport) latestImport = result.import || null;
    rows.push(...(result.rows || []));
    if (!result.hasMore) break;
    page += 1;
  }
  if (!latestImport) throw new Error('MK-Pro chưa có dữ liệu đối chiếu tồn DMS đã chốt. Hãy vào Kho → Đối chiếu tồn DMS trước.');
  const productCodes = Array.from(new Set(rows.map((row) => upper(row.productCode)).filter(Boolean)));
  const catalogRows = productCodes.length ? await Product.find({
    $or: [{ code: { $in: productCodes } }, { productCode: { $in: productCodes } }, { sku: { $in: productCodes } }],
    isActive: { $ne: false }
  }).select('code productCode sku name productName salePrice price category brand brandCode groupCode groupName productGroup productGroupCode productGroupName line family printGroup printGroupName').lean() : [];
  const catalogMap = new Map();
  for (const product of catalogRows || []) {
    [product.code, product.productCode, product.sku].map(upper).filter(Boolean).forEach((code) => catalogMap.set(code, product));
  }
  const map = new Map();
  for (const row of rows) {
    const productCode = upper(row.productCode);
    if (!productCode) continue;
    const sourceQty = type === 'internal_greater'
      ? number(row.allocation?.remainingQty ?? row.internalExcessQty)
      : number(row.dmsExcessQty);
    const initialQty = int(sourceQty);
    const usedQty = usedByDay.get(productCode) || 0;
    const diffQty = Math.max(0, initialQty - usedQty);
    if (diffQty <= 0) continue;
    const catalog = catalogMap.get(productCode) || {};
    const price = number(catalog.salePrice ?? catalog.price ?? row.salePrice ?? row.price);
    if (price <= 0) continue;
    const current = map.get(productCode) || {
      productCode,
      productName: productNameOf(catalog) || clean(row.productName || row.dmsProductName),
      diffQty: 0,
      remainingQty: 0,
      price,
      usedQtyBefore: usedQty,
      groupFields: productGroupFields(catalog),
      sourceProduct: catalog
    };
    current.diffQty += diffQty;
    current.remainingQty += diffQty;
    current.totalAmount = money(current.diffQty * current.price);
    map.set(productCode, current);
  }
  return {
    products: Array.from(map.values()),
    latestImport,
    dmsGapType: type,
    truncated: page > DEFAULTS.maxDmsPages
  };
}

async function loadPreviewSourceContext() {
  const [catalogProducts, promotionGroupItems, promotions] = await Promise.all([
    Product.find({ isActive: { $ne: false } })
      .select('code productCode sku category brand brandCode groupCode groupName productGroup productGroupCode productGroupName line family printGroup printGroupName')
      .lean()
      .catch(() => []),
    PromotionGroupItem.find({ isActive: { $ne: false } })
      .select('programCode groupCode productCode startDate endDate cancelledAt isActive')
      .lean()
      .catch(() => []),
    Promotion.find({ isActive: { $ne: false } })
      .select('code programCode productCodes productGroupCode startDate endDate isActive active')
      .lean()
      .catch(() => [])
  ]);
  return { catalogProducts, promotionGroupItems, promotions };
}

async function resolveDisplayGroupProducts(group, { targetDate = todayVN(), catalogProducts = null, promotionGroupItems = null, promotions = null } = {}) {
  const sourceType = clean(group.sourceType || 'custom');
  const sourceCode = upper(group.sourceCode || group.sourceName || group.groupCode);
  const manualCodes = Array.isArray(group.productCodes) ? group.productCodes.map(upper).filter(Boolean) : [];
  if (sourceType === 'custom') return Array.from(new Set(manualCodes));
  if (sourceType === 'promotion_group' || sourceType === 'promotion_program') {
    const [items, promos] = promotionGroupItems && promotions ? [promotionGroupItems, promotions] : await Promise.all([
      PromotionGroupItem.find({ isActive: { $ne: false } }).select('programCode groupCode productCode startDate endDate cancelledAt isActive').lean().catch(() => []),
      Promotion.find({ isActive: { $ne: false } }).select('code programCode productCodes productGroupCode startDate endDate isActive active').lean().catch(() => [])
    ]);
    const codes = new Set(manualCodes);
    for (const item of (items || []).filter((row) => isActiveByDate(row, targetDate))) {
      const groupCode = upper(item.groupCode || item.programCode);
      const programCode = upper(item.programCode || item.groupCode);
      if (groupCode === sourceCode || programCode === sourceCode) codes.add(upper(item.productCode));
    }
    for (const promo of (promos || []).filter((row) => isActiveByDate(row, targetDate))) {
      if (upper(promo.code) === sourceCode || upper(promo.programCode) === sourceCode || upper(promo.productGroupCode) === sourceCode) {
        (promo.productCodes || []).forEach((code) => codes.add(upper(code)));
      }
    }
    return Array.from(codes).filter(Boolean);
  }
  if (sourceType === 'product_group') {
    const rows = catalogProducts || await Product.find({ isActive: { $ne: false } }).select('code productCode sku category brand brandCode groupCode groupName productGroup productGroupCode productGroupName line family printGroup printGroupName').lean();
    const codes = new Set(manualCodes);
    for (const product of rows || []) {
      const matches = productGroupFields(product).some((value) => upper(value) === sourceCode || norm(value) === norm(group.sourceName) || norm(value) === norm(group.sourceCode));
      if (matches) codes.add(productCodeOf(product));
    }
    return Array.from(codes).filter(Boolean);
  }
  return Array.from(new Set(manualCodes));
}

async function loadSelectedGroups(groupCodes = [], targetDate = todayVN(), sourceContext = {}) {
  const codes = groupCodes.map(upper).filter(Boolean);
  const rows = codes.length ? await DisplayCheckGroup.find({ groupCode: { $in: codes }, isActive: { $ne: false } }).lean() : [];
  const groups = rows.map(publicGroup);
  const found = new Set(groups.map((group) => group.groupCode));
  const missing = codes.filter((code) => !found.has(code));
  if (missing.length) throw new Error(`Nhóm trưng bày không tồn tại hoặc đang tắt: ${missing.join(', ')}`);
  const catalogProducts = sourceContext.catalogProducts || await Product.find({ isActive: { $ne: false } }).select('code productCode sku category brand brandCode groupCode groupName productGroup productGroupCode productGroupName line family printGroup printGroupName').lean().catch(() => []);
  for (const group of groups) {
    group.resolvedProductCodes = await resolveDisplayGroupProducts(group, { targetDate, ...sourceContext, catalogProducts });
  }
  return groups;
}

function makePreviewSkeleton({ workingDate, customer, targetAmount, targetLineCount, selectedGroups, sourceSnapshot }) {
  return {
    ok: true,
    feasible: true,
    warnings: [],
    errors: [],
    summary: {
      workingDate,
      customerCode: upper(customer.code || customer.customerCode),
      customerName: clean(customer.name || customer.customerName),
      targetAmount: number(targetAmount),
      generatedAmount: 0,
      targetLineCount: Math.max(1, int(targetLineCount || 1)),
      actualLineCount: 0,
      status: 'feasible'
    },
    selectedGroups: selectedGroups.map((group) => ({
      groupCode: group.groupCode,
      groupName: group.groupName,
      conditionType: group.conditionType,
      thresholdAmount: number(group.thresholdAmount),
      thresholdQty: int(group.thresholdQty),
      generatedAmount: 0,
      generatedQty: 0,
      remainingAmount: number(group.thresholdAmount),
      remainingQty: int(group.thresholdQty),
      status: 'pending',
      note: groupLabel(group)
    })),
    items: [],
    sourceSnapshot
  };
}

function failPreview(preview, message, type = 'INFEASIBLE') {
  preview.feasible = false;
  preview.summary.status = 'infeasible';
  preview.errors.push({ type, message });
  return preview;
}
function warnPreview(preview, message, type = 'WARN') { preview.warnings.push({ type, message }); }
function productBelongsToGroup(product, group) { return (group.resolvedProductCodes || []).includes(upper(product.productCode)); }
function selectedGroupByCode(preview, code) { return preview.selectedGroups.find((group) => group.groupCode === code); }
function productSelectedGroupCodes(product, groups) { return groups.filter((group) => productBelongsToGroup(product, group)).map((group) => group.groupCode); }
function addItem(preview, product, qty, reason, selectedGroups) {
  const safeQty = Math.max(0, Math.min(int(qty), product.remainingQty));
  if (!safeQty) return false;
  product.remainingQty -= safeQty;
  const amount = money(safeQty * product.price);
  const groupCodes = productSelectedGroupCodes(product, selectedGroups);
  let item = preview.items.find((row) => row.productCode === product.productCode && row.reason === reason);
  if (item) {
    item.qty += safeQty;
    item.amount = money(item.qty * item.price);
  } else {
    item = {
      productCode: product.productCode,
      productName: product.productName,
      productGroupCode: clean(product.groupFields?.[0] || ''),
      productGroupName: clean(product.groupFields?.[0] || ''),
      groupCodes,
      qty: safeQty,
      price: product.price,
      amount,
      reason
    };
    preview.items.push(item);
  }
  preview.summary.generatedAmount = money(preview.summary.generatedAmount + amount);
  preview.summary.actualLineCount = new Set(preview.items.map((row) => row.productCode)).size;
  for (const code of groupCodes) {
    const group = selectedGroupByCode(preview, code);
    if (!group) continue;
    group.generatedAmount = money(group.generatedAmount + amount);
    group.generatedQty += safeQty;
  }
  return true;
}
function refreshGroupStatuses(preview) {
  for (const group of preview.selectedGroups) {
    if (group.conditionType === 'quantity') {
      group.remainingQty = Math.max(0, int(group.thresholdQty) - int(group.generatedQty));
      group.remainingAmount = 0;
      group.status = group.remainingQty <= 0 ? 'passed' : 'failed';
    } else {
      group.remainingAmount = Math.max(0, money(number(group.thresholdAmount) - number(group.generatedAmount)));
      group.remainingQty = 0;
      group.status = group.remainingAmount <= 0 ? 'passed' : 'failed';
    }
  }
}
function canUseWithoutHalfBaked(product, selectedGroups, activeDisplayGroups) {
  const selected = new Set(selectedGroups.map((group) => group.groupCode));
  for (const group of activeDisplayGroups || []) {
    if (selected.has(group.groupCode)) continue;
    if (productBelongsToGroup(product, group)) return false;
  }
  return true;
}
function productScoreForFill(product, preview, selectedGroups, activeDisplayGroups) {
  if (product.remainingQty <= 0) return -Infinity;
  const already = preview.items.some((item) => item.productCode === product.productCode);
  const remain = Math.max(1, preview.summary.targetAmount - preview.summary.generatedAmount);
  const dmsPressure = product.diffQty > 0 ? product.remainingQty / product.diffQty : 0;
  const priceFit = Math.max(0, 1 - Math.abs(remain - product.price) / Math.max(remain, product.price));
  const diversity = already ? 0 : 1;
  const halfBakedPenalty = canUseWithoutHalfBaked(product, selectedGroups, activeDisplayGroups) ? 0 : 1;
  return 0.20 * diversity + 0.15 * dmsPressure + 0.10 * priceFit + 0.10 * Math.min(1, product.price / Math.max(1, remain)) - 0.30 * halfBakedPenalty - (already ? 0.20 : 0);
}

function satisfyGroup(preview, group, products, selectedGroups) {
  const candidates = products.filter((product) => product.remainingQty > 0 && productBelongsToGroup(product, group));
  if (!candidates.length) return `Nhóm ${group.groupName} không có sản phẩm lệch DMS khả dụng.`;
  let guard = 0;
  while (guard < 500) {
    guard += 1;
    refreshGroupStatuses(preview);
    const row = selectedGroupByCode(preview, group.groupCode);
    if (row && row.status === 'passed') return '';
    const remainingAmount = group.conditionType === 'amount' ? Math.max(0, number(group.thresholdAmount) - number(row?.generatedAmount)) : 0;
    const remainingQty = group.conditionType === 'quantity' ? Math.max(0, int(group.thresholdQty) - int(row?.generatedQty)) : 0;
    const sorted = candidates
      .filter((product) => product.remainingQty > 0)
      .sort((a, b) => {
        const aUsed = preview.items.some((item) => item.productCode === a.productCode) ? 1 : 0;
        const bUsed = preview.items.some((item) => item.productCode === b.productCode) ? 1 : 0;
        if (aUsed !== bUsed) return aUsed - bUsed;
        const aFit = group.conditionType === 'quantity' ? a.remainingQty : Math.abs(remainingAmount - a.price);
        const bFit = group.conditionType === 'quantity' ? b.remainingQty : Math.abs(remainingAmount - b.price);
        return group.conditionType === 'quantity' ? bFit - aFit : aFit - bFit;
      });
    const product = sorted[0];
    if (!product) break;
    let qty = 1;
    if (group.conditionType === 'quantity') qty = Math.min(product.remainingQty, Math.max(1, remainingQty));
    else qty = Math.min(product.remainingQty, Math.max(1, Math.ceil(remainingAmount / Math.max(1, product.price))));
    addItem(preview, product, qty, `Trưng bày ${group.groupName}`, selectedGroups);
  }
  refreshGroupStatuses(preview);
  const status = selectedGroupByCode(preview, group.groupCode);
  if (status?.status !== 'passed') return group.conditionType === 'quantity'
    ? `Không đủ số lượng DMS lệch cho nhóm ${group.groupName}. Còn thiếu ${status?.remainingQty || 0}.`
    : `Không đủ giá trị DMS lệch cho nhóm ${group.groupName}. Còn thiếu ${(status?.remainingAmount || 0).toLocaleString('vi-VN')}đ.`;
  return '';
}

async function generatePreview(input = {}) {
  const workingDate = dateOnly(input.workingDate);
  const customerCode = upper(input.customerCode);
  const targetAmount = number(input.targetAmount);
  const targetLineCount = Math.max(1, int(input.targetLineCount || 1));
  const selectedGroupCodes = Array.isArray(input.selectedGroupCodes) ? input.selectedGroupCodes.map(upper).filter(Boolean) : [];
  const options = {
    toleranceAmount: Math.max(0, number(input.toleranceAmount, DEFAULTS.toleranceAmount)),
    maxOverAmount: Math.max(0, number(input.maxOverAmount, DEFAULTS.maxOverAmount)),
    allowOverTargetForDisplay: input.allowOverTargetForDisplay === true || input.allowOverTargetForDisplay === 'true',
    dmsGapType: normalizeDmsGapType(input.dmsGapType || input.dmsComparisonType)
  };
  if (!customerCode) throw new Error('Thiếu mã cửa hàng.');
  if (targetAmount <= 0) throw new Error('Doanh số cần chấm phải > 0.');
  const customer = await findCustomerByCode(customerCode);
  if (!customer) throw new Error(`Không tìm thấy cửa hàng ${customerCode}.`);
  const sourceContext = await loadPreviewSourceContext();
  const [selectedGroups, activeDisplayGroups, dms] = await Promise.all([
    loadSelectedGroups(selectedGroupCodes, workingDate, sourceContext),
    DisplayCheckGroup.find({ isActive: { $ne: false } }).lean().then((rows) => rows.map(publicGroup)).catch(() => []),
    loadDmsGapProducts({ workingDate, dmsGapType: options.dmsGapType, forceRefresh: input.forceRefresh === true || input.forceRefresh === 'true' })
  ]);
  for (const group of activeDisplayGroups) group.resolvedProductCodes = await resolveDisplayGroupProducts(group, { targetDate: workingDate, ...sourceContext }).catch(() => []);
  const products = dms.products.map((product) => ({ ...product }));
  const preview = makePreviewSkeleton({
    workingDate,
    customer,
    targetAmount,
    targetLineCount,
    selectedGroups,
    sourceSnapshot: {
      dmsGapType: dms.dmsGapType,
      dmsGapAt: dms.latestImport?.snapshotAt || dms.latestImport?.committedAt || dms.latestImport?.updatedAt || '',
      dmsImportCode: dms.latestImport?.code || dms.latestImport?.id || '',
      promotionDate: workingDate
    }
  });
  if (!products.length) return failPreview(preview, 'Không có hàng lệch DMS khả dụng.', 'NO_DMS_GAP');
  for (const group of selectedGroups) {
    if (!(group.resolvedProductCodes || []).length) return failPreview(preview, `Nhóm ${group.groupName} không resolve được sản phẩm từ MK-Pro.`, 'GROUP_NO_PRODUCTS');
  }
  const minRequiredAmount = selectedGroups.reduce((sum, group) => sum + (group.conditionType === 'amount' ? number(group.thresholdAmount) : 0), 0);
  if (!options.allowOverTargetForDisplay && minRequiredAmount > targetAmount + options.maxOverAmount) {
    return failPreview(preview, `Tổng ngưỡng tiền nhóm đã chọn (${minRequiredAmount.toLocaleString('vi-VN')}đ) vượt doanh số cần chấm (${targetAmount.toLocaleString('vi-VN')}đ).`, 'GROUP_THRESHOLD_EXCEEDS_TARGET');
  }
  for (const group of selectedGroups) {
    const reason = satisfyGroup(preview, group, products, selectedGroups);
    if (reason) return failPreview(preview, reason, 'GROUP_INFEASIBLE');
  }
  refreshGroupStatuses(preview);
  if (!options.allowOverTargetForDisplay && preview.summary.generatedAmount > targetAmount + options.maxOverAmount) {
    return failPreview(preview, 'Để đạt trưng bày bắt buộc, giá trị sinh đã vượt quá room doanh số cho phép.', 'OVER_TARGET_FOR_DISPLAY');
  }
  let guard = 0;
  while (preview.summary.actualLineCount < targetLineCount && guard < 200) {
    guard += 1;
    const candidates = products.filter((product) => product.remainingQty > 0 && !preview.items.some((item) => item.productCode === product.productCode));
    candidates.sort((a, b) => productScoreForFill(b, preview, selectedGroups, activeDisplayGroups) - productScoreForFill(a, preview, selectedGroups, activeDisplayGroups));
    const product = candidates[0];
    if (!product || !Number.isFinite(productScoreForFill(product, preview, selectedGroups, activeDisplayGroups))) break;
    if (!canUseWithoutHalfBaked(product, selectedGroups, activeDisplayGroups)) break;
    addItem(preview, product, 1, 'Tăng số dòng', selectedGroups);
    if (!options.allowOverTargetForDisplay && preview.summary.generatedAmount > targetAmount + options.maxOverAmount) break;
  }
  if (preview.summary.actualLineCount < targetLineCount) warnPreview(preview, `Không đủ SKU phù hợp để đạt ${targetLineCount} dòng. Đã sinh ${preview.summary.actualLineCount} dòng.`, 'LINE_COUNT_NOT_REACHED');
  guard = 0;
  while (preview.summary.generatedAmount < targetAmount - options.toleranceAmount && guard < 500) {
    guard += 1;
    const candidates = products.filter((product) => product.remainingQty > 0).sort((a, b) => productScoreForFill(b, preview, selectedGroups, activeDisplayGroups) - productScoreForFill(a, preview, selectedGroups, activeDisplayGroups));
    const product = candidates[0];
    if (!product || !Number.isFinite(productScoreForFill(product, preview, selectedGroups, activeDisplayGroups))) break;
    const room = Math.max(0, targetAmount + options.maxOverAmount - preview.summary.generatedAmount);
    const qty = Math.max(1, Math.min(product.remainingQty, Math.floor(room / Math.max(1, product.price)) || 1));
    if (!options.allowOverTargetForDisplay && product.price > room + 1) break;
    addItem(preview, product, qty, 'Lấp đủ doanh số', selectedGroups);
  }
  refreshGroupStatuses(preview);
  const failedGroup = preview.selectedGroups.find((group) => group.status !== 'passed');
  if (failedGroup) return failPreview(preview, `Nhóm ${failedGroup.groupName} chưa đạt ngưỡng trưng bày.`, 'SELECTED_GROUP_NOT_PASSED');
  if (preview.summary.generatedAmount < targetAmount - options.toleranceAmount) warnPreview(preview, `Giá trị sinh còn thiếu ${(targetAmount - preview.summary.generatedAmount).toLocaleString('vi-VN')}đ so với doanh số cần chấm.`, 'TARGET_AMOUNT_NOT_REACHED');
  if (preview.summary.generatedAmount > targetAmount + options.maxOverAmount) warnPreview(preview, `Giá trị sinh vượt doanh số cần chấm quá ngưỡng cho phép.`, 'TARGET_AMOUNT_OVER');
  preview.summary.status = preview.feasible ? 'feasible' : 'infeasible';
  return preview;
}

function sanitizePreviewForSave(payload = {}) {
  if (!payload || typeof payload !== 'object') throw new Error('Thiếu previewPayload để xác nhận chấm.');
  const summary = payload.summary || {};
  const items = Array.isArray(payload.items) ? payload.items : [];
  const selectedGroups = Array.isArray(payload.selectedGroups) ? payload.selectedGroups : [];
  if (!summary.workingDate || !summary.customerCode) throw new Error('Preview thiếu thông tin ngày/cửa hàng.');
  if (!items.length) throw new Error('Preview chưa có sản phẩm để xác nhận chấm.');
  return { summary, items, selectedGroups, sourceSnapshot: payload.sourceSnapshot || {}, feasible: payload.feasible !== false, warnings: payload.warnings || [], errors: payload.errors || [] };
}
async function nextPlanCode(workingDate) {
  const prefix = `DCP-${dateOnly(workingDate).replace(/-/g, '')}-`;
  const count = await DisplayCheckPlan.countDocuments({ workingDate: dateOnly(workingDate) });
  return `${prefix}${String(count + 1).padStart(4, '0')}`;
}
async function confirmPlan(input = {}, userCode = 'system') {
  const payload = sanitizePreviewForSave(input.previewPayload || input);
  if (!payload.feasible) throw new Error('Preview đang không khả thi, không thể xác nhận chấm.');
  const planCode = await nextPlanCode(payload.summary.workingDate);
  const doc = await DisplayCheckPlan.create({
    workingDate: dateOnly(payload.summary.workingDate),
    planCode,
    customerCode: upper(payload.summary.customerCode),
    customerName: clean(payload.summary.customerName),
    targetAmount: number(payload.summary.targetAmount),
    generatedAmount: number(payload.summary.generatedAmount),
    targetLineCount: int(payload.summary.targetLineCount),
    actualLineCount: int(payload.summary.actualLineCount),
    selectedGroups: payload.selectedGroups,
    items: payload.items,
    sourceSnapshot: payload.sourceSnapshot,
    status: 'confirmed',
    confirmedBy: userCode,
    confirmedAt: nowIso(),
    createdAt: nowIso(),
    updatedAt: nowIso()
  });
  await DisplayCheckStoreSetup.findOneAndUpdate(
    { workingDate: dateOnly(payload.summary.workingDate), customerCode: upper(payload.summary.customerCode) },
    { status: 'confirmed', updatedBy: userCode, updatedAt: nowIso() }
  ).catch(() => null);
  return publicPlan(asLean(doc));
}

async function listPlans(workingDate) {
  const rows = await DisplayCheckPlan.find({ workingDate: dateOnly(workingDate) }).sort({ createdAt: -1 }).lean();
  return rows.map(publicPlan);
}
async function getPlan(id) {
  const doc = await DisplayCheckPlan.findById(id).lean();
  if (!doc) throw new Error('Không tìm thấy danh sách chấm.');
  return publicPlan(doc);
}
async function cancelPlan(id, reason = '', userCode = 'system') {
  const doc = await DisplayCheckPlan.findByIdAndUpdate(id, { status: 'cancelled', cancelledBy: userCode, cancelledAt: nowIso(), cancelReason: clean(reason), updatedAt: nowIso() }, { new: true });
  if (!doc) throw new Error('Không tìm thấy danh sách chấm cần hủy.');
  return publicPlan(asLean(doc));
}

module.exports = {
  currentUserCode,
  bootstrap,
  listGroups,
  createGroup,
  updateGroup,
  deleteGroup,
  listStoreSetups,
  upsertStoreSetup,
  cancelStoreSetup,
  generatePreview,
  confirmPlan,
  listPlans,
  getPlan,
  cancelPlan
};
