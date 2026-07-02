'use strict';

const crypto = require('node:crypto');
const ArLedgerModel = require('../../models/ArLedger');
const CustomerModel = require('../../models/Customer');
const UserModel = require('../../models/User');
const dateUtil = require('../../utils/date.util');
const { makeId, toNumber } = require('../../utils/common.util');
const { assertValidArLedgerContract } = require('../../domain/ar/arLedgerValidator');

const CATEGORY = 'AR-DEBT-ADJUSTMENT';
const SOURCE_TYPE = 'MANUAL_DEBT';
const DEBT_TYPES = Object.freeze({
  OPENING_DEBT: 'Công nợ ban đầu',
  MANUAL_DEBT: 'Công nợ ngoài bán hàng',
  DEBT_ADJUSTMENT_INCREASE: 'Điều chỉnh tăng công nợ'
});

let modelsForTest = null;

function getModels() {
  return modelsForTest || { ArLedger: ArLedgerModel, Customer: CustomerModel, User: UserModel };
}

function setModelsForTest(nextModels) {
  modelsForTest = nextModels || null;
}

function clean(value = '') {
  return String(value ?? '').trim();
}

function upper(value = '') {
  return clean(value).toUpperCase();
}

function money(value) {
  const n = Number(toNumber(value));
  if (!Number.isFinite(n)) return 0;
  return Math.round(n);
}

function compactKey(value = '') {
  return upper(value).replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

function shortHash(value = '') {
  return crypto.createHash('sha256').update(clean(value)).digest('hex').slice(0, 12).toUpperCase();
}

function actorLabel(actor = {}) {
  if (typeof actor === 'string') return clean(actor);
  return clean(actor.username || actor.fullName || actor.name || actor.email || actor.code || actor.staffCode || actor.id || actor._id || 'web-accountant');
}

function fail(status, code, message, details = {}) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  err.details = details;
  return err;
}

function applySession(query, session) {
  return session && query && typeof query.session === 'function' ? query.session(session) : query;
}

async function leanOne(query) {
  if (!query) return null;
  if (typeof query.lean === 'function') return query.lean();
  return query;
}

function queryOptions(options = {}) {
  return options.session ? { session: options.session } : {};
}

async function findCustomer(customerCode, options = {}) {
  const code = clean(customerCode);
  if (!code) return null;
  const { Customer } = getModels();
  const query = Customer.findOne({
    isActive: { $ne: false },
    $or: [{ code }, { customerCode: code }, { id: code }]
  });
  return leanOne(applySession(query, options.session));
}

function staffFilter(code, role) {
  const value = clean(code);
  const base = { isActive: { $ne: false } };
  if (role) base.role = role;
  base.$or = role === 'delivery'
    ? [{ code: value }, { staffCode: value }, { deliveryStaffCode: value }, { shipperCode: value }]
    : [{ code: value }, { staffCode: value }, { salesStaffCode: value }, { salesmanCode: value }];
  return base;
}

function canonicalStaff(user = {}, role = 'sales') {
  const isDelivery = role === 'delivery';
  const code = clean(isDelivery
    ? (user.deliveryStaffCode || user.shipperCode || user.code || user.staffCode)
    : (user.salesStaffCode || user.salesmanCode || user.code || user.staffCode));
  const name = clean(isDelivery
    ? (user.deliveryStaffName || user.shipperName || user.fullName || user.name)
    : (user.salesStaffName || user.salesmanName || user.fullName || user.name));
  return { id: clean(user._id || user.id), code, name };
}

