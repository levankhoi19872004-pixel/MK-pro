'use strict';

const Product = require('../models/Product');
const Inventory = require('../models/Inventory');
const SalesOrder = require('../models/SalesOrder');
const Receipt = require('../models/Receipt');
const ReturnOrder = require('../models/ReturnOrder');
const { normalizeText, toNumber } = require('../utils/common.util');

function today() {
  return new Date().toISOString().slice(0, 10);
}

function daysBetween(from, to) {
  const a = new Date(String(from || '').slice(0, 10));
  const b = new Date(String(to || '').slice(0, 10));
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
  return Math.floor((a.getTime() - b.getTime()) / 86400000);
}

function isActive(row = {}) {
  return !['void', 'cancelled', 'canceled', 'deleted'].includes(String(row.status || '').toLowerCase());
}

async function stockReport(query = {}) {
  const q = normalizeText(query.q);
  const [stockRows, products] = await Promise.all([
    Inventory.find({}).sort({ productCode: 1, warehouseCode: 1 }).lean(),
    Product.find({}).lean()
  ]);
  const productMap = new Map(products.map((p) => [String(p.code || p.id || p._id), p]));
  let stock = stockRows.map((row) => {
    const product = productMap.get(String(row.productCode || row.productId || '')) || {};
    const quantity = toNumber(row.quantity ?? row.qty ?? row.availableQty);
    return {
      id: row.id || String(row._id || ''),
      productId: row.productId || product.id || String(product._id || ''),
      productCode: row.productCode || product.code || '',
      productName: row.productName || product.name || '',
      warehouseId: row.warehouseId || '',
      warehouseCode: row.warehouseCode || row.warehouse || 'MAIN',
      warehouseName: row.warehouseName || row.warehouse || 'Kho chính',
      unit: row.unit || product.unit || '',
      quantity,
      qty: quantity,
      availableQty: toNumber(row.availableQty || quantity),
      minStock: toNumber(product.minStock),
      maxStock: toNumber(product.maxStock),
      updatedAt: row.updatedAt || row.createdAt || ''
    };
  });
  if (q) {
    stock = stock.filter((row) => [row.productCode, row.productName, row.warehouseCode, row.warehouseName].some((value) => normalizeText(value).includes(q)));
  }
  const summary = stock.reduce((acc, row) => {
    acc.totalRows += 1;
    acc.totalQuantity += toNumber(row.quantity);
    if (toNumber(row.quantity) <= 0) acc.outOfStock += 1;
    if (toNumber(row.minStock) > 0 && toNumber(row.quantity) <= toNumber(row.minStock)) acc.lowStock += 1;
    return acc;
  }, { totalRows: 0, totalQuantity: 0, outOfStock: 0, lowStock: 0 });
  return { stock, summary };
}

function matchDate(row, query = {}) {
  const value = String(row.date || row.documentDate || row.createdAt || '').slice(0, 10);
  if (query.dateFrom && value < query.dateFrom) return false;
  if (query.dateTo && value > query.dateTo) return false;
  return true;
}

