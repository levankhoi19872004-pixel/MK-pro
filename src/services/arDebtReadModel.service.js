'use strict';

const dateUtil = require('../utils/date.util');
const { toNumber } = require('../utils/common.util');
const { DEBT_ZERO_TOLERANCE, normalizeDebtAmount, hasOpenDebt } = require('../constants/finance.constants');
const {
  isCanonicalArDebtLedger,
  PHASE87_READ_MODEL_CATEGORIES,
  normalizeAccountingAmount,
  validateArLedgerContract
} = require('../domain/ar/arLedgerValidator');
const arLedgerReadService = require('./arLedgerRead.service');
const {
  filterReadModelEligibleArLedgers,
  isArDebtReversalLedger,
  reversalOriginalKeys
} = require('../domain/ar/arLedgerQueryPolicy');

let models = null;
function getModels() {
  if (models) return models;
  models = {
    ArLedger: require('../models/ArLedger'),
    ArDebtOrder: require('../models/ArDebtOrder'),
    ArDebtCustomer: require('../models/ArDebtCustomer')
  };
  return models;
}

function setModelsForTest(nextModels) {
  models = nextModels || null;
}

function clean(value = '') {
  return String(value ?? '').trim();
}

function lower(value = '') {
  return clean(value).toLowerCase();
}

