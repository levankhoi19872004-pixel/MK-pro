'use strict';

const dateUtil = require('../../utils/date.util');
const { toNumber } = require('../../utils/common.util');
const {
  DEBT_ZERO_TOLERANCE,
  normalizeDebtAmount,
  hasOpenDebt,
  isOverpaid
} = require('../../constants/finance.constants');
const { isPhase87ReadModelArDebtLedger, PHASE87_READ_MODEL_CATEGORIES, normalizeAccountingAmount, validateArLedgerContract } = require('../../domain/ar/arLedgerValidator');
const { filterReadModelEligibleArLedgers } = require('../../domain/ar/arLedgerQueryPolicy');
const arLedgerReadService = require('../arLedgerRead.service');

const INACTIVE_AR_STATUSES = Object.freeze([
  'void',
  'voided',
  'cancelled',
  'canceled',
  'deleted',
  'removed',
  'reversed',
  'superseded'
]);

const CONFIRMED_AR_ACCOUNTING_STATUSES = Object.freeze([
  'confirmed',
  'locked',
  'posted',
  'accounting_confirmed'
]);

const DEFAULT_QUERY_LIMIT = 5000;

let ArLedgerModel = null;
function getArLedgerModel() {
  if (!ArLedgerModel) ArLedgerModel = require('../../models/ArLedger');
  return ArLedgerModel;
}

function setArLedgerModelForTest(model) {
  ArLedgerModel = model;
  arLedgerReadService.setModelsForTest(model ? { ArLedger: model } : null);
}

function text(value) {
  return String(value ?? '').trim();
}

function lower(value) {
  return text(value).toLowerCase();
}

function upper(value) {
  return text(value).toUpperCase();
}

function asId(value) {
  return text(value && typeof value === 'object' && value.toString ? value.toString() : value);
}

