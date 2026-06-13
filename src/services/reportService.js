'use strict';

const dateUtil = require('../utils/date.util');
const Product = require('../models/Product');
const StockTransaction = require('../models/StockTransaction');
const SalesOrder = require('../models/SalesOrder');
// Công nợ không đọc Customer/User.
// Source of Truth duy nhất: arLedgers.
const MasterOrder = require('../models/MasterOrder');
const Receipt = require('../models/Receipt');
const ArLedger = require('../models/ArLedger');
const Cashbook = require('../models/Cashbook');
const Bankbook = require('../models/Bankbook');
const ReturnOrder = require('../models/ReturnOrder');
const ImportOrder = require('../models/ImportOrder');
const { normalizeText, toNumber } = require('../utils/common.util');
const { STOCK_WAREHOUSE_CODE, STOCK_WAREHOUSE_NAME } = require('../constants/business.constants');
const inventoryStockService = require('./inventoryStock.service');
const { DEBT_ZERO_TOLERANCE, normalizeDebtAmount, hasOpenDebt, isOverpaid } = require('../constants/finance.constants');



function daysBetween(from, to) {
  const a = new Date(dateUtil.toDateOnly(from));
  const b = new Date(dateUtil.toDateOnly(to));
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
  return Math.floor((a.getTime() - b.getTime()) / 86400000);
}

function isActive(row = {}) {
  return !['void', 'cancelled', 'canceled', 'deleted', 'duplicate_cancelled'].includes(String(row.status || '').toLowerCase());
}

