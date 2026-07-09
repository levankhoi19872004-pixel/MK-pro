'use strict';

const reportService = require('./reportService');
const DebtCollection = require('../models/DebtCollection');
const ArLedger = require('../models/ArLedger');
const dateUtil = require('../utils/date.util');
const { toNumber } = require('../utils/common.util');
const arLedgerUtil = require('../utils/arLedger.util');
const { normalizeDebtAmount, hasOpenDebt } = require('../constants/finance.constants');
const {
  loadDebtBalancesForCustomers,
  activeArFilter: buildMobileActiveArFilter
} = require('./mobile/mobileDebtQuery.service');
const { listMobileDebtsFromDebtNew } = require('./mobile/mobileDebtNewAdapter.service');
const DebtCollectionPolicy = require('../policies/debtCollection.policy');
const {
  isCloseoutCorrectionKey,
  extractSalesOrderIdFromCloseoutCorrectionKey,
  canonicalDebtOrderIdentity,
  debtOrderAliasKeys
} = require('../utils/debtOrderIdentity.util');

const PENDING_STATUSES = ['submitted', 'under_review'];
const INACTIVE_AR_STATUSES = ['void', 'cancelled', 'canceled', 'deleted', 'duplicate_cancelled', 'reversed'];

function text(value) {
  return String(value || '').trim();
}

function lower(value) {
  return text(value).toLowerCase();
}

function canonicalKey(value) {
  return text(value).toUpperCase();
}

function extractSalesOrderCodeFromReturnToken(value = '') {
  const raw = canonicalKey(value);
  if (!raw) return '';
  const direct = raw.match(/^RO-([A-Z0-9]+)$/i);
  if (direct) return direct[1];
  const idempotency = raw.match(/^AR-RETURN:RO-([A-Z0-9]+)$/i);
  if (idempotency) return idempotency[1];
  const code = raw.match(/(?:^|[-_:])RO-([A-Z0-9]+)(?=$|[-_:])/i);
  return code ? code[1] : '';
}

function expandOrderKeys(values = []) {
  const out = new Set();
  for (const value of values || []) {
    const key = text(value);
    if (!key) continue;
    out.add(key);
    const upper = canonicalKey(key);
    out.add(upper);
    const fromCloseoutCorrection = extractSalesOrderIdFromCloseoutCorrectionKey(key);
    if (fromCloseoutCorrection) out.add(fromCloseoutCorrection);
    const fromReturn = extractSalesOrderCodeFromReturnToken(key);
    if (fromReturn) out.add(fromReturn);
    if (/^[A-Z0-9]+$/i.test(key) && !/^RO-/i.test(key)) {
      out.add(`RO-${key}`);
      out.add(`AR-RETURN:RO-${key}`);
      out.add(`AR-RETURN-RO-${key}`);
      out.add(`RO-${upper}`);
      out.add(`AR-RETURN:RO-${upper}`);
      out.add(`AR-RETURN-RO-${upper}`);
    }
  }
  return [...out].filter(Boolean);
}

function rowOrderKeys(row = {}) {
  return expandOrderKeys(debtOrderAliasKeys(row));
}

function money(value) {
  return Math.max(0, Math.round(toNumber(value)));
}

function withSession(query, session) {
  return session && query && typeof query.session === 'function' ? query.session(session) : query;
}

function cleanOrderCode(row = {}) {
  const identity = canonicalDebtOrderIdentity(row);
  return text(identity.salesOrderCode || identity.canonicalOrderCode || extractSalesOrderCodeFromReturnToken(row.idempotencyKey || row.returnOrderCode || row.sourceCode || row.code) || row.code);
}

function collectionDateFilter(query = {}) {
  const filter = {};
  if (query.fromDate || query.toDate || query.dateFrom || query.dateTo || query.date) {
    const from = dateUtil.toDateOnly(query.fromDate || query.dateFrom || query.date || '');
    const to = dateUtil.toDateOnly(query.toDate || query.dateTo || query.date || '');
    filter.submittedAt = {};
    if (from) filter.submittedAt.$gte = `${from}T00:00:00.000Z`;
    if (to) filter.submittedAt.$lte = `${to}T23:59:59.999Z`;
  }
  return filter;
}

