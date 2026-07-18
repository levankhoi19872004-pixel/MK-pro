'use strict';

// Legacy mobile debt query kept for historical diagnostics.
// Production /api/mobile/debts must use DebtNewService.listCustomers via mobileDebtNewAdapter.service.

const ArLedger = require('../../models/ArLedger');
const DebtCollection = require('../../models/DebtCollection');
const dateUtil = require('../../utils/date.util');
const { toNumber } = require('../../utils/common.util');
const { escapeRegex } = require('../../utils/query.util');
const { DEBT_ZERO_TOLERANCE } = require('../../constants/finance.constants');
const { projectBalanceFromTotals } = require('../accounting/LegacyDebtProjector');
const { resolveDebtLedgerOwnership } = require('../../domain/ar/DebtLedgerOwnershipResolver');
const { annotateLegacyAdjustmentProjection, isLegacyAdjustment } = require('../../domain/ar/legacyAdjustmentProjectionPolicy');
const arBalanceService = require('../accounting/arBalanceService');
const arLedgerUtil = require('../../utils/arLedger.util');
const {
  normalizeArCategory,
  getArLedgerCategoryEffect
} = require('../../utils/arLedgerCategoryEffect.util');
const {
  buildConfirmedArLedgerFilter,
  isConfirmedArLedger
} = require('../../utils/arLedgerStatus.util');
const { parseMobilePagination, buildPagination } = require('./mobilePagination.util');

const PENDING_STATUSES = ['submitted', 'under_review'];
const EXTRA_INACTIVE_STATUSES = ['duplicate_cancelled', 'draft'];

const MOBILE_AR_DEBT_CATEGORIES = Object.freeze([
  'AR-DEBT-OPEN',
  'AR-DEBT-PAYMENT',
  'AR-DEBT-ADJUSTMENT',
  'AR-DEBT-VOID',
  'AR-SALE',
  'AR-EXTERNAL',
  'AR-EXTERNAL-DEBT',
  'AR-RETURN',
  'AR-RECEIPT',
  'AR-BONUS',
  'AR-ALLOWANCE',
  'AR-BONUS-ALLOWANCE',
  'AR-ADJUSTMENT',
  'AR-SALE-REVERSAL',
  'AR-RETURN-REVERSAL',
  'AR-RECEIPT-REVERSAL'
]);

const MOBILE_DEBIT_SEED_CATEGORIES = Object.freeze([
  'AR-DEBT-OPEN',
  'AR-SALE',
  'AR-EXTERNAL',
  'AR-EXTERNAL-DEBT',
  'AR-RETURN-REVERSAL',
  'AR-RECEIPT-REVERSAL',
  'AR-DEBT-ADJUSTMENT',
  'AR-ADJUSTMENT'
]);

const DEBT_LEDGER_PROJECTION = [
  'id', 'code', 'type', 'category', 'ledgerType', 'source', 'sourceType', 'sourceId', 'sourceCode',
  'sourceOrderId', 'sourceOrderCode', 'returnOrderId', 'returnOrderCode', 'receiptId', 'allocationId', 'orderPaymentAllocationId', 'paymentAllocationId',
  'componentId', 'componentCode', 'componentKey', 'financialComponent', 'financialComponentId', 'financialComponentCode',
  'correctionId', 'originalLedgerId', 'sourceVersion', 'idempotencyKey',
  'refType', 'refId', 'refCode', 'orderId', 'orderCode', 'salesOrderId', 'salesOrderCode',
  'customerId', 'customerCode', 'customerName', 'customerPhone', 'phone', 'customerAddress', 'address',
  'debit', 'credit', 'amount', 'arDebit', 'arCredit', 'totalAmount', 'value',
  'status', 'lifecycleStatus', 'account', 'accountingConfirmed', 'accountingStatus', 'entryType', 'active',
  'reversed', 'isDeleted', 'deleted', 'deletedAt', 'date', 'documentDate', 'createdAt',
  'salesStaffCode', 'salesStaffName', 'salesmanCode', 'salesmanName', 'nvbhCode', 'nvbhName',
  'deliveryStaffCode', 'deliveryStaffName', 'deliveryCode', 'deliveryName', 'nvghCode', 'nvghName',
  'metadata'
].join(' ');

