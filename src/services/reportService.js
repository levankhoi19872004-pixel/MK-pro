const { calculateInventory } = require('./inventoryService');
const { getReceivableSummary, listReceivableLedger } = require('./receivableService');
const { listCash, getBalance } = require('./cashService');

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function cleanText(value) {
  return String(value || '').trim();
}

function cleanCode(value) {
  return cleanText(value).toUpperCase();
}

function ensureReportShape(data) {
  if (!data.documents) data.documents = [];
  if (!data.postings) data.postings = [];
  if (!data.receivablePostings) data.receivablePostings = [];
  if (!data.cashLedger) data.cashLedger = [];
  if (!data.products) data.products = [];
  return data;
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function endOfDate(value) {
  if (!value) return null;
  const date = parseDate(value);
  if (!date) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    date.setHours(23, 59, 59, 999);
  }
  return date;
}

function isInDateRange(dateValue, query = {}) {
  const date = parseDate(dateValue);
  if (!date) return true;

  const fromDate = parseDate(query.fromDate);
  const toDate = endOfDate(query.toDate);

  if (fromDate && date < fromDate) return false;
  if (toDate && date > toDate) return false;
  return true;
}

function filterDocuments(data, type, query = {}) {
  ensureReportShape(data);
  const status = cleanCode(query.status);
  const customerCode = cleanCode(query.customerCode);
  const staffCode = cleanCode(query.staffCode);
  const keyword = cleanText(query.keyword || query.q).toLowerCase();

  return data.documents
    .filter(document => document.type === type)
    .filter(document => !status || cleanCode(document.status) === status)
    .filter(document => !customerCode || cleanCode(document.customerCode) === customerCode)
    .filter(document => !staffCode || cleanCode(document.staffCode) === staffCode)
    .filter(document => isInDateRange(document.orderDate || document.receiptDate || document.paymentDate || document.createdAt, query))
    .filter(document => {
      if (!keyword) return true;
      return [
        document.documentNo,
        document.customerCode,
        document.customerName,
        document.supplierCode,
        document.supplierName,
        document.staffCode,
        document.staffName,
        document.note
      ].some(value => String(value || '').toLowerCase().includes(keyword));
    });
}

function summarizeSales(data, query = {}) {
  const orders = filterDocuments(data, 'SALES_ORDER', { ...query, status: query.status || 'POSTED' });

  const productMap = new Map();
  const customerMap = new Map();
  const staffMap = new Map();

  orders.forEach(order => {
    const customerKey = cleanCode(order.customerCode) || 'NO_CUSTOMER';
    if (!customerMap.has(customerKey)) {
      customerMap.set(customerKey, {
        customerCode: order.customerCode || '',
        customerName: order.customerName || '',
        totalOrders: 0,
        totalQuantity: 0,
        totalAmount: 0,
        paidAmount: 0,
        debtAmount: 0
      });
    }

    const customer = customerMap.get(customerKey);
    customer.totalOrders += 1;
    customer.totalQuantity += toNumber(order.totalQuantity, 0);
    customer.totalAmount += toNumber(order.totalAmount, 0);
    customer.paidAmount += toNumber(order.paidAmount, 0);
    customer.debtAmount += toNumber(order.debtAmount, 0);

    const staffKey = cleanCode(order.staffCode) || 'NO_STAFF';
    if (!staffMap.has(staffKey)) {
      staffMap.set(staffKey, {
        staffCode: order.staffCode || '',
        staffName: order.staffName || '',
        totalOrders: 0,
        totalQuantity: 0,
        totalAmount: 0,
        paidAmount: 0,
        debtAmount: 0
      });
    }

    const staff = staffMap.get(staffKey);
    staff.totalOrders += 1;
    staff.totalQuantity += toNumber(order.totalQuantity, 0);
    staff.totalAmount += toNumber(order.totalAmount, 0);
    staff.paidAmount += toNumber(order.paidAmount, 0);
    staff.debtAmount += toNumber(order.debtAmount, 0);

    (order.items || []).forEach(item => {
      const productKey = cleanCode(item.productCode) || 'NO_PRODUCT';
      if (!productMap.has(productKey)) {
        productMap.set(productKey, {
          productCode: item.productCode || '',
          productName: item.productName || '',
          unit: item.unit || '',
          totalQuantity: 0,
          totalAmount: 0
        });
      }

      const product = productMap.get(productKey);
      product.productName = product.productName || item.productName || '';
      product.unit = product.unit || item.unit || '';
      product.totalQuantity += toNumber(item.quantity, 0);
      product.totalAmount += toNumber(item.amount, 0) - toNumber(item.discountAmount, 0);
    });
  });

  return {
    totalOrders: orders.length,
    totalQuantity: orders.reduce((sum, order) => sum + toNumber(order.totalQuantity, 0), 0),
    grossAmount: orders.reduce((sum, order) => sum + toNumber(order.grossAmount, 0), 0),
    discountAmount: orders.reduce((sum, order) => sum + toNumber(order.discountAmount, 0), 0),
    totalAmount: orders.reduce((sum, order) => sum + toNumber(order.totalAmount, 0), 0),
    paidAmount: orders.reduce((sum, order) => sum + toNumber(order.paidAmount, 0), 0),
    debtAmount: orders.reduce((sum, order) => sum + toNumber(order.debtAmount, 0), 0),
    byProduct: Array.from(productMap.values()).sort((a, b) => b.totalAmount - a.totalAmount),
    byCustomer: Array.from(customerMap.values()).sort((a, b) => b.totalAmount - a.totalAmount),
    byStaff: Array.from(staffMap.values()).sort((a, b) => b.totalAmount - a.totalAmount),
    rows: orders.sort((a, b) => new Date(b.orderDate || b.createdAt) - new Date(a.orderDate || a.createdAt))
  };
}

