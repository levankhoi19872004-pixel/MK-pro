'use strict';

const ReturnOrder = require('../../models/ReturnOrder');
const Product = require('../../models/Product');
const { toNumber } = require('../../utils/common.util');

const INACTIVE_RETURN_STATUSES = ['cancelled', 'canceled', 'void', 'voided', 'deleted', 'removed', 'rejected', 'duplicate_cancelled'];

function text(value = '') {
  return String(value ?? '').trim();
}

function money(value) {
  const n = Number(toNumber(value));
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function quantity(value) {
  const n = Number(toNumber(value));
  return Number.isFinite(n) ? n : 0;
}

function unique(values = []) {
  return Array.from(new Set((Array.isArray(values) ? values : [values]).map(text).filter(Boolean)));
}

function lower(value = '') {
  return text(value).toLowerCase();
}

function firstText(source = {}, keys = []) {
  for (const key of keys) {
    const value = source && source[key];
    if (value !== undefined && value !== null && text(value)) return text(value);
  }
  return '';
}

function firstMoney(source = {}, keys = []) {
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(source || {}, key)) continue;
    const value = source[key];
    if (value === undefined || value === null || value === '') continue;
    const parsed = money(value);
    if (parsed !== 0) return parsed;
  }
  return 0;
}

function firstQuantity(source = {}, keys = []) {
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(source || {}, key)) continue;
    const value = source[key];
    if (value === undefined || value === null || value === '') continue;
    const parsed = quantity(value);
    if (parsed !== 0) return parsed;
  }
  return 0;
}

function orderIdentityValues(order = {}) {
  return unique([
    order.id,
    order._id,
    order.code,
    order.orderCode,
    order.salesOrderCode,
    order.documentCode,
    order.invoiceCode,
    order.salesOrderId,
    order.orderId,
    order.sourceOrderId,
    order.sourceId,
    order.refId
  ]);
}

function orderDisplayCode(order = {}) {
  return text(order.code || order.orderCode || order.salesOrderCode || order.documentCode || order.invoiceCode || order.id || order._id);
}

function returnOrderIdentityFilter(order = {}) {
  const keys = orderIdentityValues(order);
  if (!keys.length) return null;
  return {
    deleted: { $ne: true },
    isDeleted: { $ne: true },
    $or: [
      { salesOrderId: { $in: keys } },
      { orderId: { $in: keys } },
      { sourceOrderId: { $in: keys } },
      { originalOrderId: { $in: keys } },
      { deliveryOrderId: { $in: keys } },
      { salesOrderCode: { $in: keys } },
      { orderCode: { $in: keys } },
      { sourceOrderCode: { $in: keys } },
      { originalOrderCode: { $in: keys } },
      { deliveryOrderCode: { $in: keys } }
    ]
  };
}

function isInactiveReturnOrder(row = {}) {
  const status = lower(row.status || row.returnStatus || row.returnState || row.warehouseStatus || row.accountingStatus);
  return INACTIVE_RETURN_STATUSES.includes(status)
    || row.deleted === true
    || row.isDeleted === true
    || Boolean(row.deletedAt)
    || Boolean(row.cancelledAt)
    || Boolean(row.canceledAt)
    || Boolean(row.voidedAt);
}

function returnOrderDate(row = {}) {
  return text(row.returnDate || row.returnedAt || row.date || row.documentDate || row.deliveryDate || row.createdAt || row.updatedAt || '');
}

function returnOrderItemRows(row = {}) {
  for (const key of ['items', 'lines', 'products', 'returnItems']) {
    if (Array.isArray(row[key])) return row[key];
  }
  return [];
}

function productCodeOf(item = {}) {
  return text(item.productCode || item.code || item.sku || item.productId || item.itemCode || '');
}

function productNameOf(item = {}, product = {}) {
  return text(item.productName || item.name || item.productTitle || product.name || product.productName || '');
}

function specificationOf(item = {}, product = {}) {
  const explicit = firstText(item, ['specification', 'quyCach', 'packing', 'caseSize', 'unitPerCase', 'conversionRate', 'packingRate'])
    || firstText(product, ['specification', 'quyCach', 'packing', 'caseSize', 'unitPerCase', 'conversionRate', 'packingRate']);
  if (explicit) return explicit;
  const units = Array.isArray(product.units) ? product.units : [];
  const defaultUnit = units.find((unit) => unit && (unit.isDefaultSale || unit.isBase));
  if (defaultUnit && defaultUnit.ratio) return text(defaultUnit.ratio);
  return '-';
}

function itemReturnQty(item = {}) {
  return firstQuantity(item, ['returnQty', 'qtyReturn', 'returnQuantity', 'returnedQty', 'actualReturnQty', 'quantity', 'qty']);
}

function itemUnitPrice(item = {}, product = {}) {
  return firstMoney(item, ['unitPrice', 'salePrice', 'price', 'finalPrice', 'catalogSalePrice'])
    || firstMoney(product, ['salePrice', 'price']);
}

function itemReturnAmount(item = {}, unitPrice = 0) {
  const explicit = firstMoney(item, ['returnAmount', 'amount', 'lineTotal', 'totalAmount', 'totalReturnAmount']);
  if (explicit > 0) return explicit;
  return Math.round(itemReturnQty(item) * money(unitPrice));
}