function text(value) {
  return String(value ?? '').trim();
}

function lower(value) {
  return text(value).toLowerCase();
}

function unique(values = []) {
  return [...new Set((Array.isArray(values) ? values : [values]).map(text).filter(Boolean))];
}

function caseVariants(value) {
  const raw = text(value);
  return raw ? unique([raw, raw.toUpperCase(), raw.toLowerCase()]) : [];
}

function categoryTypeValues(categories = MOBILE_AR_DEBT_CATEGORIES) {
  return unique(categories.flatMap((category) => {
    const normalized = lower(category).replace(/-/g, '_');
    return [normalized, category, category.toLowerCase()];
  }));
}

function categoryCondition(categories = MOBILE_AR_DEBT_CATEGORIES) {
  const upperCategories = unique(categories.map((category) => String(category).toUpperCase()));
  const typeValues = categoryTypeValues(upperCategories);
  return {
    $or: [
      { category: { $in: upperCategories } },
      { ledgerType: { $in: upperCategories } },
      { type: { $in: typeValues } }
    ]
  };
}

function andMatch(...conditions) {
  const parts = conditions.filter((condition) => condition && Object.keys(condition).length);
  if (!parts.length) return {};
  if (parts.length === 1) return parts[0];
  return { $and: parts };
}

function activeArFilter(extra = {}) {
  return andMatch(
    buildConfirmedArLedgerFilter({}, { extraInactiveStatuses: EXTRA_INACTIVE_STATUSES }),
    { active: { $ne: false } },
    categoryCondition(),
    extra
  );
}

function staffSeedCondition(query = {}) {
  const salesCode = text(query.salesStaffCode || query.salesmanCode);
  const deliveryCode = text(query.deliveryStaffCode);
  const salesName = !salesCode ? text(query.salesStaffName || query.salesmanName) : '';
  const deliveryName = !deliveryCode ? text(query.deliveryStaffName) : '';
  const clauses = [];

  if (salesCode) {
    const values = caseVariants(salesCode);
    clauses.push({
      $or: [
        { salesStaffCode: { $in: values } },
        { salesmanCode: { $in: values } },
        { nvbhCode: { $in: values } }
      ]
    });
  } else if (salesName) {
    const values = caseVariants(salesName);
    clauses.push({
      $or: [
        { salesStaffName: { $in: values } },
        { salesmanName: { $in: values } },
        { nvbhName: { $in: values } }
      ]
    });
  }

  if (deliveryCode) {
    const values = caseVariants(deliveryCode);
    clauses.push({
      $or: [
        { deliveryStaffCode: { $in: values } },
        { deliveryCode: { $in: values } },
        { nvghCode: { $in: values } }
      ]
    });
  } else if (deliveryName) {
    const values = caseVariants(deliveryName);
    clauses.push({
      $or: [
        { deliveryStaffName: { $in: values } },
        { deliveryName: { $in: values } },
        { nvghName: { $in: values } }
      ]
    });
  }

  if (!clauses.length) return null;
  return clauses.length === 1 ? clauses[0] : { $and: clauses };
}

function extractSalesOrderCodeFromReturnToken(value = '') {
  const raw = text(value).toUpperCase();
  if (!raw) return '';
  const direct = raw.match(/^RO-([A-Z0-9]+)$/i);
  if (direct) return direct[1];
  const idempotency = raw.match(/^AR-RETURN:RO-([A-Z0-9]+)$/i);
  if (idempotency) return idempotency[1];
  const embedded = raw.match(/(?:^|[-_:])RO-([A-Z0-9]+)(?=$|[-_:])/i);
  return embedded ? embedded[1] : '';
}

