'use strict';

const { toNumber } = require('../utils/common.util');

const orderRepository = require('./orderRepository');
const masterOrderRepository = require('./masterOrderRepository');
const importOrderRepository = require('./importOrderRepository');
const receiptRepository = require('./receiptRepository');
const cashbookRepository = require('./cashbookRepository');
const bankbookRepository = require('./bankbookRepository');
const Product = require('../models/Product');

const PRINT_TYPE_ALIASES = {
  ORDER: 'ORDER_SINGLE',
  SALES_ORDER: 'ORDER_SINGLE',
  SALES: 'ORDER_SINGLE',
  ORDER_SINGLE: 'ORDER_SINGLE',
  DMS_DELIVERY_INVOICE: 'DMS_DELIVERY_INVOICE',
  DMS_INVOICE: 'DMS_DELIVERY_INVOICE',

  MASTER_ORDER: 'ORDER_TOTAL',
  TOTAL_ORDER: 'ORDER_TOTAL',
  ORDER_TOTAL: 'ORDER_TOTAL',

  IMPORT: 'IMPORT_ORDER',
  IMPORT_ORDER: 'IMPORT_ORDER',

  RECEIPT: 'PAYMENT_RECEIPT',
  PAYMENT: 'PAYMENT_RECEIPT',
  CASH_RECEIPT: 'PAYMENT_RECEIPT',
  PAYMENT_RECEIPT: 'PAYMENT_RECEIPT'
};


function cleanText(value) {
  return String(value ?? '').trim();
}


function normalizeWarehouseCode(value) {
  const raw = cleanText(value).toUpperCase().replace(/[\s-]+/g, '_');
  if (raw === 'KHO_PC' || raw === 'PC') return 'KHO_PC';
  if (raw === 'KHO_HC' || raw === 'HC') return 'KHO_HC';
  return 'KHO_HC';
}

function warehouseNameFromCode(code) {
  return normalizeWarehouseCode(code) === 'KHO_PC' ? 'KHO PC' : 'KHO HC';
}

function orderKeys(order = {}) {
  return [order.id, order.code, order.orderNo, order.orderCode, order._id]
    .map((value) => cleanText(value))
    .filter(Boolean);
}

async function loadMasterChildren(masterOrder = {}) {
  const ids = new Set((Array.isArray(masterOrder.childOrderIds) ? masterOrder.childOrderIds : [])
    .map((item) => cleanText(item?.id || item?.code || item?._id || item))
    .filter(Boolean));
  if (!ids.size) return [];
  const rows = await orderRepository.findAll();
  return rows.filter((order) => orderKeys(order).some((key) => ids.has(key)));
}

function getItemProductCode(item = {}) {
  return cleanText(item.productCode || item.code || item.sku || item.maHang || item.productId);
}

function getItemQty(item = {}) {
  return toNumber(item.quantity ?? item.qty ?? item.totalQuantity ?? item.soLuong);
}

function getItemPack(item = {}, product = {}) {
  return toNumber(item.packingQty ?? item.conversionRate ?? item.unitsPerCase ?? item.qtyPerCase ?? item.packSize ?? product.conversionRate ?? 1) || 1;
}

async function enrichMasterOrderForPrint(masterOrder = {}) {
  const children = await loadMasterChildren(masterOrder);
  const productCodes = Array.from(new Set(children.flatMap((child) => (Array.isArray(child.items) ? child.items : [])
    .map(getItemProductCode)
    .filter(Boolean))));
  const products = productCodes.length ? await Product.find({ code: { $in: productCodes } }).lean() : [];
  const productMap = new Map(products.map((product) => [cleanText(product.code || product.productCode || product.sku), product]));
  const grouped = new Map();

  for (const child of children) {
    for (const item of (Array.isArray(child.items) ? child.items : [])) {
      const code = getItemProductCode(item);
      if (!code) continue;
      const product = productMap.get(code) || {};
      const warehouseCode = normalizeWarehouseCode(product.warehouseCode || item.warehouseCode || item.warehouse || 'KHO_HC');
      const warehouseName = cleanText(product.warehouseName || item.warehouseName) || warehouseNameFromCode(warehouseCode);
      const qty = getItemQty(item);
      const salePrice = toNumber(product.salePrice ?? item.salePrice ?? item.price ?? item.unitPrice);
      const key = `${warehouseCode}|${code}`;
      const old = grouped.get(key) || {
        code,
        productCode: code,
        name: cleanText(product.name || item.productName || item.name || item.tenHang),
        productName: cleanText(product.name || item.productName || item.name || item.tenHang),
        unit: cleanText(product.unit || item.unit || item.dvt || 'Cái'),
        conversionRate: getItemPack(item, product),
        packingQty: getItemPack(item, product),
        warehouseCode,
        warehouseName,
        salePrice,
        price: salePrice,
        quantity: 0,
        qty: 0,
        amount: 0,
        sourceOrderCodes: []
      };
      old.quantity += qty;
      old.qty += qty;
      old.salePrice = salePrice;
      old.price = salePrice;
      old.amount = old.quantity * salePrice;
      const childCode = cleanText(child.code || child.orderCode || child.id);
      if (childCode && !old.sourceOrderCodes.includes(childCode)) old.sourceOrderCodes.push(childCode);
      grouped.set(key, old);
    }
  }

  const items = Array.from(grouped.values()).sort((a, b) => {
    const wh = String(a.warehouseCode).localeCompare(String(b.warehouseCode), 'vi');
    if (wh) return wh;
    return String(a.code).localeCompare(String(b.code), 'vi', { numeric: true });
  });

  const totalQuantity = items.reduce((sum, item) => sum + toNumber(item.quantity), 0);
  const totalAmount = items.reduce((sum, item) => sum + toNumber(item.amount), 0);

  return {
    ...masterOrder,
    children,
    orderCount: children.length,
    totalOrders: children.length,
    totalQuantity,
    totalQty: totalQuantity,
    totalAmount,
    goodsAmount: totalAmount,
    items,
    printMode: 'MASTER_PICKING_BY_WAREHOUSE',
    pricingSource: 'products.salePrice'
  };
}

function normalizePrintType(type) {
  const key = String(type || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
  return PRINT_TYPE_ALIASES[key] || key;
}

async function findPaymentReceiptByIdOrCode(idOrCode) {
  return (await receiptRepository.findByIdOrCode(idOrCode))
    || (await cashbookRepository.findByIdOrCode(idOrCode))
    || (await bankbookRepository.findByIdOrCode(idOrCode));
}

async function findDocumentByPrintType(type, idOrCode) {
  const printType = normalizePrintType(type);
  if (!idOrCode) return { printType, document: null };

  let document = null;
  if (printType === 'ORDER_SINGLE' || printType === 'DMS_DELIVERY_INVOICE') document = await orderRepository.findByIdOrCode(idOrCode);
  if (printType === 'ORDER_TOTAL') {
    document = await masterOrderRepository.findByIdOrCode(idOrCode);
    if (document) document = await enrichMasterOrderForPrint(document);
  }
  if (printType === 'IMPORT_ORDER') document = await importOrderRepository.findByIdOrCode(idOrCode);
  if (printType === 'PAYMENT_RECEIPT') document = await findPaymentReceiptByIdOrCode(idOrCode);

  return { printType, document };
}

module.exports = {
  normalizePrintType,
  findDocumentByPrintType
};
