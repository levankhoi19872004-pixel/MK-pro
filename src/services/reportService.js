'use strict';

const Product = require('../models/Product');
const Inventory = require('../models/Inventory');
const SalesOrder = require('../models/SalesOrder');
const MasterOrder = require('../models/MasterOrder');
const Receipt = require('../models/Receipt');
const Payment = require('../models/Payment');
const Cashbook = require('../models/Cashbook');
const Bankbook = require('../models/Bankbook');
const ReturnOrder = require('../models/ReturnOrder');
const ImportOrder = require('../models/ImportOrder');
const { normalizeText, toNumber } = require('../utils/common.util');

function today() {
  return new Date().toISOString().slice(0, 10);
}

function toDateOnly(value) {
  return String(value || '').slice(0, 10);
}

function daysBetween(from, to) {
  const a = new Date(toDateOnly(from));
  const b = new Date(toDateOnly(to));
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
  return Math.floor((a.getTime() - b.getTime()) / 86400000);
}

function isActive(row = {}) {
  return !['void', 'cancelled', 'canceled', 'deleted'].includes(String(row.status || '').toLowerCase());
}

function matchDate(row, query = {}) {
  const value = toDateOnly(row.date || row.documentDate || row.orderDate || row.deliveryDate || row.createdAt);
  if (query.dateFrom && value < query.dateFrom) return false;
  if (query.dateTo && value > query.dateTo) return false;
  if (query.date && value !== query.date) return false;
  return true;
}

function totalOf(row = {}) {
  return toNumber(row.totalAmount ?? row.amount ?? row.grandTotal ?? row.total ?? row.value);
}

function sum(rows = [], picker = totalOf) {
  return rows.reduce((total, row) => total + toNumber(picker(row)), 0);
}

function filterByQuery(rows = [], query = {}, fields = []) {
  const q = normalizeText(query.q || query.keyword || query.search);
  if (!q) return rows;
  return rows.filter((row) => fields.some((field) => normalizeText(row[field]).includes(q)));
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
    stock = stock.filter((row) => [row.productCode, row.productName, row.warehouseCode, row.warehouseName]
      .some((value) => normalizeText(value).includes(q)));
  }

  const summary = stock.reduce((acc, row) => {
    acc.totalRows += 1;
    acc.totalQuantity += toNumber(row.quantity);
    if (toNumber(row.quantity) <= 0) acc.outOfStock += 1;
    if (toNumber(row.minStock) > 0 && toNumber(row.quantity) <= toNumber(row.minStock)) acc.lowStock += 1;
    return acc;
  }, { totalRows: 0, totalQuantity: 0, outOfStock: 0, lowStock: 0 });

  return { source: 'mongo', stock, summary };
}

