'use strict';

const importOrderRepository = require('../repositories/importOrderRepository');
const productRepository = require('../repositories/productRepository');
const { makeId, normalizeText, toNumber } = require('../utils/common.util');
const { withMongoTransaction } = require('../utils/transaction.util');

function today() { return new Date().toISOString().slice(0, 10); }
function nowIso() { return new Date().toISOString(); }

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
  const q = normalizeText(query.q);
  const orders = await importOrderRepository.findAll({}, { sort: { createdAt: -1, code: -1 } });
  return orders
    .map(toClient)
    .filter((order) => !q || [order.code, order.supplier, order.supplierName, order.note].some((value) => normalizeText(value).includes(q)));
}

async function hydrateItems(rawItems = []) {
  const products = await productRepository.findAll({});
  const byCode = new Map(products.map((p) => [String(p.code || p.sku || p.id || '').trim(), p]));
  return (Array.isArray(rawItems) ? rawItems : [])
    .map((raw) => {
      const productKey = String(raw.productCode || raw.code || raw.productId || raw.sku || '').trim();
      const product = byCode.get(productKey);
      const quantity = toNumber(raw.quantity ?? raw.qty ?? raw.totalQty);
      const costPrice = toNumber(raw.costPrice ?? raw.price ?? raw.unitPrice ?? product?.costPrice ?? 0);
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
        amount: toNumber(raw.amount ?? quantity * costPrice)
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
    date: String(body.date || today()).slice(0, 10),
    supplier: String(body.supplier || body.supplierName || '').trim(),
    supplierName: String(body.supplierName || body.supplier || '').trim(),
    note: String(body.note || '').trim(),
    items,
    totalQuantity: toNumber(body.totalQuantity ?? items.reduce((sum, item) => sum + toNumber(item.quantity), 0)),
    totalAmount: toNumber(body.totalAmount ?? items.reduce((sum, item) => sum + toNumber(item.amount), 0)),
    status: body.status || 'posted',
    source: body.source || 'mongo_import_order_route',
    createdAt: body.createdAt || nowIso(),
    updatedAt: nowIso()
  };
  await withMongoTransaction(async (session) => {
    await importOrderRepository.upsert(importOrder, { session });
  });
  return { importOrder: toClient(importOrder) };
}

async function updateImportOrder(id, body = {}) {
  const current = await importOrderRepository.findByIdOrCode(id);
  if (!current) return { error: 'Không tìm thấy phiếu nhập', status: 404 };
  const items = body.items ? await hydrateItems(body.items) : current.items || [];
  if (!items.length) return { error: 'Phiếu nhập chưa có dòng hàng', status: 400 };
  const updated = {
    ...current,
    ...body,
    id: current.id || body.id,
    code: current.code || body.code,
    date: String(body.date || current.date || today()).slice(0, 10),
    supplier: String(body.supplier ?? body.supplierName ?? current.supplier ?? '').trim(),
    supplierName: String(body.supplierName ?? body.supplier ?? current.supplierName ?? '').trim(),
    note: String(body.note ?? current.note ?? '').trim(),
    items,
    totalQuantity: toNumber(body.totalQuantity ?? items.reduce((sum, item) => sum + toNumber(item.quantity), 0)),
    totalAmount: toNumber(body.totalAmount ?? items.reduce((sum, item) => sum + toNumber(item.amount), 0)),
    updatedAt: nowIso()
  };
  await withMongoTransaction(async (session) => {
    await importOrderRepository.upsert(updated, { session });
  });
  return { importOrder: toClient(updated) };
}

module.exports = { listImportOrders, createImportOrder, updateImportOrder, toClient };