function expandOrderKeys(values = []) {
  const out = new Set();
  for (const value of values || []) {
    const key = text(value);
    if (!key) continue;
    out.add(key);
    out.add(key.toUpperCase());
    out.add(key.toLowerCase());
    const fromReturn = extractSalesOrderCodeFromReturnToken(key);
    if (fromReturn) {
      out.add(fromReturn);
      out.add(fromReturn.toUpperCase());
      out.add(fromReturn.toLowerCase());
    }
    if (/^[A-Z0-9]+$/i.test(key) && !/^RO-/i.test(key)) {
      out.add(`RO-${key}`);
      out.add(`AR-RETURN:RO-${key}`);
      out.add(`AR-RETURN-RO-${key}`);
    }
  }
  return [...out].filter(Boolean);
}

function orderCodeOf(row = {}) {
  return text(
    row.salesOrderCode
    || row.orderCode
    || row.sourceOrderCode
    || row.refCode
    || extractSalesOrderCodeFromReturnToken(row.returnOrderCode || row.sourceCode || row.refCode || row.idempotencyKey || row.code || row.id)
    || row.sourceCode
    || row.code
  );
}

function orderIdOf(row = {}) {
  return text(row.salesOrderId || row.orderId || row.sourceOrderId || row.refId || row.sourceId || row.id);
}

function orderKeysFromRow(row = {}) {
  return expandOrderKeys([
    row.orderId,
    row.salesOrderId,
    row.sourceOrderId,
    row.refId,
    row.sourceId,
    row.returnOrderId,
    row.orderCode,
    row.salesOrderCode,
    row.sourceOrderCode,
    row.refCode,
    row.sourceCode,
    row.returnOrderCode,
    row.idempotencyKey,
    row.code,
    row.id
  ]);
}

function orderRefCondition(keys = []) {
  const values = expandOrderKeys(keys);
  if (!values.length) return { _id: '__NO_MOBILE_DEBT_ORDER_KEYS__' };
  return {
    $or: [
      { orderId: { $in: values } },
      { salesOrderId: { $in: values } },
      { sourceOrderId: { $in: values } },
      { refId: { $in: values } },
      { sourceId: { $in: values } },
      { returnOrderId: { $in: values } },
      { orderCode: { $in: values } },
      { salesOrderCode: { $in: values } },
      { sourceOrderCode: { $in: values } },
      { refCode: { $in: values } },
      { sourceCode: { $in: values } },
      { returnOrderCode: { $in: values } },
      { idempotencyKey: { $in: values } },
      { code: { $in: values } },
      { id: { $in: values } }
    ]
  };
}

function orderKeysFromSeed(rows = []) {
  const keys = unique((rows || []).flatMap(orderKeysFromRow));
  return {
    ids: unique(keys.filter((key) => !/^AR-|^RO-/i.test(key))),
    codes: keys,
    keys
  };
}

function debitSeedCondition() {
  return categoryCondition(MOBILE_DEBIT_SEED_CATEGORIES);
}

async function scopedArContext(query = {}) {
  const seedCondition = staffSeedCondition(query);
  if (!seedCondition) return { match: activeArFilter(), ids: [], codes: [], keys: [] };

  const seedRows = await ArLedger.find(activeArFilter(andMatch(seedCondition, debitSeedCondition())))
    .select(DEBT_LEDGER_PROJECTION)
    .sort({ date: -1, createdAt: -1, _id: -1 })
    .limit(10000)
    .lean();

  const { ids, codes, keys } = orderKeysFromSeed(seedRows);
  if (!keys.length) {
    return { match: { _id: '__NO_MOBILE_DEBT_SCOPE__' }, ids: [], codes: [], keys: [] };
  }

  return {
    ids,
    codes,
    keys,
    match: activeArFilter(orderRefCondition(keys))
  };
}

