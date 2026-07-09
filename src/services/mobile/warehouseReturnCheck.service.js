'use strict';

const dateUtil = require('../../utils/date.util');
const { makeId, toNumber } = require('../../utils/common.util');
const ReturnOrder = require('../../models/ReturnOrder');
const Product = require('../../models/Product');
const WarehouseReturnCheck = require('../../models/WarehouseReturnCheck');
const auditService = require('../auditService');
const { createCommandTelemetry } = require('../../utils/commandTelemetry');

const ACTIVE_RETURN_STATUSES = new Set([
  '', 'draft', 'pending', 'active', 'waiting_receive', 'pending_warehouse_receive',
  'pending_warehouse_check', 'ready_to_stock_in', 'warehouse_matched', 'warehouse_discrepancy',
  'merged', 'delivered', 'completed', 'received', 'posted', 'has_return'
]);
const INACTIVE_RETURN_STATUSES = new Set(['cancelled', 'canceled', 'void', 'deleted', 'removed', 'duplicate_cancelled', 'cleared']);
const TERMINAL_CHECK_STATUSES = new Set(['confirmed', 'discrepancy']);

function clean(value = '') {
  return String(value ?? '').trim();
}

function compact(value = '') {
  return clean(value).toLowerCase().replace(/\s+/g, '');
}

function dateOnly(value = '', fallback = '') {
  return dateUtil.toDateOnly(value || '', fallback || '');
}

function actorName(actor = {}) {
  return clean(actor.fullName || actor.name || actor.username || actor.code || actor.staffCode || 'system');
}

function actorCode(actor = {}) {
  return clean(actor.code || actor.staffCode || actor.username || actor.id || '');
}

function actorTenantId(actor = {}) {
  return clean(actor.tenantId || process.env.DEFAULT_TENANT_ID || 'minh-khai');
}

function response(body = {}, statusCode = 200) {
  return { statusCode, body: { ok: true, success: true, ...body } };
}

function error(message, status = 400, code = '') {
  const err = new Error(message);
  err.status = status;
  err.statusCode = status;
  err.code = code;
  return err;
}

function normalizeDeliveryCode(row = {}) {
  return clean(row.deliveryStaffCode || row.deliveryCode || row.nvghCode || row.shipperCode || row.staffDeliveryCode || row.staffCode || '');
}

function normalizeDeliveryName(row = {}) {
  return clean(row.deliveryStaffName || row.deliveryName || row.nvghName || row.shipperName || row.staffDeliveryName || row.staffName || '');
}

function returnOrderId(row = {}) {
  return clean(row.id || row.code || row._id || row.returnOrderId || row.returnOrderCode || '');
}

function returnOrderCode(row = {}) {
  return clean(row.code || row.id || row.returnOrderCode || row._id || '');
}

function orderCodeOf(row = {}) {
  return clean(row.salesOrderCode || row.orderCode || row.sourceOrderCode || row.deliveryOrderCode || row.code || '');
}

function returnBusinessDate(row = {}) {
  return dateOnly(row.returnDate || row.date || row.documentDate || row.deliveryDate || row.createdAt || row.updatedAt || '');
}

function isActiveReturnOrder(row = {}) {
  if (!row || row.deletedAt) return false;
  const statuses = [row.status, row.returnStatus, row.returnState].map((value) => clean(value).toLowerCase()).filter(Boolean);
  if (statuses.some((status) => INACTIVE_RETURN_STATUSES.has(status))) return false;
  if (!statuses.length) return true;
  return statuses.some((status) => ACTIVE_RETURN_STATUSES.has(status)) || statuses.every((status) => !INACTIVE_RETURN_STATUSES.has(status));
}

function productCodeOf(item = {}) {
  return clean(item.productCode || item.code || item.productId || item.sku || item.itemCode || '');
}

function productNameOf(item = {}, product = {}) {
  return clean(item.productName || item.name || item.itemName || product.productName || product.name || '');
}

function conversionRateOf(item = {}, product = {}) {
  const value = toNumber(item.conversionRate ?? item.packingQty ?? item.qtyPerCase ?? item.caseSize ?? product.conversionRate ?? product.packingQty ?? product.qtyPerCase ?? product.caseSize ?? 1);
  return Math.max(1, Math.round(value || 1));
}