function buildPendingFilter(query = {}) {
  const filter = {
    status: { $in: PENDING_STATUSES },
    ...collectionDateFilter(query)
  };

  if (query.customerCode) filter.customerCode = text(query.customerCode);
  if (query.customerId) filter.customerId = text(query.customerId);
  if (Array.isArray(query.orderCodes) && query.orderCodes.length) {
    const orderCodes = expandOrderKeys(query.orderCodes);
    filter.allocations = {
      $elemMatch: {
        $or: [
          { salesOrderCode: { $in: orderCodes } },
          { orderCode: { $in: orderCodes } },
          { sourceOrderCode: { $in: orderCodes } },
          { refCode: { $in: orderCodes } },
          { salesOrderId: { $in: orderCodes } },
          { orderId: { $in: orderCodes } },
          { sourceOrderId: { $in: orderCodes } },
          { refId: { $in: orderCodes } }
        ]
      }
    };
  }
  if (query.excludeCollectionId) {
    const value = text(query.excludeCollectionId);
    filter.$and = filter.$and || [];
    filter.$and.push({ id: { $ne: value } }, { code: { $ne: value } });
  }

  return filter;
}

function summarizePendingCollections(rows = []) {
  const byCustomer = new Map();
  const byOrder = new Map();
  const collectionsByOrder = new Map();
  let total = 0;

  for (const collection of rows || []) {
    const amount = money(collection.amount);
    total += amount;
    const customerKey = text(collection.customerCode || collection.customerId || collection.customerName);
    if (customerKey) byCustomer.set(customerKey, money((byCustomer.get(customerKey) || 0) + amount));

    const allocations = Array.isArray(collection.allocations) ? collection.allocations : [];
    for (const allocation of allocations) {
      const orderCode = cleanOrderCode(allocation);
      if (!orderCode) continue;
      const allocated = money(allocation.allocatedAmount ?? allocation.amount);
      byOrder.set(orderCode, money((byOrder.get(orderCode) || 0) + allocated));
      const current = collectionsByOrder.get(orderCode) || [];
      current.push({
        id: text(collection.id || collection.code || collection._id),
        code: text(collection.code || collection.id || collection._id),
        status: text(collection.status),
        amount: money(collection.amount),
        allocatedAmount: allocated,
        submittedAt: text(collection.submittedAt || collection.createdAt),
        collectorCode: text(collection.collectorCode || collection.submittedByCode || collection.createdBy)
      });
      collectionsByOrder.set(orderCode, current);
    }
  }

  return { total, byCustomer, byOrder, collectionsByOrder };
}

function pendingAmountForOrder(order = {}, pendingByOrder = new Map()) {
  const keys = rowOrderKeys(order);
  for (const key of keys) {
    const direct = pendingByOrder.get(key);
    if (direct != null) return money(direct);
  }
  return 0;
}

function pendingCollectionsForOrder(order = {}, collectionsByOrder = new Map()) {
  const keys = rowOrderKeys(order);
  for (const key of keys) {
    const rows = collectionsByOrder.get(key);
    if (Array.isArray(rows) && rows.length) return rows;
  }
  return [];
}

function collectibleStateFromRows(rows = [], pendingByOrder = new Map(), collectionsByOrder = new Map()) {
  const attach = (row = {}) => {
    const remainingDebt = Math.max(0, normalizeDebtAmount(row.remainingDebt ?? row.debt ?? row.debtAmount ?? row.availableDebt ?? row.availableDebtAmount ?? 0));
    const pendingCollectedAmount = pendingAmountForOrder(row, pendingByOrder);
    const availableToCollect = Math.max(0, normalizeDebtAmount(remainingDebt - pendingCollectedAmount));
    return {
      ...row,
      remainingDebt,
      debt: normalizeDebtAmount(row.debt ?? row.debtAmount ?? remainingDebt),
      debtAmount: normalizeDebtAmount(row.debtAmount ?? row.debt ?? remainingDebt),
      pendingCollectionAmount: pendingCollectedAmount,
      pendingCollectedAmount,
      availableDebt: availableToCollect,
      availableDebtAmount: availableToCollect,
      availableToCollect,
      collectionLocked: pendingCollectedAmount > 0,
      collectible: availableToCollect > 0,
      pendingCollections: pendingCollectionsForOrder(row, collectionsByOrder)
    };
  };
  return Array.isArray(rows) ? rows.map(attach) : attach(rows || {});
}

