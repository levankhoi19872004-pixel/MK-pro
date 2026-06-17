'use strict';

const Product = require('../../models/Product');
const StockTransaction = require('../../models/StockTransaction');
const inventoryStockService = require('../inventoryStock.service');
const { STOCK_WAREHOUSE_CODE, STOCK_WAREHOUSE_NAME } = require('../../constants/business.constants');
const {
  businessDateStages,
  businessDate,
  dateRange,
  firstText,
  lower,
  paginate,
  text,
  toNumber
} = require('./ReportDomainUtils');

function transactionQuantity(row = {}) {
  const explicit = row.quantity ?? row.qty;
  const direction = lower(row.direction);
  if (explicit !== undefined && explicit !== null && text(explicit) !== '') {
    const value = toNumber(explicit);
    // Dấu âm trên ledger là tín hiệu mạnh nhất (đặc biệt với reversal). Chỉ dùng
    // direction để chuyển các bản ghi legacy OUT đang lưu số dương.
    if (value < 0) return value;
    if (direction === 'out' && value > 0) return -value;
    return value;
  }
  const inQty = Math.abs(toNumber(row.inQty));
  const outQty = Math.abs(toNumber(row.outQty));
  if (inQty || outQty) return inQty - outQty;
  return 0;
}

function transactionCategory(row = {}, quantity = transactionQuantity(row)) {
  const type = [row.type, row.transactionType, row.sourceType, row.refType].map((value) => text(value).toUpperCase()).join(' ');
  const reversal = Boolean(row.reversedFrom) || type.includes('REVERS') || type.includes('VOID') || type.includes('CANCEL');
  if (type.includes('RETURN') || type.includes('TRA_HANG') || type.includes('TRA HANG')) return reversal ? 'return_reversal' : 'return';
  if (type.includes('IMPORT') || type.includes('PURCHASE') || type.includes('NHAP')) return reversal ? 'import_reversal' : 'import';
  if (type.includes('SALE') || type.includes('DELIVERY') || type.includes('XUAT')) return reversal ? 'sale_reversal' : 'sale';
  if (type.includes('ADJUST') || type.includes('OPENING') || type.includes('REBUILD')) return 'adjustment';
  return quantity >= 0 ? 'other_in' : 'other_out';
}

function productCodeOf(row = {}) {
  return firstText(row, ['productCode', 'productId', 'code', 'sku']);
}

function productNameOf(row = {}, product = {}) {
  return firstText(row, ['productName', 'name']) || firstText(product, ['name', 'productName']);
}

async function loadProducts() {
  const products = await Product.find({})
    .select('id code productCode sku name productName unit baseUnit conversionRate packing')
    .lean();
  const map = new Map();
  for (const product of products) {
    const aliases = [product.code, product.productCode, product.sku, product.id, product._id]
      .map((value) => text(value).toUpperCase())
      .filter(Boolean);
    for (const alias of aliases) map.set(alias, product);
  }
  return map;
}

function queryTextMatches(row = {}, q = '') {
  const needle = text(q).toUpperCase();
  if (!needle) return true;
  return [row.productCode, row.productName].some((value) => text(value).toUpperCase().includes(needle));
}

async function loadTransactionsUntil(dateTo) {
  return StockTransaction.aggregate([
    ...businessDateStages('0000-01-01', dateTo, ['date'], '_reportBusinessDate'),
    { $sort: { _reportBusinessDate: 1, createdAt: 1, _id: 1 } }
  ]).allowDiskUse(true).exec();
}

async function loadTransactionsRange(dateFrom, dateTo) {
  if (!dateFrom || !dateTo || dateFrom > dateTo) return [];
  return StockTransaction.aggregate([
    ...businessDateStages(dateFrom, dateTo, ['date'], '_reportBusinessDate'),
    { $sort: { _reportBusinessDate: 1, createdAt: 1, _id: 1 } }
  ]).allowDiskUse(true).exec();
}