async function resolveOptionalStaff(code, name, role, options = {}) {
  const suppliedCode = clean(code);
  const suppliedName = clean(name);
  if (!suppliedCode) return { code: '', name: suppliedName, id: '' };
  const { User } = getModels();
  const query = User.findOne(staffFilter(suppliedCode, role));
  const row = await leanOne(applySession(query, options.session));
  if (!row) {
    throw fail(400, role === 'delivery' ? 'DELIVERY_STAFF_NOT_FOUND' : 'SALES_STAFF_NOT_FOUND', role === 'delivery' ? 'Không tìm thấy NVGH hợp lệ.' : 'Không tìm thấy NVBH hợp lệ.');
  }
  const staff = canonicalStaff(row, role);
  if (!staff.code) {
    throw fail(400, role === 'delivery' ? 'DELIVERY_STAFF_CODE_REQUIRED' : 'SALES_STAFF_CODE_REQUIRED', role === 'delivery' ? 'NVGH chưa có mã nghiệp vụ hợp lệ.' : 'NVBH chưa có mã nghiệp vụ hợp lệ.');
  }
  return { ...staff, name: staff.name || suppliedName };
}

function normalizeDebtType(value) {
  const debtType = upper(value || 'MANUAL_DEBT');
  if (!DEBT_TYPES[debtType]) {
    throw fail(400, 'MANUAL_DEBT_TYPE_INVALID', 'Loại công nợ thủ công không hợp lệ.', { allowedDebtTypes: Object.keys(DEBT_TYPES) });
  }
  return debtType;
}

function normalizeManualDebtInput(body = {}) {
  const customerCode = clean(body.customerCode || body.customerId || body.code);
  const amount = money(body.amount ?? body.debit ?? body.totalAmount);
  const debtType = normalizeDebtType(body.debtType || body.type);
  const postingDate = dateUtil.toDateOnly(body.postingDate || body.documentDate || body.date || dateUtil.todayVN());
  const note = clean(body.note || body.reason || body.reasonText);
  const referenceNo = clean(body.referenceNo || body.referenceCode || body.refCode || body.documentNo);

  if (!customerCode) throw fail(400, 'CUSTOMER_CODE_REQUIRED', 'Cần chọn khách hàng để tạo công nợ.');
  if (amount <= 0) throw fail(400, 'MANUAL_DEBT_AMOUNT_INVALID', 'Số tiền công nợ phải lớn hơn 0.');
  if (!postingDate) throw fail(400, 'POSTING_DATE_INVALID', 'Ngày ghi nhận công nợ không hợp lệ.');
  if (!note) throw fail(400, 'MANUAL_DEBT_NOTE_REQUIRED', 'Cần nhập diễn giải/lý do tạo công nợ.');

  return {
    customerCode,
    customerName: clean(body.customerName),
    amount,
    debtType,
    debtTypeLabel: DEBT_TYPES[debtType],
    postingDate,
    note,
    referenceNo,
    salesStaffCode: clean(body.salesStaffCode || body.salesmanCode || body.nvbhCode),
    salesStaffName: clean(body.salesStaffName || body.salesmanName || body.nvbhName),
    deliveryStaffCode: clean(body.deliveryStaffCode || body.deliveryCode || body.nvghCode),
    deliveryStaffName: clean(body.deliveryStaffName || body.deliveryName || body.nvghName),
    idempotencyKey: clean(body.idempotencyKey),
    tenantId: clean(body.tenantId)
  };
}

function buildManualDebtSource(normalized = {}) {
  const datePart = clean(normalized.postingDate).replace(/[^0-9]/g, '') || dateUtil.todayVN().replace(/-/g, '');
  const customerPart = compactKey(normalized.customerCode) || 'CUSTOMER';
  const typePart = compactKey(normalized.debtType) || 'MANUAL';
  if (normalized.referenceNo) {
    const refHash = shortHash(`${normalized.debtType}:${normalized.customerCode}:${normalized.referenceNo}`);
    return {
      sourceId: `MD-${typePart}-${customerPart}-${refHash}`,
      sourceCode: `CNTH-${datePart}-${customerPart}-${refHash.slice(0, 8)}`,
      deterministic: true
    };
  }
  const id = makeId('MD');
  return {
    sourceId: id,
    sourceCode: `CNTH-${datePart}-${customerPart}-${String(id).slice(-8)}`,
    deterministic: false
  };
}