function normalizeDebtOrder(order = {}, pending = {}) {
  const identity = canonicalDebtOrderIdentity(order);
  const salesOrderCode = cleanOrderCode(order);
  const salesOrderId = text(identity.salesOrderId || identity.canonicalOrderId || order.salesOrderId || order.orderId || order.id);
  const debt = normalizeDebtAmount(order.debt ?? order.debtAmount ?? order.remainingDebt ?? 0);
  const orderType = text(order.orderType) || (/^NDNBLH/i.test(salesOrderCode) ? 'external_debt' : 'sales_order');
  const state = collectibleStateFromRows({ ...order, salesOrderId, salesOrderCode, debt, remainingDebt: debt }, pending.byOrder || pending || new Map(), pending.collectionsByOrder || new Map());

  return {
    salesOrderId,
    orderId: salesOrderId,
    salesOrderCode,
    orderCode: salesOrderCode,
    canonicalOrderKey: text(identity.canonicalOrderKey || salesOrderId || salesOrderCode),
    canonicalOrderId: text(identity.canonicalOrderId || salesOrderId),
    canonicalOrderCode: text(identity.canonicalOrderCode || salesOrderCode),
    correctionSourceId: text(identity.correctionSourceId),
    correctionSourceCode: text(identity.correctionSourceCode),
    orderType,
    orderDate: dateUtil.toDateOnly(order.documentDate || order.dueDate || order.orderDate || order.date || ''),
    documentDate: dateUtil.toDateOnly(order.documentDate || order.dueDate || order.orderDate || order.date || ''),
    debit: toNumber(order.debit),
    credit: toNumber(order.credit),
    debt,
    debtAmount: debt,
    remainingDebt: debt,
    pendingCollectionAmount: state.pendingCollectedAmount,
    pendingCollectedAmount: state.pendingCollectedAmount,
    availableDebt: state.availableToCollect,
    availableDebtAmount: state.availableToCollect,
    availableToCollect: state.availableToCollect,
    collectionLocked: state.collectionLocked,
    collectible: state.collectible,
    pendingCollections: state.pendingCollections,
    overdueDays: toNumber(order.overdueDays),
    agingDays: toNumber(order.agingDays),
    status: order.status || '',
    salesStaffCode: text(order.salesStaffCode || order.salesmanCode),
    salesStaffName: text(order.salesStaffName || order.salesmanName),
    deliveryStaffCode: text(order.deliveryStaffCode),
    deliveryStaffName: text(order.deliveryStaffName)
  };
}

function normalizeCustomerDebt(row = {}, pending = {}) {
  const customerKey = text(row.customerCode || row.customerId || row.customerName);
  const orders = (Array.isArray(row.orders) ? row.orders : [])
    .map((order) => normalizeDebtOrder(order, pending))
    .filter((order) => hasOpenDebt(order.debt) || order.pendingCollectedAmount > 0);

  const debtAmount = normalizeDebtAmount(row.debt ?? row.debtAmount ?? row.debtAmountTotal ?? 0);
  const orderPendingTotal = orders.reduce((sum, order) => sum + toNumber(order.pendingCollectedAmount), 0);
  const pendingCollectedAmount = money(orders.length ? orderPendingTotal : (pending.byCustomer?.get(customerKey) || 0));
  const availableDebtAmount = Math.max(0, normalizeDebtAmount(debtAmount - pendingCollectedAmount));
  const oldestDebtDate = orders
    .filter((order) => hasOpenDebt(order.debt))
    .map((order) => order.orderDate || order.documentDate || '')
    .filter(Boolean)
    .sort()[0] || '';

  return {
    customerId: text(row.customerId),
    customerCode: text(row.customerCode),
    customerName: text(row.customerName),
    phone: text(row.phone),
    address: text(row.address),
    salesmanCode: text(row.salesmanCode),
    salesmanName: text(row.salesmanName),
    salesStaffCode: text(row.salesStaffCode || row.salesmanCode),
    salesStaffName: text(row.salesStaffName || row.salesmanName),
    deliveryStaffCode: text(row.deliveryStaffCode),
    deliveryStaffName: text(row.deliveryStaffName),
    debtAmount,
    remainingDebt: debtAmount,
    pendingCollectionAmount: pendingCollectedAmount,
    pendingCollectedAmount,
    availableDebt: availableDebtAmount,
    availableDebtAmount,
    availableToCollect: availableDebtAmount,
    collectionLocked: pendingCollectedAmount > 0,
    collectible: availableDebtAmount > 0,
    orderCount: toNumber(row.orderCount || orders.length),
    oldestDebtDate,
    orders,
    ledgers: orders.map((order) => ({
      date: order.documentDate || order.orderDate || '',
      type: order.orderType === 'external_debt' ? 'AR-EXTERNAL-DEBT' : 'AR-SALE',
      orderType: order.orderType,
      salesOrderCode: order.salesOrderCode || '',
      refCode: order.salesOrderCode || '',
      debit: toNumber(order.debit),
      credit: toNumber(order.credit),
      debt: normalizeDebtAmount(order.debt)
    }))
  };
}