async function currentStockReport(query = {}) {
  const result = await inventoryStockService.getInventorySummary({
    q: query.q || query.search || query.keyword || ''
  });
  const allRows = (result.stock || []).map((row) => ({
    ...row,
    quantity: toNumber(row.onHand ?? row.quantity ?? row.qty),
    qty: toNumber(row.onHand ?? row.quantity ?? row.qty),
    onHand: toNumber(row.onHand ?? row.quantity ?? row.qty),
    reservedQty: toNumber(row.reservedQty),
    availableQty: toNumber(row.availableQty)
  }));
  const paged = paginate(allRows, query, { defaultLimit: 50, maxLimit: 200 });
  return {
    source: 'mongo_inventories_canonical',
    inventorySource: 'inventories',
    reportMode: 'current_stock',
    stock: paged.rows,
    items: paged.rows,
    meta: paged.meta,
    summary: result.summary,
    negativeStockCount: result.negativeStockCount,
    negativeStockRows: result.negativeStockRows || []
  };
}

async function inventoryMovementReport(query = {}) {
  const { dateFrom, dateTo } = dateRange(query);
  const today = require('../../utils/date.util').todayVN();
  const [transactions, productMap, currentStock, futureTransactions] = await Promise.all([
    loadTransactionsUntil(dateTo),
    loadProducts(),
    currentStockReport({ full: '1', export: '1' }),
    dateTo < today ? loadTransactionsRange(dateTo, today) : Promise.resolve([])
  ]);
  const grouped = new Map();

  for (const transaction of transactions) {
    const transactionDate = transaction._reportBusinessDate || businessDate(transaction, ['date']);
    if (!transactionDate || transactionDate > dateTo) continue;
    const productCode = productCodeOf(transaction).toUpperCase();
    if (!productCode) continue;
    const product = productMap.get(productCode) || {};
    if (!grouped.has(productCode)) {
      grouped.set(productCode, {
        productId: firstText(transaction, ['productId']) || firstText(product, ['id', '_id']),
        productCode,
        productName: productNameOf(transaction, product),
        warehouseCode: STOCK_WAREHOUSE_CODE,
        warehouseName: STOCK_WAREHOUSE_NAME,
        unit: firstText(product, ['baseUnit', 'unit']) || firstText(transaction, ['unit']),
        openingQty: 0,
        importQty: 0,
        returnQty: 0,
        otherInQty: 0,
        saleQty: 0,
        reversalOutQty: 0,
        otherOutQty: 0,
        adjustmentQty: 0,
        inQty: 0,
        outQty: 0,
        endingQty: 0,
        transactionCount: 0
      });
    }

    const row = grouped.get(productCode);
    const quantity = transactionQuantity(transaction);
    if (transactionDate < dateFrom) {
      row.openingQty += quantity;
      row.endingQty += quantity;
      continue;
    }

    row.transactionCount += 1;
    row.endingQty += quantity;
    if (quantity > 0) row.inQty += quantity;
    else if (quantity < 0) row.outQty += Math.abs(quantity);

    const category = transactionCategory(transaction, quantity);
    if (quantity > 0) {
      if (category === 'import') row.importQty += quantity;
      else if (category === 'return') row.returnQty += quantity;
      else if (category === 'sale_reversal') row.otherInQty += quantity;
      else if (category === 'adjustment') row.adjustmentQty += quantity;
      else row.otherInQty += quantity;
    } else if (quantity < 0) {
      const absolute = Math.abs(quantity);
      if (category === 'sale') row.saleQty += absolute;
      else if (category.endsWith('_reversal')) row.reversalOutQty += absolute;
      else if (category === 'adjustment') row.adjustmentQty -= absolute;
      else row.otherOutQty += absolute;
    }
  }

  const currentByProduct = new Map((currentStock.stock || []).map((row) => [
    text(row.productCode).toUpperCase(),
    row
  ]));
  const futureNetByProduct = new Map();
  for (const transaction of futureTransactions) {
    const transactionDate = transaction._reportBusinessDate || businessDate(transaction, ['date']);
    if (!transactionDate || transactionDate <= dateTo) continue;
    const code = productCodeOf(transaction).toUpperCase();
    if (!code) continue;
    futureNetByProduct.set(code, toNumber(futureNetByProduct.get(code)) + transactionQuantity(transaction));
  }
  for (const [productCode, current] of currentByProduct.entries()) {
    if (grouped.has(productCode)) continue;
    grouped.set(productCode, {
      productId: current.productId || current.id || '',
      productCode,
      productName: current.productName || '',
      warehouseCode: STOCK_WAREHOUSE_CODE,
      warehouseName: STOCK_WAREHOUSE_NAME,
      unit: current.unit || current.baseUnit || '',
      openingQty: 0,
      importQty: 0,
      returnQty: 0,
      otherInQty: 0,
      saleQty: 0,
      reversalOutQty: 0,
      otherOutQty: 0,
      adjustmentQty: 0,
      inQty: 0,
      outQty: 0,
      endingQty: 0,
      transactionCount: 0
    });
  }

  let rows = Array.from(grouped.values()).map((row) => {
    const ledgerOpeningQty = toNumber(row.openingQty);
    const ledgerEndingQty = ledgerOpeningQty + toNumber(row.inQty) - toNumber(row.outQty);
    const current = currentByProduct.get(row.productCode);
    const canBackcastFromCurrent = Boolean(current) && dateTo <= today;
    const futureNetQty = toNumber(futureNetByProduct.get(row.productCode));
    const canonicalEndingQty = canBackcastFromCurrent
      ? toNumber(current.onHand ?? current.quantity ?? current.qty) - futureNetQty
      : ledgerEndingQty;
    const canonicalOpeningQty = canonicalEndingQty - toNumber(row.inQty) + toNumber(row.outQty);
    return {
      ...row,
      ledgerOpeningQty,
      ledgerEndingQty,
      currentOnHandQty: current ? toNumber(current.onHand ?? current.quantity ?? current.qty) : null,
      futureNetQty,
      openingQty: canonicalOpeningQty,
      endingQty: canonicalEndingQty,
      quantity: canonicalEndingQty,
      qty: canonicalEndingQty,
      availableQty: canonicalEndingQty,
      endingSource: canBackcastFromCurrent ? 'inventories_backcast' : 'stockTransactions',
      reconciliationDifference: canonicalEndingQty - ledgerEndingQty
    };
  });
  rows = rows.filter((row) => queryTextMatches(row, query.q || query.search || query.keyword));
  rows.sort((a, b) => a.productCode.localeCompare(b.productCode, 'vi'));

  const summary = rows.reduce((acc, row) => {
    acc.totalRows += 1;
    acc.openingQty += toNumber(row.openingQty);
    acc.inQty += toNumber(row.inQty);
    acc.outQty += toNumber(row.outQty);
    acc.importQty += toNumber(row.importQty);
    acc.returnQty += toNumber(row.returnQty);
    acc.endingQty += toNumber(row.endingQty);
    if (toNumber(row.endingQty) < 0) acc.negativeStockCount += 1;
    if (Math.abs(toNumber(row.reconciliationDifference)) > 0.000001) {
      acc.reconciliationMismatchCount += 1;
      acc.reconciliationDifferenceQty += toNumber(row.reconciliationDifference);
    }
    return acc;
  }, {
    totalRows: 0,
    openingQty: 0,
    inQty: 0,
    outQty: 0,
    importQty: 0,
    returnQty: 0,
    endingQty: 0,
    negativeStockCount: 0,
    reconciliationMismatchCount: 0,
    reconciliationDifferenceQty: 0
  });

  const paged = paginate(rows, query, { defaultLimit: 50, maxLimit: 200 });
  return {
    source: 'mongo_stock_transactions',
    inventorySource: 'stockTransactions',
    reportMode: 'inventory_movement',
    dateFrom,
    dateTo,
    stock: paged.rows,
    items: paged.rows,
    meta: paged.meta,
    summary,
    negativeStockCount: summary.negativeStockCount,
    negativeStockRows: rows.filter((row) => toNumber(row.endingQty) < 0)
  };
}