function buildIdempotencyKey(normalized = {}, source = {}) {
  if (normalized.idempotencyKey) {
    return normalized.idempotencyKey.startsWith(`${CATEGORY}:`) ? normalized.idempotencyKey : `${CATEGORY}:${normalized.idempotencyKey}`;
  }
  if (normalized.referenceNo) return `${CATEGORY}:${source.sourceId}`;
  return `${CATEGORY}:${source.sourceId}`;
}

function buildManualDebtLedger(input = {}, resolved = {}) {
  const normalized = resolved.normalized || normalizeManualDebtInput(input);
  const source = resolved.source || buildManualDebtSource(normalized);
  const now = resolved.now || dateUtil.nowIso();
  const actor = resolved.actor || input.actor || input.user || input.createdBy || 'web-accountant';
  const actorName = actorLabel(actor);
  const customer = resolved.customer || {};
  const salesStaff = resolved.salesStaff || {};
  const deliveryStaff = resolved.deliveryStaff || {};
  const customerCode = clean(customer.code || customer.customerCode || normalized.customerCode);
  const customerName = clean(customer.name || customer.customerName || normalized.customerName);
  const customerId = clean(customer._id || customer.id || customerCode);
  const idempotencyKey = buildIdempotencyKey(normalized, source);

  const ledger = {
    tenantId: normalized.tenantId,
    id: `AR-DEBT-ADJUSTMENT-${source.sourceId}`,
    code: `AR-DEBT-ADJUSTMENT-${source.sourceCode}`,
    type: 'ar_debt_adjustment',
    account: 'AR',
    category: CATEGORY,
    ledgerType: CATEGORY,
    entryType: 'normal',
    sourceType: SOURCE_TYPE,
    sourceModel: 'ManualDebt',
    sourceId: source.sourceId,
    sourceCode: source.sourceCode,
    refType: SOURCE_TYPE,
    refId: source.sourceId,
    refCode: source.sourceCode,
    orderType: 'manual_debt',
    orderId: source.sourceId,
    orderCode: source.sourceCode,
    salesOrderId: source.sourceId,
    salesOrderCode: source.sourceCode,
    customerId,
    customerCode,
    customerName,
    salesStaffCode: clean(salesStaff.code || normalized.salesStaffCode),
    salesStaffName: clean(salesStaff.name || normalized.salesStaffName),
    salesmanCode: clean(salesStaff.code || normalized.salesStaffCode),
    salesmanName: clean(salesStaff.name || normalized.salesStaffName),
    deliveryStaffCode: clean(deliveryStaff.code || normalized.deliveryStaffCode),
    deliveryStaffName: clean(deliveryStaff.name || normalized.deliveryStaffName),
    date: normalized.postingDate,
    debit: normalized.amount,
    credit: 0,
    amount: normalized.amount,
    direction: 'debit',
    amountField: 'debit',
    status: 'posted',
    active: true,
    reversed: false,
    accountingConfirmed: true,
    accountingStatus: 'confirmed',
    accountingBatchId: `MANUAL-DEBT-${source.sourceId}`,
    referenceCode: normalized.referenceNo,
    referenceId: normalized.referenceNo,
    reasonCode: normalized.debtType,
    reason: normalized.note,
    reasonText: normalized.note,
    note: normalized.note,
    idempotencyKey,
    source: 'manualDebtPostingService',
    createdBy: actorName,
    accountingConfirmedBy: actorName,
    auditTrail: [{
      action: 'create_manual_debt',
      at: now,
      by: actorName,
      debtType: normalized.debtType,
      amount: normalized.amount,
      customerCode,
      sourceId: source.sourceId,
      sourceCode: source.sourceCode,
      referenceNo: normalized.referenceNo
    }],
    metadata: {
      postingContract: 'manualDebt/v1',
      sourceTypeCanonical: SOURCE_TYPE,
      debtType: normalized.debtType,
      debtTypeLabel: normalized.debtTypeLabel,
      referenceNo: normalized.referenceNo,
      deterministicSource: source.deterministic === true,
      accountingEffect: 'increase_ar_debt'
    },
    createdAt: now,
    updatedAt: now
  };
  return assertValidArLedgerContract(ledger);
}

