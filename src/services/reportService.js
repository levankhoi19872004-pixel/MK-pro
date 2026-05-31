'use strict';

const Product = require('../models/Product');
const Inventory = require('../models/Inventory');
const InventoryLegacy = require('../models/InventoryLegacy');
const StockTransaction = require('../models/StockTransaction');
const SalesOrder = require('../models/SalesOrder');
const Customer = require('../models/Customer');
const MasterOrder = require('../models/MasterOrder');
const Receipt = require('../models/Receipt');
const Payment = require('../models/Payment');
const Cashbook = require('../models/Cashbook');
const Bankbook = require('../models/Bankbook');
const ReturnOrder = require('../models/ReturnOrder');
const ImportOrder = require('../models/ImportOrder');
const { normalizeText, toNumber } = require('../utils/common.util');
const { DEBT_ZERO_TOLERANCE, normalizeDebtAmount, hasOpenDebt, isOverpaid } = require('../constants/finance.constants');

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

function buildStockTxFilter(query = {}) {
  const filter = {};
  if (query.productCode) filter.productCode = String(query.productCode).trim();
  if (query.warehouseCode) filter.warehouseCode = String(query.warehouseCode).trim();
  if (query.date || query.dateFrom || query.dateTo) {
    filter.date = {};
    if (query.dateFrom) filter.date.$gte = String(query.dateFrom).slice(0, 10);
    if (query.dateTo) filter.date.$lte = String(query.dateTo).slice(0, 10);
    if (query.date) filter.date = String(query.date).slice(0, 10);
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
    const dateFrom = String(query.dateFrom || '0000-01-01').slice(0, 10);
    const dateTo = String(query.dateTo || query.asOfDate || today()).slice(0, 10);
    const [transactions, products] = await Promise.all([
      StockTransaction.find({}).sort({ date: 1, createdAt: 1, productCode: 1 }).lean(),
      Product.find({}).lean()
    ]);
    const productMap = new Map(products.map((p) => [String(p.code || p.id || p._id), p]));
    const byKey = new Map();

    transactions.forEach((tx) => {
      const txDate = toDateOnly(tx.date || tx.createdAt);
      if (txDate > dateTo) return;
      const productCode = String(tx.productCode || tx.productId || '').trim();
      const warehouseCode = String(tx.warehouseCode || 'MAIN').trim();
      const key = `${productCode}@@${warehouseCode}`;
      const product = productMap.get(productCode) || {};
      if (!byKey.has(key)) {
        byKey.set(key, {
          productId: tx.productId || product.id || String(product._id || ''),
          productCode,
          productName: tx.productName || product.name || '',
          warehouseCode,
          warehouseName: tx.warehouseName || 'Kho chính',
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
    if (q) stock = stock.filter((row) => [row.productCode, row.productName, row.warehouseCode, row.warehouseName].some((value) => normalizeText(value).includes(q)));
    const summary = stock.reduce((acc, row) => {
      acc.totalRows += 1;
      acc.openingQty += toNumber(row.openingQty);
      acc.importQty += toNumber(row.importQty);
      acc.exportQty += toNumber(row.exportQty);
      acc.returnQty += toNumber(row.returnQty);
      acc.endingQty += toNumber(row.endingQty);
      return acc;
    }, { totalRows: 0, openingQty: 0, importQty: 0, exportQty: 0, returnQty: 0, endingQty: 0 });
    return { source: 'mongo_stock_transactions', dateFrom, dateTo, stock, summary };
  }

  const [snapshotRows, legacyRows, products] = await Promise.all([
    Inventory.find({}).sort({ productCode: 1, warehouseCode: 1 }).lean(),
    InventoryLegacy.find({}).sort({ productCode: 1, warehouseCode: 1 }).lean(),
    Product.find({}).lean()
  ]);

  // Nếu inventorySnapshots chưa được rebuild/migrate nhưng collection inventories cũ đã có dữ liệu,
  // dùng inventories làm nguồn hiển thị tạm để tránh màn hình tồn kho chỉ hiện 1 dòng hoặc tồn = 0.
  // Khi rebuild chuẩn xong, inventorySnapshots sẽ có nhiều dòng hơn và tự được ưu tiên.
  const snapshotTotalQty = snapshotRows.reduce((sum, row) => sum + toNumber(row.onHand ?? row.quantity ?? row.qty ?? row.availableQty), 0);
  const legacyTotalQty = legacyRows.reduce((sum, row) => sum + toNumber(row.onHand ?? row.quantity ?? row.qty ?? row.availableQty), 0);
  const useLegacyInventory = legacyRows.length > snapshotRows.length && (snapshotRows.length <= 1 || snapshotTotalQty <= 0) && legacyTotalQty !== 0;
  const stockRows = useLegacyInventory ? legacyRows : snapshotRows;

  const productMap = new Map(products.map((p) => [String(p.code || p.id || p._id), p]));
  let stock = stockRows.map((row) => {
    const product = productMap.get(String(row.productCode || row.productId || '')) || {};
    const quantity = toNumber(row.onHand ?? row.quantity ?? row.qty ?? row.availableQty);
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
      onHand: quantity,
      reservedQty: toNumber(row.reservedQty),
      availableQty: toNumber(row.availableQty ?? Math.max(0, quantity - toNumber(row.reservedQty))),
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

  return { source: useLegacyInventory ? 'mongo_inventories_legacy_fallback' : 'mongo_inventory_snapshots', stock, summary, inventorySource: useLegacyInventory ? 'inventories' : 'inventorySnapshots' };
}

async function stockCardReport(query = {}) {
  let rows = await StockTransaction.find(buildStockTxFilter(query)).sort({ date: 1, createdAt: 1, productCode: 1 }).lean();
  rows = filterByQuery(rows, query, ['productCode', 'productName', 'warehouseCode', 'refCode', 'refType', 'type']);
  let runningByKey = new Map();
  const transactions = rows.map((tx) => {
    const key = `${tx.productCode || ''}@@${tx.warehouseCode || 'MAIN'}`;
    const running = toNumber(runningByKey.get(key)) + stockQty(tx);
    runningByKey.set(key, running);
    return {
      id: tx.id || String(tx._id || ''),
      date: toDateOnly(tx.date || tx.createdAt),
      productCode: tx.productCode || '',
      productName: tx.productName || '',
      warehouseCode: tx.warehouseCode || 'MAIN',
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
  // Công nợ chỉ phát sinh khi nghiệp vụ giao hàng đã hoàn tất.
  // Không dùng status/ arStatus để thay thế deliveryStatus, vì đơn import/gộp có thể bị gán nhầm status.
  return ['delivered', 'success', 'completed', 'done'].includes(String(order.deliveryStatus || '').toLowerCase());
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
    date: toDateOnly(order.date || order.orderDate || order.createdAt),
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
    salesmanCode: order.salesmanCode || order.staffCode || order.salesStaffCode || '',
    salesmanName: order.salesmanName || order.staffName || order.salesStaffName || '',
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
    date: toDateOnly(row.date || row.createdAt),
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
    date: toDateOnly(row.date || row.createdAt),
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
    date: toDateOnly(row.date || row.createdAt),
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
        date: toDateOnly(receipt.date || receipt.createdAt),
        customerCode: receipt.customerCode || '',
        customerName: receipt.customerName || '',
        amount,
        message: 'Phiếu thu đã Void nhưng chưa có bút toán đảo AR debit.'
      });
    } else if (String(receipt.status || '').toLowerCase() !== 'void' && !hasReceiptCredit && amount > 0) {
      diagnostics.push({
        level: 'warning',
        code: receipt.code || receipt.id || '',
        date: toDateOnly(receipt.date || receipt.createdAt),
        customerCode: receipt.customerCode || '',
        customerName: receipt.customerName || '',
        amount,
        message: 'Phiếu thu đang hiệu lực nhưng chưa thấy bút toán AR credit.'
      });
    }
  });
  return diagnostics;
}

async function debtReport(query = {}) {
  const [orders, journals, receipts, returns, customers] = await Promise.all([
    SalesOrder.find({}).sort({ date: 1, createdAt: 1 }).lean(),
    Payment.find({}).lean().catch(() => []),
    Receipt.find({}).lean(),
    ReturnOrder.find({}).lean(),
    Customer.find({}).lean().catch(() => [])
  ]);

  const activeOrders = orders.filter(isActive).filter((order) => matchDate(order, query));
  const orderByKey = new Map();
  activeOrders.forEach((order) => {
    const id = String(order.id || order._id || '').trim();
    const code = String(order.code || order.orderCode || '').trim();
    if (id) orderByKey.set(id, order);
    if (code) orderByKey.set(code, order);
  });
  const ledger = activeLedgerRows(journals).filter((entry) => {
    const type = String(entry.type || '').toLowerCase();
    const isSaleDebit = type.includes('sale') && toNumber(entry.debit || entry.amount) > 0;
    if (!isSaleDebit) return true;
    const orderKey = getLedgerOrderKey(entry);
    const order = orderByKey.get(orderKey);
    return order ? isDeliveredForAR(order) : true;
  });
  const ledgerKeys = new Set(ledger.map(moneyDocKey).filter(Boolean));

  // ERP/DMS chuẩn: báo cáo công nợ đọc từ AR Ledger (collection journals).
  // Với dữ liệu cũ chưa được rebuild journal, tạo dòng backfill ảo khi báo cáo để không mất số liệu.
  activeOrders.forEach((order) => {
    const hasSaleLedger = ledger.some((row) => String(row.type || '').toLowerCase().includes('sale') && isLedgerForOrder(row, order));
    if (!hasSaleLedger) {
      const row = makeVirtualSaleLedger(order);
      if (row) ledger.push(row);
    }
  });

  returns.filter(isActive).forEach((row) => {
    const key = moneyDocKey(row);
    const hasReturnLedger = ledger.some((entry) => String(entry.type || '').toLowerCase().includes('return') && (entry.refId === row.id || entry.refCode === row.code || moneyDocKey(entry) === key));
    if (!hasReturnLedger) {
      const virtual = makeVirtualReturnLedger(row);
      if (virtual) ledger.push(virtual);
    }
  });

  receipts.filter(isActive).forEach((row) => {
    const hasReceiptLedger = ledgerKeys.has(String(row.id || '').trim()) || ledgerKeys.has(String(row.code || '').trim()) || ledger.some((entry) => entry.refId === row.id || entry.refCode === row.code);
    if (!hasReceiptLedger) {
      const virtual = makeVirtualReceiptLedger(row);
      if (virtual) ledger.push(virtual);
    }
  });

  const customerMeta = new Map();
  customers.filter(isActive).forEach((customer) => {
    const meta = {
      customerId: String(customer.id || customer._id || '').trim(),
      customerCode: String(customer.code || customer.customerCode || '').trim(),
      customerName: customer.name || customer.customerName || '',
      phone: customer.phone || customer.customerPhone || '',
      address: customer.address || customer.customerAddress || '',
      salesmanCode: customer.salesmanCode || customer.staffCode || customer.salesStaffCode || '',
      salesmanName: customer.salesmanName || customer.staffName || customer.salesStaffName || '',
      deliveryStaffCode: customer.deliveryStaffCode || customer.deliveryCode || customer.deliveryStaff || '',
      deliveryStaffName: customer.deliveryStaffName || customer.deliveryName || ''
    };
    [meta.customerId, meta.customerCode, meta.customerName].forEach((key) => {
      const cleanKey = String(key || '').trim();
      if (cleanKey && !customerMeta.has(cleanKey)) customerMeta.set(cleanKey, meta);
    });
  });

  const orderMeta = new Map();
  activeOrders.forEach((order) => {
    const id = String(order.id || order._id || '').trim();
    const code = String(order.code || order.orderCode || '').trim();
    const cmeta = customerMeta.get(String(order.customerId || '').trim())
      || customerMeta.get(String(order.customerCode || '').trim())
      || customerMeta.get(String(order.customerName || '').trim())
      || {};
    const meta = {
      orderId: id || code,
      orderCode: code || id,
      documentDate: toDateOnly(order.date || order.orderDate || order.createdAt),
      dueDate: toDateOnly(order.dueDate || order.paymentDueDate || order.date || order.createdAt),
      customerId: order.customerId || cmeta.customerId || '',
      customerCode: order.customerCode || cmeta.customerCode || '',
      customerName: order.customerName || cmeta.customerName || '',
      phone: order.phone || order.customerPhone || cmeta.phone || '',
      address: order.address || order.customerAddress || cmeta.address || '',
      salesmanCode: order.salesmanCode || order.staffCode || order.salesStaffCode || cmeta.salesmanCode || '',
      salesmanName: order.salesmanName || order.staffName || order.salesStaffName || cmeta.salesmanName || '',
      deliveryStaffCode: order.deliveryStaffCode || order.deliveryCode || cmeta.deliveryStaffCode || '',
      deliveryStaffName: order.deliveryStaffName || order.deliveryName || cmeta.deliveryStaffName || ''
    };
    if (id) orderMeta.set(id, meta);
    if (code) orderMeta.set(code, meta);
  });

  const byOrder = new Map();
  const unappliedByCustomer = new Map();
  const ensureOrder = (key, seed = {}) => {
    const cleanKey = String(key || seed.orderId || seed.orderCode || '').trim();
    if (!cleanKey) return null;
    if (!byOrder.has(cleanKey)) {
      byOrder.set(cleanKey, {
        orderId: seed.orderId || cleanKey,
        orderCode: seed.orderCode || cleanKey,
        documentDate: seed.documentDate || '',
        dueDate: seed.dueDate || seed.documentDate || '',
        customerId: seed.customerId || '',
        customerCode: seed.customerCode || '',
        customerName: seed.customerName || '',
        phone: seed.phone || '',
        address: seed.address || '',
        salesmanCode: seed.salesmanCode || '',
        salesmanName: seed.salesmanName || '',
        deliveryStaffCode: seed.deliveryStaffCode || '',
        deliveryStaffName: seed.deliveryStaffName || '',
        debit: 0,
        credit: 0,
        receiptAmount: 0,
        returnAmount: 0,
        ledgerEntries: []
      });
    }
    return byOrder.get(cleanKey);
  };

  ledger.filter(isActive).forEach((entry) => {
    const orderKey = getLedgerOrderKey(entry);
    const meta = orderMeta.get(orderKey) || {};
    const debit = toNumber(entry.debit || (String(entry.type || '').toLowerCase().includes('sale') ? entry.amount : 0));
    const credit = toNumber(entry.credit || (!String(entry.type || '').toLowerCase().includes('sale') ? entry.amount : 0));
    const type = String(entry.type || '').toLowerCase();
    const customerKey = getLedgerCustomerKey(entry);

    if (!orderKey && customerKey && (credit > 0 || debit > 0)) {
      // Phiếu thu không gắn đơn được phân bổ theo khách.
      // Nếu phiếu thu bị hủy, bút toán đảo RECEIPT_VOID là debit và sẽ triệt tiêu credit gốc.
      unappliedByCustomer.set(customerKey, (unappliedByCustomer.get(customerKey) || 0) + credit - debit);
      return;
    }

    if (orderKey && !orderMeta.has(orderKey)) {
      // Không đưa bút toán mồ côi vào báo cáo công nợ theo đơn.
      // Đây là nguyên nhân làm danh sách đơn bán một số lượng nhưng báo cáo công nợ lại ra số khác.
      return;
    }

    const target = ensureOrder(orderKey, {
      ...meta,
      orderId: meta.orderId || entry.orderId || entry.refId || '',
      orderCode: meta.orderCode || entry.orderCode || entry.refCode || '',
      documentDate: meta.documentDate || toDateOnly(entry.date || entry.createdAt),
      dueDate: meta.dueDate || toDateOnly(entry.dueDate || entry.date || entry.createdAt),
      customerId: meta.customerId || entry.customerId || '',
      customerCode: meta.customerCode || entry.customerCode || '',
      customerName: meta.customerName || entry.customerName || '',
      salesmanCode: meta.salesmanCode || entry.salesmanCode || '',
      salesmanName: meta.salesmanName || entry.salesmanName || '',
      deliveryStaffCode: meta.deliveryStaffCode || entry.deliveryStaffCode || '',
      deliveryStaffName: meta.deliveryStaffName || entry.deliveryStaffName || ''
    });
    if (!target) return;
    target.debit += debit;
    target.credit += credit;
    if (type.includes('receipt') || type === 'debt') target.receiptAmount += credit - debit;
    if (type.includes('return')) target.returnAmount += credit - debit;
    target.ledgerEntries.push(entry);
  });

  // Phân bổ khoản thu theo khách chưa gắn đơn vào các đơn còn nợ cũ nhất của khách.
  Array.from(byOrder.values())
    .sort((a, b) => String(a.documentDate).localeCompare(String(b.documentDate)))
    .forEach((row) => {
      const keys = [row.customerId, row.customerCode, row.customerName].map((v) => String(v || '').trim()).filter(Boolean);
      for (const key of keys) {
        let available = toNumber(unappliedByCustomer.get(key));
        if (available <= 0) continue;
        const currentDebt = Math.max(0, row.debit - row.credit);
        const applied = Math.min(currentDebt, available);
        if (applied > 0) {
          row.credit += applied;
          row.receiptAmount += applied;
          unappliedByCustomer.set(key, available - applied);
        }
      }
    });

  const now = today();
  let debts = Array.from(byOrder.values()).map((row) => {
    const rawDebt = toNumber(row.debit) - toNumber(row.credit);
    const debt = normalizeDebtAmount(rawDebt);
    const overpaidAmount = Math.max(0, -debt);
    const overdueDays = hasOpenDebt(debt) ? Math.max(0, daysBetween(now, row.dueDate || row.documentDate)) : 0;
    const status = isOverpaid(debt) ? 'overpaid' : (hasOpenDebt(debt) ? (overdueDays > 0 ? 'overdue' : 'open') : 'paid');
    return {
      ...row,
      paidOnOrder: 0,
      receiptAmount: Math.max(0, toNumber(row.receiptAmount)),
      returnAmount: Math.max(0, toNumber(row.returnAmount)),
      debt,
      rawDebt: debt,
      overpaidAmount,
      debtZeroTolerance: DEBT_ZERO_TOLERANCE,
      overdueDays,
      agingDays: row.documentDate ? Math.max(0, daysBetween(now, row.documentDate)) : 0,
      status
    };
  });

  debts = filterByQuery(debts, query, ['orderCode', 'customerCode', 'customerName', 'salesmanName', 'deliveryStaffName']);
  if (query.salesman) debts = debts.filter((row) => normalizeText(row.salesmanName || row.salesmanCode).includes(normalizeText(query.salesman)));
  if (query.delivery) debts = debts.filter((row) => normalizeText(row.deliveryStaffName || row.deliveryStaffCode).includes(normalizeText(query.delivery)));
  if (query.status) debts = debts.filter((row) => row.status === query.status);

  // Tab Tổng công nợ là báo cáo quản trị: mặc định chỉ hiển thị khách còn nợ > 0.
  // Khách đã tất toán chỉ xuất hiện khi người dùng lọc trạng thái "Đã tất toán" hoặc truyền includePaid=1.
  const includePaidCustomers = String(query.includePaid || '').trim() === '1' || String(query.status || '') === 'paid';
  // Mặc định hiển thị cả dòng nợ âm để kế toán thấy lỗi thu vượt/thiếu bút toán phát sinh nợ,
  // không che âm về 0.
  const reportDebtRows = includePaidCustomers ? debts : debts.filter((row) => hasOpenDebt(row.debt) || isOverpaid(row.debt));

  const customerMap = new Map();
  reportDebtRows.forEach((row) => {
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
      debt: normalizeDebtAmount(row.debt),
      overdueDays: toNumber(row.overdueDays),
      agingDays: toNumber(row.agingDays),
      status: row.status,
      salesmanCode: row.salesmanCode,
      salesmanName: row.salesmanName,
      deliveryStaffCode: row.deliveryStaffCode,
      deliveryStaffName: row.deliveryStaffName
    });
    target.overdueDays = Math.max(toNumber(target.overdueDays), toNumber(row.overdueDays));
    target.agingDays = Math.max(toNumber(target.agingDays), toNumber(row.agingDays));
    if (!target.salesmanCode && !target.salesmanName) {
      target.salesmanCode = row.salesmanCode || '';
      target.salesmanName = row.salesmanName || '';
    }
    if (!target.deliveryStaffCode && !target.deliveryStaffName) {
      target.deliveryStaffCode = row.deliveryStaffCode || '';
      target.deliveryStaffName = row.deliveryStaffName || '';
    }
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
    .filter((row) => includePaidCustomers ? (row.debit || row.credit || row.debt) : (hasOpenDebt(row.debt) || isOverpaid(row.debt)))
    .sort((a, b) => Math.abs(b.debt) - Math.abs(a.debt) || b.overdueDays - a.overdueDays || String(a.customerName).localeCompare(String(b.customerName)));

  const bySalesman = buildDebtPersonSummary(reportDebtRows, { codeKey: 'salesmanCode', nameKey: 'salesmanName', role: 'salesman' });
  const byDelivery = buildDebtPersonSummary(reportDebtRows, { codeKey: 'deliveryStaffCode', nameKey: 'deliveryStaffName', role: 'delivery' });
  let arLedger = ledger.map(normalizeArLedgerEntry).sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.code).localeCompare(String(a.code)));
  arLedger = filterByQuery(arLedger, query, ['code', 'refCode', 'orderCode', 'customerCode', 'customerName', 'type', 'note']);
  const arDiagnostics = buildArLedgerDiagnostics(receipts, ledger);

  const summary = {
    orderCount: reportDebtRows.length,
    customerCount: customerSummary.length,
    overdueCount: reportDebtRows.filter((row) => row.status === 'overdue').length,
    totalDebit: sum(reportDebtRows, (row) => row.debit),
    totalCredit: sum(reportDebtRows, (row) => row.credit),
    totalDebt: sum(reportDebtRows, (row) => normalizeDebtAmount(row.debt)),
    totalPositiveDebt: sum(reportDebtRows.filter((row) => hasOpenDebt(row.debt)), (row) => normalizeDebtAmount(row.debt)),
    totalOverpaid: sum(reportDebtRows.filter((row) => isOverpaid(row.debt)), (row) => Math.abs(normalizeDebtAmount(row.debt))),
    debtZeroTolerance: DEBT_ZERO_TOLERANCE,
    journalCount: ledger.length,
    arLedgerCount: arLedger.length,
    arWarningCount: arDiagnostics.length,
    unappliedCredit: Array.from(unappliedByCustomer.values()).reduce((total, amount) => total + Math.max(0, toNumber(amount)), 0)
  };

  return { source: 'mongo_ar_ledger', ledgerCollection: 'journals', debts, customerSummary, bySalesman, byDelivery, arLedger, arDiagnostics, summary };
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
  stockCardReport,
  debtReport,
  debtBySalesmanReport,
  debtByDeliveryReport,
  dashboardReport,
  salesReport,
  financeReport,
  deliveryReport
};