async function stockReport(query = {}) {
  // Tồn hiện tại tuyệt đối không phụ thuộc khoảng ngày. Muốn xem nhập-xuất-tồn
  // phải gọi rõ mode=movement hoặc inventoryMovementReport().
  if (lower(query.mode) === 'movement') return inventoryMovementReport(query);
  return currentStockReport(query);
}

async function stockCardReport(query = {}) {
  const { dateFrom, dateTo } = dateRange(query);
  const [transactions, productMap, movement] = await Promise.all([
    loadTransactionsUntil(dateTo),
    loadProducts(),
    inventoryMovementReport({ ...query, full: '1', export: '1', mode: 'movement' })
  ]);
  const openingByProduct = new Map((movement.stock || []).map((row) => [row.productCode, toNumber(row.openingQty)]));
  const periodRows = [];

  for (const transaction of transactions) {
    const transactionDate = transaction._reportBusinessDate || businessDate(transaction, ['date']);
    if (!transactionDate || transactionDate > dateTo) continue;
    const productCode = productCodeOf(transaction).toUpperCase();
    if (!productCode) continue;
    const product = productMap.get(productCode) || {};
    const productName = productNameOf(transaction, product);
    if (!queryTextMatches({ productCode, productName }, query.q || query.search || query.keyword)) continue;
    const quantity = transactionQuantity(transaction);
    if (transactionDate < dateFrom) continue;
    periodRows.push({ transaction, transactionDate, productCode, productName, quantity });
  }

  periodRows.sort((a, b) => a.productCode.localeCompare(b.productCode, 'vi')
    || a.transactionDate.localeCompare(b.transactionDate)
    || text(a.transaction.createdAt).localeCompare(text(b.transaction.createdAt))
    || text(a.transaction._id).localeCompare(text(b.transaction._id)));

  const runningByProduct = new Map(openingByProduct);
  const rows = periodRows.map(({ transaction, transactionDate, productCode, productName, quantity }) => {
    const openingQty = toNumber(runningByProduct.get(productCode));
    const balanceQty = openingQty + quantity;
    runningByProduct.set(productCode, balanceQty);
    return {
      id: transaction.id || String(transaction._id || ''),
      date: transactionDate,
      productCode,
      productName,
      warehouseCode: STOCK_WAREHOUSE_CODE,
      warehouseName: STOCK_WAREHOUSE_NAME,
      type: transaction.type || transaction.transactionType || '',
      category: transactionCategory(transaction, quantity),
      refType: transaction.refType || transaction.sourceType || '',
      refCode: transaction.refCode || transaction.sourceCode || '',
      openingQty,
      inQty: quantity > 0 ? quantity : 0,
      outQty: quantity < 0 ? Math.abs(quantity) : 0,
      quantity,
      balanceQty,
      note: transaction.note || ''
    };
  });

  const summary = rows.reduce((acc, row) => {
    acc.transactionCount += 1;
    acc.inQty += toNumber(row.inQty);
    acc.outQty += toNumber(row.outQty);
    return acc;
  }, {
    productCount: new Set(rows.map((row) => row.productCode)).size,
    transactionCount: 0,
    openingQty: toNumber(movement.summary?.openingQty),
    inQty: 0,
    outQty: 0,
    endingQty: toNumber(movement.summary?.endingQty),
    reconciliationMismatchCount: toNumber(movement.summary?.reconciliationMismatchCount)
  });

  const paged = paginate(rows, query, { defaultLimit: 50, maxLimit: 200 });
  return {
    source: 'mongo_stock_transactions',
    inventorySource: 'stockTransactions',
    reportMode: 'stock_card',
    dateFrom,
    dateTo,
    transactions: paged.rows,
    items: paged.rows,
    meta: paged.meta,
    summary
  };
}

module.exports = {
  transactionQuantity,
  transactionCategory,
  currentStockReport,
  inventoryMovementReport,
  stockReport,
  stockCardReport
};