async function getPendingCollections(query = {}, options = {}) {
  let q = DebtCollection.find(buildPendingFilter(query)).limit(5000);
  q = withSession(q, options.session || query.session);
  return q.lean();
}

async function getCustomerDebts(query = {}) {
  const scopedQuery = {
    ...query,
    limit: query.limit || 100,
    includePaid: query.includePaid || '0'
  };

  if (query.customerKeyword && !scopedQuery.q) scopedQuery.q = query.customerKeyword;

  const report = await reportService.debtCustomers(scopedQuery);
  const sourceRows = Array.isArray(report.customerSummary) ? report.customerSummary : [];
  const visibleOrderCodes = sourceRows.flatMap((row) => Array.isArray(row.orders) ? row.orders : [])
    .map((order) => cleanOrderCode(order))
    .filter(Boolean);
  // Pending phải khóa chung giữa NVBH/NVGH, nhưng chỉ tính các đơn thuộc scope đang xem.
  // Không lọc theo collectorCode vì người còn lại vẫn phải nhìn thấy phần tiền đã báo thu.
  const pendingRows = String(query.includePendingCollections ?? '1') === '0'
    ? []
    : await getPendingCollections({ ...query, orderCodes: visibleOrderCodes });
  const pending = summarizePendingCollections(pendingRows);
  const items = sourceRows
    .map((row) => normalizeCustomerDebt(row, pending))
    .filter((item) => hasOpenDebt(item.debtAmount) || item.pendingCollectedAmount > 0)
    .sort((a, b) => toNumber(b.availableDebtAmount) - toNumber(a.availableDebtAmount) || toNumber(b.debtAmount) - toNumber(a.debtAmount));

  const summary = {
    ...(report.summary || {}),
    totalDebt: items.reduce((sum, item) => sum + toNumber(item.debtAmount), 0),
    pendingCollected: items.reduce((sum, item) => sum + toNumber(item.pendingCollectedAmount), 0),
    availableDebt: items.reduce((sum, item) => sum + toNumber(item.availableDebtAmount), 0),
    customerCount: items.length,
    orderCount: items.reduce((sum, item) => sum + toNumber(item.orderCount), 0)
  };

  return {
    ok: true,
    source: 'DebtReadService',
    summary,
    items
  };
}

function activeArFilter() {
  return buildMobileActiveArFilter({ entryType: { $ne: 'reversal' } });
}

function orderRefCondition(keys = []) {
  const values = expandOrderKeys(keys);
  return {
    $or: [
      { orderCode: { $in: values } },
      { salesOrderCode: { $in: values } },
      { sourceOrderCode: { $in: values } },
      { refCode: { $in: values } },
      { orderId: { $in: values } },
      { salesOrderId: { $in: values } },
      { sourceOrderId: { $in: values } },
      { sourceId: { $in: values } },
      { sourceCode: { $in: values } },
      { returnOrderId: { $in: values } },
      { returnOrderCode: { $in: values } },
      { idempotencyKey: { $in: values } },
      { code: { $in: values } },
      { id: { $in: values } },
      { refId: { $in: values } }
    ]
  };
}

function rowMatchesOrder(row = {}, key = '') {
  const expected = new Set(expandOrderKeys([key]).map(canonicalKey));
  if (!expected.size) return false;
  return rowOrderKeys(row).some((value) => expected.has(canonicalKey(value)));
}

function pickDebtSourceRow(rows = []) {
  return rows.find((row) => toNumber(row.debit) > 0) || rows[0] || null;
}

const DEBT_ORDER_LEDGER_PROJECTION = 'id code type category ledgerType source sourceId sourceCode sourceType sourceOrderId sourceOrderCode returnOrderId returnOrderCode idempotencyKey refType refId refCode orderId orderCode salesOrderId salesOrderCode customerCode customerName debit credit amount status accountingConfirmed accountingStatus entryType date createdAt salesStaffCode salesStaffName salesmanCode salesmanName nvbhCode nvbhName deliveryStaffCode deliveryStaffName deliveryCode deliveryName nvghCode nvghName';