async function scopedArMatch(query = {}) {
  return (await scopedArContext(query)).match;
}

function pendingFilter(query = {}, scope = {}) {
  const filter = { status: { $in: PENDING_STATUSES } };
  const keys = unique([...(scope.keys || []), ...(scope.ids || []), ...(scope.codes || [])]);
  const expanded = expandOrderKeys(keys);
  if (expanded.length) {
    filter.allocations = {
      $elemMatch: {
        $or: [
          { salesOrderId: { $in: expanded } },
          { orderId: { $in: expanded } },
          { sourceOrderId: { $in: expanded } },
          { refId: { $in: expanded } },
          { salesOrderCode: { $in: expanded } },
          { orderCode: { $in: expanded } },
          { sourceOrderCode: { $in: expanded } },
          { refCode: { $in: expanded } }
        ]
      }
    };
    return filter;
  }

  const salesCode = text(query.salesStaffCode || query.salesmanCode);
  const deliveryCode = text(query.deliveryStaffCode);
  if (salesCode) filter.salesStaffCode = { $in: caseVariants(salesCode) };
  if (deliveryCode) filter.deliveryStaffCode = { $in: caseVariants(deliveryCode) };
  return filter;
}

function allocationScopeKey(row = {}) {
  return lower(row.salesOrderCode || row.orderCode || row.salesOrderId || row.orderId || row.sourceOrderCode || row.sourceOrderId || row.refCode || row.refId);
}

function summarizePending(rows = [], scope = {}) {
  const byOrder = new Map();
  const byCustomer = new Map();
  const allowed = new Set(expandOrderKeys([...(scope.keys || []), ...(scope.ids || []), ...(scope.codes || [])]).map(lower));
  let total = 0;
  for (const row of rows || []) {
    const allocations = Array.isArray(row.allocations) ? row.allocations : [];
    const scopedAllocations = allowed.size
      ? allocations.filter((allocation) => allowed.has(allocationScopeKey(allocation)))
      : allocations;
    let scopedAmount = 0;
    for (const allocation of scopedAllocations) {
      const key = orderCodeOf(allocation) || text(allocation.salesOrderId || allocation.orderId || allocation.refId);
      if (!key) continue;
      const allocated = Math.max(0, toNumber(allocation.allocatedAmount ?? allocation.amount));
      scopedAmount += allocated;
      for (const expandedKey of expandOrderKeys([key])) byOrder.set(expandedKey, (byOrder.get(expandedKey) || 0) + allocated);
    }
    const amount = allocations.length ? scopedAmount : Math.max(0, toNumber(row.amount));
    total += amount;
    const customerKey = lower(row.customerCode || row.customerId || row.customerName);
    if (customerKey) byCustomer.set(customerKey, (byCustomer.get(customerKey) || 0) + amount);
  }
  return { total, byOrder, byCustomer };
}

function isMobileCanonicalDebtLedger(row = {}) {
  if (row.active === false || row.accountingConfirmed !== true) return false;
  if (!isConfirmedArLedger(row, { extraInactiveStatuses: EXTRA_INACTIVE_STATUSES })) return false;
  return MOBILE_AR_DEBT_CATEGORIES.includes(normalizeArCategory(row));
}

function keywordMatches(row = {}, keyword = '') {
  const needle = lower(keyword);
  if (!needle) return true;
  return [
    row.customerCode,
    row.customerName,
    row.customerId,
    row.phone,
    row.customerPhone,
    row.orderCode,
    row.salesOrderCode,
    row.sourceOrderCode,
    row.refCode,
    row.sourceCode,
    row.code,
    row.id
  ].some((value) => lower(value).includes(needle));
}

function ledgerDebit(row = {}) {
  return Math.max(0, Math.round(arLedgerUtil.effectiveArDebit(row)));
}

function ledgerCredit(row = {}) {
  return Math.max(0, Math.round(arLedgerUtil.effectiveArCredit(row)));
}

