'use strict';

const dateUtil = require('../utils/date.util');
const queryGuard = require('../utils/queryGuard.util');
const importOrderRepository = require('../repositories/importOrderRepository');
const productRepository = require('../repositories/productRepository');
const { makeId, normalizeText, toNumber } = require('../utils/common.util');
const { withMongoTransaction } = require('../utils/transaction.util');
const inventoryService = require('./inventoryService');


function buildImportCode(existingOrders = []) {
  const max = existingOrders.reduce((result, order) => {
    const match = String(order.code || '').match(/(\d+)$/);
    return Math.max(result, match ? Number(match[1]) : 0);
  }, 0);
  return `PN${String(max + 1).padStart(5, '0')}`;
}

function getImportOrderDate(order = {}) {
  return dateUtil.toDateOnly(
    order.date ||
    order.documentDate ||
    order.importDate ||
    order.createdAt ||
    ''
  );
}

function syncImportOrderDates(order = {}, fallbackDate = dateUtil.todayVN()) {
  const importDate = dateUtil.toDateOnly(
    order.date || order.documentDate || order.importDate || order.createdAt || fallbackDate
  ) || dateUtil.toDateOnly(fallbackDate) || dateUtil.todayVN();
  return {
    ...order,
    date: importDate,
    documentDate: importDate,
    importDate
  };
}

function toClient(order) {
  const normalized = syncImportOrderDates(order, order?.createdAt || dateUtil.todayVN());
  return {
    ...normalized,
    id: normalized.id || normalized.code,
    code: normalized.code || normalized.id,
    items: Array.isArray(normalized.items) ? normalized.items : [],
    totalQuantity: toNumber(normalized.totalQuantity),
    totalAmount: toNumber(normalized.totalAmount),
    displayDate: getImportOrderDate(normalized)
  };
}

function buildImportDateMongoOr(dateFrom, dateTo) {
  const dateRange = {};
  if (dateFrom) dateRange.$gte = dateFrom;
  if (dateTo) dateRange.$lte = dateTo;

  const createdAtRange = {};
  if (dateFrom) createdAtRange.$gte = `${dateFrom}T00:00:00.000Z`;
  if (dateTo) createdAtRange.$lte = `${dateTo}T23:59:59.999Z`;

  return [
    { date: dateRange },
    { documentDate: dateRange },
    { importDate: dateRange },
    { createdAt: createdAtRange }
  ];
}

function isImportOrderInDateRange(order, dateFrom, dateTo) {
  const importDate = getImportOrderDate(order);
  if (!importDate) return false;
  if (dateFrom && importDate < dateFrom) return false;
  if (dateTo && importDate > dateTo) return false;
  return true;
}

async function listImportOrders(query = {}) {
  const showAll = String(query.all || query.showAll || '').trim() === '1';
  const guardedQuery = queryGuard.normalizeQueryDateRange(query, { defaultToday: !showAll });
  const page = queryGuard.getPagination(guardedQuery);
  const q = normalizeText(guardedQuery.q || guardedQuery.keyword || guardedQuery.search);
  const dateFrom = dateUtil.toDateOnly(guardedQuery.dateFrom);
  const dateTo = dateUtil.toDateOnly(guardedQuery.dateTo);

  const filter = {};
  const hasDateRange = Boolean(!showAll && (dateFrom || dateTo));
  if (hasDateRange) {
    filter.$or = buildImportDateMongoOr(dateFrom, dateTo);
  }
  if (q) {
    const rx = queryGuard.buildRegex(guardedQuery.q || guardedQuery.keyword || guardedQuery.search);
    filter.$and = filter.$and || [];
    filter.$and.push({ $or: [{ code: rx }, { supplier: rx }, { supplierName: rx }, { note: rx }] });
  }

  const options = { sort: { createdAt: -1, code: -1 } };
  if (!hasDateRange) {
    options.skip = page.skip;
    options.limit = page.limit;
  }
  const orders = await importOrderRepository.findAll(filter, options);
  const safeFiltered = hasDateRange ? orders.filter((order) => isImportOrderInDateRange(order, dateFrom, dateTo)) : orders;
  return safeFiltered.slice(hasDateRange ? page.skip : 0, hasDateRange ? page.skip + page.limit : undefined).map(toClient);
}

