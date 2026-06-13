'use strict';

const Product = require('../../models/Product');
const orderRepository = require('../../repositories/orderRepository');
const masterOrderRepository = require('../../repositories/masterOrderRepository');
const importOrderRepository = require('../../repositories/importOrderRepository');
const masterReturnOrderRepository = require('../../repositories/masterReturnOrderRepository');
const returnOrderRepository = require('../../repositories/returnOrderRepository');
const receiptRepository = require('../../repositories/receiptRepository');
const cashbookRepository = require('../../repositories/cashbookRepository');
const bankbookRepository = require('../../repositories/bankbookRepository');

const { cleanText, isActiveDocument, uniqueText } = require('./PrintContract');
const { buildSalesInvoice } = require('./builders/SalesInvoiceBuilder');
const { buildMasterPicking } = require('./builders/MasterPickingBuilder');
const { buildImportPicking } = require('./builders/ImportPickingBuilder');
const { buildReturnPicking } = require('./builders/ReturnPickingBuilder');
const LegacyPromotionFallbackService = require('./LegacyPromotionFallbackService');

function normalizeIds(values) {
  return uniqueText(Array.isArray(values) ? values : String(values || '').split(','));
}

function itemProductCodes(documents = []) {
  return uniqueText((Array.isArray(documents) ? documents : []).flatMap((document) => {
    return (Array.isArray(document?.items) ? document.items : []).map((item) => (
      item.productCode || item.code || item.sku || item.productId || item.productSnapshot?.code
    ));
  }));
}

async function loadProductMap(documents = []) {
  const codes = itemProductCodes(documents);
  if (!codes.length) return new Map();
  const rows = await Product.find({
    $or: [
      { code: { $in: codes } },
      { productCode: { $in: codes } },
      { sku: { $in: codes } }
    ]
  }).lean();
  return new Map(rows.flatMap((product) => {
    const keys = uniqueText([product.code, product.productCode, product.sku]);
    return keys.map((key) => [key, product]);
  }));
}

function documentKeys(document = {}) {
  return uniqueText([
    document.id,
    document.code,
    document.orderCode,
    document.salesOrderCode,
    document.documentCode,
    document.invoiceCode,
    document._id
  ]);
}

function assertFound(requestedIds, documents, label) {
  const found = new Set((documents || []).flatMap(documentKeys));
  const missing = requestedIds.filter((id) => !found.has(id));
  if (missing.length) {
    const error = new Error(`Không tìm thấy ${label}: ${missing.join(', ')}`);
    error.status = 404;
    throw error;
  }
}

async function readSalesOrders(ids = []) {
  const requestedIds = normalizeIds(ids);
  if (!requestedIds.length) throw Object.assign(new Error('Chưa chọn đơn bán để in'), { status: 400 });
  const rows = (await orderRepository.findManyByIdentity(requestedIds, { limit: Math.max(requestedIds.length, 1) }))
    .filter(isActiveDocument);
  assertFound(requestedIds, rows, 'đơn bán');
  const productMap = await loadProductMap(rows);
  const enrichedRows = await LegacyPromotionFallbackService.enrichSalesOrders(rows, productMap);
  return enrichedRows.map((row) => buildSalesInvoice(row, { productMap }));
}

function masterChildIds(master = {}) {
  return uniqueText((Array.isArray(master.childOrderIds) ? master.childOrderIds : []).map((value) => (
    value?.id || value?.code || value?._id || value
  )));
}

async function findMasterOrdersByIds(ids = []) {
  const requestedIds = normalizeIds(ids);
  if (!requestedIds.length) throw Object.assign(new Error('Chưa chọn đơn tổng để in'), { status: 400 });
  const rows = (await masterOrderRepository.findAll({
    $or: [
      { id: { $in: requestedIds } },
      { code: { $in: requestedIds } }
    ]
  }, { limit: Math.max(requestedIds.length, 1) })).filter(isActiveDocument);
  assertFound(requestedIds, rows, 'đơn tổng');
  return rows;
}