async function debtReport(query = {}) {
  const [orders, receipts, payments, returns] = await Promise.all([
    SalesOrder.find({}).sort({ date: -1, createdAt: -1 }).lean(),
    Receipt.find({}).lean(),
    Payment.find({}).lean().catch(() => []),
    ReturnOrder.find({}).lean()
  ]);

  const moneyDocs = [...receipts, ...payments];
  const receiptByOrder = new Map();
  const receiptByCustomer = new Map();

  moneyDocs.filter(isActive).forEach((receipt) => {
    const amount = totalOf(receipt);
    const orderKey = String(receipt.salesOrderId || receipt.orderId || receipt.refId || receipt.orderCode || '');
    const customerKey = String(receipt.customerId || receipt.customerCode || '');
    if (orderKey) receiptByOrder.set(orderKey, (receiptByOrder.get(orderKey) || 0) + amount);
    if (customerKey) receiptByCustomer.set(customerKey, (receiptByCustomer.get(customerKey) || 0) + amount);
  });

  const returnByOrder = new Map();
  returns.filter(isActive).forEach((row) => {
    const amount = totalOf(row) || toNumber(row.returnAmount);
    const key = String(row.salesOrderId || row.orderId || row.refId || row.orderCode || '');
    if (key) returnByOrder.set(key, (returnByOrder.get(key) || 0) + amount);
  });

  const now = today();
  let debts = orders.filter(isActive).filter((order) => matchDate(order, query)).map((order) => {
    const orderId = String(order.id || order._id || '');
    const orderCode = String(order.code || order.orderCode || '');
    const debit = totalOf(order);
    const paidOnOrder = toNumber(order.paidAmount || order.paymentAmount);
    const receiptAmount = receiptByOrder.get(orderId) || receiptByOrder.get(orderCode) || 0;
    const returnAmount = returnByOrder.get(orderId) || returnByOrder.get(orderCode) || 0;
    const credit = paidOnOrder + receiptAmount + returnAmount;
    const debt = Math.max(0, debit - credit);
    const documentDate = toDateOnly(order.date || order.orderDate || order.createdAt);
    const dueDate = toDateOnly(order.dueDate || order.paymentDueDate || documentDate);
    const overdueDays = debt > 0 ? Math.max(0, daysBetween(now, dueDate)) : 0;

    return {
      orderId,
      orderCode,
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

  debts = filterByQuery(debts, query, ['orderCode', 'customerCode', 'customerName', 'salesmanName', 'deliveryStaffName']);
  if (query.salesman) debts = debts.filter((row) => normalizeText(row.salesmanName || row.salesmanCode).includes(normalizeText(query.salesman)));
  if (query.delivery) debts = debts.filter((row) => normalizeText(row.deliveryStaffName || row.deliveryStaffCode).includes(normalizeText(query.delivery)));
  if (query.status) debts = debts.filter((row) => row.status === query.status);

  const customerMap = new Map();
  debts.forEach((row) => {
    const key = row.customerId || row.customerCode || row.customerName;
    if (!customerMap.has(key)) {
      customerMap.set(key, {
        customerId: row.customerId,
        customerCode: row.customerCode,
        customerName: row.customerName,
        phone: row.phone,
        address: row.address,
        debit: 0,
        credit: 0,
        debt: 0,
        orderCount: 0,
        overdueCount: 0
      });
    }
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
    totalDebit: sum(debts, (row) => row.debit),
    totalCredit: sum(debts, (row) => row.credit),
    totalDebt: sum(debts, (row) => row.debt)
  };

  return { source: 'mongo', debts, customerSummary, summary };
}

async function salesReport(query = {}) {
  let orders = await SalesOrder.find({}).sort({ date: -1, createdAt: -1 }).lean();
  orders = orders.filter(isActive).filter((row) => matchDate(row, query));
  orders = filterByQuery(orders, query, ['code', 'orderCode', 'customerCode', 'customerName', 'salesmanName', 'staffName']);

  const rows = orders.map((order) => ({
    id: order.id || String(order._id || ''),
    code: order.code || order.orderCode || '',
    date: toDateOnly(order.date || order.orderDate || order.createdAt),
    customerCode: order.customerCode || '',
    customerName: order.customerName || '',
    salesmanCode: order.salesmanCode || order.staffCode || '',
    salesmanName: order.salesmanName || order.staffName || '',
    totalAmount: totalOf(order),
    paidAmount: toNumber(order.paidAmount || order.paymentAmount),
    debtAmount: Math.max(0, totalOf(order) - toNumber(order.paidAmount || order.paymentAmount)),
    status: order.status || ''
  }));

  const bySalesman = new Map();
  rows.forEach((row) => {
    const key = row.salesmanCode || row.salesmanName || 'UNKNOWN';
    if (!bySalesman.has(key)) bySalesman.set(key, { salesmanCode: row.salesmanCode, salesmanName: row.salesmanName, orderCount: 0, totalAmount: 0 });
    const target = bySalesman.get(key);
    target.orderCount += 1;
    target.totalAmount += row.totalAmount;
  });

  return {
    source: 'mongo',
    sales: rows,
    bySalesman: Array.from(bySalesman.values()),
    summary: {
      orderCount: rows.length,
      totalAmount: sum(rows, (row) => row.totalAmount),
      paidAmount: sum(rows, (row) => row.paidAmount),
      debtAmount: sum(rows, (row) => row.debtAmount)
    }
  };
}

async function financeReport(query = {}) {
  const [receipts, cashbooks, bankbooks, returns] = await Promise.all([
    Receipt.find({}).lean(),
    Cashbook.find({}).lean(),
    Bankbook.find({}).lean(),
    ReturnOrder.find({}).lean()
  ]);

  const receiptRows = receipts.filter(isActive).filter((row) => matchDate(row, query));
  const cashRows = cashbooks.filter(isActive).filter((row) => matchDate(row, query));
  const bankRows = bankbooks.filter(isActive).filter((row) => matchDate(row, query));
  const returnRows = returns.filter(isActive).filter((row) => matchDate(row, query));

  const cashIn = sum(cashRows.filter((row) => String(row.type || row.direction || '').toLowerCase() !== 'out'));
  const cashOut = sum(cashRows.filter((row) => String(row.type || row.direction || '').toLowerCase() === 'out'));
  const bankIn = sum(bankRows.filter((row) => String(row.type || row.direction || '').toLowerCase() !== 'out'));
  const bankOut = sum(bankRows.filter((row) => String(row.type || row.direction || '').toLowerCase() === 'out'));

  return {
    source: 'mongo',
    summary: {
      receiptCount: receiptRows.length,
      totalReceipts: sum(receiptRows),
      cashIn,
      cashOut,
      cashBalance: cashIn - cashOut,
      bankIn,
      bankOut,
      bankBalance: bankIn - bankOut,
      returnCount: returnRows.length,
      totalReturns: sum(returnRows)
    },
    receipts: receiptRows,
    cashbook: cashRows,
    bankbook: bankRows,
    returns: returnRows
  };
}

async function deliveryReport(query = {}) {
  let masterOrders = await MasterOrder.find({}).sort({ deliveryDate: -1, createdAt: -1 }).lean();
  masterOrders = masterOrders.filter(isActive).filter((row) => matchDate(row, query));
  masterOrders = filterByQuery(masterOrders, query, ['code', 'masterOrderCode', 'deliveryStaffCode', 'deliveryStaffName', 'status']);

  const rows = masterOrders.map((order) => ({
    id: order.id || String(order._id || ''),
    code: order.code || order.masterOrderCode || '',
    deliveryDate: toDateOnly(order.deliveryDate || order.date || order.createdAt),
    deliveryStaffCode: order.deliveryStaffCode || order.staffCode || '',
    deliveryStaffName: order.deliveryStaffName || order.staffName || '',
    orderCount: toNumber(order.orderCount || (Array.isArray(order.childOrders) ? order.childOrders.length : 0)),
    totalAmount: totalOf(order),
    collectedAmount: toNumber(order.collectedAmount || order.paidAmount),
    status: order.status || ''
  }));

  const byStaff = new Map();
  rows.forEach((row) => {
    const key = row.deliveryStaffCode || row.deliveryStaffName || 'UNKNOWN';
    if (!byStaff.has(key)) byStaff.set(key, { deliveryStaffCode: row.deliveryStaffCode, deliveryStaffName: row.deliveryStaffName, tripCount: 0, orderCount: 0, totalAmount: 0, collectedAmount: 0 });
    const target = byStaff.get(key);
    target.tripCount += 1;
    target.orderCount += row.orderCount;
    target.totalAmount += row.totalAmount;
    target.collectedAmount += row.collectedAmount;
  });

  return {
    source: 'mongo',
    delivery: rows,
    byStaff: Array.from(byStaff.values()),
    summary: {
      tripCount: rows.length,
      orderCount: sum(rows, (row) => row.orderCount),
      totalAmount: sum(rows, (row) => row.totalAmount),
      collectedAmount: sum(rows, (row) => row.collectedAmount)
    }
  };
}

async function dashboardReport(query = {}) {
  const [sales, debts, stock, finance, delivery, imports] = await Promise.all([
    salesReport(query),
    debtReport(query),
    stockReport(query),
    financeReport(query),
    deliveryReport(query),
    ImportOrder.find({}).lean()
  ]);

  const activeImports = imports.filter(isActive).filter((row) => matchDate(row, query));
  return {
    source: 'mongo',
    dashboard: {
      sales: sales.summary,
      debts: debts.summary,
      stock: stock.summary,
      finance: finance.summary,
      delivery: delivery.summary,
      imports: {
        importCount: activeImports.length,
        totalImportAmount: sum(activeImports)
      }
    }
  };
}

module.exports = {
  stockReport,
  debtReport,
  dashboardReport,
  salesReport,
  financeReport,
  deliveryReport
};