async function debtReport(query = {}) {
  const [orders, receipts, returns] = await Promise.all([
    SalesOrder.find({}).sort({ date: -1, createdAt: -1 }).lean(),
    Receipt.find({}).lean(),
    ReturnOrder.find({}).lean()
  ]);

  const receiptByOrder = new Map();
  const receiptByCustomer = new Map();
  receipts.filter(isActive).forEach((receipt) => {
    const amount = toNumber(receipt.amount || receipt.totalAmount);
    const orderKey = String(receipt.salesOrderId || receipt.orderId || receipt.refId || '');
    const customerKey = String(receipt.customerId || receipt.customerCode || '');
    if (orderKey) receiptByOrder.set(orderKey, (receiptByOrder.get(orderKey) || 0) + amount);
    if (customerKey) receiptByCustomer.set(customerKey, (receiptByCustomer.get(customerKey) || 0) + amount);
  });

  const returnByOrder = new Map();
  returns.filter(isActive).forEach((row) => {
    const amount = toNumber(row.totalAmount || row.amount || row.returnAmount);
    const key = String(row.salesOrderId || row.orderId || row.refId || '');
    if (key) returnByOrder.set(key, (returnByOrder.get(key) || 0) + amount);
  });

  const now = today();
  let debts = orders.filter(isActive).filter((order) => matchDate(order, query)).map((order) => {
    const orderId = String(order.id || order._id || '');
    const debit = toNumber(order.totalAmount);
    const paidOnOrder = toNumber(order.paidAmount);
    const receiptAmount = receiptByOrder.get(orderId) || receiptByOrder.get(String(order.code || '')) || 0;
    const returnAmount = returnByOrder.get(orderId) || returnByOrder.get(String(order.code || '')) || 0;
    const credit = paidOnOrder + receiptAmount + returnAmount;
    const debt = Math.max(0, debit - credit);
    const documentDate = String(order.date || order.createdAt || '').slice(0, 10);
    const dueDate = String(order.dueDate || order.paymentDueDate || documentDate).slice(0, 10);
    const overdueDays = debt > 0 ? Math.max(0, daysBetween(now, dueDate)) : 0;
    return {
      orderId,
      orderCode: order.code || '',
      documentDate,
      dueDate,
      customerId: order.customerId || '',
      customerCode: order.customerCode || '',
      customerName: order.customerName || '',
      phone: order.phone || order.customerPhone || '',
      address: order.address || order.customerAddress || '',
      salesmanCode: order.salesmanCode || order.staffCode || '',
      salesmanName: order.salesmanName || order.staffName || '',
      deliveryStaffCode: order.deliveryStaffCode || '',
      deliveryStaffName: order.deliveryStaffName || '',
      debit,
      paidOnOrder,
      receiptAmount,
      returnAmount,
      credit,
      debt,
      overdueDays,
      agingDays: documentDate ? Math.max(0, daysBetween(now, documentDate)) : 0,
      status: debt <= 0 ? 'paid' : (overdueDays > 0 ? 'overdue' : 'open')
    };
  });

  const q = normalizeText(query.q);
  if (q) debts = debts.filter((row) => [row.orderCode, row.customerCode, row.customerName, row.salesmanName, row.deliveryStaffName].some((value) => normalizeText(value).includes(q)));
  if (query.salesman) debts = debts.filter((row) => normalizeText(row.salesmanName || row.salesmanCode).includes(normalizeText(query.salesman)));
  if (query.delivery) debts = debts.filter((row) => normalizeText(row.deliveryStaffName || row.deliveryStaffCode).includes(normalizeText(query.delivery)));
  if (query.status) debts = debts.filter((row) => row.status === query.status);

  const customerMap = new Map();
  debts.forEach((row) => {
    const key = row.customerId || row.customerCode || row.customerName;
    if (!customerMap.has(key)) customerMap.set(key, { customerId: row.customerId, customerCode: row.customerCode, customerName: row.customerName, phone: row.phone, address: row.address, debit: 0, credit: 0, debt: 0, orderCount: 0, overdueCount: 0 });
    const target = customerMap.get(key);
    target.debit += row.debit;
    target.credit += row.credit;
    target.debt += row.debt;
    target.orderCount += 1;
    if (row.status === 'overdue') target.overdueCount += 1;
  });
  const customerSummary = Array.from(customerMap.values()).filter((row) => row.debit || row.credit || row.debt);
  const summary = {
    orderCount: debts.length,
    customerCount: customerSummary.length,
    overdueCount: debts.filter((row) => row.status === 'overdue').length,
    totalDebit: debts.reduce((sum, row) => sum + row.debit, 0),
    totalCredit: debts.reduce((sum, row) => sum + row.credit, 0),
    totalDebt: debts.reduce((sum, row) => sum + row.debt, 0)
  };
  return { debts, customerSummary, summary };
}

module.exports = { stockReport, debtReport };