function firstNumber(source = {}, fields = []) {
  for (const field of fields) {
    if (source[field] !== undefined && source[field] !== null && source[field] !== '') return toNumber(source[field]);
  }
  return 0;
}

function returnQtyOf(item = {}) {
  return toNumber(item.returnQty ?? item.qtyReturn ?? item.returnQuantity ?? item.returnedQty ?? item.actualReturnQty ?? item.quantity ?? item.qty ?? item.totalQty ?? 0);
}

function splitQty(item = {}, product = {}) {
  const conversionRate = conversionRateOf(item, product);
  const explicitCaseQty = firstNumber(item, ['reportedCaseQty', 'returnCaseQty', 'caseReturnQty', 'qtyReturnCase', 'returnedCaseQty', 'caseQty', 'cartonQty', 'cases', 'qtyCase', 'caseQuantity']);
  const explicitEachQty = firstNumber(item, ['reportedEachQty', 'returnLooseQty', 'looseReturnQty', 'qtyReturnLoose', 'returnedLooseQty', 'looseQty', 'unitQty', 'eachQty', 'remainderQty', 'qtyLoose', 'looseQuantity']);
  if (explicitCaseQty > 0 || explicitEachQty > 0) {
    return {
      caseQty: Math.max(0, Math.round(explicitCaseQty)),
      eachQty: Math.max(0, Math.round(explicitEachQty)),
      totalEachQty: Math.max(0, Math.round(explicitCaseQty * conversionRate + explicitEachQty)),
      conversionRate
    };
  }
  const totalEachQty = Math.max(0, Math.round(returnQtyOf(item)));
  return {
    caseQty: Math.floor(totalEachQty / conversionRate),
    eachQty: totalEachQty % conversionRate,
    totalEachQty,
    conversionRate
  };
}

function normalizeReceivedInput(row = {}) {
  return {
    productCode: productCodeOf(row),
    receivedCaseQty: Math.max(0, Math.round(toNumber(row.receivedCaseQty ?? row.caseQty ?? row.cases ?? 0))),
    receivedEachQty: Math.max(0, Math.round(toNumber(row.receivedEachQty ?? row.eachQty ?? row.looseQty ?? row.units ?? 0))),
    note: clean(row.note || row.discrepancyNote || '')
  };
}