async function readMasterOrders(ids = [], options = {}) {
  const masters = await findMasterOrdersByIds(ids);
  const childIds = uniqueText(masters.flatMap(masterChildIds));
  const children = childIds.length
    ? (await orderRepository.findManyByIdentity(childIds, { limit: Math.max(childIds.length, 1) })).filter(isActiveDocument)
    : [];
  const productMap = await loadProductMap(children);
  const childMasterMap = new Map();
  for (const master of masters) {
    const masterCode = cleanText(master.code || master.id);
    for (const childId of masterChildIds(master)) childMasterMap.set(childId, masterCode);
  }
  for (const child of children) {
    const matchingKey = documentKeys(child).find((key) => childMasterMap.has(key));
    if (matchingKey) childMasterMap.set(cleanText(child.id || child.code), childMasterMap.get(matchingKey));
  }
  return buildMasterPicking(masters, children, {
    productMap,
    childMasterMap,
    date: options.date
  });
}

async function readImportOrders(ids = [], options = {}) {
  const requestedIds = normalizeIds(ids);
  if (!requestedIds.length) throw Object.assign(new Error('Chưa chọn phiếu nhập để in'), { status: 400 });
  const rows = (await importOrderRepository.findAll({
    $or: [
      { id: { $in: requestedIds } },
      { code: { $in: requestedIds } }
    ]
  }, { limit: Math.max(requestedIds.length, 1) })).filter(isActiveDocument);
  assertFound(requestedIds, rows, 'phiếu nhập');
  const productMap = await loadProductMap(rows);
  return buildImportPicking(rows, { productMap, date: options.date });
}

function returnChildIds(master = {}) {
  return uniqueText((Array.isArray(master.returnOrderIds) ? master.returnOrderIds : []).map((value) => (
    value?.id || value?.code || value?._id || value
  )));
}

async function readMasterReturnOrders(ids = []) {
  const requestedIds = normalizeIds(ids);
  if (!requestedIds.length) throw Object.assign(new Error('Chưa chọn đơn tổng trả để in'), { status: 400 });

  const masters = (await masterReturnOrderRepository.findAll({
    $or: [
      { id: { $in: requestedIds } },
      { code: { $in: requestedIds } }
    ]
  }, { limit: Math.max(requestedIds.length, 1), sort: { createdAt: 1 } })).filter(isActiveDocument);

  assertFound(requestedIds, masters, 'đơn tổng trả hàng');

  const childIds = uniqueText(masters.flatMap(returnChildIds));
  const children = childIds.length ? (await returnOrderRepository.findAll({
    $or: [
      { id: { $in: childIds } },
      { code: { $in: childIds } }
    ]
  }, { limit: Math.max(childIds.length, 1), sort: { createdAt: 1 } })).filter(isActiveDocument) : [];

  const productMap = await loadProductMap(children);
  const childMap = new Map();
  for (const child of children) {
    for (const key of documentKeys(child)) childMap.set(key, child);
  }

  const masterMap = new Map();
  for (const master of masters) {
    for (const key of documentKeys(master)) masterMap.set(key, master);
  }

  return requestedIds.map((requestedId) => {
    const master = masterMap.get(requestedId);
    const masterChildren = returnChildIds(master).map((childId) => childMap.get(childId)).filter(Boolean);
    return buildReturnPicking(master, masterChildren, { productMap });
  });
}

async function readMasterReturnOrder(id) {
  const [document] = await readMasterReturnOrders([id]);
  return document;
}

async function readPaymentReceipt(id) {
  return (await receiptRepository.findByIdOrCode(id))
    || (await cashbookRepository.findByIdOrCode(id))
    || (await bankbookRepository.findByIdOrCode(id));
}

module.exports = {
  normalizeIds,
  loadProductMap,
  readSalesOrders,
  readMasterOrders,
  readImportOrders,
  readMasterReturnOrder,
  readMasterReturnOrders,
  readPaymentReceipt
};