function assignmentFromRow(row = {}) {
  return {
    salesStaffCode: text(row.salesStaffCode || row.salesmanCode || row.nvbhCode),
    salesStaffName: text(row.salesStaffName || row.salesmanName || row.nvbhName),
    deliveryStaffCode: text(row.deliveryStaffCode || row.deliveryCode || row.nvghCode),
    deliveryStaffName: text(row.deliveryStaffName || row.deliveryName || row.nvghName)
  };
}

function scopeMatches(source = {}, scope = {}) {
  const salesman = lower(scope.salesman || scope.salesStaffCode);
  const delivery = lower(scope.delivery || scope.deliveryStaffCode);
  const assignment = assignmentFromRow(source);
  if (salesman && ![assignment.salesStaffCode, assignment.salesStaffName].some((value) => lower(value) === salesman)) return false;
  if (delivery && ![assignment.deliveryStaffCode, assignment.deliveryStaffName].some((value) => lower(value) === delivery)) return false;
  return true;
}

function debtCollectionAccessForSource(source = {}, input = {}) {
  const actor = input.actor || input.user || input.currentUser;
  if (actor) {
    return DebtCollectionPolicy.canCreateDebtCollection(actor, source, {
      collector: input.collector || {},
      scope: input.collectionScope || ''
    });
  }
  const legacyScope = input.scope || input.query || {};
  if (!scopeMatches(source, legacyScope)) {
    return { allowed: false, scope: 'own', reason: 'legacy_scope_mismatch' };
  }
  return { allowed: true, scope: Object.keys(legacyScope || {}).length ? 'own' : 'all', reason: 'legacy_scope_match' };
}

async function loadOrderDebtRows(orderKeys = [], options = {}) {
  const keys = [...new Set(orderKeys.map(text).filter(Boolean))];
  if (!keys.length) return [];
  // Phase80 compatibility: mobile collection must read the same canonical AR order rows as the old guard.
  /* Static legacy contract marker:
  ArLedger.find({ $and: [activeArFilter(), orderRefCondition(keys)] })
    .select(DEBT_ORDER_LEDGER_PROJECTION)
    .limit(Math.max(200, keys.length * 50))
  */
  let query = ArLedger.find({ $and: [activeArFilter(), orderRefCondition(keys)] });
  if (query && typeof query.select === 'function') query = query.select(DEBT_ORDER_LEDGER_PROJECTION);
  if (query && typeof query.limit === 'function') query = query.limit(Math.max(200, keys.length * 50));
  query = withSession(query, options.session);
  const rows = query && typeof query.lean === 'function' ? await query.lean() : await query;
  return (Array.isArray(rows) ? rows : []).filter((row) => keys.some((key) => rowMatchesOrder(row, key)));
}

async function loadPendingRows(orderKeys = [], options = {}) {
  const keys = expandOrderKeys(orderKeys);
  if (!keys.length) return [];
  const filter = {
    status: { $in: PENDING_STATUSES },
    allocations: {
      $elemMatch: {
        $or: [
          { salesOrderCode: { $in: keys } },
          { orderCode: { $in: keys } },
          { sourceOrderCode: { $in: keys } },
          { refCode: { $in: keys } },
          { salesOrderId: { $in: keys } },
          { orderId: { $in: keys } },
          { sourceOrderId: { $in: keys } },
          { refId: { $in: keys } }
        ]
      }
    }
  };
  if (options.excludeCollectionId) {
    const value = text(options.excludeCollectionId);
    filter.$and = [{ id: { $ne: value } }, { code: { $ne: value } }];
  }
  let query = DebtCollection.find(filter);
  if (query && typeof query.limit === 'function') query = query.limit(5000);
  query = withSession(query, options.session);
  return query && typeof query.lean === 'function' ? query.lean() : query;
}

function pendingForOrder(rows = [], key = '') {
  return rows.reduce((sum, collection) => {
    const allocations = Array.isArray(collection.allocations) ? collection.allocations : [];
    return sum + allocations.reduce((inner, allocation) => {
      return rowMatchesOrder(allocation, key) ? inner + money(allocation.allocatedAmount ?? allocation.amount) : inner;
    }, 0);
  }, 0);
}