function checkIdFor(date, deliveryStaffCode) {
  const code = clean(deliveryStaffCode || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || 'unknown';
  return `WRCHK-${date}-${code}`;
}

function checkFilter(date, deliveryStaffCode, tenantId = '') {
  const filter = {
    date,
    deliveryStaffCode: clean(deliveryStaffCode)
  };
  if (tenantId) filter.tenantId = tenantId;
  return filter;
}

function buildDateFilter(date) {
  const target = dateOnly(date, dateUtil.todayVN());
  const prefix = new RegExp(`^${target}`);
  return {
    $or: [
      { returnDate: target }, { returnDate: prefix },
      { date: target }, { date: prefix },
      { documentDate: target }, { documentDate: prefix },
      { deliveryDate: target }, { deliveryDate: prefix },
      { createdAt: prefix }
    ]
  };
}

function buildReturnOrderFilter({ date, deliveryStaffCode = '', tenantId = '' } = {}) {
  const and = [buildDateFilter(date)];
  if (deliveryStaffCode) {
    const code = clean(deliveryStaffCode);
    and.push({
      $or: [
        { deliveryStaffCode: code },
        { deliveryCode: code },
        { nvghCode: code },
        { shipperCode: code },
        { staffDeliveryCode: code },
        { staffCode: code }
      ]
    });
  }
  if (tenantId) and.push({ $or: [{ tenantId }, { tenantId: { $exists: false } }, { tenantId: '' }] });
  return { $and: and };
}

async function loadReturnOrders({ date, deliveryStaffCode = '', tenantId = '' } = {}) {
  const rows = await ReturnOrder.find(buildReturnOrderFilter({ date, deliveryStaffCode, tenantId }))
    .select('id code tenantId date documentDate returnDate deliveryDate createdAt updatedAt customerCode customerName salesOrderId salesOrderCode orderId orderCode sourceOrderCode deliveryOrderCode deliveryStaffCode deliveryStaffName deliveryCode deliveryName nvghCode nvghName shipperCode shipperName staffCode staffName status returnStatus returnState warehouseStatus warehouseReceiveStatus stockReceiveStatus warehouseCheckStatus warehouseCheckId warehouseCheckedAt warehouseCheckedBy warehouseCheckedByName warehouseCheckNote stockInStatus stockPosted stockPostedAt stockPostedBy stockPostedByName stockTransactionIds accountingStatus returnMergeStatus items totalQuantity quantity qty totalAmount totalReturnAmount amount debtReduction note')
    .lean()
    .catch(() => []);
  return (rows || []).filter(isActiveReturnOrder).filter((row) => returnBusinessDate(row) === dateOnly(date, dateUtil.todayVN()));
}

async function productMapForCodes(codes = []) {
  const uniqueCodes = [...new Set((codes || []).map(clean).filter(Boolean))];
  if (!uniqueCodes.length) return new Map();
  const products = await Product.find({
    $or: [
      { productCode: { $in: uniqueCodes } },
      { code: { $in: uniqueCodes } },
      { sku: { $in: uniqueCodes } }
    ]
  }).select('code productCode sku name productName conversionRate packingQty qtyPerCase caseSize baseUnit unit').lean().catch(() => []);
  const map = new Map();
  for (const product of products || []) {
    [product.productCode, product.code, product.sku].map(clean).filter(Boolean).forEach((code) => map.set(code, product));
  }
  return map;
}

async function aggregateReturns({ date, deliveryStaffCode = '', tenantId = '' } = {}) {
  const targetDate = dateOnly(date, dateUtil.todayVN());
  const returnOrders = await loadReturnOrders({ date: targetDate, deliveryStaffCode, tenantId });
  const productCodes = [];
  for (const ro of returnOrders) {
    for (const item of Array.isArray(ro.items) ? ro.items : []) {
      const code = productCodeOf(item);
      if (code) productCodes.push(code);
    }
  }
  const products = await productMapForCodes(productCodes);
  const deliveryMap = new Map();

  for (const ro of returnOrders) {
    const deliveryCode = normalizeDeliveryCode(ro);
    if (!deliveryCode) continue;
    const deliveryKey = compact(deliveryCode);
    if (!deliveryMap.has(deliveryKey)) {
      deliveryMap.set(deliveryKey, {
        date: targetDate,
        deliveryStaffCode: deliveryCode,
        deliveryStaffName: normalizeDeliveryName(ro),
        returnOrderIds: new Set(),
        returnOrderCount: 0,
        sourceLineCount: 0,
        products: new Map()
      });
    }
    const bucket = deliveryMap.get(deliveryKey);
    bucket.deliveryStaffName = bucket.deliveryStaffName || normalizeDeliveryName(ro);
    bucket.returnOrderIds.add(returnOrderId(ro));
    const items = Array.isArray(ro.items) ? ro.items : [];
    for (const item of items) {
      const productCode = productCodeOf(item);
      if (!productCode) continue;
      const product = products.get(productCode) || {};
      const qty = splitQty(item, product);
      if (qty.totalEachQty <= 0) continue;
      const productKey = compact(productCode);
      if (!bucket.products.has(productKey)) {
        bucket.products.set(productKey, {
          productCode,
          productName: productNameOf(item, product),
          unit: clean(item.unit || product.unit || product.baseUnit || ''),
          conversionRate: qty.conversionRate,
          totalEachQty: 0,
          reportedCaseQty: 0,
          reportedEachQty: 0,
          sourceLines: []
        });
      }
      const productBucket = bucket.products.get(productKey);
      productBucket.productName = productBucket.productName || productNameOf(item, product);
      productBucket.conversionRate = Math.max(productBucket.conversionRate || 1, qty.conversionRate || 1);
      productBucket.totalEachQty += qty.totalEachQty;
      bucket.sourceLineCount += 1;
      productBucket.sourceLines.push({
        returnOrderId: returnOrderId(ro),
        returnOrderCode: returnOrderCode(ro),
        orderCode: orderCodeOf(ro),
        salesOrderCode: clean(ro.salesOrderCode || ro.orderCode || ''),
        customerCode: clean(ro.customerCode || ''),
        customerName: clean(ro.customerName || ''),
        reportedCaseQty: qty.caseQty,
        reportedEachQty: qty.eachQty,
        reportedTotalEachQty: qty.totalEachQty,
        returnAt: clean(ro.returnDate || ro.date || ro.documentDate || ro.createdAt || '')
      });
    }
  }

  const deliveries = Array.from(deliveryMap.values()).map((bucket) => {
    const items = Array.from(bucket.products.values()).map((item) => {
      const rate = Math.max(1, item.conversionRate || 1);
      item.reportedCaseQty = Math.floor(item.totalEachQty / rate);
      item.reportedEachQty = item.totalEachQty % rate;
      return item;
    }).sort((a, b) => clean(a.productName || a.productCode).localeCompare(clean(b.productName || b.productCode), 'vi'));
    return {
      date: bucket.date,
      deliveryStaffCode: bucket.deliveryStaffCode,
      deliveryStaffName: bucket.deliveryStaffName,
      sourceReturnOrderIds: Array.from(bucket.returnOrderIds).filter(Boolean),
      returnOrderCount: bucket.returnOrderIds.size,
      productCount: items.length,
      totalReportedLines: bucket.sourceLineCount,
      items
    };
  }).sort((a, b) => clean(a.deliveryStaffName || a.deliveryStaffCode).localeCompare(clean(b.deliveryStaffName || b.deliveryStaffCode), 'vi'));

  return deliveryStaffCode ? (deliveries.find((d) => compact(d.deliveryStaffCode) === compact(deliveryStaffCode)) || {
    date: targetDate,
    deliveryStaffCode: clean(deliveryStaffCode),
    deliveryStaffName: '',
    sourceReturnOrderIds: [],
    returnOrderCount: 0,
    productCount: 0,
    totalReportedLines: 0,
    items: []
  }) : deliveries;
}

function normalizeCheckDoc(doc = {}) {
  const row = typeof doc?.toObject === 'function' ? doc.toObject() : { ...(doc || {}) };
  delete row._id;
  delete row.__v;
  return row;
}

async function existingChecksByDelivery(date, tenantId = '') {
  const filter = { date };
  if (tenantId) filter.tenantId = tenantId;
  const checks = await WarehouseReturnCheck.find(filter).lean().catch(() => []);
  const map = new Map();
  for (const check of checks || []) map.set(compact(check.deliveryStaffCode), check);
  return map;
}

function buildItemFromAggregate(aggregateItem = {}, receivedMap = new Map(), defaultToReported = true) {
  const code = clean(aggregateItem.productCode);
  const received = receivedMap.get(compact(code)) || {};
  const receivedCaseQty = received.receivedCaseQty !== undefined ? received.receivedCaseQty : (defaultToReported ? aggregateItem.reportedCaseQty : 0);
  const receivedEachQty = received.receivedEachQty !== undefined ? received.receivedEachQty : (defaultToReported ? aggregateItem.reportedEachQty : 0);
  const diffCaseQty = Math.round(toNumber(receivedCaseQty) - toNumber(aggregateItem.reportedCaseQty));
  const diffEachQty = Math.round(toNumber(receivedEachQty) - toNumber(aggregateItem.reportedEachQty));
  const status = diffCaseQty === 0 && diffEachQty === 0 ? 'matched' : 'discrepancy';
  return {
    productCode: code,
    productName: clean(aggregateItem.productName),
    unit: clean(aggregateItem.unit),
    conversionRate: Math.max(1, Math.round(toNumber(aggregateItem.conversionRate || 1))),
    reportedCaseQty: Math.round(toNumber(aggregateItem.reportedCaseQty)),
    reportedEachQty: Math.round(toNumber(aggregateItem.reportedEachQty)),
    reportedTotalEachQty: Math.round(toNumber(aggregateItem.totalEachQty)),
    receivedCaseQty: Math.max(0, Math.round(toNumber(receivedCaseQty))),
    receivedEachQty: Math.max(0, Math.round(toNumber(receivedEachQty))),
    diffCaseQty,
    diffEachQty,
    status,
    note: clean(received.note || ''),
    sourceLines: Array.isArray(aggregateItem.sourceLines) ? aggregateItem.sourceLines : []
  };
}

async function buildDetail({ date, deliveryStaffCode, tenantId = '' } = {}) {
  const targetDate = dateOnly(date, dateUtil.todayVN());
  const aggregate = await aggregateReturns({ date: targetDate, deliveryStaffCode, tenantId });
  const check = await WarehouseReturnCheck.findOne(checkFilter(targetDate, aggregate.deliveryStaffCode || deliveryStaffCode, tenantId)).lean().catch(() => null);
  const savedItems = new Map((Array.isArray(check?.items) ? check.items : []).map((item) => [compact(item.productCode), item]));
  const items = (aggregate.items || []).map((item) => buildItemFromAggregate(item, savedItems, true));
  const discrepancyCount = items.filter((item) => item.status === 'discrepancy').length;
  return {
    check: check ? normalizeCheckDoc(check) : null,
    header: {
      id: check?.id || checkIdFor(targetDate, aggregate.deliveryStaffCode || deliveryStaffCode),
      tenantId,
      date: targetDate,
      deliveryStaffCode: aggregate.deliveryStaffCode || clean(deliveryStaffCode),
      deliveryStaffName: aggregate.deliveryStaffName || check?.deliveryStaffName || '',
      status: check?.status || (items.length ? 'pending' : 'empty'),
      returnOrderCount: aggregate.returnOrderCount || 0,
      productCount: items.length,
      totalReportedLines: aggregate.totalReportedLines || 0,
      totalDiscrepancyItems: discrepancyCount,
      checkedAt: check?.checkedAt || '',
      checkedByName: check?.checkedByName || '',
      note: check?.note || ''
    },
    sourceReturnOrderIds: aggregate.sourceReturnOrderIds || [],
    items
  };
}

function assertItemsAreValid(bodyItems = [], aggregateItems = []) {
  const allowed = new Set((aggregateItems || []).map((item) => compact(item.productCode)).filter(Boolean));
  const normalized = (Array.isArray(bodyItems) ? bodyItems : []).map(normalizeReceivedInput).filter((item) => item.productCode);
  for (const item of normalized) {
    if (!allowed.has(compact(item.productCode))) {
      throw error(`Sản phẩm ${item.productCode} không nằm trong danh sách hàng trả của NVGH/ngày này`, 400, 'WAREHOUSE_RETURN_ITEM_NOT_IN_SOURCE');
    }
  }
  return normalized;
}

function summarizeDiff(items = []) {
  return (items || [])
    .filter((item) => item.status === 'discrepancy')
    .map((item) => `${item.productCode}: ${item.diffCaseQty >= 0 ? '+' : ''}${item.diffCaseQty} thùng, ${item.diffEachQty >= 0 ? '+' : ''}${item.diffEachQty} lẻ`)
    .join('; ');
}

function buildSourceReturnOrderFilter(sourceReturnOrderIds = [], tenantId = '') {
  const keys = [...new Set((Array.isArray(sourceReturnOrderIds) ? sourceReturnOrderIds : []).map(clean).filter(Boolean))];
  if (!keys.length) return null;
  const filter = {
    $or: [
      { id: { $in: keys } },
      { code: { $in: keys } },
      { returnOrderId: { $in: keys } },
      { returnOrderCode: { $in: keys } }
    ],
    status: { $nin: ['cancelled', 'canceled', 'void', 'deleted', 'removed', 'duplicate_cancelled', 'cleared'] }
  };
  if (tenantId) filter.$and = [{ $or: [{ tenantId }, { tenantId: { $exists: false } }, { tenantId: '' }] }];
  return filter;
}

async function applyReturnOrdersCheckResult({ doc = {}, discrepancyCount = 0, actor = {}, note = '', beforeRows = [] } = {}) {
  const sourceReturnOrderIds = Array.isArray(doc.sourceReturnOrderIds) ? doc.sourceReturnOrderIds : [];
  const filter = buildSourceReturnOrderFilter(sourceReturnOrderIds, doc.tenantId || actorTenantId(actor));
  if (!filter) return { matchedCount: 0, modifiedCount: 0 };

  const now = dateUtil.nowIso();
  const matched = discrepancyCount <= 0;
  const checkStatus = matched ? 'matched' : 'discrepancy';
  const stockInStatus = matched ? 'ready' : 'blocked';
  const displayStatus = matched ? 'ready_to_stock_in' : 'warehouse_discrepancy';
  const warehouseStatus = matched ? 'warehouse_matched' : 'warehouse_discrepancy';

  const update = {
    $set: {
      warehouseCheckStatus: checkStatus,
      warehouseStatus,
      warehouseCheckId: doc.id || '',
      warehouseCheckedAt: doc.checkedAt || now,
      warehouseCheckedBy: actorCode(actor),
      warehouseCheckedByName: actorName(actor),
      warehouseCheckNote: clean(note || doc.note || ''),
      stockInStatus,
      status: displayStatus,
      returnStatus: displayStatus,
      updatedAt: now
    }
  };

  const result = await ReturnOrder.updateMany(
    {
      ...filter,
      stockPosted: { $ne: true },
      stockInStatus: { $ne: 'posted' }
    },
    update
  );

  await auditService.log(matched ? 'warehouse_return_check_confirmed' : 'warehouse_return_check_discrepancy', {
    tenantId: doc.tenantId || actorTenantId(actor),
    actor,
    refType: 'returnOrder',
    refId: sourceReturnOrderIds.join(','),
    refCode: `${doc.date || ''}:${doc.deliveryStaffCode || ''}`,
    before: {
      returnOrderIds: sourceReturnOrderIds,
      rows: (Array.isArray(beforeRows) ? beforeRows : []).map((row) => ({
        id: returnOrderId(row),
        code: returnOrderCode(row),
        warehouseCheckStatus: row.warehouseCheckStatus || '',
        stockInStatus: row.stockInStatus || '',
        stockPosted: Boolean(row.stockPosted)
      }))
    },
    after: {
      warehouseCheckStatus: checkStatus,
      stockInStatus,
      warehouseCheckId: doc.id || '',
      matchedCount: result.matchedCount || result.n || 0,
      modifiedCount: result.modifiedCount || result.nModified || 0,
      totalDiscrepancyItems: discrepancyCount
    },
    note: clean(note || doc.note || '')
  });

  return result;
}

async function persistCheck({ date, deliveryStaffCode, bodyItems = [], note = '', confirm = false, actor = {} } = {}) {
  const tenantId = actorTenantId(actor);
  const targetDate = dateOnly(date, dateUtil.todayVN());
  const detailBefore = await buildDetail({ date: targetDate, deliveryStaffCode, tenantId });
  const aggregateItems = detailBefore.items || [];
  const normalizedInput = assertItemsAreValid(bodyItems, aggregateItems);
  if (!aggregateItems.length) {
    throw error('Không có hàng trả cần kiểm cho NVGH/ngày này', 400, 'WAREHOUSE_RETURN_EMPTY');
  }
  const receivedMap = new Map(normalizedInput.map((item) => [compact(item.productCode), item]));
  const finalItems = aggregateItems.map((item) => buildItemFromAggregate(item, receivedMap, true));
  const discrepancyCount = finalItems.filter((item) => item.status === 'discrepancy').length;
  const status = confirm ? (discrepancyCount ? 'discrepancy' : 'confirmed') : 'checking';
  const now = dateUtil.nowIso();
  const header = detailBefore.header || {};
  const deliveryCode = clean(header.deliveryStaffCode || deliveryStaffCode);
  const deliveryName = clean(header.deliveryStaffName || '');
  const doc = {
    id: checkIdFor(targetDate, deliveryCode),
    tenantId,
    date: targetDate,
    deliveryStaffCode: deliveryCode,
    deliveryStaffName: deliveryName,
    status,
    sourceReturnOrderIds: detailBefore.sourceReturnOrderIds || [],
    returnOrderCount: header.returnOrderCount || 0,
    productCount: finalItems.length,
    totalReportedLines: header.totalReportedLines || 0,
    totalReportedItems: finalItems.reduce((sum, item) => sum + Math.round(toNumber(item.reportedTotalEachQty)), 0),
    totalDiscrepancyItems: discrepancyCount,
    items: finalItems,
    note: clean(note),
    checkedByUserId: confirm ? clean(actor.id || actor._id || '') : clean(detailBefore.check?.checkedByUserId || ''),
    checkedByCode: confirm ? actorCode(actor) : clean(detailBefore.check?.checkedByCode || ''),
    checkedByName: confirm ? actorName(actor) : clean(detailBefore.check?.checkedByName || ''),
    checkedAt: confirm ? now : clean(detailBefore.check?.checkedAt || ''),
    createdAt: detailBefore.check?.createdAt || now,
    updatedAt: now
  };

  const saved = await WarehouseReturnCheck.findOneAndUpdate(
    checkFilter(targetDate, deliveryCode, tenantId),
    { $set: doc },
    { upsert: true, new: true, lean: true }
  );

  if (confirm) {
    await applyReturnOrdersCheckResult({
      doc,
      discrepancyCount,
      actor,
      note,
      beforeRows: await loadReturnOrders({ date: targetDate, deliveryStaffCode: deliveryCode, tenantId })
    });
  }

  await auditService.log(confirm
    ? (discrepancyCount ? 'warehouse_return_check_discrepancy' : 'warehouse_return_check_confirmed')
    : 'warehouse_return_check_saved', {
    tenantId,
    actor,
    refType: 'warehouseReturnCheck',
    refId: doc.id,
    refCode: `${targetDate}:${deliveryCode}`,
    before: detailBefore.check || null,
    after: {
      status,
      date: targetDate,
      deliveryStaffCode: deliveryCode,
      deliveryStaffName: deliveryName,
      productCount: finalItems.length,
      totalDiscrepancyItems: discrepancyCount,
      discrepancySummary: summarizeDiff(finalItems)
    },
    note: clean(note)
  });

  return normalizeCheckDoc(saved || doc);
}

function createMobileWarehouseReturnCheckService() {
  return {
    async listChecks({ query = {}, mobileUser = {} } = {}) {
      const tenantId = actorTenantId(mobileUser);
      const targetDate = dateOnly(query.date, dateUtil.todayVN());
      const deliveries = await aggregateReturns({ date: targetDate, deliveryStaffCode: clean(query.deliveryStaffCode || ''), tenantId });
      const checks = await existingChecksByDelivery(targetDate, tenantId);
      const statusFilter = clean(query.status || '').toLowerCase();
      const rows = (Array.isArray(deliveries) ? deliveries : [deliveries]).filter(Boolean).map((delivery) => {
        const check = checks.get(compact(delivery.deliveryStaffCode)) || {};
        const status = check.status || (delivery.productCount ? 'pending' : 'empty');
        return {
          date: targetDate,
          deliveryStaffCode: delivery.deliveryStaffCode,
          deliveryStaffName: delivery.deliveryStaffName,
          returnOrderCount: delivery.returnOrderCount || 0,
          productCount: delivery.productCount || 0,
          totalReportedLines: delivery.totalReportedLines || 0,
          status,
          checkedAt: check.checkedAt || '',
          checkedByName: check.checkedByName || '',
          discrepancyCount: toNumber(check.totalDiscrepancyItems || 0)
        };
      }).filter((row) => !statusFilter || row.status === statusFilter);
      return response({
        message: 'Đã tải danh sách NVGH cần kiểm hàng trả',
        data: { date: targetDate, rows, total: rows.length },
        rows,
        total: rows.length
      });
    },

    async detail({ query = {}, mobileUser = {} } = {}) {
      const tenantId = actorTenantId(mobileUser);
      const targetDate = dateOnly(query.date, dateUtil.todayVN());
      const deliveryStaffCode = clean(query.deliveryStaffCode);
      if (!deliveryStaffCode) throw error('Thiếu NVGH cần kiểm', 400, 'WAREHOUSE_RETURN_MISSING_DELIVERY');
      const detail = await buildDetail({ date: targetDate, deliveryStaffCode, tenantId });
      return response({
        message: 'Đã tải chi tiết kiểm hàng trả',
        data: detail,
        ...detail
      });
    },

    async save({ body = {}, mobileUser = {} } = {}) {
      const saved = await persistCheck({
        date: body.date,
        deliveryStaffCode: body.deliveryStaffCode,
        bodyItems: body.items,
        note: body.note,
        confirm: false,
        actor: mobileUser
      });
      return response({
        message: 'Đã lưu nháp kiểm hàng trả',
        data: { check: saved },
        check: saved
      });
    },

    async confirm({ body = {}, mobileUser = {} } = {}) {
      const telemetry = createCommandTelemetry('warehouse.returnConfirm');
      const saved = await persistCheck({
        date: body.date,
        deliveryStaffCode: body.deliveryStaffCode,
        bodyItems: body.items,
        note: body.note,
        confirm: true,
        actor: mobileUser
      });
      telemetry.mark('persistCheck', { status: saved.status });
      return response({
        message: saved.status === 'confirmed' ? 'Đã xác nhận hàng trả khớp kho' : 'Đã xác nhận hàng trả có lệch',
        data: { check: saved },
        check: saved,
        performance: telemetry.finish()
      });
    },

    async itemSources({ query = {}, mobileUser = {} } = {}) {
      const tenantId = actorTenantId(mobileUser);
      const targetDate = dateOnly(query.date, dateUtil.todayVN());
      const deliveryStaffCode = clean(query.deliveryStaffCode);
      const productCode = clean(query.productCode);
      if (!deliveryStaffCode) throw error('Thiếu NVGH cần xem nguồn', 400, 'WAREHOUSE_RETURN_MISSING_DELIVERY');
      if (!productCode) throw error('Thiếu sản phẩm cần xem nguồn', 400, 'WAREHOUSE_RETURN_MISSING_PRODUCT');
      const detail = await buildDetail({ date: targetDate, deliveryStaffCode, tenantId });
      const item = (detail.items || []).find((row) => compact(row.productCode) === compact(productCode));
      if (!item) throw error('Không tìm thấy sản phẩm trong hàng trả của NVGH/ngày này', 404, 'WAREHOUSE_RETURN_ITEM_NOT_FOUND');
      return response({
        message: 'Đã tải nguồn hàng trả theo sản phẩm',
        data: { product: item, sourceLines: item.sourceLines || [] },
        product: item,
        sourceLines: item.sourceLines || []
      });
    }
  };
}

async function hasBlockingWarehouseReturnCheckForReturnOrder(returnOrder = {}) {
  if (!returnOrder || !isActiveReturnOrder(returnOrder)) return false;
  const qty = (Array.isArray(returnOrder.items) ? returnOrder.items : []).reduce((sum, item) => sum + returnQtyOf(item), 0);
  if (qty <= 0) return false;
  const date = returnBusinessDate(returnOrder) || dateUtil.todayVN();
  const deliveryStaffCode = normalizeDeliveryCode(returnOrder);
  if (!date || !deliveryStaffCode) return true;
  const tenantId = actorTenantId(returnOrder);
  const check = await WarehouseReturnCheck.findOne(checkFilter(date, deliveryStaffCode, tenantId)).select('status totalDiscrepancyItems sourceReturnOrderIds').lean().catch(() => null);
  if (!check) return true;
  const currentReturnOrderId = returnOrderId(returnOrder);
  const checkedSources = (Array.isArray(check.sourceReturnOrderIds) ? check.sourceReturnOrderIds : []).map(compact).filter(Boolean);
  if (currentReturnOrderId && !checkedSources.includes(compact(currentReturnOrderId))) return true;
  if (clean(check.status).toLowerCase() !== 'confirmed') return true;
  if (toNumber(check.totalDiscrepancyItems || 0) > 0) return true;
  return false;
}

module.exports = {
  createMobileWarehouseReturnCheckService,
  hasBlockingWarehouseReturnCheckForReturnOrder,
  helpers: {
    aggregateReturns,
    buildDetail,
    returnBusinessDate,
    normalizeDeliveryCode,
    splitQty
  }
};