function assignmentFromRow(row = {}) {
  return {
    salesStaffCode: text(row.salesStaffCode || row.salesmanCode || row.nvbhCode),
    salesStaffName: text(row.salesStaffName || row.salesmanName || row.nvbhName),
    deliveryStaffCode: text(row.deliveryStaffCode || row.deliveryCode || row.nvghCode),
    deliveryStaffName: text(row.deliveryStaffName || row.deliveryName || row.nvghName)
  };
}

function customerKeyOf(row = {}) {
  return lower(row.customerCode || row.customerId || row.customerName || 'UNKNOWN_CUSTOMER');
}

function groupOrders(rows = [], query = {}) {
  const map = new Map();
  const debtRows = (rows || []).filter(isMobileCanonicalDebtLedger);
  const ownership = resolveDebtLedgerOwnership(debtRows);
  const annotated = annotateLegacyAdjustmentProjection(debtRows, ownership);
  const annotatedById = new Map(annotated.flatMap((row) => [row.ledgerId, row.id, row.code, row._id, row.idempotencyKey].map(text).filter(Boolean).map((key) => [key, row])));
  const selectedRows = [];
  const selectedKeys = new Set();
  function pushSelected(row = {}) {
    const key = text(row.ledgerId || row.id || row.code || row._id || row.idempotencyKey);
    const annotatedRow = annotatedById.get(key) || row;
    const projected = isLegacyAdjustment(annotatedRow) ? annotatedRow : row;
    if (isLegacyAdjustment(projected) && projected.projectionIncluded === false) return;
    const selectedKey = text(projected.ledgerId || projected.id || projected.code || projected._id || projected.idempotencyKey);
    if (selectedKey && selectedKeys.has(selectedKey)) return;
    if (selectedKey) selectedKeys.add(selectedKey);
    selectedRows.push(projected);
  }
  for (const row of ownership.selectedEntries || []) pushSelected(row);
  for (const row of ownership.unresolvedEntries || []) {
    const key = text(row.ledgerId || row.id || row.code || row._id || row.idempotencyKey);
    const projected = annotatedById.get(key) || row;
    if (isLegacyAdjustment(projected) && projected.projectionIncluded !== false) pushSelected(projected);
  }
  for (const row of selectedRows) {
    if (!keywordMatches(row, query.q || query.customerKeyword || query.search)) continue;

    const customerKey = customerKeyOf(row);
    const orderCode = orderCodeOf(row);
    const orderId = orderIdOf(row);
    const orderKey = lower(orderCode || orderId || row.id || row.code || row._id);
    if (!customerKey || !orderKey) continue;
    const key = `${customerKey}::${orderKey}`;
    if (!map.has(key)) {
      const assignment = assignmentFromRow(row);
      map.set(key, {
        salesOrderId: orderId,
        salesOrderCode: orderCode || orderId,
        orderId,
        orderCode: orderCode || orderId,
        orderDate: dateUtil.toDateOnly(row.date || row.documentDate || row.createdAt || ''),
        documentDate: dateUtil.toDateOnly(row.documentDate || row.date || row.createdAt || ''),
        customerId: text(row.customerId),
        customerCode: text(row.customerCode),
        customerName: text(row.customerName),
        phone: text(row.phone || row.customerPhone),
        address: text(row.address || row.customerAddress),
        ...assignment,
        debit: 0,
        credit: 0,
        debt: 0,
        ledgerCount: 0,
        ledgerCategories: new Set()
      });
    }
    const target = map.get(key);
    const rowDate = dateUtil.toDateOnly(row.date || row.documentDate || row.createdAt || '');
    if (rowDate && (!target.orderDate || rowDate < target.orderDate)) {
      target.orderDate = rowDate;
      target.documentDate = rowDate;
    }
    const assignment = assignmentFromRow(row);
    for (const field of ['salesStaffCode', 'salesStaffName', 'deliveryStaffCode', 'deliveryStaffName']) {
      if (!target[field] && assignment[field]) target[field] = assignment[field];
    }
    if (!target.customerCode && row.customerCode) target.customerCode = text(row.customerCode);
    if (!target.customerName && row.customerName) target.customerName = text(row.customerName);
    if (!target.phone && (row.phone || row.customerPhone)) target.phone = text(row.phone || row.customerPhone);
    if (!target.address && (row.address || row.customerAddress)) target.address = text(row.address || row.customerAddress);
    target.debit += ledgerDebit(row);
    target.credit += ledgerCredit(row);
    target.ledgerCount += 1;
    target.ledgerCategories.add(normalizeArCategory(row));
  }

  return Array.from(map.values()).map((order) => {
    order.debit = Math.round(order.debit);
    order.credit = Math.round(order.credit);
    const projection = projectBalanceFromTotals({ debit: order.debit, credit: order.credit }, { tolerance: DEBT_ZERO_TOLERANCE });
    order.rawBalance = projection.rawBalance;
    order.debt = projection.debtAmount;
    order.debtAmount = projection.debtAmount;
    order.creditBalance = projection.creditBalance;
    order.creditBalanceAmount = projection.creditBalanceAmount;
    order.displayStatus = projection.displayStatus;
    order.ledgerCategories = Array.from(order.ledgerCategories).sort();
    return order;
  });
}