function returnOrderTotalAmount(row = {}) {
  const explicit = firstMoney(row, ['totalReturnAmount', 'returnAmount', 'totalAmount', 'amount', 'debtReduction']);
  if (explicit > 0) return explicit;
  return returnOrderItemRows(row).reduce((sum, item) => sum + itemReturnAmount(item, itemUnitPrice(item)), 0);
}

function productLookupKeys(product = {}) {
  return unique([product.code, product.productCode, product.sku, product.id, product._id]);
}

function indexProducts(products = []) {
  const map = new Map();
  for (const product of products || []) {
    for (const key of productLookupKeys(product)) {
      map.set(key, product);
      map.set(key.toUpperCase(), product);
      map.set(key.toLowerCase(), product);
    }
  }
  return map;
}

async function loadProductMapForCodes(codes = [], options = {}) {
  const keys = unique(codes);
  if (!keys.length) return new Map();
  const variants = unique(keys.flatMap((key) => [key, key.toUpperCase(), key.toLowerCase()]));
  let query = Product.find({
    $or: [
      { code: { $in: variants } },
      { productCode: { $in: variants } },
      { sku: { $in: variants } },
      { id: { $in: variants } }
    ]
  }).lean();
  if (options.session && typeof query.session === 'function') query = query.session(options.session);
  return indexProducts(await query);
}

function buildReturnRowsFromOrders(returnOrders = [], productByCode = new Map()) {
  const rows = [];
  for (const returnOrder of returnOrders || []) {
    for (const item of returnOrderItemRows(returnOrder)) {
      const productCode = productCodeOf(item);
      const product = productByCode.get(productCode)
        || productByCode.get(productCode.toUpperCase())
        || productByCode.get(productCode.toLowerCase())
        || {};
      const returnQty = itemReturnQty(item);
      const unitPrice = itemUnitPrice(item, product);
      const returnAmount = itemReturnAmount(item, unitPrice);
      if (returnQty <= 0 && returnAmount <= 0) continue;
      rows.push({
        productCode,
        productName: productNameOf(item, product),
        specification: specificationOf(item, product),
        returnQty,
        unitPrice,
        returnAmount,
        returnOrderId: text(returnOrder.id || returnOrder._id || ''),
        returnOrderCode: text(returnOrder.code || returnOrder.returnCode || ''),
        returnDate: returnOrderDate(returnOrder)
      });
    }
  }
  return rows;
}

function headerDate(returnOrders = [], rows = [], order = {}) {
  return text(rows.find((row) => row.returnDate)?.returnDate)
    || text(returnOrders.find((row) => returnOrderDate(row)) && returnOrderDate(returnOrders.find((row) => returnOrderDate(row))))
    || text(order.returnDate || order.deliveryDate || order.date || order.orderDate || order.createdAt || '');
}

async function loadReturnOrdersForSalesOrder(order = {}, options = {}) {
  const filter = returnOrderIdentityFilter(order);
  if (!filter) return [];
  let query = ReturnOrder.find(filter).sort({ returnDate: -1, date: -1, createdAt: -1 }).lean();
  if (options.session && typeof query.session === 'function') query = query.session(options.session);
  return (await query).filter((row) => !isInactiveReturnOrder(row));
}

async function buildMobileSalesOrderReturnsSummary(order = {}, options = {}) {
  const returnOrders = await loadReturnOrdersForSalesOrder(order, options);
  const itemCodes = returnOrders.flatMap((row) => returnOrderItemRows(row).map(productCodeOf));
  const productByCode = await loadProductMapForCodes(itemCodes, options);
  const rows = buildReturnRowsFromOrders(returnOrders, productByCode);
  const totalReturnAmount = rows.reduce((sum, row) => sum + money(row.returnAmount), 0)
    || returnOrders.reduce((sum, row) => sum + returnOrderTotalAmount(row), 0);
  const returnDate = headerDate(returnOrders, rows, order);

  return {
    orderId: text(order.id || order._id || ''),
    orderCode: orderDisplayCode(order),
    customerCode: text(order.customerCode || order.customerId || ''),
    customerName: text(order.customerName || ''),
    salesStaffCode: text(order.salesStaffCode || order.salesmanCode || order.nvbhCode || ''),
    salesStaffName: text(order.salesStaffName || order.salesmanName || order.nvbhName || ''),
    deliveryStaffCode: text(order.deliveryStaffCode || order.deliveryCode || order.nvghCode || ''),
    deliveryStaffName: text(order.deliveryStaffName || order.deliveryName || order.nvghName || ''),
    returnDate,
    totalReturnAmount: money(totalReturnAmount),
    hasReturns: rows.length > 0,
    rows
  };
}

module.exports = {
  buildMobileSalesOrderReturnsSummary,
  _internal: {
    money,
    quantity,
    unique,
    orderIdentityValues,
    returnOrderIdentityFilter,
    isInactiveReturnOrder,
    returnOrderItemRows,
    productCodeOf,
    productNameOf,
    specificationOf,
    itemReturnQty,
    itemUnitPrice,
    itemReturnAmount,
    returnOrderTotalAmount,
    buildReturnRowsFromOrders
  }
};