async function hydrateItems(rawItems = []) {
  const products = await productRepository.findAll({});
  const productMap = new Map();
  const addProductKey = (key, product) => {
    const normalized = String(key || '').trim().toLowerCase();
    if (normalized && !productMap.has(normalized)) productMap.set(normalized, product);
  };
  products.forEach((product) => {
    [product.code, product.sku, product.id, product._id, product.productCode, product.barcode].forEach((key) => addProductKey(key, product));
  });
  return (Array.isArray(rawItems) ? rawItems : [])
    .map((raw) => {
      const productKey = String(raw.productCode || raw.code || raw.productId || raw.sku || raw.barcode || '').trim();
      const product = productMap.get(productKey.toLowerCase());
      const quantity = toNumber(raw.quantity ?? raw.qty ?? raw.totalQty);
      const costPrice = toNumber(product?.costPrice || 0);
      const productCode = String(raw.productCode || raw.code || product?.code || productKey).trim();
      return {
        ...raw,
        productId: raw.productId || product?.id || productCode,
        productCode,
        productName: raw.productName || raw.name || product?.name || '',
        unit: raw.unit || product?.unit || '',
        baseUnit: raw.baseUnit || product?.baseUnit || '',
        conversionRate: toNumber(raw.conversionRate || product?.conversionRate || 1) || 1,
        quantity,
        qty: quantity,
        costPrice,
        amount: quantity * costPrice,
        warehouseCode: String(raw.warehouseCode || raw.warehouse || product?.warehouseCode || product?.defaultWarehouse || 'KHO_HC').trim() || 'KHO_HC',
        warehouseName: String(raw.warehouseName || product?.warehouseName || ((String(raw.warehouseCode || product?.warehouseCode || product?.defaultWarehouse || 'KHO_HC').trim() === 'KHO_PC') ? 'KHO PC' : 'KHO HC')).trim()
      };
    })
    .filter((item) => item.quantity > 0 || item.productCode || item.productName);
}

async function createImportOrder(body = {}) {
  const items = await hydrateItems(body.items);
  if (!items.length) return { error: 'Phiếu nhập chưa có dòng hàng', status: 400 };
  const existingOrders = await importOrderRepository.findAll();
  const importDate = dateUtil.toDateOnly(body.date || body.documentDate || body.importDate || dateUtil.todayVN());
  const importOrder = {
    ...body,
    id: String(body.id || makeId('IM')).trim(),
    code: String(body.code || buildImportCode(existingOrders)).trim(),
    date: importDate,
    documentDate: importDate,
    importDate,
    supplier: String(body.supplier || body.supplierName || '').trim(),
    supplierName: String(body.supplierName || body.supplier || '').trim(),
    note: String(body.note || '').trim(),
    items,
    totalQuantity: toNumber(body.totalQuantity ?? items.reduce((sum, item) => sum + toNumber(item.quantity), 0)),
    totalAmount: toNumber(body.totalAmount ?? items.reduce((sum, item) => sum + toNumber(item.amount), 0)),
    status: 'draft',
    postedAt: '',
    postedBy: '',
    source: body.source || 'mongo_import_order_route',
    createdAt: body.createdAt || dateUtil.nowIso(),
    updatedAt: dateUtil.nowIso()
  };
  await importOrderRepository.upsert(importOrder);
  return { importOrder: toClient(importOrder) };
}