function buildCustomersFromOrders(orders = [], includePaid = false) {
  const map = new Map();
  for (const order of orders || []) {
    const key = lower(order.customerCode || order.customerId || order.customerName || 'UNKNOWN_CUSTOMER');
    if (!map.has(key)) {
      map.set(key, {
        customerId: text(order.customerId),
        customerCode: text(order.customerCode),
        customerName: text(order.customerName),
        phone: text(order.phone),
        address: text(order.address),
        salesStaffCode: text(order.salesStaffCode),
        salesStaffName: text(order.salesStaffName),
        salesmanCode: text(order.salesStaffCode),
        salesmanName: text(order.salesStaffName),
        deliveryStaffCode: text(order.deliveryStaffCode),
        deliveryStaffName: text(order.deliveryStaffName),
        debtAmount: 0,
        creditBalance: 0,
        creditBalanceAmount: 0,
        rawBalance: 0,
        debit: 0,
        credit: 0,
        orderCount: 0,
        oldestDebtDate: '',
        orders: []
      });
    }
    const target = map.get(key);
    for (const field of ['salesStaffCode', 'salesStaffName', 'deliveryStaffCode', 'deliveryStaffName', 'phone', 'address']) {
      if (!target[field] && order[field]) target[field] = order[field];
    }
    target.salesmanCode = target.salesStaffCode;
    target.salesmanName = target.salesStaffName;
    target.debit += toNumber(order.debit);
    target.credit += toNumber(order.credit);
    target.debtAmount += toNumber(order.debtAmount ?? order.debt);
    target.creditBalance += toNumber(order.creditBalance);
    target.creditBalanceAmount += toNumber(order.creditBalanceAmount ?? order.creditBalance);
    target.rawBalance += toNumber(order.rawBalance);
    if ((order.debtAmount ?? order.debt) > DEBT_ZERO_TOLERANCE) target.orderCount += 1;
    if (order.documentDate && (!target.oldestDebtDate || order.documentDate < target.oldestDebtDate)) target.oldestDebtDate = order.documentDate;
    if (includePaid || order.debt > DEBT_ZERO_TOLERANCE) target.orders.push(order);
  }
  return Array.from(map.values()).map((customer) => ({
    ...customer,
    debtAmount: Math.max(0, Math.round(customer.debtAmount)),
    creditBalance: Math.max(0, Math.round(customer.creditBalance)),
    creditBalanceAmount: Math.max(0, Math.round(customer.creditBalanceAmount)),
    rawBalance: Math.round(customer.rawBalance),
    debit: Math.round(customer.debit),
    credit: Math.round(customer.credit)
  }));
}