function summarizePurchases(data, query = {}) {
  const receipts = filterDocuments(data, 'WAREHOUSE_RECEIPT', { ...query, status: query.status || 'POSTED' });

  return {
    totalReceipts: receipts.length,
    totalQuantity: receipts.reduce((sum, receipt) => sum + toNumber(receipt.totalQuantity, 0), 0),
    totalAmount: receipts.reduce((sum, receipt) => sum + toNumber(receipt.totalAmount, 0), 0),
    rows: receipts.sort((a, b) => new Date(b.receiptDate || b.createdAt) - new Date(a.receiptDate || a.createdAt))
  };
}

function summarizeStock(data, query = {}) {
  ensureReportShape(data);
  const rows = calculateInventory(data, query);
  const onlyPositive = query.onlyPositive === true || query.onlyPositive === 'true';
  const onlyNegative = query.onlyNegative === true || query.onlyNegative === 'true';
  const onlyZero = query.onlyZero === true || query.onlyZero === 'true';

  const filteredRows = rows.filter(row => {
    if (onlyPositive && toNumber(row.stock, 0) <= 0) return false;
    if (onlyNegative && toNumber(row.stock, 0) >= 0) return false;
    if (onlyZero && toNumber(row.stock, 0) !== 0) return false;
    return true;
  });

  return {
    totalRows: filteredRows.length,
    totalQtyIn: filteredRows.reduce((sum, row) => sum + toNumber(row.qtyIn, 0), 0),
    totalQtyOut: filteredRows.reduce((sum, row) => sum + toNumber(row.qtyOut, 0), 0),
    totalStock: filteredRows.reduce((sum, row) => sum + toNumber(row.stock, 0), 0),
    totalAmountIn: filteredRows.reduce((sum, row) => sum + toNumber(row.amountIn, 0), 0),
    totalAmountOut: filteredRows.reduce((sum, row) => sum + toNumber(row.amountOut, 0), 0),
    rows: filteredRows
  };
}

function summarizeReceivables(data, query = {}) {
  const summary = getReceivableSummary(data, query);
  const ledger = listReceivableLedger(data, query);

  return {
    ...summary,
    totalLedgerRows: ledger.length,
    ledger
  };
}

function summarizeCash(data, query = {}) {
  ensureReportShape(data);
  const keyword = cleanText(query.keyword || query.q).toLowerCase();
  const type = cleanCode(query.type);

  const rows = listCash(data)
    .filter(item => !type || cleanCode(item.type) === type)
    .filter(item => isInDateRange(item.occurredAt || item.createdAt, query))
    .filter(item => {
      if (!keyword) return true;
      return [item.content, item.refType, item.refCode, item.note].some(value => String(value || '').toLowerCase().includes(keyword));
    })
    .sort((a, b) => new Date(b.occurredAt || b.createdAt) - new Date(a.occurredAt || a.createdAt));

  const totalIn = rows.filter(item => item.type === 'IN').reduce((sum, item) => sum + toNumber(item.amount, 0), 0);
  const totalOut = rows.filter(item => item.type === 'OUT').reduce((sum, item) => sum + toNumber(item.amount, 0), 0);

  return {
    totalRows: rows.length,
    totalIn,
    totalOut,
    balanceInRange: totalIn - totalOut,
    currentBalance: getBalance(data),
    rows
  };
}

function buildDashboard(data, query = {}) {
  const sales = summarizeSales(data, query);
  const purchases = summarizePurchases(data, query);
  const stock = summarizeStock(data, query);
  const receivables = summarizeReceivables(data, { ...query, onlyDebt: query.onlyDebt || false });
  const cash = summarizeCash(data, query);

  return {
    period: {
      fromDate: query.fromDate || '',
      toDate: query.toDate || ''
    },
    sales: {
      totalOrders: sales.totalOrders,
      totalQuantity: sales.totalQuantity,
      totalAmount: sales.totalAmount,
      paidAmount: sales.paidAmount,
      debtAmount: sales.debtAmount
    },
    purchases: {
      totalReceipts: purchases.totalReceipts,
      totalQuantity: purchases.totalQuantity,
      totalAmount: purchases.totalAmount
    },
    stock: {
      totalRows: stock.totalRows,
      totalStock: stock.totalStock,
      totalQtyIn: stock.totalQtyIn,
      totalQtyOut: stock.totalQtyOut
    },
    receivables: {
      totalCustomers: receivables.totalCustomers,
      totalDebitAmount: receivables.totalDebitAmount,
      totalCreditAmount: receivables.totalCreditAmount,
      totalBalance: receivables.totalBalance
    },
    cash: {
      totalIn: cash.totalIn,
      totalOut: cash.totalOut,
      balanceInRange: cash.balanceInRange,
      currentBalance: cash.currentBalance
    }
  };
}

module.exports = {
  summarizeSales,
  summarizePurchases,
  summarizeStock,
  summarizeReceivables,
  summarizeCash,
  buildDashboard
};