async function updateImportOrder(id, body = {}) {
  const current = await importOrderRepository.findByIdOrCode(id);
  if (!current) return { error: 'Không tìm thấy phiếu nhập', status: 404 };
  if (String(current.status || 'draft').toLowerCase() === 'posted') {
    return { error: 'Phiếu đã nhập kho, không được sửa trực tiếp để tránh lệch tồn kho', status: 409 };
  }
  const items = body.items ? await hydrateItems(body.items) : current.items || [];
  if (!items.length) return { error: 'Phiếu nhập chưa có dòng hàng', status: 400 };
  const importDate = dateUtil.toDateOnly(body.date || body.documentDate || body.importDate || current.date || current.documentDate || current.importDate || dateUtil.todayVN());
  const updated = {
    ...current,
    ...body,
    id: current.id || body.id,
    code: current.code || body.code,
    date: importDate,
    documentDate: importDate,
    importDate,
    supplier: String(body.supplier ?? body.supplierName ?? current.supplier ?? '').trim(),
    supplierName: String(body.supplierName ?? body.supplier ?? current.supplierName ?? '').trim(),
    note: String(body.note ?? current.note ?? '').trim(),
    items,
    totalQuantity: toNumber(body.totalQuantity ?? items.reduce((sum, item) => sum + toNumber(item.quantity), 0)),
    totalAmount: toNumber(body.totalAmount ?? items.reduce((sum, item) => sum + toNumber(item.amount), 0)),
    updatedAt: dateUtil.nowIso()
  };
  updated.status = 'draft';
  updated.postedAt = '';
  updated.postedBy = '';
  await importOrderRepository.upsert(updated);
  return { importOrder: toClient(updated) };
}

async function postImportOrder(id, actor = {}) {
  const current = await importOrderRepository.findByIdOrCode(id);
  if (!current) return { error: 'Không tìm thấy phiếu nhập', status: 404 };
  if (String(current.status || '').toLowerCase() === 'posted') {
    return { error: 'Phiếu này đã nhập kho, không được nhập lại lần 2', status: 409 };
  }
  const items = await hydrateItems(current.items || []);
  if (!items.length) return { error: 'Phiếu nhập chưa có dòng hàng', status: 400 };
  const normalizedCurrent = syncImportOrderDates(current, current.date || current.createdAt || dateUtil.todayVN());
  const posted = {
    ...normalizedCurrent,
    items,
    totalQuantity: items.reduce((sum, item) => sum + toNumber(item.quantity), 0),
    totalAmount: items.reduce((sum, item) => sum + toNumber(item.amount), 0),
    status: 'posted',
    postedAt: dateUtil.nowIso(),
    postedBy: String(actor.username || actor.name || actor.id || 'admin').trim(),
    updatedAt: dateUtil.nowIso()
  };
  await withMongoTransaction(async (session) => {
    await inventoryService.postStockMovement(posted, {
      type: 'IMPORT',
      direction: 'IN',
      refType: 'IMPORT_ORDER',
      refId: posted.id || posted.code,
      refCode: posted.code || posted.id,
      date: getImportOrderDate(posted),
      warehouseCode: posted.warehouseCode,
      warehouseName: posted.warehouseName,
      note: 'Nhập kho theo phiếu nhập'
    }, { session });
    await importOrderRepository.upsert(posted, { session });
  });
  return { importOrder: toClient(posted) };
}

async function cancelImportOrder(id, actor = {}) {
  const current = await importOrderRepository.findByIdOrCode(id);
  if (!current) return { error: 'Không tìm thấy phiếu nhập', status: 404 };
  const status = String(current.status || 'draft').toLowerCase();
  if (status === 'posted') {
    return { error: 'Phiếu đã nhập kho, không được huỷ để tránh lệch tồn kho', status: 409 };
  }
  if (status === 'cancelled' || status === 'canceled') {
    return { error: 'Phiếu nhập đã huỷ trước đó', status: 409 };
  }
  const cancelled = {
    ...current,
    status: 'cancelled',
    cancelledAt: dateUtil.nowIso(),
    cancelledBy: String(actor.username || actor.name || actor.id || 'admin').trim(),
    updatedAt: dateUtil.nowIso()
  };
  await importOrderRepository.upsert(cancelled);
  return { importOrder: toClient(cancelled) };
}

module.exports = { listImportOrders, createImportOrder, updateImportOrder, postImportOrder, cancelImportOrder, toClient, getImportOrderDate };