function matchDate(row, query = {}) {
  const value = dateUtil.toDateOnly(row.date || row.documentDate || row.orderDate || row.deliveryDate || row.createdAt);
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

function buildStockTxFilter(query = {}) {
  const filter = {};
  if (query.productCode) filter.productCode = String(query.productCode).trim();
  // Tồn kho chỉ có 1 kho MAIN; bỏ lọc HC/PC ở thẻ kho.
  if (query.date || query.dateFrom || query.dateTo) {
    filter.date = {};
    if (query.dateFrom) filter.date.$gte = dateUtil.toDateOnly(query.dateFrom);
    if (query.dateTo) filter.date.$lte = dateUtil.toDateOnly(query.dateTo);
    if (query.date) filter.date = dateUtil.toDateOnly(query.date);
  }
  return filter;
}

function isInType(row = {}) {
  const direction = String(row.direction || '').toUpperCase();
  if (direction) return direction === 'IN';
  return toNumber(row.quantity ?? row.qty) >= 0;
}

function stockQty(row = {}) {
  return toNumber(row.quantity ?? row.qty ?? 0);
}


async function stockReport(query = {}) {
  const q = normalizeText(query.q);
  const hasPeriod = Boolean(query.dateFrom || query.dateTo || query.asOfDate || query.mode === 'movement');

  if (hasPeriod) {
    const dateFrom = dateUtil.toDateOnly(query.dateFrom || '0000-01-01');
    const dateTo = dateUtil.toDateOnly(query.dateTo || query.asOfDate || dateUtil.todayVN());
    const [transactions, products] = await Promise.all([
      StockTransaction.find({}).sort({ date: 1, createdAt: 1, productCode: 1 }).lean(),
      Product.find({}).lean()
    ]);
    const productMap = new Map(products.map((p) => [String(p.code || p.id || p._id), p]));
    const byKey = new Map();

    transactions.forEach((tx) => {
      const txDate = dateUtil.toDateOnly(tx.date || tx.createdAt);
      if (txDate > dateTo) return;
      const productCode = String(tx.productCode || tx.productId || '').trim();
      const key = productCode;
      const product = productMap.get(productCode) || {};
      if (!byKey.has(key)) {
        byKey.set(key, {
          productId: tx.productId || product.id || String(product._id || ''),
          productCode,
          productName: tx.productName || product.name || '',
          warehouseCode: STOCK_WAREHOUSE_CODE,
          warehouseName: STOCK_WAREHOUSE_NAME,
          unit: product.unit || tx.unit || '',
          openingQty: 0,
          importQty: 0,
          exportQty: 0,
          returnQty: 0,
          adjustmentQty: 0,
          endingQty: 0
        });
      }
      const row = byKey.get(key);
      const qty = stockQty(tx);
      if (txDate < dateFrom) {
        row.openingQty += qty;
      } else {
        const type = String(tx.type || '').toUpperCase();
        if (type.includes('RETURN')) row.returnQty += Math.abs(qty);
        else if (type.includes('IMPORT') || isInType(tx)) row.importQty += Math.abs(qty);
        else if (type.includes('SALE') || !isInType(tx)) row.exportQty += Math.abs(qty);
        else row.adjustmentQty += qty;
      }
      row.endingQty += qty;
    });

    let stock = Array.from(byKey.values()).map((row) => ({
      ...row,
      inQty: row.importQty + row.returnQty + Math.max(0, row.adjustmentQty),
      outQty: row.exportQty + Math.abs(Math.min(0, row.adjustmentQty)),
      quantity: row.endingQty,
      qty: row.endingQty,
      availableQty: row.endingQty
    }));
    if (q) stock = stock.filter((row) => [row.productCode, row.productName].some((value) => normalizeText(value).includes(q)));
    const negativeStockRows = stock.filter((row) => toNumber(row.quantity ?? row.qty ?? row.availableQty) < 0);
    const summary = stock.reduce((acc, row) => {
      acc.totalRows += 1;
      acc.openingQty += toNumber(row.openingQty);
      acc.importQty += toNumber(row.importQty);
      acc.exportQty += toNumber(row.exportQty);
      acc.returnQty += toNumber(row.returnQty);
      acc.endingQty += toNumber(row.endingQty);
      return acc;
    }, { totalRows: 0, openingQty: 0, importQty: 0, exportQty: 0, returnQty: 0, endingQty: 0 });
    summary.negativeStockCount = negativeStockRows.length;
    return { source: 'mongo_stock_transactions', dateFrom, dateTo, stock, summary, negativeStockCount: negativeStockRows.length, negativeStockRows };
  }

  const currentStock = await inventoryStockService.getInventorySummary(query);
  return {
    ...currentStock,
    source: 'mongo_inventories_canonical',
    inventorySource: 'inventories',
    stock: currentStock.stock,
    summary: currentStock.summary,
    negativeStockCount: currentStock.negativeStockCount,
    negativeStockRows: currentStock.negativeStockRows
  };
}

async function stockCardReport(query = {}) {
  let rows = await StockTransaction.find(buildStockTxFilter(query)).sort({ date: 1, createdAt: 1, productCode: 1 }).lean();
  rows = filterByQuery(rows, query, ['productCode', 'productName', 'warehouseCode', 'refCode', 'refType', 'type']);
  let runningByKey = new Map();
  const transactions = rows.map((tx) => {
    const key = `${tx.productCode || ''}`;
    const running = toNumber(runningByKey.get(key)) + stockQty(tx);
    runningByKey.set(key, running);
    return {
      id: tx.id || String(tx._id || ''),
      date: dateUtil.toDateOnly(tx.date || tx.createdAt),
      productCode: tx.productCode || '',
      productName: tx.productName || '',
      warehouseCode: STOCK_WAREHOUSE_CODE,
      type: tx.type || '',
      refType: tx.refType || '',
      refCode: tx.refCode || '',
      inQty: toNumber(tx.inQty || (stockQty(tx) > 0 ? stockQty(tx) : 0)),
      outQty: toNumber(tx.outQty || (stockQty(tx) < 0 ? Math.abs(stockQty(tx)) : 0)),
      quantity: stockQty(tx),
      balanceQty: toNumber(tx.balanceQty || running),
      note: tx.note || ''
    };
  });
  const summary = transactions.reduce((acc, row) => {
    acc.transactionCount += 1;
    acc.inQty += toNumber(row.inQty);
    acc.outQty += toNumber(row.outQty);
    return acc;
  }, { transactionCount: 0, inQty: 0, outQty: 0 });
  return { source: 'mongo_stock_transactions', transactions, summary };
}


function moneyDocKey(row = {}) {
  return String(row.id || row._id || row.code || row.refId || row.refCode || '').trim();
}

function activeLedgerRows(rows = []) {
  return rows.filter(isActive).filter((row) => {
    const type = String(row.type || '').toLowerCase();
    const account = String(row.account || '').toUpperCase();
    return account === 'AR' || type.includes('ar') || type.includes('debt') || type.includes('receipt') || type.includes('return') || toNumber(row.debit) || toNumber(row.credit);
  });
}

function orderIdentity(order = {}) {
  return {
    id: String(order.id || order._id || order.code || '').trim(),
    code: String(order.code || order.orderCode || '').trim()
  };
}

function isLedgerForOrder(row = {}, order = {}) {
  const { id, code } = orderIdentity(order);
  const keys = [row.orderId, row.salesOrderId, row.refId, row.orderCode, row.salesOrderCode, row.refCode].map((v) => String(v || '').trim()).filter(Boolean);
  return keys.includes(id) || keys.includes(code);
}

function getLedgerOrderKey(row = {}) {
  return String(row.orderId || row.salesOrderId || row.refId || row.orderCode || row.salesOrderCode || row.refCode || '').trim();
}

function getLedgerCustomerKey(row = {}) {
  return String(row.customerId || row.customerCode || row.customerName || '').trim();
}

function isDeliveredForAR(order = {}) {
  // Công nợ AR chỉ phát sinh sau 2 điều kiện:
  // 1) NVGH đã giao xong; 2) kế toán đã xác nhận báo cáo giao hàng.
  // Không backfill ảo cho đơn mới giao nhưng còn chờ kế toán, vì sẽ làm báo cáo công nợ nhảy sớm.
  const delivered = ['delivered', 'success', 'completed', 'done'].includes(String(order.deliveryStatus || '').toLowerCase());
  const accountingStatus = String(order.accountingStatus || '').toLowerCase();
  const accountingConfirmed = Boolean(order.accountingConfirmed) || ['confirmed', 'locked', 'posted'].includes(accountingStatus);
  return delivered && accountingConfirmed;
}

function findOrderForMoneyDoc(row = {}, orderByKey = new Map()) {
  const keys = [row.orderId, row.salesOrderId, row.sourceOrderId, row.refId, row.orderCode, row.salesOrderCode, row.sourceOrderCode, row.refCode]
    .map((value) => String(value || '').trim())
    .filter(Boolean);
  for (const key of keys) {
    const order = orderByKey.get(key);
    if (order) return order;
  }
  return null;
}

function isMobileDeliveryMoneyDoc(row = {}) {
  const text = [row.source, row.refType, row.type, row.note]
    .map((value) => String(value || '').toLowerCase())
    .join(' ');
  return text.includes('mobile_delivery')
    || text.includes('mobiledelivery')
    || text.includes('mobile delivery')
    || text.includes('mobile_delivery_return')
    || text.includes('app giao hàng');
}

function isMoneyDocAllowedForAR(row = {}, orderByKey = new Map()) {
  // Phiếu thu/hàng trả phát sinh từ app giao hàng chỉ là dữ liệu chờ đối chiếu.
  // Không đưa vào AR Ledger ảo cho tới khi đơn liên quan đã được kế toán xác nhận.
  if (!isMobileDeliveryMoneyDoc(row)) return true;
  const order = findOrderForMoneyDoc(row, orderByKey);
  return order ? isDeliveredForAR(order) : false;
}

function isAccountingConfirmedDoc(row = {}) {
  const accountingStatus = String(row.accountingStatus || row.financeStatus || '').toLowerCase();
  return Boolean(row.accountingConfirmed || row.financeConfirmed) || ['confirmed', 'locked', 'posted'].includes(accountingStatus);
}

function isReturnDocAllowedForAR(row = {}, orderByKey = new Map()) {
  // V45: hàng trả dù kho đã nhận vẫn chỉ là dữ liệu chờ kế toán.
  // Chỉ đưa hàng trả vào AR khi chính phiếu/đơn đã được kế toán xác nhận,
  // hoặc đơn giao liên quan đã được kế toán xác nhận.
  if (isAccountingConfirmedDoc(row)) return true;
  const order = findOrderForMoneyDoc(row, orderByKey);
  return order ? isDeliveredForAR(order) : false;
}

function isLedgerReturnOrMobileMoneyBlocked(entry = {}, orderByKey = new Map()) {
  const type = String(entry.type || '').toLowerCase();
  const refType = String(entry.refType || '').toLowerCase();
  const isReturnLedger = type.includes('return') || refType.includes('return');
  if (!isReturnLedger && !isMobileDeliveryMoneyDoc(entry)) return false;
  if (isAccountingConfirmedDoc(entry)) return false;
  const order = findOrderForMoneyDoc(entry, orderByKey);
  return order ? !isDeliveredForAR(order) : isMobileDeliveryMoneyDoc(entry);
}

function makeVirtualSaleLedger(order = {}) {
  // V45 chuẩn: chỉ đơn đã chốt giao mới được đưa sang công nợ.
  // Không backfill công nợ ảo cho đơn mới tạo / đã gộp nhưng chưa giao xong.
  if (!isDeliveredForAR(order)) return null;
  // Bút toán phát sinh công nợ phải lấy tổng phải thu ban đầu của đơn đã giao.
  // Không dùng debtAmount còn lại, vì receipt/return sẽ được ghi thành bút toán giảm nợ riêng trong AR Ledger.
  const debit = toNumber(order.debtBeforeCollection ?? order.totalAmount ?? order.amount ?? order.grandTotal ?? order.payableAmount ?? order.debtAmount ?? order.debt ?? 0);
  if (debit <= 0) return null;
  return {
    id: `VIRTUAL-AR-SALE-${order.id || order.code}`,
    code: `VIRTUAL-AR-SALE-${order.code || order.id}`,
    date: dateUtil.toDateOnly(order.date || order.orderDate || order.createdAt),
    type: 'ar_sale_virtual_backfill',
    account: 'AR',
    refType: 'SALES_ORDER',
    refId: order.id || order._id || order.code,
    refCode: order.code || order.id,
    orderId: order.id || order._id || order.code,
    orderCode: order.code || order.id,
    customerId: order.customerId || '',
    customerCode: order.customerCode || '',
    customerName: order.customerName || '',
    salesmanCode: order.salesmanCode || order.salesStaffCode || order.nvbhCode || '',
    salesmanName: order.salesmanName || order.salesStaffName || order.nvbhName || '',
    deliveryStaffCode: order.deliveryStaffCode || '',
    deliveryStaffName: order.deliveryStaffName || '',
    debit,
    credit: 0,
    amount: debit,
    status: 'posted',
    source: 'virtual_backfill_from_orders'
  };
}

function makeVirtualReturnLedger(row = {}) {
  const credit = totalOf(row) || toNumber(row.returnAmount || row.debtReduction || row.totalAmount);
  if (credit <= 0) return null;
  return {
    id: `VIRTUAL-AR-RETURN-${row.id || row.code}`,
    code: `VIRTUAL-AR-RETURN-${row.code || row.id}`,
    date: dateUtil.toDateOnly(row.date || row.createdAt),
    type: 'ar_return_virtual_backfill',
    account: 'AR',
    refType: 'RETURN_ORDER',
    refId: row.id || row._id || row.code,
    refCode: row.code || row.id,
    orderId: row.salesOrderId || row.orderId || row.sourceOrderId || '',
    orderCode: row.salesOrderCode || row.orderCode || '',
    customerId: row.customerId || '',
    customerCode: row.customerCode || '',
    customerName: row.customerName || '',
    debit: 0,
    credit,
    amount: credit,
    status: 'posted',
    source: 'virtual_backfill_from_returns'
  };
}

function makeVirtualReceiptLedger(row = {}) {
  const credit = totalOf(row);
  if (credit <= 0) return null;
  return {
    id: `VIRTUAL-AR-RECEIPT-${row.id || row.code}`,
    code: `VIRTUAL-AR-RECEIPT-${row.code || row.id}`,
    date: dateUtil.toDateOnly(row.date || row.createdAt),
    type: 'ar_receipt_virtual_backfill',
    account: 'AR',
    refType: 'RECEIPT',
    refId: row.id || row._id || row.code,
    refCode: row.code || row.id,
    orderId: row.orderId || row.salesOrderId || '',
    orderCode: row.orderCode || row.salesOrderCode || row.refCode || '',
    customerId: row.customerId || '',
    customerCode: row.customerCode || '',
    customerName: row.customerName || '',
    debit: 0,
    credit,
    amount: credit,
    status: 'posted',
    source: 'virtual_backfill_from_receipts'
  };
}


function normalizeArLedgerEntry(row = {}) {
  const type = String(row.type || '').toLowerCase();
  const debit = toNumber(row.debit || (type.includes('sale') ? row.amount : 0));
  const credit = toNumber(row.credit || (!type.includes('sale') ? row.amount : 0));
  return {
    id: row.id || String(row._id || ''),
    code: row.code || '',
    date: dateUtil.toDateOnly(row.date || row.createdAt),
    type: row.type || '',
    account: row.account || 'AR',
    refType: row.refType || '',
    refId: row.refId || row.id || '',
    refCode: row.refCode || row.code || '',
    orderId: row.orderId || row.salesOrderId || '',
    orderCode: row.orderCode || row.salesOrderCode || '',
    customerId: row.customerId || '',
    customerCode: row.customerCode || '',
    customerName: row.customerName || '',
    debit,
    credit,
    balanceEffect: debit - credit,
    status: row.status || 'posted',
    source: row.source || '',
    note: row.note || row.voidReason || ''
  };
}

function buildArLedgerDiagnostics(receipts = [], ledger = []) {
  const rows = ledger.map(normalizeArLedgerEntry);
  const diagnostics = [];
  receipts.forEach((receipt) => {
    const receiptId = String(receipt.id || receipt._id || '').trim();
    const receiptCode = String(receipt.code || '').trim();
    const related = rows.filter((entry) => {
      const keys = [entry.refId, entry.refCode, entry.code, entry.id].map((v) => String(v || '').trim());
      return (receiptId && keys.includes(receiptId)) || (receiptCode && keys.includes(receiptCode));
    });
    const hasReceiptCredit = related.some((entry) => String(entry.type || '').toLowerCase().includes('receipt') && !String(entry.type || '').toLowerCase().includes('void') && toNumber(entry.credit) > 0);
    const hasVoidReverse = related.some((entry) => String(entry.type || '').toLowerCase().includes('void') && toNumber(entry.debit) > 0);
    const amount = totalOf(receipt);
    if (String(receipt.status || '').toLowerCase() === 'void' && !hasVoidReverse) {
      diagnostics.push({
        level: 'danger',
        code: receipt.code || receipt.id || '',
        date: dateUtil.toDateOnly(receipt.date || receipt.createdAt),
        customerCode: receipt.customerCode || '',
        customerName: receipt.customerName || '',
        amount,
        message: 'Phiếu thu đã Void nhưng chưa có bút toán đảo AR debit.'
      });
    } else if (String(receipt.status || '').toLowerCase() !== 'void' && !hasReceiptCredit && amount > 0) {
      diagnostics.push({
        level: 'warning',
        code: receipt.code || receipt.id || '',
        date: dateUtil.toDateOnly(receipt.date || receipt.createdAt),
        customerCode: receipt.customerCode || '',
        customerName: receipt.customerName || '',
        amount,
        message: 'Phiếu thu đang hiệu lực nhưng chưa thấy bút toán AR credit.'
      });
    }
  });
  return diagnostics;
}


function escapeRegExp(value = '') {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getSafeLimit(value, defaultLimit = 50, maxLimit = 100) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return defaultLimit;
  return Math.min(Math.max(1, Math.floor(n)), maxLimit);
}

function getPage(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.max(1, Math.floor(n));
}

function pushDebtLedgerAnd(match, condition) {
  if (!condition) return;
  if (!Array.isArray(match.$and)) match.$and = [];
  match.$and.push(condition);
}

// REPORT_DEBT_ARLEDGER_ONLY_MATCH_START
function buildDebtLedgerMatch(query = {}) {
  const match = {
    status: { $nin: ['void', 'cancelled', 'canceled', 'deleted', 'duplicate_cancelled', 'reversed'] },
    reversed: { $ne: true },
    refType: { $ne: 'AR_LEDGER_REVERSAL' },
    type: { $nin: ['ar_reversal', 'reversal', 'ar_void'] }
  };

  if (query.dateFrom || query.dateTo || query.date) {
    match.date = {};
    if (query.dateFrom) match.date.$gte = dateUtil.toDateOnly(query.dateFrom);
    if (query.dateTo) match.date.$lte = dateUtil.toDateOnly(query.dateTo);
    if (query.date) match.date = dateUtil.toDateOnly(query.date);
  }

  if (query.customerCode) {
    const rx = new RegExp(`^${escapeRegExp(query.customerCode)}$`, 'i');
    pushDebtLedgerAnd(match, { $or: [{ customerCode: rx }, { customerId: rx }] });
  }

  if (query.customerId) {
    const rx = new RegExp(`^${escapeRegExp(query.customerId)}$`, 'i');
    pushDebtLedgerAnd(match, { $or: [{ customerId: rx }, { customerCode: rx }] });
  }

  // V46 AR staff-filter rule:
  // Do NOT filter NVBH/NVGH directly on every arLedger row here.
  // Receipt/return/bonus rows can legitimately miss staff metadata, so direct row-level
  // filtering would drop AR-RECEIPT/AR-RETURN and make debt appear higher than reality.
  // Staff scope is resolved by first finding matching AR-SALE order keys, then loading
  // ALL AR rows for those order keys.

  return match;
}
// REPORT_DEBT_ARLEDGER_ONLY_MATCH_END

function buildLedgerStaffSeedCondition(query = {}) {
  const parts = [];
  if (query.delivery) {
    const rx = new RegExp(escapeRegExp(query.delivery), 'i');
    parts.push({
      $or: [
        // STAFF DATA RULE: NVGH filter only reads delivery identity fields.
        // Do not use staffCode/staffName here; those fields are audit/legacy-display only.
        { deliveryStaffCode: rx },
        { deliveryStaffName: rx },
        { deliveryCode: rx },
        { deliveryName: rx },
        { nvghCode: rx },
        { nvghName: rx }
      ]
    });
  }
  if (query.salesman) {
    const rx = new RegExp(escapeRegExp(query.salesman), 'i');
    parts.push({
      $or: [
        // STAFF DATA RULE: NVBH filter only reads sales identity fields.
        // Do not use staffCode/staffName here; those fields are audit/legacy-display only.
        { salesmanCode: rx },
        { salesmanName: rx },
        { salesStaffCode: rx },
        { salesStaffName: rx },
        { nvbhCode: rx },
        { nvbhName: rx }
      ]
    });
  }
  if (!parts.length) return null;
  return parts.length === 1 ? parts[0] : { $and: parts };
}

function normalizeLedgerOrderKey(value) {
  return String(value || '').trim();
}

async function buildDebtLedgerMatchWithStaffScope(query = {}) {
  const match = buildDebtLedgerMatch(query);
  const staffCondition = buildLedgerStaffSeedCondition(query);
  if (!staffCondition) return match;

  const seedMatch = {
    ...buildDebtLedgerMatch({}),
    type: { $in: ['ar_sale', 'ar_external_debt'] },
    ...staffCondition
  };
  if (query.dateFrom || query.dateTo || query.date) {
    seedMatch.date = {};
    if (query.dateFrom) seedMatch.date.$gte = dateUtil.toDateOnly(query.dateFrom);
    if (query.dateTo) seedMatch.date.$lte = dateUtil.toDateOnly(query.dateTo);
    if (query.date) seedMatch.date = dateUtil.toDateOnly(query.date);
  }

  const saleRows = await ArLedger.find(seedMatch)
    .select('orderId orderCode salesOrderId salesOrderCode refId refCode')
    .limit(5000)
    .lean()
    .catch(() => []);

  const orderIds = Array.from(new Set(saleRows
    .flatMap((row) => [row.orderId, row.salesOrderId, row.refId])
    .map(normalizeLedgerOrderKey)
    .filter(Boolean)));
  const orderCodes = Array.from(new Set(saleRows
    .flatMap((row) => [row.orderCode, row.salesOrderCode, row.refCode])
    .map(normalizeLedgerOrderKey)
    .filter(Boolean)));

  if (!orderIds.length && !orderCodes.length) {
    pushDebtLedgerAnd(match, { _id: '__NO_AR_SALE_MATCHING_STAFF_SCOPE__' });
    return match;
  }

  pushDebtLedgerAnd(match, {
    $or: [
      ...(orderIds.length ? [
        { orderId: { $in: orderIds } },
        { salesOrderId: { $in: orderIds } },
        { refId: { $in: orderIds } }
      ] : []),
      ...(orderCodes.length ? [
        { orderCode: { $in: orderCodes } },
        { salesOrderCode: { $in: orderCodes } },
        { refCode: { $in: orderCodes } }
      ] : [])
    ]
  });
  return match;
}

function applyDebtStatusFilter(rows = [], query = {}) {
  const status = String(query.status || '').trim();
  const includePaid = String(query.includePaid || '').trim() === '1' || status === 'paid';
  if (includePaid) return rows;
  if (!status || status === 'all' || status === 'unpaid' || status === 'open') {
    return rows.filter((row) => hasOpenDebt(row.debt) || isOverpaid(row.debt));
  }
  if (status === 'overdue') return rows.filter((row) => row.status === 'overdue');
  return rows.filter((row) => row.status === status);
}

async function debtReport(query = {}) {
  // V45 FAST PATH: /api/debts không được load toàn bộ orders/arLedgers/receipts/returns/customers.
  // API này chỉ đọc AR Ledger theo bộ lọc, phân trang thật, và chỉ lấy customer meta liên quan.
  const page = getPage(query.page);
  const limit = getSafeLimit(query.limit, 50, 100);
  const skip = (page - 1) * limit;
  const hasSearchCriteria = Boolean(query.q || query.keyword || query.search || query.salesman || query.delivery || query.customerCode || query.customerId || query.dateFrom || query.dateTo || query.date);

  const match = await buildDebtLedgerMatchWithStaffScope(query);
  const textSearch = String(query.q || query.keyword || query.search || '').trim();
  if (textSearch) {
    const rx = new RegExp(escapeRegExp(textSearch), 'i');
    pushDebtLedgerAnd(match, {
      $or: [
        { customerCode: rx },
        { customerName: rx },
        { customerId: rx },
        { orderCode: rx },
        { salesOrderCode: rx },
        { refCode: rx }
      ]
    });
  }

  // Nếu không có tiêu chí, chỉ đọc trang nhỏ gần nhất thay vì tính toàn bộ hệ thống.
  if (!hasSearchCriteria) {
    match.date = match.date || { $gte: dateUtil.toDateOnly(dateUtil.todayVN()) };
  }

  const grouped = await ArLedger.aggregate([
    { $match: match },
    { $project: {
      date: { $ifNull: ['$date', '$createdAt'] },
      code: 1,
      type: 1,
      orderType: 1,
      refType: 1,
      refId: 1,
      refCode: 1,
      orderId: { $ifNull: ['$orderId', '$salesOrderId'] },
      orderCode: { $ifNull: ['$orderCode', '$salesOrderCode'] },
      customerId: 1,
      customerCode: 1,
      customerName: 1,
      phone: { $ifNull: ['$phone', '$customerPhone'] },
      address: { $ifNull: ['$address', '$customerAddress'] },
      salesmanCode: 1,
      salesmanName: 1,
      salesStaffCode: 1,
      salesStaffName: 1,
      staffCode: 1,
      staffName: 1,
      nvbhCode: 1,
      nvbhName: 1,
      deliveryStaffCode: 1,
      deliveryStaffName: 1,
      deliveryCode: 1,
      deliveryName: 1,
      deliveryStaff: 1,
      nvghCode: 1,
      nvghName: 1,
      debit: { $ifNull: ['$debit', 0] },
      credit: { $ifNull: ['$credit', 0] },
      amount: { $ifNull: ['$amount', 0] },
      status: 1,
      source: 1,
      note: 1,
      createdAt: 1
    } },
    { $group: {
      _id: {
        customerCode: '$customerCode',
        customerId: '$customerId',
        customerName: '$customerName',
        orderCode: '$orderCode',
        orderId: '$orderId'
      },
      firstDate: { $min: '$date' },
      lastDate: { $max: '$date' },
      phone: { $max: '$phone' },
      address: { $max: '$address' },
      debit: { $sum: { $cond: [{ $gt: ['$debit', 0] }, '$debit', { $cond: [{ $regexMatch: { input: { $toLower: { $ifNull: ['$type', ''] } }, regex: 'sale|external_debt' } }, '$amount', 0] }] } },
      credit: { $sum: { $cond: [{ $gt: ['$credit', 0] }, '$credit', { $cond: [{ $regexMatch: { input: { $toLower: { $ifNull: ['$type', ''] } }, regex: 'sale|external_debt' } }, 0, '$amount'] }] } },
      receiptAmount: { $sum: { $cond: [{ $regexMatch: { input: { $toLower: { $ifNull: ['$type', ''] } }, regex: 'receipt|payment|collection|debt' } }, { $ifNull: ['$credit', '$amount'] }, 0] } },
      returnAmount: { $sum: { $cond: [{ $regexMatch: { input: { $toLower: { $ifNull: ['$type', ''] } }, regex: 'return' } }, { $ifNull: ['$credit', '$amount'] }, 0] } },
      bonusAmount: { $sum: { $cond: [{ $regexMatch: { input: { $toLower: { $ifNull: ['$type', ''] } }, regex: 'bonus|discount|allowance' } }, { $ifNull: ['$credit', '$amount'] }, 0] } },
      // ===== SCOPED FIX: DEBT_REPORT_ORDER_STAFF_FROM_AR_SALE_ONLY_START =====
      // Một đơn có nhiều dòng AR: SALE, PAYMENT, RETURN, BONUS...
      // PAYMENT/RETURN có thể mang staff audit/legacy và làm $max chọn sai NVBH/NVGH khi trùng mã.
      // Vì vậy nhân sự hiển thị theo đơn nợ phải lấy từ dòng AR-SALE gốc của chính đơn đó.
      saleSalesmanCode: { $max: { $cond: [
        { $regexMatch: { input: { $toLower: { $ifNull: ['$type', ''] } }, regex: 'sale|external_debt' } },
        { $ifNull: ['$salesmanCode', { $ifNull: ['$salesStaffCode', '$nvbhCode'] }] },
        ''
      ] } },
      saleSalesmanName: { $max: { $cond: [
        { $regexMatch: { input: { $toLower: { $ifNull: ['$type', ''] } }, regex: 'sale|external_debt' } },
        { $ifNull: ['$salesmanName', { $ifNull: ['$salesStaffName', '$nvbhName'] }] },
        ''
      ] } },
      saleDeliveryStaffCode: { $max: { $cond: [
        { $regexMatch: { input: { $toLower: { $ifNull: ['$type', ''] } }, regex: 'sale|external_debt' } },
        { $ifNull: ['$deliveryStaffCode', { $ifNull: ['$deliveryCode', '$nvghCode'] }] },
        ''
      ] } },
      saleDeliveryStaffName: { $max: { $cond: [
        { $regexMatch: { input: { $toLower: { $ifNull: ['$type', ''] } }, regex: 'sale|external_debt' } },
        { $ifNull: ['$deliveryStaffName', { $ifNull: ['$deliveryName', '$nvghName'] }] },
        ''
      ] } },
      saleOrderType: { $max: { $cond: [
        { $regexMatch: { input: { $toLower: { $ifNull: ['$type', ''] } }, regex: 'sale|external_debt' } },
        { $ifNull: ['$orderType', { $cond: [{ $eq: ['$type', 'ar_external_debt'] }, 'external_debt', 'sales_order'] }] },
        ''
      ] } },
      salesmanCode: { $max: { $ifNull: ['$salesmanCode', { $ifNull: ['$salesStaffCode', '$nvbhCode'] }] } },
      salesmanName: { $max: { $ifNull: ['$salesmanName', { $ifNull: ['$salesStaffName', '$nvbhName'] }] } },
      deliveryStaffCode: { $max: { $ifNull: ['$deliveryStaffCode', { $ifNull: ['$deliveryCode', '$nvghCode'] }] } },
      deliveryStaffName: { $max: { $ifNull: ['$deliveryStaffName', { $ifNull: ['$deliveryName', '$nvghName'] }] } },
      fallbackSalesmanCode: { $max: { $ifNull: ['$salesmanCode', { $ifNull: ['$salesStaffCode', '$nvbhCode'] }] } },
      fallbackSalesmanName: { $max: { $ifNull: ['$salesmanName', { $ifNull: ['$salesStaffName', '$nvbhName'] }] } },
      fallbackDeliveryStaffCode: { $max: { $ifNull: ['$deliveryStaffCode', { $ifNull: ['$deliveryCode', '$nvghCode'] }] } },
      fallbackDeliveryStaffName: { $max: { $ifNull: ['$deliveryStaffName', { $ifNull: ['$deliveryName', '$nvghName'] }] } }
      // ===== SCOPED FIX: DEBT_REPORT_ORDER_STAFF_FROM_AR_SALE_ONLY_END =====
    } },
    { $addFields: { debt: { $subtract: ['$debit', '$credit'] } } },
    { $sort: { debt: -1, lastDate: -1 } },
    { $limit: Math.max(skip + limit + 1, limit + 1) }
  ]).allowDiskUse(true).exec().catch(() => []);

  const now = dateUtil.todayVN();
  let debts = grouped.map((row) => {
    const id = row._id || {};
    if (!row.fallbackSalesmanCode && row.salesmanCode) row.fallbackSalesmanCode = row.salesmanCode;
    if (!row.fallbackSalesmanName && row.salesmanName) row.fallbackSalesmanName = row.salesmanName;
    if (!row.fallbackDeliveryStaffCode && row.deliveryStaffCode) row.fallbackDeliveryStaffCode = row.deliveryStaffCode;
    if (!row.fallbackDeliveryStaffName && row.deliveryStaffName) row.fallbackDeliveryStaffName = row.deliveryStaffName;
    const debt = normalizeDebtAmount(toNumber(row.debit) - toNumber(row.credit));
    const documentDate = dateUtil.toDateOnly(row.firstDate || row.lastDate || new Date());
    const overdueDays = hasOpenDebt(debt) ? Math.max(0, daysBetween(now, documentDate)) : 0;
    const status = isOverpaid(debt) ? 'overpaid' : (hasOpenDebt(debt) ? (overdueDays > 0 ? 'overdue' : 'open') : 'paid');
    return {
      orderId: id.orderId || id.orderCode || '',
      orderCode: id.orderCode || id.orderId || '',
      customerId: id.customerId || '',
      customerCode: id.customerCode || '',
      customerName: id.customerName || 'Chưa rõ khách',
      phone: row.phone || '',
      address: row.address || '',
      // ===== SCOPED FIX: ORDER_DATA_LINEAGE_REPORT_AR_SALE_STAFF_ONLY_START =====
      // Công nợ hiển thị nhân sự theo dòng AR-SALE của đơn.
      // Không lấy từ PAYMENT/RETURN/BONUS vì các dòng đó có thể là audit/user thao tác hoặc legacy display.
      salesmanCode: row.saleSalesmanCode || row.fallbackSalesmanCode || '',
      salesmanName: row.saleSalesmanName || row.fallbackSalesmanName || '',
      deliveryStaffCode: row.saleDeliveryStaffCode || row.fallbackDeliveryStaffCode || '',
      deliveryStaffName: row.saleDeliveryStaffName || row.fallbackDeliveryStaffName || '',
      orderType: row.saleOrderType || (/^NDNBLH/i.test(String(id.orderCode || '')) ? 'external_debt' : 'sales_order'),
      // ===== SCOPED FIX: ORDER_DATA_LINEAGE_REPORT_AR_SALE_STAFF_ONLY_END =====
      documentDate,
      dueDate: documentDate,
      debit: toNumber(row.debit),
      credit: toNumber(row.credit),
      receiptAmount: Math.max(0, toNumber(row.receiptAmount)),
      returnAmount: Math.max(0, toNumber(row.returnAmount)),
      bonusAmount: Math.max(0, toNumber(row.bonusAmount)),
      debt,
      rawDebt: debt,
      overpaidAmount: Math.max(0, -debt),
      debtZeroTolerance: DEBT_ZERO_TOLERANCE,
      overdueDays,
      agingDays: documentDate ? Math.max(0, daysBetween(now, documentDate)) : 0,
      status
    };
  });

  debts = applyDebtStatusFilter(debts, query);
  if (skip) debts = debts.slice(skip);
  const hasMore = debts.length > limit;
  debts = debts.slice(0, limit);

  const customerMap = new Map();
  debts.forEach((row) => {
    const key = String(row.customerCode || row.customerId || row.customerName || '').trim();
    if (!key) return;
    if (!customerMap.has(key)) {
      customerMap.set(key, {
        customerId: row.customerId,
        customerCode: row.customerCode,
        customerName: row.customerName || 'Chưa rõ khách',
        phone: row.phone,
        address: row.address,
        salesmanCode: row.salesmanCode || '',
        salesmanName: row.salesmanName || '',
        deliveryStaffCode: row.deliveryStaffCode || '',
        deliveryStaffName: row.deliveryStaffName || '',
        debit: 0,
        credit: 0,
        receiptAmount: 0,
        returnAmount: 0,
        bonusAmount: 0,
        debt: 0,
        orderCount: 0,
        overdueCount: 0,
        overdueDays: 0,
        agingDays: 0,
        orders: []
      });
    }
    const target = customerMap.get(key);
    target.debit += toNumber(row.debit);
    target.credit += toNumber(row.credit);
    target.receiptAmount += toNumber(row.receiptAmount);
    target.returnAmount += toNumber(row.returnAmount);
    target.bonusAmount += toNumber(row.bonusAmount);
    target.debt += normalizeDebtAmount(row.debt);
    target.orderCount += 1;
    target.orders.push({
      orderId: row.orderId,
      orderCode: row.orderCode,
      documentDate: row.documentDate,
      dueDate: row.dueDate,
      debit: toNumber(row.debit),
      credit: toNumber(row.credit),
      receiptAmount: toNumber(row.receiptAmount),
      returnAmount: toNumber(row.returnAmount),
      bonusAmount: toNumber(row.bonusAmount),
      debt: normalizeDebtAmount(row.debt),
      overdueDays: toNumber(row.overdueDays),
      agingDays: toNumber(row.agingDays),
      status: row.status,
      salesmanCode: row.salesmanCode,
      salesmanName: row.salesmanName,
      deliveryStaffCode: row.deliveryStaffCode,
      deliveryStaffName: row.deliveryStaffName,
      orderType: row.orderType || 'sales_order'
    });
    target.overdueDays = Math.max(toNumber(target.overdueDays), toNumber(row.overdueDays));
    target.agingDays = Math.max(toNumber(target.agingDays), toNumber(row.agingDays));
    if (row.status === 'overdue') target.overdueCount += 1;
  });

  const customerSummary = Array.from(customerMap.values())
    .map((row) => ({
      ...row,
      debt: normalizeDebtAmount(row.debt),
      overpaidAmount: Math.max(0, -normalizeDebtAmount(row.debt)),
      status: isOverpaid(row.debt) ? 'overpaid' : (hasOpenDebt(row.debt) ? (toNumber(row.overdueDays) > 0 ? 'overdue' : 'open') : 'paid'),
      debtZeroTolerance: DEBT_ZERO_TOLERANCE
    }))
    .sort((a, b) => Math.abs(b.debt) - Math.abs(a.debt) || b.overdueDays - a.overdueDays || String(a.customerName).localeCompare(String(b.customerName)));

  const arLedgerRows = await ArLedger.find(match)
    .sort({ date: -1, createdAt: -1 })
    .limit(200)
    .lean()
    .catch(() => []);
  let arLedger = arLedgerRows.map(normalizeArLedgerEntry);
  arLedger = filterByQuery(arLedger, query, ['code', 'refCode', 'orderCode', 'customerCode', 'customerName', 'type', 'note']);

  const bySalesman = buildDebtPersonSummary(debts, { codeKey: 'salesmanCode', nameKey: 'salesmanName', role: 'salesman' });
  const byDelivery = buildDebtPersonSummary(debts, { codeKey: 'deliveryStaffCode', nameKey: 'deliveryStaffName', role: 'delivery' });
  const summary = {
    page,
    limit,
    hasMore,
    orderCount: debts.length,
    customerCount: customerSummary.length,
    overdueCount: debts.filter((row) => row.status === 'overdue').length,
    totalDebit: sum(debts, (row) => row.debit),
    totalCredit: sum(debts, (row) => row.credit),
    totalDebt: sum(debts, (row) => normalizeDebtAmount(row.debt)),
    totalPositiveDebt: sum(debts.filter((row) => hasOpenDebt(row.debt)), (row) => normalizeDebtAmount(row.debt)),
    totalOverpaid: sum(debts.filter((row) => isOverpaid(row.debt)), (row) => Math.abs(normalizeDebtAmount(row.debt))),
    debtZeroTolerance: DEBT_ZERO_TOLERANCE,
    journalCount: grouped.length,
    arLedgerCount: arLedger.length,
    arWarningCount: 0,
    optimized: true
  };

  return { source: 'mongo_ar_ledger_fast', ledgerCollection: 'arLedgers', debts, customerSummary, bySalesman, byDelivery, arLedger, arDiagnostics: [], summary };
}

async function debtInit(query = {}) {
  return {
    source: 'mongo_ar_ledger_fast',
    summary: {
      totalDebt: 0,
      customerDebt: 0,
      orderDebt: 0,
      overdueDebt: 0,
      note: 'Màn công nợ chỉ tải danh sách khi người dùng nhập khách/NVBH/NVGH để tránh quét toàn bộ AR Ledger.'
    },
    filters: {
      maxListLimit: 100,
      maxAutocompleteLimit: 20
    }
  };
}

async function debtCustomers(query = {}) {
  return debtReport({ ...query, limit: getSafeLimit(query.limit, 50, 100) });
}

async function debtCustomerDetail(query = {}) {
  const customerCode = query.customerCode || query.code || query.customerId || query.id || query.q;
  return debtReport({ ...query, customerCode, q: query.q || customerCode, includePaid: query.includePaid || '1', limit: getSafeLimit(query.limit, 100, 100) });
}

async function debtArLedger(query = {}) {
  const page = getPage(query.page);
  const limit = getSafeLimit(query.limit, 100, 200);
  const skip = (page - 1) * limit;
  const match = await buildDebtLedgerMatchWithStaffScope(query);
  if (query.q || query.keyword || query.search) {
    const rx = new RegExp(escapeRegExp(query.q || query.keyword || query.search), 'i');
    pushDebtLedgerAnd(match, { $or: [{ code: rx }, { refCode: rx }, { orderCode: rx }, { salesOrderCode: rx }, { customerCode: rx }, { customerName: rx }, { customerId: rx }, { type: rx }, { note: rx }] });
  }
  const rows = await ArLedger.find(match).sort({ date: -1, createdAt: -1 }).skip(skip).limit(limit + 1).lean().catch(() => []);
  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const arLedger = data.map(normalizeArLedgerEntry);
  const summary = {
    page,
    limit,
    hasMore,
    arLedgerCount: arLedger.length,
    totalDebit: sum(arLedger, (row) => row.debit),
    totalCredit: sum(arLedger, (row) => row.credit),
    totalDebt: sum(arLedger, (row) => row.balanceEffect),
    arWarningCount: 0,
    optimized: true
  };
  return { source: 'mongo_ar_ledger_fast', ledgerCollection: 'arLedgers', debts: [], customerSummary: [], bySalesman: [], byDelivery: [], arLedger, arDiagnostics: [], summary };
}

function buildDebtPersonSummary(rows = [], options = {}) {
  const codeKey = options.codeKey || 'salesmanCode';
  const nameKey = options.nameKey || 'salesmanName';
  const role = options.role || 'person';
  const map = new Map();

  rows.forEach((row) => {
    const code = String(row[codeKey] || '').trim();
    const name = String(row[nameKey] || '').trim();
    const key = code || name || 'UNASSIGNED';
    if (!map.has(key)) {
      map.set(key, {
        role,
        code,
        name: name || (code ? '' : 'Chưa gán'),
        label: code && name ? `${code} - ${name}` : (name || code || 'Chưa gán'),
        customerKeys: new Set(),
        customers: 0,
        orders: 0,
        paidOrders: 0,
        overdueOrders: 0,
        openOrders: 0,
        debit: 0,
        credit: 0,
        receiptAmount: 0,
        returnAmount: 0,
        bonusAmount: 0,
        debt: 0,
        maxOverdueDays: 0,
        maxAgingDays: 0
      });
    }

    const target = map.get(key);
    const customerKey = row.customerId || row.customerCode || row.customerName;
    if (customerKey) target.customerKeys.add(String(customerKey));
    target.orders += 1;
    if (row.status === 'paid') target.paidOrders += 1;
    if (row.status === 'overdue') target.overdueOrders += 1;
    if (row.status === 'open') target.openOrders += 1;
    target.debit += toNumber(row.debit);
    target.credit += toNumber(row.credit);
    target.receiptAmount += toNumber(row.receiptAmount);
    target.returnAmount += toNumber(row.returnAmount);
    target.bonusAmount += toNumber(row.bonusAmount);
    target.debt += normalizeDebtAmount(row.debt);
    target.maxOverdueDays = Math.max(target.maxOverdueDays, toNumber(row.overdueDays));
    target.maxAgingDays = Math.max(target.maxAgingDays, toNumber(row.agingDays));
  });

  return Array.from(map.values())
    .map((row) => {
      const { customerKeys, ...plain } = row;
      return {
        ...plain,
        customers: customerKeys.size,
        collectionRate: plain.debit > 0 ? Math.round((plain.credit / plain.debit) * 10000) / 100 : 0,
        debt: Math.max(0, normalizeDebtAmount(plain.debt)),
        debtZeroTolerance: DEBT_ZERO_TOLERANCE,
        status: hasOpenDebt(plain.debt) ? (plain.overdueOrders > 0 ? 'overdue' : 'open') : 'paid'
      };
    })
    .sort((a, b) => b.debt - a.debt || b.overdueOrders - a.overdueOrders || String(a.label).localeCompare(String(b.label)));
}

async function debtBySalesmanReport(query = {}) {
  const report = await debtReport(query);
  return {
    source: report.source,
    ledgerCollection: report.ledgerCollection,
    bySalesman: report.bySalesman,
    summary: report.summary
  };
}

async function debtByDeliveryReport(query = {}) {
  const report = await debtReport(query);
  return {
    source: report.source,
    ledgerCollection: report.ledgerCollection,
    byDelivery: report.byDelivery,
    summary: report.summary
  };
}

async function salesReport(query = {}) {
  let orders = await SalesOrder.find({}).sort({ date: -1, createdAt: -1 }).lean();
  orders = orders.filter(isActive).filter((row) => matchDate(row, query));
  orders = filterByQuery(orders, query, ['code', 'orderCode', 'customerCode', 'customerName', 'salesmanName', 'staffName']);

  const rows = orders.map((order) => ({
    id: order.id || String(order._id || ''),
    code: order.code || order.orderCode || '',
    date: dateUtil.toDateOnly(order.date || order.orderDate || order.createdAt),
    customerCode: order.customerCode || '',
    customerName: order.customerName || '',
    salesmanCode: order.salesmanCode || order.salesStaffCode || order.nvbhCode || '',
    salesmanName: order.salesmanName || order.salesStaffName || order.nvbhName || '',
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
    deliveryDate: dateUtil.toDateOnly(order.deliveryDate || order.date || order.createdAt),
    deliveryStaffCode: order.deliveryStaffCode || order.deliveryCode || order.nvghCode || '',
    deliveryStaffName: order.deliveryStaffName || order.deliveryName || order.nvghName || '',
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
  stockCardReport,
  debtReport,
  debtInit,
  debtCustomers,
  debtCustomerDetail,
  debtArLedger,
  debtBySalesmanReport,
  debtByDeliveryReport,
  dashboardReport,
  salesReport,
  financeReport,
  deliveryReport
};