function escapeRegExp(value = '') {
  return clean(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function ledgerId(row = {}) {
  return clean(row.id || row.code || row._id);
}

function sourceId(row = {}) {
  return clean(row.sourceId || row.salesOrderId || row.orderId || row.refId);
}

function sourceCode(row = {}) {
  return clean(row.sourceCode || row.salesOrderCode || row.orderCode || row.refCode || sourceId(row));
}

function ledgerDate(row = {}) {
  return dateUtil.toDateOnly(row.date || row.documentDate || row.deliveryDate || row.createdAt || '', '');
}

function effect(row = {}) {
  const { debit, credit } = normalizeAccountingAmount(row);
  return debit - credit;
}

function buildCanonicalLedgerMongoMatch(extra = {}) {
  return arLedgerReadService.buildCanonicalArLedgerMatch(extra);
}

function normalizeCanonicalLedger(row = {}) {
  const amounts = normalizeAccountingAmount(row);
  return {
    ...row,
    id: ledgerId(row),
    sourceType: clean(row.sourceType),
    sourceId: sourceId(row),
    sourceCode: sourceCode(row),
    customerCode: clean(row.customerCode),
    customerName: clean(row.customerName),
    category: clean(row.category).toUpperCase(),
    ledgerType: clean(row.ledgerType).toUpperCase(),
    entryType: clean(row.entryType),
    debit: amounts.debit,
    credit: amounts.credit,
    amount: amounts.amount,
    direction: amounts.direction,
    amountField: amounts.amountField,
    date: ledgerDate(row),
    salesStaffCode: clean(row.salesStaffCode || row.salesmanCode || row.nvbhCode),
    salesStaffName: clean(row.salesStaffName || row.salesmanName || row.nvbhName),
    deliveryStaffCode: clean(row.deliveryStaffCode || row.deliveryCode || row.nvghCode),
    deliveryStaffName: clean(row.deliveryStaffName || row.deliveryName || row.nvghName),
    masterOrderId: clean(row.masterOrderId),
    masterOrderCode: clean(row.masterOrderCode),
    effect: amounts.debit - amounts.credit
  };
}

function groupCanonicalLedgers(ledgerRows = [], options = {}) {
  const rawCanonical = [];
  const rejected = [];
  for (const row of Array.isArray(ledgerRows) ? ledgerRows : []) {
    if (isCanonicalArDebtLedger(row) && PHASE87_READ_MODEL_CATEGORIES.includes(clean(row.category).toUpperCase())) rawCanonical.push(row);
    else rejected.push({ ledgerId: ledgerId(row), validation: validateArLedgerContract(row) });
  }
  const eligibleRows = filterReadModelEligibleArLedgers(rawCanonical);
  const eligibleSet = new Set(eligibleRows);
  for (const row of rawCanonical) {
    if (!eligibleSet.has(row) && isArDebtReversalLedger(row)) {
      rejected.push({
        ledgerId: ledgerId(row),
        validation: {
          ok: false,
          category: clean(row.category).toUpperCase(),
          errors: [{
            code: 'ORPHAN_AR_REVERSAL_EXCLUDED_FROM_DEBT_READ_MODEL',
            field: 'reversedLedgerId',
            reason: 'Active reversal ledger has no active original ledger in the same canonical read set.',
            originalKeys: reversalOriginalKeys(row)
          }]
        }
      });
    }
  }
  const canonical = eligibleRows.map(normalizeCanonicalLedger);

  const orderMap = new Map();
  for (const ledger of canonical) {
    const key = `${ledger.customerCode}::${ledger.sourceId}`;
    if (!orderMap.has(key)) {
      orderMap.set(key, {
        id: `DEBT-ORDER:${ledger.customerCode}:${ledger.sourceId}`,
        customerCode: ledger.customerCode,
        customerName: ledger.customerName,
        sourceType: ledger.sourceType,
        sourceId: ledger.sourceId,
        sourceCode: ledger.sourceCode,
        salesStaffCode: ledger.salesStaffCode,
        salesStaffName: ledger.salesStaffName,
        deliveryStaffCode: ledger.deliveryStaffCode,
        deliveryStaffName: ledger.deliveryStaffName,
        masterOrderId: ledger.masterOrderId,
        masterOrderCode: ledger.masterOrderCode,
        debit: 0,
        credit: 0,
        remainingDebt: 0,
        rawDebt: 0,
        ledgerCount: 0,
        ledgerIds: [],
        lastDebtDate: '',
        status: 'paid',
        rebuiltAt: options.rebuiltAt || dateUtil.nowIso(),
        readModelVersion: 'phase87-single-ar-debt-closeout-v2'
      });
    }
    const target = orderMap.get(key);
    if (ledger.category === 'AR-DEBT-OPEN') {
      target.salesStaffCode = ledger.salesStaffCode || target.salesStaffCode;
      target.salesStaffName = ledger.salesStaffName || target.salesStaffName;
      target.deliveryStaffCode = ledger.deliveryStaffCode || target.deliveryStaffCode;
      target.deliveryStaffName = ledger.deliveryStaffName || target.deliveryStaffName;
      target.masterOrderId = ledger.masterOrderId || target.masterOrderId;
      target.masterOrderCode = ledger.masterOrderCode || target.masterOrderCode;
    }
    target.debit += ledger.debit;
    target.credit += ledger.credit;
    target.ledgerCount += 1;
    target.ledgerIds.push(ledger.id);
    if (!target.lastDebtDate || ledger.date > target.lastDebtDate) target.lastDebtDate = ledger.date;
  }

  const debtOrders = Array.from(orderMap.values()).map((row) => {
    row.debit = Math.round(row.debit);
    row.credit = Math.round(row.credit);
    row.rawDebt = Math.round(row.debit - row.credit);
    row.remainingDebt = normalizeDebtAmount(row.rawDebt, DEBT_ZERO_TOLERANCE);
    row.status = hasOpenDebt(row.remainingDebt) ? 'open' : 'paid';
    return row;
  }).sort((a, b) => Math.abs(b.remainingDebt) - Math.abs(a.remainingDebt) || a.customerName.localeCompare(b.customerName, 'vi'));

  const customerMap = new Map();
  for (const order of debtOrders) {
    const key = order.customerCode || order.customerName || '(missing)';
    if (!customerMap.has(key)) {
      customerMap.set(key, {
        id: `DEBT-CUSTOMER:${key}`,
        customerCode: order.customerCode,
        customerName: order.customerName,
        salesStaffCode: order.salesStaffCode,
        salesStaffName: order.salesStaffName,
        deliveryStaffCode: order.deliveryStaffCode,
        deliveryStaffName: order.deliveryStaffName,
        debit: 0,
        credit: 0,
        rawDebt: 0,
        remainingDebt: 0,
        orderCount: 0,
        ledgerCount: 0,
        lastDebtDate: '',
        status: 'paid',
        rebuiltAt: order.rebuiltAt,
        readModelVersion: order.readModelVersion
      });
    }
    const customer = customerMap.get(key);
    if (!customer.salesStaffCode && order.salesStaffCode) customer.salesStaffCode = order.salesStaffCode;
    if (!customer.salesStaffName && order.salesStaffName) customer.salesStaffName = order.salesStaffName;
    if (!customer.deliveryStaffCode && order.deliveryStaffCode) customer.deliveryStaffCode = order.deliveryStaffCode;
    if (!customer.deliveryStaffName && order.deliveryStaffName) customer.deliveryStaffName = order.deliveryStaffName;
    customer.debit += order.debit;
    customer.credit += order.credit;
    customer.rawDebt += order.rawDebt;
    customer.remainingDebt += order.remainingDebt;
    customer.orderCount += hasOpenDebt(order.remainingDebt) ? 1 : 0;
    customer.ledgerCount += order.ledgerCount;
    if (!customer.lastDebtDate || order.lastDebtDate > customer.lastDebtDate) customer.lastDebtDate = order.lastDebtDate;
  }

  const debtCustomers = Array.from(customerMap.values()).map((row) => {
    row.debit = Math.round(row.debit);
    row.credit = Math.round(row.credit);
    row.rawDebt = Math.round(row.rawDebt);
    row.remainingDebt = normalizeDebtAmount(row.rawDebt, DEBT_ZERO_TOLERANCE);
    row.status = hasOpenDebt(row.remainingDebt) ? 'open' : 'paid';
    return row;
  }).sort((a, b) => Math.abs(b.remainingDebt) - Math.abs(a.remainingDebt) || a.customerName.localeCompare(b.customerName, 'vi'));

  return { canonicalLedgers: canonical, rejectedLedgers: rejected, debtOrders, debtCustomers };
}

async function loadCanonicalLedgerRows(filter = {}, options = {}) {
  const { ArLedger } = getModels();
  arLedgerReadService.setModelsForTest({ ArLedger });
  return arLedgerReadService.getCanonicalArLedgers(filter, { ...options, includeRejected: false });
}

function sourceFilter(sourceIdValue) {
  const value = clean(sourceIdValue);
  return value ? { sourceId: value } : {};
}

function customerFilter(customerCode) {
  const value = clean(customerCode);
  return value ? { customerCode: value } : {};
}


function debtOrderIdentity(row = {}) {
  return clean(row.id || (row.customerCode && row.sourceId ? `DEBT-ORDER:${row.customerCode}:${row.sourceId}` : ''));
}

function debtCustomerIdentity(row = {}) {
  const code = clean(row.customerCode);
  return clean(row.id || (code ? `DEBT-CUSTOMER:${code}` : ''));
}

function buildDebtCustomerSummaryFromOrders(orderRows = [], customerCodeValue = '', options = {}) {
  const customerCode = clean(customerCodeValue);
  const rows = (Array.isArray(orderRows) ? orderRows : [])
    .filter((row) => !customerCode || clean(row.customerCode) === customerCode);
  if (!rows.length) return null;
  const rebuiltAt = options.rebuiltAt || dateUtil.nowIso();
  const summary = {
    id: `DEBT-CUSTOMER:${customerCode || clean(rows[0].customerCode)}`,
    customerCode: customerCode || clean(rows[0].customerCode),
    customerName: clean(rows[0].customerName),
    salesStaffCode: clean(rows[0].salesStaffCode),
    salesStaffName: clean(rows[0].salesStaffName),
    deliveryStaffCode: clean(rows[0].deliveryStaffCode),
    deliveryStaffName: clean(rows[0].deliveryStaffName),
    debit: 0,
    credit: 0,
    rawDebt: 0,
    remainingDebt: 0,
    orderCount: 0,
    ledgerCount: 0,
    lastDebtDate: '',
    status: 'paid',
    rebuiltAt,
    readModelVersion: rows[0].readModelVersion || 'phase87-single-ar-debt-closeout-v2'
  };
  for (const row of rows) {
    if (!summary.customerName && row.customerName) summary.customerName = clean(row.customerName);
    if (!summary.salesStaffCode && row.salesStaffCode) summary.salesStaffCode = clean(row.salesStaffCode);
    if (!summary.salesStaffName && row.salesStaffName) summary.salesStaffName = clean(row.salesStaffName);
    if (!summary.deliveryStaffCode && row.deliveryStaffCode) summary.deliveryStaffCode = clean(row.deliveryStaffCode);
    if (!summary.deliveryStaffName && row.deliveryStaffName) summary.deliveryStaffName = clean(row.deliveryStaffName);
    summary.debit += Math.round(toNumber(row.debit));
    summary.credit += Math.round(toNumber(row.credit));
    summary.rawDebt += Math.round(toNumber(row.rawDebt ?? (toNumber(row.debit) - toNumber(row.credit))));
    summary.remainingDebt += Math.round(toNumber(row.remainingDebt));
    summary.orderCount += hasOpenDebt(row.remainingDebt) ? 1 : 0;
    summary.ledgerCount += Math.round(toNumber(row.ledgerCount));
    if (!summary.lastDebtDate || clean(row.lastDebtDate) > summary.lastDebtDate) summary.lastDebtDate = clean(row.lastDebtDate);
  }
  summary.debit = Math.round(summary.debit);
  summary.credit = Math.round(summary.credit);
  summary.rawDebt = Math.round(summary.rawDebt);
  summary.remainingDebt = normalizeDebtAmount(summary.rawDebt, DEBT_ZERO_TOLERANCE);
  summary.status = hasOpenDebt(summary.remainingDebt) ? 'open' : 'paid';
  return summary;
}

async function replaceDebtOrdersById(ArDebtOrder, debtOrders = [], options = {}) {
  const session = options.session;
  const rows = (Array.isArray(debtOrders) ? debtOrders : [])
    .map((row) => ({ ...row, id: debtOrderIdentity(row) }))
    .filter((row) => row.id);
  if (!rows.length) return { upsertedOrders: 0 };
  if (typeof ArDebtOrder.bulkWrite === 'function') {
    const result = await ArDebtOrder.bulkWrite(rows.map((row) => ({
      replaceOne: {
        filter: { id: row.id },
        replacement: row,
        upsert: true
      }
    })), { ordered: false, session });
    return {
      upsertedOrders: rows.length,
      bulkResult: {
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount,
        upsertedCount: result.upsertedCount
      }
    };
  }
  for (const row of rows) {
    await ArDebtOrder.updateOne({ id: row.id }, { $set: row }, { upsert: true, session });
  }
  return { upsertedOrders: rows.length };
}

async function replaceDebtCustomer(ArDebtCustomer, customer = null, customerCodeValue = '', options = {}) {
  const session = options.session;
  const customerCode = clean(customerCodeValue || customer?.customerCode);
  if (!customer) {
    if (!customerCode) return { upsertedCustomers: 0, deletedCustomers: 0 };
    const deleted = await ArDebtCustomer.deleteOne({ customerCode }, { session });
    return { upsertedCustomers: 0, deletedCustomers: deleted.deletedCount || 0 };
  }
  const row = { ...customer, id: debtCustomerIdentity(customer) };
  const filter = row.customerCode ? { customerCode: row.customerCode } : { id: row.id };
  const result = await ArDebtCustomer.updateOne(filter, { $set: row }, { upsert: true, session });
  return {
    upsertedCustomers: 1,
    matchedCount: result.matchedCount,
    modifiedCount: result.modifiedCount,
    upsertedCount: result.upsertedCount || 0
  };
}

async function persistReadModel(result, scope = {}, options = {}) {
  const { ArDebtOrder, ArDebtCustomer } = getModels();
  if (options.dryRun) return { dryRun: true, writtenOrders: 0, writtenCustomers: 0 };
  const session = options.session;
  const sourceId = clean(scope.sourceId);
  const customerCode = clean(scope.customerCode);

  if (sourceId) {
    const debtOrders = Array.isArray(result.debtOrders) ? result.debtOrders : [];
    const orderWrite = await replaceDebtOrdersById(ArDebtOrder, debtOrders, options);
    let staleOrderDelete = { deletedCount: 0, skipped: true };
    if (!debtOrders.length && options.deleteStaleOrders === true) {
      // Explicit maintenance/correction-only cleanup. The delivery closeout hot path
      // must not issue destructive deleteMany round-trips when it has just posted
      // or idempotently found AR-DEBT-OPEN for a known source.
      staleOrderDelete = await ArDebtOrder.deleteOne({ sourceId }, { session });
    }
    return {
      dryRun: false,
      writtenOrders: debtOrders.length,
      writtenCustomers: 0,
      upsertedOrders: orderWrite.upsertedOrders || 0,
      staleOrdersDeleted: staleOrderDelete.deletedCount || 0,
      staleOrderCleanupSkipped: staleOrderDelete.skipped === true
    };
  }

  if (customerCode) {
    const debtOrders = (result.debtOrders || []).filter((row) => clean(row.customerCode) === customerCode);
    const debtCustomers = (result.debtCustomers || []).filter((row) => clean(row.customerCode) === customerCode);
    const orderWrite = await replaceDebtOrdersById(ArDebtOrder, debtOrders, options);
    // Do not run destructive stale-order cleanup by customer in the
    // closeout/read-model refresh path. In production this cleanup became
    // the slowest query for POST /api/new/delivery-today/closeout.
    // Full destructive cleanup remains available through rebuildAllDebtReadModels().
    const customerWrite = await replaceDebtCustomer(ArDebtCustomer, debtCustomers[0] || null, customerCode, options);
    return {
      dryRun: false,
      writtenOrders: debtOrders.length,
      writtenCustomers: debtCustomers.length ? 1 : 0,
      staleOrdersDeleted: 0,
      staleOrderCleanupSkipped: true,
      upsertedOrders: orderWrite.upsertedOrders || 0,
      upsertedCustomers: customerWrite.upsertedCustomers || 0,
      customerWrite
    };
  }

  if (options.allowFullRebuild === true) {
    await ArDebtOrder.deleteMany({}, { session });
    await ArDebtCustomer.deleteMany({}, { session });
    if (result.debtOrders.length) await ArDebtOrder.insertMany(result.debtOrders, { ordered: false, session });
    if (result.debtCustomers.length) await ArDebtCustomer.insertMany(result.debtCustomers, { ordered: false, session });
    return { dryRun: false, writtenOrders: result.debtOrders.length, writtenCustomers: result.debtCustomers.length };
  }

  const err = new Error('Refuse to rebuild AR debt read model without explicit scope');
  err.code = 'AR_DEBT_READ_MODEL_SCOPE_REQUIRED';
  throw err;
}

async function rebuildDebtForSource(sourceIdValue, options = {}) {
  const rows = await loadCanonicalLedgerRows(sourceFilter(sourceIdValue), options);
  const result = groupCanonicalLedgers(rows, options);
  result.persist = await persistReadModel(result, { sourceId: clean(sourceIdValue) }, options);
  return { scope: 'source', sourceId: clean(sourceIdValue), ...result };
}

async function rebuildDebtForCustomer(customerCode, options = {}) {
  const rows = await loadCanonicalLedgerRows(customerFilter(customerCode), options);
  const result = groupCanonicalLedgers(rows, options);
  result.persist = await persistReadModel(result, { customerCode: clean(customerCode) }, options);
  return { scope: 'customer', customerCode: clean(customerCode), ...result };
}


async function refreshDebtCustomerFromOrders(customerCodeValue, options = {}) {
  const customerCode = clean(customerCodeValue);
  if (!customerCode) {
    const err = new Error('Missing customerCode for AR debt customer refresh');
    err.code = 'AR_DEBT_CUSTOMER_REFRESH_CUSTOMER_REQUIRED';
    throw err;
  }
  const { ArDebtOrder, ArDebtCustomer } = getModels();
  if (options.dryRun) {
    const query = ArDebtOrder.find({ customerCode });
    if (typeof query.lean === 'function') query.lean();
    const orderRows = await query;
    const debtCustomer = buildDebtCustomerSummaryFromOrders(orderRows, customerCode, options);
    return { scope: 'customer-summary', customerCode, dryRun: true, debtCustomer, persist: { dryRun: true, writtenCustomers: 0 } };
  }
  const session = options.session;
  const query = ArDebtOrder.find({ customerCode });
  if (typeof query.lean === 'function') query.lean();
  if (typeof query.session === 'function' && session) query.session(session);
  const orderRows = await query;
  const debtCustomer = buildDebtCustomerSummaryFromOrders(orderRows, customerCode, options);
  const customerWrite = await replaceDebtCustomer(ArDebtCustomer, debtCustomer, customerCode, options);
  return {
    scope: 'customer-summary',
    customerCode,
    orderCount: orderRows.length,
    debtCustomer,
    persist: {
      dryRun: false,
      writtenOrders: 0,
      writtenCustomers: debtCustomer ? 1 : 0,
      customerWrite
    }
  };
}

async function rebuildAllDebtReadModels(options = {}) {
  const rows = await loadCanonicalLedgerRows({}, options);
  const result = groupCanonicalLedgers(rows, options);
  result.persist = await persistReadModel(result, {}, { ...options, allowFullRebuild: true });
  return { scope: 'all', ...result };
}


function debtDisplayAmount(row = {}) {
  return normalizeDebtAmount(row.remainingDebtDisplay ?? row.debt ?? row.remainingDebt ?? row.rawDebt ?? 0, DEBT_ZERO_TOLERANCE);
}

function exposeDebtCustomer(row = {}) {
  const debt = debtDisplayAmount(row);
  return {
    ...row,
    debt,
    totalDebt: debt,
    totalDebtDisplay: debt,
    remainingDebtDisplay: debt,
    salesmanCode: row.salesmanCode || row.salesStaffCode || '',
    salesmanName: row.salesmanName || row.salesStaffName || '',
    deliveryCode: row.deliveryCode || row.deliveryStaffCode || '',
    deliveryName: row.deliveryName || row.deliveryStaffName || ''
  };
}

function exposeDebtOrder(row = {}) {
  const debt = debtDisplayAmount(row);
  return {
    ...row,
    debt,
    remainingDebtDisplay: debt,
    orderId: row.orderId || row.sourceId || '',
    orderCode: row.orderCode || row.sourceCode || '',
    documentDate: row.documentDate || row.lastDebtDate || '',
    dueDate: row.dueDate || row.lastDebtDate || '',
    salesmanCode: row.salesmanCode || row.salesStaffCode || '',
    salesmanName: row.salesmanName || row.salesStaffName || '',
    deliveryCode: row.deliveryCode || row.deliveryStaffCode || '',
    deliveryName: row.deliveryName || row.deliveryStaffName || ''
  };
}

function matchesStatus(row = {}, status = 'open') {
  const normalized = lower(status || 'open');
  if (['all', ''].includes(normalized)) return true;
  if (['open', 'unpaid', 'debt', 'khach_con_no', 'khách còn nợ'].includes(normalized)) return hasOpenDebt(row.remainingDebt);
  if (['paid', 'settled', 'het_no', 'hết nợ'].includes(normalized)) return !hasOpenDebt(row.remainingDebt);
  return lower(row.status) === normalized;
}

function codeEquals(actual, expected) {
  const left = clean(actual);
  const right = clean(expected);
  if (!right) return true;
  // Staff filters are still code-only filters, but compare normalized text so
  // production rows using GHTH and UI input ghth do not disappear.
  return lower(left) === lower(right);
}

function applyFilters(rows = [], filters = {}) {
  let out = [...rows];
  const q = lower(filters.q || filters.search || filters.keyword);
  if (q) {
    out = out.filter((row) => [row.customerCode, row.customerName, row.sourceCode, row.sourceId].some((value) => lower(value).includes(q)));
  }
  const customer = clean(filters.customerCode || filters.code || filters.customerId);
  if (customer) out = out.filter((row) => [row.customerCode, row.customerName].some((value) => lower(value) === lower(customer) || lower(value).includes(lower(customer))));
  const sales = clean(filters.salesStaffCode || filters.salesman);
  if (sales) out = out.filter((row) => codeEquals(row.salesStaffCode, sales));
  const delivery = clean(filters.deliveryStaffCode || filters.delivery);
  if (delivery) out = out.filter((row) => codeEquals(row.deliveryStaffCode, delivery));
  out = out.filter((row) => matchesStatus(row, filters.status || 'open'));
  return out;
}

function paginate(rows = [], filters = {}) {
  const page = Math.max(1, Math.floor(toNumber(filters.page) || 1));
  const limit = Math.min(Math.max(1, Math.floor(toNumber(filters.limit) || 50)), 200);
  const skip = (page - 1) * limit;
  return { page, limit, total: rows.length, hasMore: rows.length > skip + limit, rows: rows.slice(skip, skip + limit) };
}

async function readModelRows(Model, filters = {}) {
  const query = Model.find({});
  if (typeof query.lean === 'function') query.lean();
  const rows = await query;
  return applyFilters(rows, filters);
}

async function getDebtCustomers(filters = {}) {
  const { ArDebtCustomer, ArDebtOrder } = getModels();
  let rows = await readModelRows(ArDebtCustomer, filters);
  let orderRows = await readModelRows(ArDebtOrder, filters);
  if (!rows.length && filters.live === true) {
    const rebuilt = await rebuildAllDebtReadModels({ dryRun: true });
    rows = applyFilters(rebuilt.debtCustomers, filters);
    orderRows = applyFilters(rebuilt.debtOrders, filters);
  }
  const page = paginate(rows, filters);
  const pageCustomerCodes = new Set(page.rows.map((row) => clean(row.customerCode)).filter(Boolean));
  const pageOrders = orderRows.filter((row) => !pageCustomerCodes.size || pageCustomerCodes.has(clean(row.customerCode)));
  const summary = {
    page: page.page,
    limit: page.limit,
    total: page.total,
    hasMore: page.hasMore,
    totalDebt: rows.filter((row) => hasOpenDebt(row.remainingDebt)).reduce((sum, row) => sum + Math.max(0, row.remainingDebt), 0),
    customerDebtCount: rows.filter((row) => hasOpenDebt(row.remainingDebt)).length,
    customerCount: rows.length,
    orderDebtCount: orderRows.filter((row) => hasOpenDebt(row.remainingDebt)).length,
    orderCount: orderRows.length,
    readModelEmpty: rows.length === 0 && orderRows.length === 0,
    debtZeroTolerance: DEBT_ZERO_TOLERANCE,
    source: 'arDebtCustomers',
    usesSnapshot: false
  };
  const exposedCustomers = page.rows.map(exposeDebtCustomer);
  const exposedOrders = pageOrders.map(exposeDebtOrder);
  return {
    source: 'phase79_ar_debt_read_model',
    readModelCollections: { debtCustomers: 'arDebtCustomers', debtOrders: 'arDebtOrders' },
    customers: exposedCustomers,
    customerSummary: exposedCustomers,
    debts: exposedCustomers,
    orders: exposedOrders,
    summary,
    debugSource: { source: 'canonical arLedgers -> arDebtCustomers/arDebtOrders', usesSnapshot: false, readModel: 'arDebtReadModel.service' }
  };
}

async function getDebtOrders(customerCode, filters = {}) {
  const { ArDebtOrder } = getModels();
  const scoped = { ...filters, customerCode: customerCode || filters.customerCode || filters.code };
  let rows = await readModelRows(ArDebtOrder, scoped);
  if (!rows.length && filters.live === true) {
    const rebuilt = scoped.customerCode ? await rebuildDebtForCustomer(scoped.customerCode, { dryRun: true }) : await rebuildAllDebtReadModels({ dryRun: true });
    rows = applyFilters(rebuilt.debtOrders, scoped);
  }
  const page = paginate(rows, scoped);
  const summary = {
    page: page.page,
    limit: page.limit,
    total: page.total,
    hasMore: page.hasMore,
    totalDebt: rows.filter((row) => hasOpenDebt(row.remainingDebt)).reduce((sum, row) => sum + Math.max(0, row.remainingDebt), 0),
    orderDebtCount: rows.filter((row) => hasOpenDebt(row.remainingDebt)).length,
    orderCount: rows.length,
    debtZeroTolerance: DEBT_ZERO_TOLERANCE,
    source: 'arDebtOrders',
    usesSnapshot: false
  };
  const exposedOrders = page.rows.map(exposeDebtOrder);
  return {
    source: 'phase79_ar_debt_read_model',
    readModelCollections: { debtCustomers: 'arDebtCustomers', debtOrders: 'arDebtOrders' },
    customerCode: scoped.customerCode || '',
    orders: exposedOrders,
    debts: exposedOrders,
    customerSummary: [],
    customers: [],
    summary,
    debugSource: { source: 'canonical arLedgers -> arDebtOrders', usesSnapshot: false, readModel: 'arDebtReadModel.service' }
  };
}

module.exports = {
  buildCanonicalLedgerMongoMatch,
  groupCanonicalLedgers,
  setModelsForTest,
  rebuildDebtForSource,
  rebuildDebtForCustomer,
  refreshDebtCustomerFromOrders,
  rebuildAllDebtReadModels,
  getDebtCustomers,
  getDebtOrders
};