async function loadDebtRows(match, options = {}) {
  if (match && match._id === '__NO_MOBILE_DEBT_SCOPE__') return [];
  const limit = Math.min(Math.max(toNumber(options.rawLimit || options.limit || 20000), 1000), 50000);
  return ArLedger.find(match)
    .select(DEBT_LEDGER_PROJECTION)
    .sort({ date: -1, createdAt: -1, _id: -1 })
    .limit(limit)
    .lean();
}

async function getMobileCustomerDebts(query = {}) {
  const { page, limit, skip } = parseMobilePagination(query, { defaultLimit: 30, maxLimit: 100 });
  const scope = await scopedArContext(query);
  const rows = await loadDebtRows(scope.match, { limit: query.rawLimit || 20000 });
  const includePaid = String(query.includePaid || '0') === '1';
  const allOrders = groupOrders(rows, query);
  const allCustomers = buildCustomersFromOrders(allOrders, includePaid);
  const visibleCustomers = allCustomers
    .filter((customer) => includePaid || customer.debtAmount > DEBT_ZERO_TOLERANCE)
    .sort((a, b) => b.debtAmount - a.debtAmount || text(a.customerName).localeCompare(text(b.customerName), 'vi') || text(a.customerCode).localeCompare(text(b.customerCode)));

  const pagedRows = visibleCustomers.slice(skip, skip + limit);
  const visibleOrderKeys = unique(pagedRows.flatMap((row) => (row.orders || []).flatMap(orderKeysFromRow)));
  const pendingScope = visibleOrderKeys.length ? { keys: visibleOrderKeys, ids: [], codes: visibleOrderKeys } : scope;
  const pendingRows = await DebtCollection.find(pendingFilter(query, pendingScope))
    .select('customerId customerCode customerName amount allocations salesStaffCode deliveryStaffCode status')
    .limit(5000)
    .lean();
  const pending = summarizePending(pendingRows, pendingScope);

  const items = pagedRows.map((row) => {
    const customerKey = lower(row.customerCode || row.customerId || row.customerName);
    const orders = (row.orders || []).map((order) => {
      const keys = expandOrderKeys([order.salesOrderCode, order.orderCode, order.salesOrderId, order.orderId]);
      const pendingCollectedAmount = Math.max(0, keys.reduce((sum, key) => sum + toNumber(pending.byOrder.get(key) || 0), 0));
      const debt = Math.max(0, toNumber(order.debtAmount ?? order.debt));
      return {
        ...order,
        salesOrderId: text(order.salesOrderId || order.orderId),
        salesOrderCode: text(order.salesOrderCode || order.orderCode),
        orderDate: dateUtil.toDateOnly(order.orderDate || order.documentDate || ''),
        documentDate: dateUtil.toDateOnly(order.documentDate || order.orderDate || ''),
        debt,
        debtAmount: debt,
        creditBalance: Math.max(0, toNumber(order.creditBalance)),
        creditBalanceAmount: Math.max(0, toNumber(order.creditBalanceAmount ?? order.creditBalance)),
        pendingCollectedAmount,
        availableDebt: Math.max(0, debt - pendingCollectedAmount)
      };
    });
    const debtAmount = Math.max(0, toNumber(row.debtAmount));
    const orderPending = orders.reduce((sum, order) => sum + toNumber(order.pendingCollectedAmount), 0);
    const pendingCollectedAmount = Math.max(0, orderPending || toNumber(pending.byCustomer.get(customerKey) || 0));
    return {
      customerId: text(row.customerId),
      customerCode: text(row.customerCode),
      customerName: text(row.customerName),
      phone: text(row.phone),
      address: text(row.address),
      salesStaffCode: text(row.salesStaffCode),
      salesStaffName: text(row.salesStaffName),
      salesmanCode: text(row.salesStaffCode),
      salesmanName: text(row.salesStaffName),
      deliveryStaffCode: text(row.deliveryStaffCode),
      deliveryStaffName: text(row.deliveryStaffName),
      debtAmount,
      creditBalance: Math.max(0, toNumber(row.creditBalance)),
      creditBalanceAmount: Math.max(0, toNumber(row.creditBalanceAmount ?? row.creditBalance)),
      rawBalance: toNumber(row.rawBalance),
      pendingCollectedAmount,
      availableDebtAmount: Math.max(0, debtAmount - pendingCollectedAmount),
      orderCount: Math.max(0, toNumber(row.orderCount)),
      oldestDebtDate: dateUtil.toDateOnly(row.oldestDebtDate || ''),
      orders,
      ledgers: orders.map((order) => ({
        date: order.documentDate,
        type: 'AR_CANONICAL_DEBT',
        source: 'arLedgers',
        salesOrderCode: order.salesOrderCode,
        refCode: order.salesOrderCode,
        debit: toNumber(order.debit),
        credit: toNumber(order.credit),
        debt: order.debt,
        categories: order.ledgerCategories || []
      }))
    };
  });

  const totalRows = visibleCustomers.length;
  const visibleOrders = visibleCustomers.flatMap((row) => row.orders || []);
  const totalDebt = visibleCustomers.reduce((sum, row) => sum + Math.max(0, toNumber(row.debtAmount)), 0);
  const creditBalanceAmount = visibleCustomers.reduce((sum, row) => sum + Math.max(0, toNumber(row.creditBalanceAmount ?? row.creditBalance)), 0);
  const totalDebit = visibleOrders.reduce((sum, row) => sum + toNumber(row.debit), 0);
  const totalCredit = visibleOrders.reduce((sum, row) => sum + toNumber(row.credit), 0);
  const pagination = buildPagination({ page, limit, totalRows });
  pagination.total = pagination.totalRows;
  pagination.nextPage = pagination.hasMore ? page + 1 : null;
  return {
    ok: true,
    source: 'mobile-ar-ledger-canonical',
    ledgerCollection: 'arLedgers',
    readModelVersion: 'mobile-canonical-ar-ledger-v3',
    summary: {
      totalDebt: Math.max(0, Math.round(totalDebt)),
      creditBalanceAmount: Math.max(0, Math.round(creditBalanceAmount)),
      totalDebit: Math.round(totalDebit),
      totalCredit: Math.round(totalCredit),
      pendingCollected: Math.max(0, toNumber(pending.total)),
      availableDebt: Math.max(0, Math.round(totalDebt - toNumber(pending.total))),
      customerCount: totalRows,
      orderCount: visibleOrders.filter((order) => order.debt > DEBT_ZERO_TOLERANCE).length,
      source: 'arLedgers',
      readModelVersion: 'mobile-canonical-ar-ledger-v3'
    },
    items,
    pagination
  };
}

async function loadDebtBalancesForCustomers(customers = []) {
  // Official mobile/customer debt source. Never fall back to Customer/SalesOrder
  // debt cache fields here; arLedgers is the accounting SSoT.
  return arBalanceService.loadCustomerBalances(customers);
}

module.exports = {
  MOBILE_AR_DEBT_CATEGORIES,
  DEBT_LEDGER_PROJECTION,
  activeArFilter,
  getMobileCustomerDebts,
  loadDebtBalancesForCustomers,
  _internal: {
    activeArFilter,
    categoryCondition,
    staffSeedCondition,
    scopedArContext,
    scopedArMatch,
    pendingFilter,
    summarizePending,
    orderKeysFromSeed,
    orderRefCondition,
    orderCodeOf,
    orderIdOf,
    orderKeysFromRow,
    expandOrderKeys,
    isMobileCanonicalDebtLedger,
    groupOrders,
    buildCustomersFromOrders,
    ledgerDebit,
    ledgerCredit,
    assignmentFromRow,
    getArLedgerCategoryEffect
  }
};