async function getOrderDebt(orderCode, options = {}) {
  const key = text(orderCode);
  if (!key) return { officialDebt: 0, pendingAmount: 0, availableDebt: 0, source: null };
  const [rows, pendingRows] = await Promise.all([
    loadOrderDebtRows([key], options),
    loadPendingRows([key], options)
  ]);
  const matching = rows.filter((row) => rowMatchesOrder(row, key));
  const officialDebt = normalizeDebtAmount(matching.reduce((sum, row) => sum + arLedgerUtil.effectiveArDebit(row) - arLedgerUtil.effectiveArCredit(row), 0));
  const pendingAmount = pendingForOrder(pendingRows, key);
  return {
    officialDebt,
    pendingAmount,
    availableDebt: Math.max(0, normalizeDebtAmount(officialDebt - pendingAmount)),
    source: pickDebtSourceRow(matching),
    rows: matching
  };
}

async function sumPendingAllocation(orderCode, options = {}) {
  const rows = await loadPendingRows([orderCode], options);
  return pendingForOrder(rows, orderCode);
}


async function getDebtOrderCollectibleState(input = {}) {
  const allocations = Array.isArray(input.allocations) && input.allocations.length
    ? input.allocations
    : [{
      salesOrderCode: input.salesOrderCode || input.orderCode || input.sourceOrderCode || input.refCode,
      salesOrderId: input.salesOrderId || input.orderId || input.sourceOrderId || input.refId,
      allocatedAmount: input.allocatedAmount || input.amount || input.paymentAmount || 0
    }];
  const keys = allocations.map((row) => text(row.salesOrderCode || row.orderCode || row.sourceOrderCode || row.refCode || row.code || row.salesOrderId || row.orderId || row.sourceOrderId || row.id)).filter(Boolean);
  if (!keys.length) return [];
  const options = {
    session: input.session,
    excludeCollectionId: input.excludeCollectionId || ''
  };
  const [ledgerRows, pendingRows] = await Promise.all([
    loadOrderDebtRows(keys, options),
    loadPendingRows(keys, options)
  ]);
  return keys.map((key) => {
    const matching = ledgerRows.filter((ledger) => rowMatchesOrder(ledger, key));
    const source = pickDebtSourceRow(matching) || {};
    const remainingDebt = Math.max(0, normalizeDebtAmount(matching.reduce((sum, ledger) => sum + arLedgerUtil.effectiveArDebit(ledger) - arLedgerUtil.effectiveArCredit(ledger), 0)));
    const pendingCollectionAmount = pendingForOrder(pendingRows, key);
    const availableToCollect = Math.max(0, normalizeDebtAmount(remainingDebt - pendingCollectionAmount));
    const pendingCollections = (pendingRows || []).flatMap((collection) => (Array.isArray(collection.allocations) ? collection.allocations : [])
      .filter((allocation) => rowMatchesOrder(allocation, key))
      .map((allocation) => ({
        id: text(collection.id || collection.code || collection._id),
        code: text(collection.code || collection.id || collection._id),
        status: text(collection.status),
        amount: money(collection.amount),
        allocatedAmount: money(allocation.allocatedAmount ?? allocation.amount),
        submittedAt: text(collection.submittedAt || collection.createdAt),
        collectorCode: text(collection.collectorCode || collection.submittedByCode || collection.createdBy)
      })));
    const sourceIdentity = canonicalDebtOrderIdentity(source);
    return {
      salesOrderCode: text(sourceIdentity.salesOrderCode || sourceIdentity.canonicalOrderCode || source.salesOrderCode || source.orderCode || source.refCode || key),
      salesOrderId: text(sourceIdentity.salesOrderId || sourceIdentity.canonicalOrderId || source.salesOrderId || source.orderId || source.refId),
      orderCode: text(sourceIdentity.salesOrderCode || sourceIdentity.canonicalOrderCode || source.salesOrderCode || source.orderCode || source.refCode || key),
      orderId: text(sourceIdentity.salesOrderId || sourceIdentity.canonicalOrderId || source.salesOrderId || source.orderId || source.refId),
      canonicalOrderKey: text(sourceIdentity.canonicalOrderKey || key),
      correctionSourceId: text(sourceIdentity.correctionSourceId),
      correctionSourceCode: text(sourceIdentity.correctionSourceCode),
      customerCode: text(source.customerCode || source.customerId || input.customerCode || input.customerId),
      customerName: text(source.customerName || input.customerName),
      remainingDebt,
      debt: remainingDebt,
      debtAmount: remainingDebt,
      pendingCollectionAmount,
      pendingCollectedAmount: pendingCollectionAmount,
      availableToCollect,
      availableDebt: availableToCollect,
      availableDebtAmount: availableToCollect,
      collectionLocked: pendingCollectionAmount > 0,
      collectible: availableToCollect > 0,
      pendingCollections,
      source
    };
  });
}