function activeLedgerFilter(normalized = {}, ledger = {}) {
  const conditions = [{ idempotencyKey: ledger.idempotencyKey }, { id: ledger.id }, { code: ledger.code }];
  if (normalized.referenceNo) conditions.push({ sourceType: SOURCE_TYPE, referenceCode: normalized.referenceNo, customerCode: ledger.customerCode });
  return {
    $or: conditions,
    active: true,
    reversed: { $ne: true },
    isDeleted: { $ne: true }
  };
}

function sameBusinessLedger(existing = {}, ledger = {}) {
  return clean(existing.customerCode).toUpperCase() === clean(ledger.customerCode).toUpperCase()
    && money(existing.amount ?? existing.debit) === money(ledger.amount)
    && clean(existing.date || existing.documentDate) === clean(ledger.date)
    && clean(existing.reasonCode) === clean(ledger.reasonCode);
}

async function createManualDebt(body = {}, options = {}) {
  const normalized = normalizeManualDebtInput(body);
  const actor = options.actor || body.actor || body.user || body.createdBy;
  const customer = await findCustomer(normalized.customerCode, options);
  if (!customer) throw fail(400, 'CUSTOMER_NOT_FOUND', 'Không tìm thấy khách hàng hợp lệ.');

  const [salesStaff, deliveryStaff] = await Promise.all([
    resolveOptionalStaff(normalized.salesStaffCode, normalized.salesStaffName, 'sales', options),
    resolveOptionalStaff(normalized.deliveryStaffCode, normalized.deliveryStaffName, 'delivery', options)
  ]);

  const source = buildManualDebtSource(normalized);
  const ledger = buildManualDebtLedger(body, { normalized, customer, salesStaff, deliveryStaff, source, actor, now: options.now });
  const { ArLedger } = getModels();
  const existingQuery = ArLedger.findOne(activeLedgerFilter(normalized, ledger));
  const existing = await leanOne(applySession(existingQuery, options.session));
  if (existing) {
    if (!sameBusinessLedger(existing, ledger)) {
      throw fail(409, 'MANUAL_DEBT_IDEMPOTENCY_CONFLICT', 'Mã tham chiếu/idempotency đã tồn tại nhưng khác khách hàng, ngày hoặc số tiền. Không được ghi đè công nợ thủ công.', {
        existing: { id: existing.id, code: existing.code, customerCode: existing.customerCode, amount: existing.amount || existing.debit, date: existing.date, reasonCode: existing.reasonCode },
        expected: { id: ledger.id, code: ledger.code, customerCode: ledger.customerCode, amount: ledger.amount, date: ledger.date, reasonCode: ledger.reasonCode }
      });
    }
    return { created: false, idempotent: true, ledger: existing, message: `Công nợ thủ công ${existing.code || existing.id} đã tồn tại.` };
  }

  const rows = await ArLedger.create([ledger], queryOptions(options));
  const doc = rows && rows[0];
  const saved = typeof doc?.toObject === 'function' ? doc.toObject() : (doc || ledger);
  return { created: true, idempotent: false, ledger: saved, message: `Đã tạo công nợ thủ công ${saved.code || ledger.code}.` };
}

module.exports = {
  CATEGORY,
  SOURCE_TYPE,
  DEBT_TYPES,
  createManualDebt,
  buildManualDebtLedger,
  normalizeManualDebtInput,
  buildManualDebtSource,
  buildIdempotencyKey,
  setModelsForTest,
  _internal: { clean, money, compactKey, shortHash, actorLabel, resolveOptionalStaff, staffFilter, canonicalStaff, sameBusinessLedger }
};