function escapeRegExp(value = '') {
  return text(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function money(value) {
  const n = toNumber(value);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function firstText(source = {}, fields = []) {
  for (const field of fields) {
    const value = text(field.split('.').reduce((current, key) => current?.[key], source));
    if (value) return value;
  }
  return '';
}

function numberFromFields(source = {}, fields = []) {
  for (const field of fields) {
    const raw = field.split('.').reduce((current, key) => current?.[key], source);
    if (raw === undefined || raw === null || text(raw) === '') continue;
    return money(raw);
  }
  return 0;
}

function normalizeDate(value) {
  return dateUtil.toDateOnly(value || '');
}

function daysBetween(later, earlier) {
  const a = normalizeDate(later);
  const b = normalizeDate(earlier);
  if (!a || !b) return 0;
  const da = new Date(`${a}T00:00:00.000Z`);
  const db = new Date(`${b}T00:00:00.000Z`);
  if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return 0;
  return Math.floor((da.getTime() - db.getTime()) / 86400000);
}

function buildActiveArDebtMongoFilter(extra = {}) {
  return {
    ...extra,
    account: /^AR$/i,
    accountingConfirmed: true,
    accountingStatus: { $in: [...CONFIRMED_AR_ACCOUNTING_STATUSES] },
    status: { $nin: [...INACTIVE_AR_STATUSES] },
    lifecycleStatus: { $nin: [...INACTIVE_AR_STATUSES] },
    reversed: { $ne: true },
    isDeleted: { $ne: true },
    deleted: { $ne: true },
    deletedAt: { $in: [null, ''] }
  };
}

function hasSearchCriteria(query = {}) {
  return Boolean(
    text(query.q || query.search || query.keyword)
    || text(query.customerCode || query.customerId || query.code || query.id)
    || text(query.orderCode || query.orderId || query.salesOrderId || query.salesOrderCode)
    || text(query.salesman || query.salesStaffCode || query.salesStaffName)
    || text(query.delivery || query.deliveryStaffCode || query.deliveryStaffName)
    || text(query.date || query.dateFrom || query.dateTo)
  );
}

function appendAnd(match, condition) {
  if (!condition) return match;
  if (!Array.isArray(match.$and)) match.$and = [];
  match.$and.push(condition);
  return match;
}

function buildBaseMongoMatch(query = {}) {
  const match = buildActiveArDebtMongoFilter();

  const tenantId = text(query.tenantId);
  if (tenantId) match.tenantId = tenantId;

  const date = normalizeDate(query.date);
  const dateFrom = normalizeDate(query.dateFrom || query.from || query.fromDate);
  const dateTo = normalizeDate(query.dateTo || query.to || query.toDate);
  if (date) match.date = date;
  else if (dateFrom || dateTo) {
    match.date = {};
    if (dateFrom) match.date.$gte = dateFrom;
    if (dateTo) match.date.$lte = dateTo;
  }

  const customer = text(query.customerCode || query.customerId || query.code || query.id);
  if (customer) {
    const rx = new RegExp(`^${escapeRegExp(customer)}$`, 'i');
    appendAnd(match, { $or: [{ customerCode: rx }, { customerId: rx }, { customerName: rx }] });
  }

  const order = text(query.orderCode || query.orderId || query.salesOrderId || query.salesOrderCode);
  if (order) {
    const rx = new RegExp(`^${escapeRegExp(order)}$`, 'i');
    appendAnd(match, {
      $or: [
        { orderId: rx },
        { orderCode: rx },
        { salesOrderId: rx },
        { salesOrderCode: rx },
        { sourceOrderId: rx },
        { sourceOrderCode: rx },
        { sourceId: rx },
        { sourceCode: rx },
        { returnOrderId: rx },
        { returnOrderCode: rx },
        { refId: rx },
        { refCode: rx }
      ]
    });
  }

  const q = text(query.q || query.search || query.keyword);
  if (q) {
    const rx = new RegExp(escapeRegExp(q), 'i');
    appendAnd(match, {
      $or: [
        { customerCode: rx },
        { customerName: rx },
        { customerId: rx },
        { customerPhone: rx },
        { phone: rx },
        { orderCode: rx },
        { salesOrderCode: rx },
        { orderId: rx },
        { salesOrderId: rx },
        { sourceOrderCode: rx },
        { sourceOrderId: rx },
        { sourceCode: rx },
        { sourceId: rx },
        { returnOrderCode: rx },
        { returnOrderId: rx },
        { refCode: rx },
        { refId: rx },
        { code: rx },
        { id: rx },
        { idempotencyKey: rx }
      ]
    });
  }

  return match;
}

function staffRegex(value) {
  const raw = text(value);
  return raw ? new RegExp(escapeRegExp(raw), 'i') : null;
}

function buildStaffSeedCondition(query = {}) {
  const parts = [];
  const sales = staffRegex(query.salesman || query.salesStaffCode || query.salesStaffName);
  const delivery = staffRegex(query.delivery || query.deliveryStaffCode || query.deliveryStaffName);
  if (sales) {
    parts.push({
      $or: [
        { salesmanCode: sales },
        { salesmanName: sales },
        { salesStaffCode: sales },
        { salesStaffName: sales },
        { nvbhCode: sales },
        { nvbhName: sales }
      ]
    });
  }
  if (delivery) {
    parts.push({
      $or: [
        { deliveryStaffCode: delivery },
        { deliveryStaffName: delivery },
        { deliveryCode: delivery },
        { deliveryName: delivery },
        { nvghCode: delivery },
        { nvghName: delivery }
      ]
    });
  }
  if (!parts.length) return null;
  return parts.length === 1 ? parts[0] : { $and: parts };
}

function candidateOrderKeys(row = {}) {
  return [
    row.salesOrderId,
    row.orderId,
    row.sourceOrderId,
    row.metadata?.salesOrderId,
    row.metadata?.orderId,
    row.salesOrderCode,
    row.orderCode,
    row.sourceOrderCode,
    row.metadata?.salesOrderCode,
    row.metadata?.orderCode,
    row.refId,
    row.refCode,
    row.sourceId,
    row.sourceCode,
    row.returnOrderId,
    row.returnOrderCode,
    row.idempotencyKey,
    row.code,
    row.id
  ].map(text).filter(Boolean);
}

function canonicalOrderKey(row = {}) {
  return firstText(row, [
    'salesOrderId',
    'orderId',
    'sourceOrderId',
    'metadata.salesOrderId',
    'metadata.orderId',
    'salesOrderCode',
    'orderCode',
    'sourceOrderCode',
    'metadata.salesOrderCode',
    'metadata.orderCode'
  ]) || extractOrderCodeFromReturnToken(firstText(row, ['returnOrderId', 'returnOrderCode', 'sourceId', 'sourceCode', 'refId', 'refCode', 'idempotencyKey', 'code', 'id'])) || asId(row._id);
}

function extractOrderCodeFromReturnToken(value = '') {
  const raw = text(value).toUpperCase();
  if (!raw) return '';
  const match = raw.match(/(?:^|[-_:])RO-([A-Z0-9]+)(?=$|[-_:])/i) || raw.match(/^RO-([A-Z0-9]+)$/i);
  return match ? match[1] : '';
}

function expandKeys(values = []) {
  const out = new Set();
  for (const value of values) {
    const key = text(value);
    if (!key) continue;
    out.add(key);
    const fromReturn = extractOrderCodeFromReturnToken(key);
    if (fromReturn) out.add(fromReturn);
  }
  return Array.from(out);
}

async function buildScopedMongoMatch(query = {}) {
  const base = buildBaseMongoMatch(query);
  const staffCondition = buildStaffSeedCondition(query);
  if (!staffCondition) return base;

  const seedMatch = buildActiveArDebtMongoFilter();
  const tenantId = text(query.tenantId);
  if (tenantId) seedMatch.tenantId = tenantId;
  appendAnd(seedMatch, staffCondition);

  const ArLedger = getArLedgerModel();
  const seedRows = await ArLedger.find(seedMatch)
    .select('id code idempotencyKey orderId orderCode salesOrderId salesOrderCode sourceOrderId sourceOrderCode sourceId sourceCode returnOrderId returnOrderCode refId refCode metadata')
    .sort({ date: -1, createdAt: -1, _id: -1 })
    .limit(DEFAULT_QUERY_LIMIT)
    .lean();

  const expanded = expandKeys(seedRows.flatMap(candidateOrderKeys));
  if (!expanded.length) {
    appendAnd(base, { _id: '__NO_AR_LEDGER_STAFF_SCOPE__' });
    return base;
  }

  appendAnd(base, {
    $or: [
      { orderId: { $in: expanded } },
      { orderCode: { $in: expanded } },
      { salesOrderId: { $in: expanded } },
      { salesOrderCode: { $in: expanded } },
      { sourceOrderId: { $in: expanded } },
      { sourceOrderCode: { $in: expanded } },
      { sourceId: { $in: expanded } },
      { sourceCode: { $in: expanded } },
      { returnOrderId: { $in: expanded } },
      { returnOrderCode: { $in: expanded } },
      { refId: { $in: expanded } },
      { refCode: { $in: expanded } },
      { idempotencyKey: { $in: expanded } },
      { code: { $in: expanded } },
      { id: { $in: expanded } }
    ]
  });
  return base;
}


function isActiveConfirmedArDebtLedger(row = {}) {
  const statuses = [row.status, row.lifecycleStatus].map(lower).filter(Boolean);
  if (statuses.some((status) => INACTIVE_AR_STATUSES.includes(status))) return false;
  return isPhase87ReadModelArDebtLedger(row) && PHASE87_READ_MODEL_CATEGORIES.includes(upper(row.category));
}

function normalizeArCategory(row = {}) {
  return upper(row.category);
}
function normalizeLedgerAmounts(row = {}, category = normalizeArCategory(row)) {
  if (!PHASE87_READ_MODEL_CATEGORIES.includes(category)) {
    return { amount: 0, debit: 0, credit: 0, direction: '', amountField: '' };
  }
  return normalizeAccountingAmount(row);
}
function normalizeLedger(row = {}) {
  const category = normalizeArCategory(row);
  const amounts = normalizeLedgerAmounts(row, category);
  const orderKey = canonicalOrderKey(row);
  const documentDate = normalizeDate(row.date || row.documentDate || row.orderDate || row.createdAt);
  return {
    _id: asId(row._id),
    id: firstText(row, ['id']) || asId(row._id),
    code: firstText(row, ['code']),
    category,
    ledgerType: row.ledgerType || '',
    type: row.type || '',
    date: documentDate,
    documentDate,
    orderKey,
    orderId: firstText(row, ['salesOrderId', 'orderId', 'sourceOrderId', 'metadata.salesOrderId', 'metadata.orderId']) || orderKey,
    orderCode: firstText(row, ['salesOrderCode', 'orderCode', 'sourceOrderCode', 'metadata.salesOrderCode', 'metadata.orderCode']) || orderKey,
    salesOrderId: firstText(row, ['salesOrderId', 'orderId', 'sourceOrderId', 'metadata.salesOrderId', 'metadata.orderId']),
    salesOrderCode: firstText(row, ['salesOrderCode', 'orderCode', 'sourceOrderCode', 'metadata.salesOrderCode', 'metadata.orderCode']),
    returnOrderId: firstText(row, ['returnOrderId', 'sourceId', 'refId']),
    returnOrderCode: firstText(row, ['returnOrderCode', 'sourceCode', 'refCode']),
    refId: firstText(row, ['refId']),
    refCode: firstText(row, ['refCode']),
    sourceId: firstText(row, ['sourceId']),
    sourceCode: firstText(row, ['sourceCode']),
    sourceOrderId: firstText(row, ['sourceOrderId']),
    sourceOrderCode: firstText(row, ['sourceOrderCode']),
    customerId: firstText(row, ['customerId']),
    customerCode: firstText(row, ['customerCode']),
    customerName: firstText(row, ['customerName']) || 'Chưa rõ khách',
    phone: firstText(row, ['phone', 'customerPhone']),
    address: firstText(row, ['address', 'customerAddress']),
    salesmanCode: firstText(row, ['salesStaffCode', 'salesmanCode', 'nvbhCode']),
    salesmanName: firstText(row, ['salesStaffName', 'salesmanName', 'nvbhName']),
    salesStaffCode: firstText(row, ['salesStaffCode', 'salesmanCode', 'nvbhCode']),
    salesStaffName: firstText(row, ['salesStaffName', 'salesmanName', 'nvbhName']),
    deliveryStaffCode: firstText(row, ['deliveryStaffCode', 'deliveryCode', 'nvghCode']),
    deliveryStaffName: firstText(row, ['deliveryStaffName', 'deliveryName', 'nvghName']),
    amount: amounts.amount,
    debit: amounts.debit,
    credit: amounts.credit,
    direction: row.direction || (amounts.debit > 0 ? 'debit' : 'credit'),
    status: row.status || '',
    accountingStatus: row.accountingStatus || '',
    accountingConfirmed: row.accountingConfirmed === true,
    tenantId: row.tenantId || '',
    idempotencyKey: row.idempotencyKey || '',
    source: row.source || '',
    sourceType: row.sourceType || '',
    sourceModel: row.sourceModel || '',
    note: row.note || '',
    createdAt: row.createdAt || '',
    ledgerId: asId(row._id) || firstText(row, ['id', 'code'])
  };
}

function ensureOrderGroup(map, ledger = {}) {
  const customerKey = firstText(ledger, ['customerCode', 'customerId', 'customerName']) || 'UNKNOWN_CUSTOMER';
  const orderKey = ledger.orderKey || `${customerKey}:NO_ORDER`;
  const key = `${customerKey}::${orderKey}`;
  if (!map.has(key)) {
    map.set(key, {
      orderKey,
      orderId: ledger.orderId || orderKey,
      orderCode: ledger.orderCode || orderKey,
      salesOrderId: ledger.salesOrderId || ledger.orderId || '',
      salesOrderCode: ledger.salesOrderCode || ledger.orderCode || '',
      date: ledger.documentDate || '',
      documentDate: ledger.documentDate || '',
      dueDate: ledger.documentDate || '',
      customerId: ledger.customerId || '',
      customerCode: ledger.customerCode || '',
      customerName: ledger.customerName || 'Chưa rõ khách',
      phone: ledger.phone || '',
      address: ledger.address || '',
      salesmanCode: '',
      salesmanName: '',
      salesStaffCode: '',
      salesStaffName: '',
      deliveryStaffCode: '',
      deliveryStaffName: '',
      arSaleAmount: 0,
      receiptAmount: 0,
      returnAmount: 0,
      returnReversalAmount: 0,
      bonusAmount: 0,
      adjustmentDebitAmount: 0,
      adjustmentCreditAmount: 0,
      totalDebit: 0,
      totalCredit: 0,
      debit: 0,
      credit: 0,
      remainingDebt: 0,
      remainingDebtDisplay: 0,
      debt: 0,
      rawDebt: 0,
      debtStatus: 'paid',
      status: 'paid',
      ageDays: 0,
      agingDays: 0,
      overdueDays: 0,
      isOverdue: false,
      ledgerIds: [],
      ledgers: []
    });
  }
  return map.get(key);
}

function applyStaff(target, ledger, options = {}) {
  const prefer = Boolean(options.prefer);
  if (prefer || !target.salesmanCode) target.salesmanCode = ledger.salesmanCode || target.salesmanCode || '';
  if (prefer || !target.salesmanName) target.salesmanName = ledger.salesmanName || target.salesmanName || '';
  if (prefer || !target.salesStaffCode) target.salesStaffCode = ledger.salesStaffCode || target.salesStaffCode || '';
  if (prefer || !target.salesStaffName) target.salesStaffName = ledger.salesStaffName || target.salesStaffName || '';
  if (prefer || !target.deliveryStaffCode) target.deliveryStaffCode = ledger.deliveryStaffCode || target.deliveryStaffCode || '';
  if (prefer || !target.deliveryStaffName) target.deliveryStaffName = ledger.deliveryStaffName || target.deliveryStaffName || '';
}

function finalizeOrder(row, options = {}) {
  const today = normalizeDate(options.today || dateUtil.todayVN());
  row.totalDebit = Math.round(row.totalDebit);
  row.totalCredit = Math.round(row.totalCredit);
  row.debit = Math.round(row.arSaleAmount + row.returnReversalAmount + row.adjustmentDebitAmount);
  row.credit = Math.round(row.totalCredit);
  row.remainingDebt = Math.round(row.totalDebit - row.totalCredit);
  row.remainingDebtDisplay = normalizeDebtAmount(row.remainingDebt, options.tolerance || DEBT_ZERO_TOLERANCE);
  row.debt = row.remainingDebtDisplay;
  row.rawDebt = row.remainingDebt;
  row.date = row.date || row.documentDate || row.dueDate;
  row.documentDate = row.documentDate || row.date;
  row.dueDate = row.dueDate || row.documentDate;
  row.ageDays = row.documentDate ? Math.max(0, daysBetween(today, row.documentDate)) : 0;
  row.agingDays = row.ageDays;
  row.isOverdue = hasOpenDebt(row.remainingDebtDisplay) && row.ageDays > 0;
  row.overdueDays = row.isOverdue ? row.ageDays : 0;
  if (isOverpaid(row.remainingDebtDisplay)) row.debtStatus = 'overpaid';
  else if (hasOpenDebt(row.remainingDebtDisplay)) row.debtStatus = row.isOverdue ? 'overdue' : 'open';
  else row.debtStatus = Math.abs(row.remainingDebt) > 0 ? 'settled_by_tolerance' : 'paid';
  row.status = row.debtStatus === 'settled_by_tolerance' ? 'paid' : row.debtStatus;
  return row;
}

function includeOrderByStatus(row = {}, query = {}) {
  const status = lower(query.status || 'open');
  const debt = normalizeDebtAmount(row.remainingDebtDisplay ?? row.remainingDebt, DEBT_ZERO_TOLERANCE);
  if (!status || ['open', 'unpaid', 'debt', 'khach_con_no', 'khách còn nợ'].includes(status)) return hasOpenDebt(debt);
  if (status === 'all') return true;
  if (['paid', 'settled', 'done', 'het_no', 'hết nợ'].includes(status)) return !hasOpenDebt(debt) && !isOverpaid(debt);
  if (['overpaid', 'credit', 'du_co', 'dư có'].includes(status)) return isOverpaid(debt);
  if (status === 'overdue') return hasOpenDebt(debt) && row.isOverdue;
  return row.status === status || row.debtStatus === status;
}

function buildCustomerSummary(orderRows = [], options = {}) {
  const map = new Map();
  for (const order of orderRows) {
    const key = firstText(order, ['customerCode', 'customerId', 'customerName']) || 'UNKNOWN_CUSTOMER';
    if (!map.has(key)) {
      map.set(key, {
        customerId: order.customerId || '',
        customerCode: order.customerCode || '',
        customerName: order.customerName || 'Chưa rõ khách',
        phone: order.phone || '',
        address: order.address || '',
        salesmanCode: order.salesmanCode || '',
        salesmanName: order.salesmanName || '',
        salesStaffCode: order.salesStaffCode || order.salesmanCode || '',
        salesStaffName: order.salesStaffName || order.salesmanName || '',
        deliveryStaffCode: order.deliveryStaffCode || '',
        deliveryStaffName: order.deliveryStaffName || '',
        totalDebt: 0,
        totalDebtDisplay: 0,
        debit: 0,
        credit: 0,
        debt: 0,
        rawDebt: 0,
        receiptAmount: 0,
        returnAmount: 0,
        bonusAmount: 0,
        orderDebtCount: 0,
        orderCount: 0,
        overdueCount: 0,
        oldestDebtAge: 0,
        overdueDays: 0,
        agingDays: 0,
        status: 'paid',
        orders: []
      });
    }
    const target = map.get(key);
    if (!target.salesmanCode && order.salesmanCode) target.salesmanCode = order.salesmanCode;
    if (!target.salesmanName && order.salesmanName) target.salesmanName = order.salesmanName;
    if (!target.salesStaffCode && order.salesStaffCode) target.salesStaffCode = order.salesStaffCode;
    if (!target.salesStaffName && order.salesStaffName) target.salesStaffName = order.salesStaffName;
    if (!target.deliveryStaffCode && order.deliveryStaffCode) target.deliveryStaffCode = order.deliveryStaffCode;
    if (!target.deliveryStaffName && order.deliveryStaffName) target.deliveryStaffName = order.deliveryStaffName;

    target.totalDebt += order.remainingDebt;
    target.totalDebtDisplay += order.remainingDebtDisplay;
    target.debit += order.debit;
    target.credit += order.credit;
    target.rawDebt += order.remainingDebt;
    target.debt += order.remainingDebtDisplay;
    target.receiptAmount += order.receiptAmount;
    target.returnAmount += order.returnAmount;
    target.bonusAmount += order.bonusAmount;
    target.orderCount += 1;
    if (hasOpenDebt(order.remainingDebtDisplay)) target.orderDebtCount += 1;
    if (order.isOverdue) target.overdueCount += 1;
    target.oldestDebtAge = Math.max(target.oldestDebtAge, order.ageDays || 0);
    target.overdueDays = Math.max(target.overdueDays, order.overdueDays || 0);
    target.agingDays = Math.max(target.agingDays, order.agingDays || 0);
    target.orders.push(order);
  }

  return Array.from(map.values()).map((customer) => {
    customer.totalDebt = Math.round(customer.totalDebt);
    customer.totalDebtDisplay = normalizeDebtAmount(customer.totalDebt, options.tolerance || DEBT_ZERO_TOLERANCE);
    customer.debt = customer.totalDebtDisplay;
    customer.rawDebt = customer.totalDebt;
    customer.status = isOverpaid(customer.debt) ? 'overpaid' : (hasOpenDebt(customer.debt) ? (customer.overdueCount > 0 ? 'overdue' : 'open') : 'paid');
    customer.debtZeroTolerance = options.tolerance || DEBT_ZERO_TOLERANCE;
    customer.orders.sort((a, b) => text(a.documentDate).localeCompare(text(b.documentDate)) || text(a.orderCode).localeCompare(text(b.orderCode)));
    return customer;
  }).sort((a, b) => Math.abs(b.debt) - Math.abs(a.debt) || b.overdueDays - a.overdueDays || text(a.customerName).localeCompare(text(b.customerName), 'vi'));
}

function buildPersonSummary(orderRows = [], options = {}) {
  const codeKey = options.codeKey || 'salesmanCode';
  const nameKey = options.nameKey || 'salesmanName';
  const role = options.role || 'person';
  const map = new Map();
  for (const row of orderRows) {
    const code = text(row[codeKey]);
    const name = text(row[nameKey]);
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
    const customerKey = firstText(row, ['customerCode', 'customerId', 'customerName']);
    if (customerKey) target.customerKeys.add(customerKey);
    target.orders += 1;
    if (row.status === 'paid') target.paidOrders += 1;
    if (row.status === 'overdue') target.overdueOrders += 1;
    if (row.status === 'open') target.openOrders += 1;
    target.debit += row.debit;
    target.credit += row.credit;
    target.receiptAmount += row.receiptAmount;
    target.returnAmount += row.returnAmount;
    target.bonusAmount += row.bonusAmount;
    target.debt += row.remainingDebtDisplay;
    target.maxOverdueDays = Math.max(target.maxOverdueDays, row.overdueDays || 0);
    target.maxAgingDays = Math.max(target.maxAgingDays, row.agingDays || 0);
  }
  return Array.from(map.values()).map((row) => {
    const { customerKeys, ...plain } = row;
    return {
      ...plain,
      customers: customerKeys.size,
      collectionRate: plain.debit > 0 ? Math.round((plain.credit / plain.debit) * 10000) / 100 : 0,
      status: hasOpenDebt(plain.debt) ? (plain.overdueOrders > 0 ? 'overdue' : 'open') : 'paid'
    };
  }).sort((a, b) => b.debt - a.debt || b.overdueOrders - a.overdueOrders || text(a.label).localeCompare(text(b.label), 'vi'));
}

function buildCustomerDebtReadModelFromLedgers(ledgerRows = [], query = {}, options = {}) {
  const tolerance = Number.isFinite(Number(options.tolerance)) ? Number(options.tolerance) : DEBT_ZERO_TOLERANCE;
  const eligibleLedgerRows = filterReadModelEligibleArLedgers((Array.isArray(ledgerRows) ? ledgerRows : []).filter(isActiveConfirmedArDebtLedger));
  const normalizedLedgers = eligibleLedgerRows.map(normalizeLedger).filter((row) => row.orderKey);
  const orderMap = new Map();

  for (const ledger of normalizedLedgers) {
    const target = ensureOrderGroup(orderMap, ledger);
    target.ledgerIds.push(ledger.ledgerId);
    target.ledgers.push(ledger);
    if (!target.date || (ledger.documentDate && ledger.documentDate < target.date)) target.date = ledger.documentDate;
    if (!target.documentDate || (ledger.documentDate && ledger.documentDate < target.documentDate)) target.documentDate = ledger.documentDate;
    if (!target.dueDate || (ledger.documentDate && ledger.documentDate < target.dueDate)) target.dueDate = ledger.documentDate;
    if (!target.orderCode && ledger.orderCode) target.orderCode = ledger.orderCode;
    if (!target.orderId && ledger.orderId) target.orderId = ledger.orderId;
    if (!target.salesOrderId && ledger.salesOrderId) target.salesOrderId = ledger.salesOrderId;
    if (!target.salesOrderCode && ledger.salesOrderCode) target.salesOrderCode = ledger.salesOrderCode;
    if (!target.phone && ledger.phone) target.phone = ledger.phone;
    if (!target.address && ledger.address) target.address = ledger.address;

    applyStaff(target, ledger, { prefer: ledger.category === 'AR-DEBT-OPEN' });
    target.totalDebit += ledger.debit;
    target.totalCredit += ledger.credit;

    if (ledger.category === 'AR-DEBT-OPEN') target.arSaleAmount += ledger.debit;
    else if (ledger.category === 'AR-DEBT-PAYMENT') target.receiptAmount += ledger.credit;
    else if (ledger.category === 'AR-DEBT-ADJUSTMENT' || ledger.category === 'AR-DEBT-VOID') {
      target.adjustmentDebitAmount += ledger.debit;
      target.adjustmentCreditAmount += ledger.credit;
    }
  }

  let allOrders = Array.from(orderMap.values()).map((row) => finalizeOrder(row, { ...options, tolerance }));
  allOrders.sort((a, b) => b.remainingDebtDisplay - a.remainingDebtDisplay || text(a.documentDate).localeCompare(text(b.documentDate)) || text(a.orderCode).localeCompare(text(b.orderCode)));
  const visibleOrders = allOrders.filter((row) => includeOrderByStatus(row, query));
  const customers = buildCustomerSummary(visibleOrders, { tolerance });
  const openOrders = allOrders.filter((row) => hasOpenDebt(row.remainingDebtDisplay));
  const openCustomers = buildCustomerSummary(openOrders, { tolerance });
  const page = Math.max(1, Math.floor(toNumber(query.page) || 1));
  const limit = Math.min(Math.max(1, Math.floor(toNumber(query.limit) || 50)), 200);
  const skip = (page - 1) * limit;
  const pagedOrders = visibleOrders.slice(skip, skip + limit);
  const visibleCustomerKeys = new Set(customers.map((row) => firstText(row, ['customerCode', 'customerId', 'customerName'])));
  const pagedCustomers = customers.filter((row) => visibleCustomerKeys.has(firstText(row, ['customerCode', 'customerId', 'customerName']))).slice(0, limit);

  const selectedCustomerCode = text(query.customerCode || query.code || query.customerId || query.id || query.q);
  const selectedCustomer = selectedCustomerCode
    ? customers.find((customer) => [customer.customerCode, customer.customerId, customer.customerName].some((value) => lower(value) === lower(selectedCustomerCode) || lower(value).includes(lower(selectedCustomerCode)))) || null
    : (customers[0] || null);

  const summary = {
    page,
    limit,
    hasMore: visibleOrders.length > skip + limit,
    tolerance,
    debtZeroTolerance: tolerance,
    totalDebt: openOrders.reduce((sum, row) => sum + Math.max(0, row.remainingDebtDisplay), 0),
    totalPositiveDebt: openOrders.reduce((sum, row) => sum + Math.max(0, row.remainingDebtDisplay), 0),
    totalOverpaid: allOrders.filter((row) => isOverpaid(row.remainingDebtDisplay)).reduce((sum, row) => sum + Math.abs(row.remainingDebtDisplay), 0),
    totalDebit: visibleOrders.reduce((sum, row) => sum + row.debit, 0),
    totalCredit: visibleOrders.reduce((sum, row) => sum + row.credit, 0),
    customerDebtCount: openCustomers.length,
    customerCount: customers.length,
    orderDebtCount: openOrders.length,
    orderCount: openOrders.length,
    visibleOrderCount: visibleOrders.length,
    overdueCount: openOrders.filter((row) => row.isOverdue).length,
    arLedgerCount: normalizedLedgers.length,
    source: 'arLedgers',
    usesSnapshot: false,
    optimized: true
  };

  return {
    source: 'mongo_ar_ledgers_read_model_v2',
    ledgerCollection: 'arLedgers',
    debts: pagedOrders,
    orders: pagedOrders,
    customerSummary: pagedCustomers,
    customers: pagedCustomers,
    selectedCustomer,
    bySalesman: buildPersonSummary(visibleOrders, { codeKey: 'salesmanCode', nameKey: 'salesmanName', role: 'salesman' }),
    byDelivery: buildPersonSummary(visibleOrders, { codeKey: 'deliveryStaffCode', nameKey: 'deliveryStaffName', role: 'delivery' }),
    arLedger: normalizedLedgers,
    arDiagnostics: [],
    summary,
    debugSource: {
      source: 'arLedgers',
      usesSnapshot: false,
      readModel: 'arCustomerDebtReadModel.service',
      formula: 'SUM(active confirmed debit) - SUM(active confirmed credit)'
    }
  };
}

async function loadLedgerRows(query = {}) {
  // Debt screen SSoT cleanup: the customer debt UI must read canonical
  // arLedgers directly, not arDebtOrders/arDebtCustomers or salesOrders caches.
  // The blank-init behavior is preserved to avoid loading the whole ledger table
  // before the user provides a filter.
  if (!hasSearchCriteria(query)) return [];
  const limit = Math.min(Math.max(toNumber(query.rawLimit || query.limit) || DEFAULT_QUERY_LIMIT, 1000), 20000);
  return arLedgerReadService.getCanonicalArLedgers({ ...query, status: query.status || 'all', limit }, { includeRejected: false });
}

async function debtReport(query = {}) {
  const rows = await loadLedgerRows(query);
  return buildCustomerDebtReadModelFromLedgers(rows, query);
}

async function debtCustomers(query = {}) {
  return debtReport({ ...query, limit: Math.min(Math.max(toNumber(query.limit) || 50, 1), 100) });
}

async function debtCustomerDetail(query = {}) {
  const customerCode = query.customerCode || query.code || query.customerId || query.id || query.q;
  return debtReport({ ...query, q: query.q || customerCode, customerCode, status: query.status || 'all', includePaid: '1', limit: Math.min(Math.max(toNumber(query.limit) || 100, 1), 100) });
}

async function debtArLedger(query = {}) {
  const rows = await loadLedgerRows({ ...query, status: 'all' });
  const arLedger = rows.map(normalizeLedger);
  const page = Math.max(1, Math.floor(toNumber(query.page) || 1));
  const limit = Math.min(Math.max(1, Math.floor(toNumber(query.limit) || 100)), 200);
  const skip = (page - 1) * limit;
  const data = arLedger.slice(skip, skip + limit);
  return {
    source: 'mongo_ar_ledgers_read_model_v2',
    ledgerCollection: 'arLedgers',
    debts: [],
    customerSummary: [],
    bySalesman: [],
    byDelivery: [],
    arLedger: data,
    arDiagnostics: [],
    summary: {
      page,
      limit,
      hasMore: arLedger.length > skip + limit,
      arLedgerCount: data.length,
      totalDebit: data.reduce((sum, row) => sum + row.debit, 0),
      totalCredit: data.reduce((sum, row) => sum + row.credit, 0),
      totalDebt: data.reduce((sum, row) => sum + row.debit - row.credit, 0),
      debtZeroTolerance: DEBT_ZERO_TOLERANCE,
      optimized: true
    },
    debugSource: { source: 'arLedgers', usesSnapshot: false, readModel: 'arCustomerDebtReadModel.service' }
  };
}

async function debtBySalesmanReport(query = {}) {
  const report = await debtReport({ ...query, status: query.status || 'all' });
  return { source: report.source, ledgerCollection: report.ledgerCollection, bySalesman: report.bySalesman, summary: report.summary, debugSource: report.debugSource };
}

async function debtByDeliveryReport(query = {}) {
  const report = await debtReport({ ...query, status: query.status || 'all' });
  return { source: report.source, ledgerCollection: report.ledgerCollection, byDelivery: report.byDelivery, summary: report.summary, debugSource: report.debugSource };
}

function debtInit() {
  return {
    source: 'mongo_ar_ledgers_read_model_v2',
    summary: {
      totalDebt: 0,
      customerDebtCount: 0,
      customerCount: 0,
      orderDebtCount: 0,
      orderCount: 0,
      overdueCount: 0,
      debtZeroTolerance: DEBT_ZERO_TOLERANCE,
      note: 'Màn công nợ chỉ tải danh sách sau khi nhập điều kiện tìm kiếm. Số liệu đọc từ arLedgers.'
    },
    filters: { maxListLimit: 100, maxAutocompleteLimit: 20 },
    debugSource: { source: 'arLedgers', usesSnapshot: false, readModel: 'arCustomerDebtReadModel.service' }
  };
}

module.exports = {
  INACTIVE_AR_STATUSES,
  CONFIRMED_AR_ACCOUNTING_STATUSES,
  buildActiveArDebtMongoFilter,
  buildBaseMongoMatch,
  canonicalOrderKey,
  isActiveConfirmedArDebtLedger,
  normalizeArCategory,
  normalizeLedger,
  buildCustomerDebtReadModelFromLedgers,
  loadLedgerRows,
  setArLedgerModelForTest,
  debtReport,
  debtCustomers,
  debtCustomerDetail,
  debtArLedger,
  debtBySalesmanReport,
  debtByDeliveryReport,
  debtInit
};
