'use strict';

const SalesOrder = require('../../models/SalesOrder');
const Product = require('../../models/Product');
const User = require('../../models/User');
const { STAFF_ROLES } = require('../../constants/business.constants');
const arLedgerReadService = require('../arLedgerRead.service');
const {
  activeDocumentFilter,
  accountingConfirmedFilter,
  businessDateStages,
  businessDate,
  classifyArCredit,
  dateRange,
  deduplicateDocuments,
  explicitLineAmountOf,
  firstText,
  historicalCatalogPriceOf,
  hasRootActualAmount,
  actualUnitPriceOf,
  isPromoLine,
  isAccountingConfirmed,
  ledgerOrderIdentityValues,
  orderIdentityValues,
  paginate,
  productCodeOf,
  productNameOf,
  promoQuantityOf,
  rootActualAmountOf,
  saleQuantityOf,
  staffIdentity,
  text,
  toNumber
} = require('./ReportDomainUtils');

function textMatches(row = {}, q = '') {
  const needle = text(q).toLowerCase();
  if (!needle) return true;
  return [
    row.code, row.orderCode, row.customerCode, row.customerName,
    row.salesStaffCode, row.salesStaffName, row.deliveryStaffCode, row.deliveryStaffName
  ].some((value) => text(value).toLowerCase().includes(needle));
}


function salesStaffKey(row = {}) {
  const code = text(row.salesStaffCode || row.salesmanCode || row.staffCode || row.code).trim();
  if (code) return `code:${code.toLowerCase()}`;
  const name = text(row.salesStaffName || row.salesmanName || row.staffName || row.name).trim();
  if (name) return `name:${name.toLowerCase()}`;
  return '';
}

function salesStaffRow(row = {}) {
  return {
    salesStaffCode: text(row.salesStaffCode || row.salesmanCode || row.staffCode || row.code),
    salesStaffName: text(row.salesStaffName || row.salesmanName || row.staffName || row.name)
  };
}

function userSalesStaffCode(user = {}) {
  return text(user.salesStaffCode || user.staffCode || user.salesmanCode || user.employeeCode || user.maNhanVien || user.code);
}

function userSalesStaffName(user = {}) {
  return text(user.salesStaffName || user.salesmanName || user.fullName || user.name);
}

const SALES_ROLE_VALUES = Object.freeze([...new Set([...(STAFF_ROLES.SALES || []), 'sales', 'sale', 'nvbh', 'NVBH', 'salesStaff', 'sales_staff'])]);

function activeSalesStaffUserFilter() {
  return {
    isActive: { $ne: false },
    $or: [
      { role: { $in: SALES_ROLE_VALUES } },
      { roleLabel: { $in: SALES_ROLE_VALUES } },
      { type: { $in: SALES_ROLE_VALUES } },
      { position: { $in: SALES_ROLE_VALUES } },
      { isSalesman: true },
      { isSalesStaff: true },
      { salesStaff: true }
    ]
  };
}

async function loadActiveSalesStaff() {
  const users = await User.find(activeSalesStaffUserFilter()).select({
    username: 1,
    fullName: 1,
    name: 1,
    code: 1,
    staffCode: 1,
    employeeCode: 1,
    maNhanVien: 1,
    salesStaffCode: 1,
    salesStaffName: 1,
    salesmanCode: 1,
    salesmanName: 1,
    role: 1,
    roleLabel: 1,
    type: 1,
    position: 1,
    isSalesman: 1,
    isSalesStaff: 1,
    salesStaff: 1,
    isActive: 1
  }).sort({ fullName: 1, name: 1, staffCode: 1, code: 1 }).lean();

  const rows = [];
  const seen = new Set();
  for (const user of users || []) {
    const staff = {
      salesStaffCode: userSalesStaffCode(user),
      salesStaffName: userSalesStaffName(user)
    };
    const key = salesStaffKey(staff);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    rows.push(staff);
  }
  return rows;
}

