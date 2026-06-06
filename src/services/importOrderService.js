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

function toClient(order) {
  return {
    ...order,
    id: order.id || order.code,
    code: order.code || order.id,
    items: Array.isArray(order.items) ? order.items : [],
    totalQuantity: toNumber(order.totalQuantity),
    totalAmount: toNumber(order.totalAmount)
  };
}

async function listImportOrders(query = {}) {
  const guardedQuery = queryGuard.normalizeQueryDateRange(query, { defaultToday: true });
  const page = queryGuard.getPagination(guardedQuery);
  const q = normalizeText(guardedQuery.q || guardedQuery.keyword || guardedQuery.search);
  const dateFrom = dateUtil.toDateOnly(guardedQuery.dateFrom);
  const dateTo = dateUtil.toDateOnly(guardedQuery.dateTo);

  const filter = {};
  if (dateFrom || dateTo) {
    const range = {};
    if (dateFrom) range.$gte = dateFrom;
    if (dateTo) range.$lte = dateTo;
    filter.$or = [{ date: range }, { documentDate: range }];
  }
  if (q) {
    const rx = queryGuard.buildRegex(guardedQuery.q || guardedQuery.keyword || guardedQuery.search);
    filter.$and = filter.$and || [];
    filter.$and.push({ $or: [{ code: rx }, { supplier: rx }, { supplierName: rx }, { note: rx }] });
  }

  const orders = await importOrderRepository.findAll(filter, { sort: { createdAt: -1, code: -1 }, skip: page.skip, limit: page.limit });
  return orders.map(toClient);
}

async function hydrateItems(rawItems = []) {
  const products = await productRepository.findAll({});
  const byCode = new Map(products.map((p) => [String(p.code || p.sku || p.id || '').trim(), p]));
  return (Array.isArray(rawItems) ? rawItems : [])
    .map((raw) => {
      const productKey = String(raw.productCode || raw.code || raw.productId || raw.sku || '').trim();
      const product = byCode.get(productKey);
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
  const importOrder = {
    ...body,
    id: String(body.id || makeId('IM')).trim(),
    code: String(body.code || buildImportCode(existingOrders)).trim(),
    date: dateUtil.toDateOnly(body.date || dateUtil.todayVN()),
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
  const updated = {
    ...current,
    ...body,
    id: current.id || body.id,
    code: current.code || body.code,
    date: dateUtil.toDateOnly(body.date || current.date || dateUtil.todayVN()),
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
  const posted = {
    ...current,
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
      date: posted.date,
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

module.exports = { listImportOrders, createImportOrder, updateImportOrder, postImportOrder, cancelImportOrder, toClient };