function normalizeAllocationIdentity(row = {}) {
  const identity = canonicalDebtOrderIdentity(row);
  const requestedKey = text(row.salesOrderCode || row.orderCode || row.sourceOrderCode || row.refCode || row.code || row.salesOrderId || row.orderId || row.sourceOrderId || row.id || row.sourceCode || row.sourceId);
  const key = text(identity.canonicalOrderKey || identity.canonicalOrderId || identity.canonicalOrderCode || extractSalesOrderCodeFromReturnToken(row.idempotencyKey || row.returnOrderCode || row.sourceCode || row.code) || requestedKey);
  const aliases = expandOrderKeys(debtOrderAliasKeys({ ...row, ...identity, sourceCode: row.sourceCode, sourceId: row.sourceId }));
  if (requestedKey) aliases.push(...expandOrderKeys([requestedKey]));
  return {
    key,
    requestedKey,
    requestedOrderId: text(row.salesOrderId || row.orderId || row.id),
    frontendAvailableDebt: money(row.availableDebt ?? row.availableDebtAmount ?? row.availableToCollect ?? 0),
    allocatedAmount: money(row.allocatedAmount ?? row.amount ?? row.paymentAmount),
    aliases: [...new Set(aliases.map(text).filter(Boolean))],
    correctionSourceId: text(identity.correctionSourceId || (isCloseoutCorrectionKey(row.sourceId) ? row.sourceId : '')),
    correctionSourceCode: text(identity.correctionSourceCode || (isCloseoutCorrectionKey(row.sourceCode) ? row.sourceCode : '')),
    identityWarning: identity.warning || ''
  };
}

function matchedLedgerIds(rows = []) {
  return rows.map((ledger) => text(ledger.id || ledger.code || ledger._id)).filter(Boolean);
}