function buildSalesmanReportRows(rows = [], activeSalesStaff = []) {
  const bySalesmanMap = new Map();
  const ensureSalesman = (source = {}) => {
    const staff = salesStaffRow(source);
    const key = salesStaffKey(staff);
    if (!key) return null;
    if (!bySalesmanMap.has(key)) {
      bySalesmanMap.set(key, {
        salesmanCode: staff.salesStaffCode,
        salesmanName: staff.salesStaffName,
        orderCount: 0,
        customerCodes: new Set(),
        beforePromoAmount: 0,
        actualAmount: 0,
        promotionValue: 0,
        receiptAmount: 0,
        returnAmount: 0,
        debtAmount: 0
      });
    }
    return bySalesmanMap.get(key);
  };

  activeSalesStaff.forEach(ensureSalesman);
  for (const row of rows) {
    const target = ensureSalesman({
      salesStaffCode: row.salesStaffCode,
      salesStaffName: row.salesStaffName
    });
    if (!target) continue;
    target.orderCount += 1;
    if (row.customerCode || row.customerName) target.customerCodes.add(row.customerCode || row.customerName);
    target.beforePromoAmount += toNumber(row.beforePromoAmount);
    target.actualAmount += toNumber(row.actualAmount);
    target.promotionValue += toNumber(row.promotionValue);
    target.receiptAmount += toNumber(row.receiptAmount);
    target.returnAmount += toNumber(row.returnAmount);
    target.debtAmount += toNumber(row.debtAmount);
  }

  return Array.from(bySalesmanMap.values()).map((row) => ({
    ...row,
    customerCount: row.customerCodes.size,
    customerCodes: undefined
  })).sort((a, b) => b.actualAmount - a.actualAmount || text(a.salesmanName || a.salesmanCode).localeCompare(text(b.salesmanName || b.salesmanCode), 'vi'));
}

async function loadProductMap() {
  const products = await Product.find({})
    .select('id code productCode sku name productName salePrice price sellPrice giaBan brand category baseUnit unit')
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

function allocateActualAmount(lines = [], rootActualAmount = 0, rootAmountDefined = false) {
  if (!lines.length) return lines;
  const explicitSum = lines.reduce((sum, line) => sum + toNumber(line.actualAmountCandidate), 0);
  const grossSum = lines.reduce((sum, line) => sum + toNumber(line.catalogAmount), 0);
  // Giá trị tổng đã khóa trên đơn là nguồn chuẩn, kể cả khi bằng 0 (đơn giảm 100%).
  // Chỉ fallback tổng dòng khi chứng từ thực sự không có snapshot tổng tiền.
  const target = rootAmountDefined ? Math.max(0, toNumber(rootActualAmount)) : explicitSum;
  if (target <= 0) return lines.map((line) => ({ ...line, actualAmount: 0 }));

  const denominator = explicitSum > 0 ? explicitSum : grossSum;
  if (denominator <= 0) {
    const equal = target / lines.length;
    return lines.map((line, index) => ({
      ...line,
      actualAmount: index === lines.length - 1 ? target - equal * (lines.length - 1) : equal
    }));
  }

  let allocated = 0;
  return lines.map((line, index) => {
    const base = explicitSum > 0 ? toNumber(line.actualAmountCandidate) : toNumber(line.catalogAmount);
    const amount = index === lines.length - 1 ? target - allocated : (target * base) / denominator;
    allocated += amount;
    return { ...line, actualAmount: Math.max(0, amount) };
  });
}

function valueOrder(order = {}, productMap = new Map()) {
  const rawItems = Array.isArray(order.items) ? order.items : [];
  const saleLines = [];
  const promoLines = [];
  let currentCatalogFallbackCount = 0;
  let missingValueCount = 0;

  rawItems.forEach((item, index) => {
    const code = productCodeOf(item).toUpperCase();
    const product = productMap.get(code) || {};
    const catalog = historicalCatalogPriceOf(item, product);
    if (catalog.fallbackCurrentCatalog) currentCatalogFallbackCount += 1;

    if (isPromoLine(item)) {
      const quantity = promoQuantityOf(item);
      promoLines.push({
        index,
        productCode: code,
        productName: productNameOf(item) || firstText(product, ['name', 'productName']),
        quantity,
        catalogPrice: catalog.value,
        catalogAmount: quantity * catalog.value
      });
      return;
    }

    const quantity = saleQuantityOf(item);
    if (quantity <= 0) return;
    const explicitAmount = explicitLineAmountOf(item);
    const actualUnitPrice = actualUnitPriceOf(item, catalog.value);
    const actualAmountCandidate = explicitAmount.hasValue
      ? explicitAmount.value
      : quantity * actualUnitPrice;
    if (!explicitAmount.hasValue && actualUnitPrice <= 0 && catalog.value <= 0) missingValueCount += 1;

    saleLines.push({
      index,
      productCode: code,
      productName: productNameOf(item) || firstText(product, ['name', 'productName']),
      brand: firstText(product, ['brand']),
      category: firstText(product, ['category']),
      unit: firstText(item, ['baseUnit', 'unit']) || firstText(product, ['baseUnit', 'unit']),
      quantity,
      catalogPrice: catalog.value,
      actualUnitPrice,
      catalogAmount: quantity * catalog.value,
      actualAmountCandidate,
      hasExplicitAmount: explicitAmount.hasValue,
      fallbackCurrentCatalog: catalog.fallbackCurrentCatalog
    });
  });

  const rootAmountDefined = hasRootActualAmount(order);
  const rootActualAmount = rootActualAmountOf(order);
  const valuedLines = allocateActualAmount(saleLines, rootActualAmount, rootAmountDefined);
  const beforePromoAmount = valuedLines.reduce((sum, line) => sum + toNumber(line.catalogAmount), 0);
  const lineActualSum = valuedLines.reduce((sum, line) => sum + toNumber(line.actualAmount), 0);
  const actualAmount = rootAmountDefined ? rootActualAmount : lineActualSum;
  const promoValue = promoLines.reduce((sum, line) => sum + toNumber(line.catalogAmount), 0);
  const saleQuantity = valuedLines.reduce((sum, line) => sum + toNumber(line.quantity), 0);
  const promoQuantity = promoLines.reduce((sum, line) => sum + toNumber(line.quantity), 0);

  return {
    saleLines: valuedLines,
    promoLines,
    saleQuantity,
    promoQuantity,
    beforePromoAmount,
    actualAmount,
    promotionDiscountAmount: Math.max(0, beforePromoAmount - actualAmount),
    promoValue,
    dataQuality: {
      currentCatalogFallbackCount,
      missingValueCount,
      orderLineMismatchAmount: Math.round(rootAmountDefined ? rootActualAmount - lineActualSum : 0),
      rootAmountDefined
    }
  };
}

async function loadConfirmedOrders(query = {}) {
  const { dateFrom, dateTo } = dateRange(query);
  const rows = await SalesOrder.aggregate([
    { $match: activeDocumentFilter() },
    { $match: accountingConfirmedFilter() },
    ...businessDateStages(dateFrom, dateTo, ['date', 'orderDate', 'documentDate'], '_reportBusinessDate'),
    { $sort: { _reportBusinessDate: 1, updatedAt: 1, createdAt: 1, _id: 1 } }
  ]).allowDiskUse(true).exec();
  const deduplicated = deduplicateDocuments(rows, 'sales');
  return {
    rows: deduplicated.rows.filter((row) => textMatches(row, query.q || query.search || query.keyword)),
    duplicateCount: deduplicated.duplicateCount,
    dateFrom,
    dateTo
  };
}

async function loadArByOrders(orders = []) {
  const keys = Array.from(new Set(orders.flatMap(orderIdentityValues)));
  if (!keys.length) return new Map();
  const ledgers = await arLedgerReadService.getCanonicalLedgersByOrderKeys(keys, { status: 'all' });

  const keyToOrder = new Map();
  for (const order of orders) {
    const canonical = text(order._id || order.id || order.code || order.orderCode);
    for (const key of orderIdentityValues(order)) keyToOrder.set(key, canonical);
  }

  const map = new Map();
  for (const ledger of ledgers) {
    const canonical = ledgerOrderIdentityValues(ledger).map((key) => keyToOrder.get(key)).find(Boolean);
    if (!canonical) continue;
    if (!map.has(canonical)) {
      map.set(canonical, { debit: 0, credit: 0, receiptAmount: 0, returnAmount: 0, adjustmentAmount: 0, otherCredit: 0 });
    }
    const target = map.get(canonical);
    const debit = toNumber(ledger.debit || (toNumber(ledger.credit) <= 0 ? ledger.amount : 0));
    const credit = toNumber(ledger.credit);
    target.debit += Math.max(0, debit);
    target.credit += Math.max(0, credit);
    if (credit > 0) {
      const category = classifyArCredit(ledger);
      if (category === 'receipt') target.receiptAmount += credit;
      else if (category === 'return') target.returnAmount += credit;
      else if (category === 'adjustment') target.adjustmentAmount += credit;
      else target.otherCredit += credit;
    }
  }
  return map;
}

function orderCanonicalKey(order = {}) {
  return text(order._id || order.id || order.code || order.orderCode);
}

async function salesReport(query = {}) {
  const [{ rows: orders, duplicateCount, dateFrom, dateTo }, productMap, activeSalesStaff] = await Promise.all([
    loadConfirmedOrders(query),
    loadProductMap(),
    loadActiveSalesStaff()
  ]);
  const arByOrder = await loadArByOrders(orders);
  const rows = orders.map((order) => {
    const valuation = valueOrder(order, productMap);
    const ar = arByOrder.get(orderCanonicalKey(order)) || {};
    const salesStaff = staffIdentity(order, 'sales');
    const deliveryStaff = staffIdentity(order, 'delivery');
    const hasArLedger = ar && (toNumber(ar.debit) > 0 || toNumber(ar.credit) > 0);
    const arDebit = toNumber(ar.debit);
    const arCredit = toNumber(ar.credit);
    const missingArLedger = !hasArLedger && isAccountingConfirmed(order);
    const debtAmount = hasArLedger ? Math.max(0, arDebit - arCredit) : 0;
    return {
      id: text(order.id || order._id),
      code: firstText(order, ['code', 'orderCode', 'salesOrderCode', 'documentCode']),
      date: order._reportBusinessDate || businessDate(order, ['date', 'orderDate', 'documentDate']),
      source: firstText(order, ['orderSource', 'source']),
      customerCode: firstText(order, ['customerCode', 'customerId']),
      customerName: firstText(order, ['customerName']),
      salesStaffCode: salesStaff.code,
      salesStaffName: salesStaff.name,
      deliveryStaffCode: deliveryStaff.code,
      deliveryStaffName: deliveryStaff.name,
      saleQuantity: valuation.saleQuantity,
      promoQuantity: valuation.promoQuantity,
      beforePromoAmount: valuation.beforePromoAmount,
      actualAmount: valuation.actualAmount,
      promotionDiscountAmount: valuation.promotionDiscountAmount,
      promotionValue: valuation.promoValue,
      arDebit,
      receiptAmount: toNumber(ar.receiptAmount),
      returnAmount: toNumber(ar.returnAmount),
      adjustmentAmount: toNumber(ar.adjustmentAmount) + toNumber(ar.otherCredit),
      debtAmount,
      deliveryStatus: order.deliveryStatus || '',
      accountingStatus: order.accountingStatus || '',
      status: order.status || '',
      items: valuation.saleLines,
      dataQuality: {
        ...valuation.dataQuality,
        missingArLedger,
        missingArDebitAmount: missingArLedger ? valuation.actualAmount : 0
      }
    };
  });

  rows.sort((a, b) => b.date.localeCompare(a.date) || b.code.localeCompare(a.code));
  const summary = rows.reduce((acc, row) => {
    acc.orderCount += 1;
    acc.saleQuantity += toNumber(row.saleQuantity);
    acc.promoQuantity += toNumber(row.promoQuantity);
    acc.beforePromoAmount += toNumber(row.beforePromoAmount);
    acc.actualAmount += toNumber(row.actualAmount);
    acc.promotionDiscountAmount += toNumber(row.promotionDiscountAmount);
    acc.promotionValue += toNumber(row.promotionValue);
    acc.receiptAmount += toNumber(row.receiptAmount);
    acc.returnAmount += toNumber(row.returnAmount);
    acc.adjustmentAmount += toNumber(row.adjustmentAmount);
    acc.debtAmount += toNumber(row.debtAmount);
    acc.currentCatalogFallbackCount += toNumber(row.dataQuality?.currentCatalogFallbackCount);
    acc.missingValueCount += toNumber(row.dataQuality?.missingValueCount);
    if (row.dataQuality?.missingArLedger) {
      acc.missingArLedgerCount += 1;
      acc.missingArDebitAmount += toNumber(row.dataQuality?.missingArDebitAmount);
    }
    return acc;
  }, {
    orderCount: 0,
    saleQuantity: 0,
    promoQuantity: 0,
    beforePromoAmount: 0,
    actualAmount: 0,
    promotionDiscountAmount: 0,
    promotionValue: 0,
    receiptAmount: 0,
    returnAmount: 0,
    adjustmentAmount: 0,
    debtAmount: 0,
    duplicateOrderCount: duplicateCount,
    currentCatalogFallbackCount: 0,
    missingValueCount: 0,
    missingArLedgerCount: 0,
    missingArDebitAmount: 0
  });

  const bySalesman = buildSalesmanReportRows(rows, activeSalesStaff);

  const paged = paginate(rows, query, { defaultLimit: 50, maxLimit: 200 });
  return {
    source: 'mongo_orders_confirmed_actual',
    orderSource: 'orders',
    arSource: 'arLedgers',
    dateFrom,
    dateTo,
    sales: paged.rows,
    items: paged.rows,
    meta: paged.meta,
    bySalesman,
    summary
  };
}

module.exports = {
  salesStaffKey,
  salesStaffRow,
  userSalesStaffCode,
  userSalesStaffName,
  activeSalesStaffUserFilter,
  loadActiveSalesStaff,
  buildSalesmanReportRows,
  loadProductMap,
  valueOrder,
  loadConfirmedOrders,
  loadArByOrders,
  salesReport
};