async function checkAvailableDebt(input = {}) {
  const customerCode = text(input.customerCode || input.customerId);
  const allocations = Array.isArray(input.allocations) ? input.allocations : [];
  if (!customerCode) return { ok: false, status: 400, message: 'Thiếu mã khách hàng' };
  if (!allocations.length) return { ok: false, status: 400, message: 'Cần chọn ít nhất một đơn nợ' };

  const normalized = allocations.map(normalizeAllocationIdentity);

  if (normalized.some((row) => !row.key || row.allocatedAmount <= 0)) {
    return { ok: false, status: 400, message: 'Dòng phân bổ thiếu đơn nợ hoặc số tiền' };
  }

  const seenKeys = new Set();
  const duplicateKey = normalized.reduce((found, row) => {
    if (found) return found;
    if (seenKeys.has(row.key)) return row.key;
    seenKeys.add(row.key);
    return '';
  }, '');
  if (duplicateKey) {
    return { ok: false, status: 400, message: `Đơn nợ ${duplicateKey} bị phân bổ trùng` };
  }

  const keys = [...new Set(normalized.flatMap((row) => [row.key, ...(row.aliases || [])]).map(text).filter(Boolean))];
  const options = {
    session: input.session,
    excludeCollectionId: input.excludeCollectionId || ''
  };
  const [ledgerRows, pendingRows] = await Promise.all([
    loadOrderDebtRows(keys, options),
    loadPendingRows(keys, options)
  ]);

  const checkedAllocations = [];
  let total = 0;
  let firstSource = null;
  let firstAssignment = null;

  for (const row of normalized) {
    const matching = ledgerRows.filter((ledger) => rowMatchesOrder(ledger, row.key));
    const source = pickDebtSourceRow(matching);
    if (!source) {
      return {
        ok: false,
        status: 409,
        code: 'DEBT_COLLECTION_ORDER_NOT_FOUND',
        message: `Không tìm thấy đơn nợ ${row.key}`,
        detail: {
          requestedKey: row.requestedKey,
          canonicalOrderKey: row.key,
          aliases: row.aliases || []
        }
      };
    }

    const sourceCustomerCode = text(source.customerCode || source.customerId);
    if (sourceCustomerCode && sourceCustomerCode !== customerCode) {
      return { ok: false, status: 409, message: `Đơn nợ ${row.key} không thuộc khách ${customerCode}` };
    }
    const access = debtCollectionAccessForSource(source, input);
    if (!access.allowed) {
      return {
        ok: false,
        status: 403,
        code: 'DEBT_COLLECTION_ORDER_FORBIDDEN',
        reason: access.reason,
        message: `Bạn không được thu công nợ của đơn ${row.key}`
      };
    }

    const officialDebt = normalizeDebtAmount(matching.reduce((sum, ledger) => sum + arLedgerUtil.effectiveArDebit(ledger) - arLedgerUtil.effectiveArCredit(ledger), 0));
    const pendingAmount = pendingForOrder(pendingRows, row.key);
    const availableDebt = Math.max(0, normalizeDebtAmount(officialDebt - pendingAmount));
    if (row.allocatedAmount > availableDebt + 0.0001) {
      return {
        ok: false,
        status: 409,
        code: 'DEBT_COLLECTION_ALLOCATION_EXCEEDS_AVAILABLE',
        message: `Số tiền thu vượt công nợ còn có thể thu của đơn ${row.key}`,
        detail: {
          requestedKey: row.requestedKey,
          canonicalOrderKey: row.key,
          salesOrderCode: row.key,
          orderCode: row.key,
          requestedAmount: row.allocatedAmount,
          frontendAvailableDebt: row.frontendAvailableDebt || undefined,
          remainingDebt: officialDebt,
          officialDebt,
          pendingCollectionAmount: pendingAmount,
          pendingAmount,
          availableToCollect: availableDebt,
          availableDebt,
          matchedLedgerIds: matchedLedgerIds(matching)
        }
      };
    }

    const assignment = assignmentFromRow(source);
    if (!firstSource) {
      firstSource = source;
      firstAssignment = assignment;
    }

    total += row.allocatedAmount;
    const sourceIdentity = canonicalDebtOrderIdentity(source);
    checkedAllocations.push({
      salesOrderId: text(sourceIdentity.salesOrderId || sourceIdentity.canonicalOrderId || source.salesOrderId || source.orderId || source.refId || row.requestedOrderId),
      salesOrderCode: text(sourceIdentity.salesOrderCode || sourceIdentity.canonicalOrderCode || source.salesOrderCode || source.orderCode || source.refCode || row.key),
      orderId: text(sourceIdentity.salesOrderId || sourceIdentity.canonicalOrderId || source.salesOrderId || source.orderId || source.refId || row.requestedOrderId),
      orderCode: text(sourceIdentity.salesOrderCode || sourceIdentity.canonicalOrderCode || source.salesOrderCode || source.orderCode || source.refCode || row.key),
      canonicalOrderKey: text(sourceIdentity.canonicalOrderKey || row.key),
      correctionSourceId: text(row.correctionSourceId || sourceIdentity.correctionSourceId),
      correctionSourceCode: text(row.correctionSourceCode || sourceIdentity.correctionSourceCode),
      orderType: text(source.orderType) || (lower(source.type) === 'ar_external_debt' ? 'external_debt' : 'sales_order'),
      orderDate: dateUtil.toDateOnly(source.date || source.documentDate || source.createdAt || ''),
      beforeDebt: officialDebt,
      pendingCollectedAmount: pendingAmount,
      availableDebt,
      allocatedAmount: row.allocatedAmount,
      ...assignment
    });
  }

  const assignment = firstAssignment || {};
  return {
    ok: true,
    customerId: text(firstSource?.customerId || input.customerId),
    customerCode: text(firstSource?.customerCode || customerCode),
    customerName: text(firstSource?.customerName),
    debtAmount: checkedAllocations.reduce((sum, row) => sum + toNumber(row.beforeDebt), 0),
    availableDebtAmount: checkedAllocations.reduce((sum, row) => sum + toNumber(row.availableDebt), 0),
    allocatedAmount: total,
    ...assignment,
    allocations: checkedAllocations
  };
}

module.exports = {
  getCustomerDebts,
  getMobileCustomerDebts: (query = {}, options = {}) => listMobileDebtsFromDebtNew({ query, mobileUser: options.mobileUser || query.mobileUser || {}, user: options.user || {} }),
  loadDebtBalancesForCustomers,
  checkAvailableDebt,
  getDebtOrderCollectibleState,
  getOrderDebt,
  sumPendingAllocation,
  _internal: {
    normalizeCustomerDebt,
    normalizeDebtOrder,
    collectibleStateFromRows,
    summarizePendingCollections,
    buildPendingFilter,
    activeArFilter,
    orderRefCondition,
    assignmentFromRow,
    scopeMatches,
    debtCollectionAccessForSource,
    pendingForOrder,
    getDebtOrderCollectibleState,
    extractSalesOrderCodeFromReturnToken,
    expandOrderKeys,
    rowMatchesOrder,
  }
};
