'use strict';

const dateUtil = require('../utils/date.util');
const { makeId, normalizeText, toNumber } = require('../utils/common.util');
const { withMongoTransaction } = require('../utils/transaction.util');
const fundLedgerRepository = require('../repositories/fundLedgerRepository');
const deliveryCashSubmissionRepository = require('../repositories/deliveryCashSubmissionRepository');
const expenseVoucherRepository = require('../repositories/expenseVoucherRepository');
const fundTransferRepository = require('../repositories/fundTransferRepository');
const deliveryCashShortageRepository = require('../repositories/deliveryCashShortageRepository');
const deliveryShortageRepaymentRepository = require('../repositories/deliveryShortageRepaymentRepository');
const auditService = require('./auditService');
function getMasterOrderDeliveryService() {
  return require('./master-order/masterOrderDelivery.service');
}
const { pickDeliveryStaffCode } = require('../domain/staff/staffIdentity');

function dateOnly(value) { return dateUtil.toDateOnly(value || dateUtil.todayVN()); }
function money(value) { return Math.max(0, Math.round(toNumber(value))); }
function activeStatus(row = {}) { return !['void', 'cancelled', 'canceled', 'deleted'].includes(String(row.status || '').toLowerCase()); }

function canonicalFundType(value) {
  return String(value || 'cash').toLowerCase() === 'bank' ? 'bank' : 'cash';
}

function canonicalDirection(value) {
  return String(value || 'in').toLowerCase() === 'out' ? 'out' : 'in';
}

function canonicalAccount(value, fundType) {
  const raw = String(value || '').trim();
  return (raw || String(fundType || 'cash')).toUpperCase();
}

function normalizeKeyPart(value) {
  return String(value || '').trim().toUpperCase();
}

function buildFundLedgerIdempotencyKey(input = {}) {
  const fundType = canonicalFundType(input.fundType);
  const direction = canonicalDirection(input.direction);
  const account = canonicalAccount(input.account, fundType);
  const sourceType = String(input.sourceType || 'MANUAL_FUND').trim() || 'MANUAL_FUND';
  const sourceIdentity = String(
    input.sourceId ||
    input.sourceCode ||
    input.referenceId ||
    input.referenceCode ||
    input.refId ||
    input.refCode ||
    input.id ||
    input.code ||
    ''
  ).trim();
  if (!sourceIdentity) return '';
  return [sourceType, sourceIdentity, fundType, direction, account].map(normalizeKeyPart).join('|');
}


function buildCode(prefix, rows = []) {
  const max = rows.reduce((result, row) => {
    const match = String(row.code || '').match(/(\d+)$/);
    return Math.max(result, match ? Number(match[1]) : 0);
  }, 0);
  return `${prefix}${String(max + 1).padStart(5, '0')}`;
}
async function nextFundLedgerCode() { return buildCode('FL', await fundLedgerRepository.findAll()); }
async function nextExpenseCode() { return buildCode('PC', await expenseVoucherRepository.findAll()); }
async function nextTransferCode() { return buildCode('CQ', await fundTransferRepository.findAll()); }

function deliverySubmissionCode(deliveryDate, deliveryStaffCode) {
  const d = String(dateOnly(deliveryDate)).replace(/-/g, '');
  const staff = String(deliveryStaffCode || 'NO_NVGH').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24) || 'NO_NVGH';
  return `NQGH-${d}-${staff}`;
}

function deliveryShortageCode(submissionCode, fundType) {
  const suffix = canonicalFundType(fundType) === 'bank' ? 'TK' : 'TM';
  return `DCSH-${String(submissionCode || '').trim()}-${suffix}`;
}

function deliveryShortageRepaymentCode(shortage = {}, repaymentDate) {
  const datePart = String(dateOnly(repaymentDate)).replace(/-/g, '');
  const staffPart = String(shortage.deliveryStaffCode || 'NVGH').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 20) || 'NVGH';
  const uniquePart = String(Date.now()).slice(-7) + String(Math.floor(Math.random() * 100)).padStart(2, '0');
  return `NQBU-${datePart}-${staffPart}-${uniquePart}`;
}

const SHORTAGE_REASON_CONFIG = {
  cash: {
    collected_not_remitted: { responsibleType: 'delivery_staff', status: 'open' },
    customer_not_paid: { responsibleType: 'customer', status: 'customer_outstanding' },
    approved_expense: { responsibleType: 'adjustment', status: 'adjusted', requireNote: true },
    pending_review: { responsibleType: 'pending', status: 'disputed', requireNote: true }
  },
  bank: {
    pending_bank_reconciliation: { responsibleType: 'pending', status: 'pending_reconciliation' },
    delivery_staff_liability: { responsibleType: 'delivery_staff', status: 'open' },
    customer_not_paid: { responsibleType: 'customer', status: 'customer_outstanding' },
    approved_adjustment: { responsibleType: 'adjustment', status: 'adjusted', requireNote: true }
  }
};

function shortageAmountFromDifference(value) {
  return Math.max(0, -Math.round(toNumber(value)));
}

function shortageResolutionInput(body = {}, fundType) {
  const nested = body.shortageResolution && typeof body.shortageResolution === 'object'
    ? body.shortageResolution[fundType]
    : null;
  return nested || body[`${fundType}ShortageResolution`] || null;
}

function normalizeShortageResolution(body = {}, fundType, shortageAmount) {
  if (shortageAmount <= 0) return null;
  const raw = shortageResolutionInput(body, fundType);
  const input = typeof raw === 'string' ? { reasonType: raw } : (raw || {});
  const reasonType = String(input.reasonType || input.reason || '').trim();
  const config = SHORTAGE_REASON_CONFIG[fundType]?.[reasonType];
  if (!config) {
    return {
      error: fundType === 'bank'
        ? 'Cần chọn cách xử lý khoản thiếu chuyển khoản trước khi xác nhận'
        : 'Cần chọn cách xử lý khoản thiếu tiền mặt trước khi xác nhận',
      fundType,
      shortageAmount
    };
  }
  const note = String(input.note || body.shortageNote || '').trim();
  if (config.requireNote && !note) {
    return {
      error: 'Cần nhập ghi chú giải trình cho cách xử lý khoản thiếu đã chọn',
      fundType,
      shortageAmount
    };
  }
  const adjustedAmount = config.responsibleType === 'adjustment' ? shortageAmount : 0;
  return {
    fundType,
    reasonType,
    responsibleType: config.responsibleType,
    status: config.status,
    originalShortageAmount: shortageAmount,
    settledAmount: 0,
    adjustedAmount,
    outstandingAmount: Math.max(0, shortageAmount - adjustedAmount),
    note
  };
}

function prepareDeliveryShortagePlans(submission = {}, body = {}) {
  const amounts = {
    cash: shortageAmountFromDifference(
      body.differenceCashAmount ?? submission.differenceCashAmount ??
      (money(body.submittedCashAmount ?? submission.submittedCashAmount) - money(submission.reportCashAmount))
    ),
    bank: shortageAmountFromDifference(
      body.differenceBankAmount ?? submission.differenceBankAmount ??
      (money(body.submittedBankAmount ?? submission.submittedBankAmount) - money(submission.reportBankAmount))
    )
  };
  const plans = [];
  const requirements = [];
  for (const fundType of ['cash', 'bank']) {
    if (amounts[fundType] <= 0) continue;
    const normalized = normalizeShortageResolution(body, fundType, amounts[fundType]);
    if (normalized?.error) requirements.push(normalized);
    else plans.push(normalized);
  }
  if (requirements.length) {
    return {
      error: requirements.map((item) => item.error).join('. '),
      status: 422,
      requiresShortageResolution: true,
      shortages: requirements
    };
  }
  return { plans, amounts };
}

function buildDeliveryShortageRecord(submission = {}, plan = {}, actor = '') {
  const now = dateUtil.nowIso();
  return {
    id: deliveryShortageCode(submission.code, plan.fundType),
    code: deliveryShortageCode(submission.code, plan.fundType),
    sourceSubmissionId: String(submission.id || '').trim(),
    sourceSubmissionCode: String(submission.code || '').trim(),
    deliveryDate: String(submission.deliveryDate || '').trim(),
    deliveryStaffCode: String(submission.deliveryStaffCode || '').trim(),
    deliveryStaffName: String(submission.deliveryStaffName || '').trim(),
    fundType: canonicalFundType(plan.fundType),
    reasonType: String(plan.reasonType || '').trim(),
    responsibleType: String(plan.responsibleType || '').trim(),
    originalShortageAmount: money(plan.originalShortageAmount),
    settledAmount: money(plan.settledAmount),
    adjustedAmount: money(plan.adjustedAmount),
    pendingRepaymentAmount: 0,
    outstandingAmount: money(plan.outstandingAmount),
    status: String(plan.status || 'open').trim(),
    note: String(plan.note || '').trim(),
    classifiedBy: String(actor || '').trim(),
    classifiedAt: now,
    createdBy: String(actor || '').trim(),
    createdAt: now,
    updatedAt: now
  };
}

async function persistDeliveryShortagePlans(submission, plans = [], actor = '', options = {}) {
  const saved = [];
  for (const plan of plans) {
    const existing = await deliveryCashShortageRepository.findBySourceAndFundType(
      submission.id,
      submission.code,
      plan.fundType,
      options
    );
    if (existing) {
      saved.push(existing);
      continue;
    }
    const shortage = buildDeliveryShortageRecord(submission, plan, actor);
    await deliveryCashShortageRepository.upsert(shortage, options);
    saved.push(shortage);
  }
  return saved;
}

function shortageMapKey(sourceId, sourceCode) {
  return String(sourceId || sourceCode || '').trim();
}

function matchQuery(row, q) {
  if (!q) return true;
  return [row.code, row.sourceCode, row.sourceType, row.deliveryStaffCode, row.deliveryStaffName, row.customerCode, row.customerName, row.staffName, row.note, row.status]
    .some((value) => normalizeText(value).includes(q));
}

function summarizeFundLedgers(rows = []) {
  const active = rows.filter(activeStatus);
  const cashIn = active.filter((e) => e.fundType === 'cash' && e.direction === 'in').reduce((sum, e) => sum + toNumber(e.amount), 0);
  const cashOut = active.filter((e) => e.fundType === 'cash' && e.direction === 'out').reduce((sum, e) => sum + toNumber(e.amount), 0);
  const bankIn = active.filter((e) => e.fundType === 'bank' && e.direction === 'in').reduce((sum, e) => sum + toNumber(e.amount), 0);
  const bankOut = active.filter((e) => e.fundType === 'bank' && e.direction === 'out').reduce((sum, e) => sum + toNumber(e.amount), 0);
  return { cashIn, cashOut, cashBalance: cashIn - cashOut, bankIn, bankOut, bankBalance: bankIn - bankOut, totalIn: cashIn + bankIn, totalOut: cashOut + bankOut, totalBalance: cashIn + bankIn - cashOut - bankOut };
}

async function listFundLedgers(query = {}) {
  const filter = {
    status: { $nin: ['void', 'cancelled', 'canceled', 'deleted'] }
  };
  if (query.fundType && query.fundType !== 'all') filter.fundType = String(query.fundType);
  if (query.direction && query.direction !== 'all') filter.direction = String(query.direction);
  const dateFrom = query.dateFrom ? dateOnly(query.dateFrom) : '';
  const dateTo = query.dateTo ? dateOnly(query.dateTo) : '';
  if (dateFrom || dateTo) filter.date = { ...(dateFrom ? { $gte: dateFrom } : {}), ...(dateTo ? { $lte: dateTo } : {}) };

  const q = String(query.q || query.search || '').trim();
  if (q) {
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rx = new RegExp(escaped, 'i');
    filter.$or = [
      'code', 'sourceCode', 'sourceType', 'deliveryStaffCode', 'deliveryStaffName',
      'customerCode', 'customerName', 'staffName', 'note', 'status'
    ].map((field) => ({ [field]: rx }));
  }

  const page = Math.max(Number(query.page || 1), 1);
  const limit = Math.min(Math.max(Number(query.limit || 50), 1), 200);
  const skip = (page - 1) * limit;
  const result = await fundLedgerRepository.aggregate([
    { $match: filter },
    {
      $facet: {
        rows: [
          { $sort: { date: -1, createdAt: -1, code: -1 } },
          { $skip: skip },
          { $limit: limit }
        ],
        totals: [
          {
            $group: {
              _id: { fundType: '$fundType', direction: '$direction' },
              amount: { $sum: { $ifNull: ['$amount', 0] } },
              count: { $sum: 1 }
            }
          }
        ],
        count: [{ $count: 'total' }]
      }
    }
  ]);

  const facet = result[0] || { rows: [], totals: [], count: [] };
  const summaryRows = (facet.totals || []).map((row) => ({
    fundType: row._id?.fundType,
    direction: row._id?.direction,
    amount: toNumber(row.amount),
    count: toNumber(row.count)
  }));
  const summary = summarizeFundLedgers(summaryRows.map((row) => ({
    fundType: row.fundType,
    direction: row.direction,
    amount: row.amount,
    status: 'posted'
  })));
  const total = toNumber(facet.count?.[0]?.total);

  return {
    fundLedgers: facet.rows || [],
    items: facet.rows || [],
    summary: { ...summary, groups: summaryRows },
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasMore: skip + (facet.rows || []).length < total
    }
  };
}

async function findExistingFundLedger(sourceType, sourceCode, fundType, direction, sourceId = '', account = '') {
  const key = buildFundLedgerIdempotencyKey({ sourceType, sourceCode, sourceId, fundType, direction, account });
  if (key) {
    const existedByKey = await fundLedgerRepository.findByIdempotencyKey(key);
    if (existedByKey) return existedByKey;
  }
  const query = {
    fundType,
    direction,
    $or: [
      { sourceType, sourceCode },
      { referenceType: sourceType, referenceCode: sourceCode }
    ]
  };
  if (account) query.account = account;
  if (sourceId) query.$or.push({ sourceType, sourceId }, { referenceType: sourceType, referenceId: sourceId });
  const rows = await fundLedgerRepository.findAll(query, { limit: 1 });
  return rows[0] || null;
}

async function postFundLedger(input = {}, options = {}) {
  const amount = money(input.amount);
  if (amount <= 0) return null;
  const fundType = canonicalFundType(input.fundType);
  const direction = canonicalDirection(input.direction);
  const account = canonicalAccount(input.account, fundType);
  const sourceType = String(input.sourceType || 'MANUAL_FUND').trim();
  const sourceId = String(input.sourceId || input.refId || input.referenceId || '').trim();
  const sourceCode = String(input.sourceCode || input.refCode || input.referenceCode || '').trim();
  const idempotencyKey = String(input.idempotencyKey || buildFundLedgerIdempotencyKey({ ...input, sourceType, sourceId, sourceCode, fundType, direction, account })).trim();
  if (!idempotencyKey) throw new Error('Thiếu sourceId/sourceCode để tạo idempotencyKey cho fund ledger');

  const existed = await fundLedgerRepository.findByIdempotencyKey(idempotencyKey, options);
  if (existed) {
    return {
      ok: true,
      skipped: true,
      ledger: existed,
      reason: 'DUPLICATE_FUND_LEDGER'
    };
  }

  const entry = {
    id: String(input.id || makeId('FL')).trim(),
    code: String(input.code || await nextFundLedgerCode()).trim(),
    date: dateOnly(input.date),
    fundType,
    direction,
    account,
    idempotencyKey,
    amount,
    sourceType,
    sourceId,
    sourceCode,
    refType: String(input.refType || sourceType).trim(),
    refId: String(input.refId || sourceId).trim(),
    refCode: String(input.refCode || sourceCode).trim(),
    referenceType: String(input.referenceType || input.refType || sourceType).trim(),
    referenceId: String(input.referenceId || input.refId || sourceId).trim(),
    referenceCode: String(input.referenceCode || input.refCode || sourceCode).trim(),
    deliveryDate: String(input.deliveryDate || '').trim(),
    deliveryStaffCode: String(input.deliveryStaffCode || '').trim(),
    deliveryStaffName: String(input.deliveryStaffName || '').trim(),
    customerCode: String(input.customerCode || '').trim(),
    customerName: String(input.customerName || '').trim(),
    staffCode: String(input.staffCode || '').trim(),
    staffName: String(input.staffName || '').trim(),
    note: String(input.note || '').trim(),
    status: String(input.status || 'posted').trim(),
    createdBy: String(input.createdBy || '').trim(),
    createdAt: input.createdAt || dateUtil.nowIso(),
    updatedAt: dateUtil.nowIso()
  };

  try {
    await fundLedgerRepository.upsert(entry, options);
    return entry;
  } catch (error) {
    if (error && (error.code === 11000 || String(error.message || '').includes('duplicate key'))) {
      const duplicate = await fundLedgerRepository.findByIdempotencyKey(idempotencyKey, options);
      if (duplicate) return { ok: true, skipped: true, ledger: duplicate, reason: 'DUPLICATE_FUND_LEDGER' };
    }
    throw error;
  }
}

function numberFromRow(row, keys = []) {
  for (const key of keys) {
    const value = toNumber(row[key]);
    if (value > 0) return value;
  }
  return 0;
}

async function buildDeliverySubmissionDraft(query = {}) {
  const deliveryDate = dateOnly(query.deliveryDate || query.date);
  const deliveryStaffCode = String(pickDeliveryStaffCode(query) || query.delivery || '').trim();
  if (!deliveryStaffCode) return { error: 'Thiếu nhân viên giao hàng để tạo phiếu nộp quỹ', status: 400 };
  const deliveryService = getMasterOrderDeliveryService();
  const listDeliveryOrders = typeof deliveryService.listDeliveryTodayOrdersCompact === 'function'
    ? deliveryService.listDeliveryTodayOrdersCompact
    : deliveryService.listDeliveryToday;
  const data = await listDeliveryOrders({ date: deliveryDate, delivery: deliveryStaffCode, deliveryStaffCode, page: 1, limit: 5000 });
  const selectedStaffCode = normalizeText(deliveryStaffCode);
  const orders = (data.orders || data.rows || []).filter((row) => (
    normalizeText(pickDeliveryStaffCode(row) || row.deliveryStaffCode) === selectedStaffCode
  ));
  if (!orders.length) return { error: 'Không có đơn giao để tạo phiếu nộp quỹ', status: 404 };
  const deliveryStaffName = orders.find((row) => row.deliveryStaffName)?.deliveryStaffName || deliveryStaffCode;
  const reportCurrentOrderCashAmount = orders.reduce((sum, row) => sum + numberFromRow(row, ['cashAmount', 'cashCollected']), 0);
  const reportCurrentOrderBankAmount = orders.reduce((sum, row) => sum + numberFromRow(row, ['bankAmount', 'bankCollected', 'transferAmount']), 0);
  const reportOldDebtCashAmount = orders.reduce((sum, row) => sum + numberFromRow(row, ['oldDebtCashCollected', 'debtCashCollected', 'arCashCollected']), 0);
  const reportOldDebtBankAmount = orders.reduce((sum, row) => sum + numberFromRow(row, ['oldDebtBankCollected', 'debtBankCollected', 'arBankCollected']), 0);
  const reportCashAmount = reportCurrentOrderCashAmount + reportOldDebtCashAmount;
  const reportBankAmount = reportCurrentOrderBankAmount + reportOldDebtBankAmount;
  const code = deliverySubmissionCode(deliveryDate, deliveryStaffCode);
  const submittedCashAmount = money(query.submittedCashAmount ?? reportCashAmount);
  const submittedBankAmount = money(query.submittedBankAmount ?? reportBankAmount);
  return {
    draft: {
      id: String(query.id || makeId('NQGH')).trim(),
      code,
      deliveryDate,
      deliveryStaffCode,
      deliveryStaffName,
      reportCashAmount,
      reportBankAmount,
      reportCurrentOrderCashAmount,
      reportCurrentOrderBankAmount,
      reportOldDebtCashAmount,
      reportOldDebtBankAmount,
      submittedCashAmount,
      submittedBankAmount,
      differenceCashAmount: submittedCashAmount - reportCashAmount,
      differenceBankAmount: submittedBankAmount - reportBankAmount,
      orderCodes: orders.map((row) => row.orderCode || row.code || '').filter(Boolean),
      orderIds: orders.map((row) => row.id || '').filter(Boolean),
      status: String(query.status || 'pending').trim(),
      matchStatus: (submittedCashAmount === reportCashAmount && submittedBankAmount === reportBankAmount) ? 'matched' : 'mismatch',
      fundPosted: false,
      note: String(query.note || '').trim(),
      createdBy: String(query.createdBy || '').trim(),
      createdAt: dateUtil.nowIso(),
      updatedAt: dateUtil.nowIso()
    },
    orders,
    deliverySummary: data.summary || data.kpi || {}
  };
}

async function createDeliveryCashSubmission(body = {}) {
  const built = await buildDeliverySubmissionDraft(body);
  if (built.error) return built;
  const draft = built.draft;
  const existed = await deliveryCashSubmissionRepository.findByIdOrCode(draft.code);
  if (existed && !['cancelled', 'canceled', 'void', 'deleted'].includes(String(existed.status || '').toLowerCase())) {
    return { error: `Đã có phiếu nộp quỹ ${existed.code} cho ngày/NVGH này`, status: 409, submission: existed };
  }
  await deliveryCashSubmissionRepository.upsert(draft);
  return { submission: draft, orders: built.orders };
}

async function listDeliveryCashSubmissions(query = {}) {
  const filter = {};
  if (query.deliveryDate || query.date) filter.deliveryDate = dateOnly(query.deliveryDate || query.date);
  if (pickDeliveryStaffCode(query) || query.delivery) filter.deliveryStaffCode = String(pickDeliveryStaffCode(query) || query.delivery).trim();
  let rows = await deliveryCashSubmissionRepository.findAll(filter, { sort: { deliveryDate: -1, createdAt: -1, code: -1 }, limit: query.limit || 500 });
  const q = normalizeText(query.q || query.search || '');
  if (q) rows = rows.filter((row) => matchQuery(row, q));
  if (!rows.length) return { submissions: [] };

  const ids = rows.map((row) => String(row.id || '').trim()).filter(Boolean);
  const codes = rows.map((row) => String(row.code || '').trim()).filter(Boolean);
  const sourceFilter = [];
  if (ids.length) sourceFilter.push({ sourceSubmissionId: { $in: ids } });
  if (codes.length) sourceFilter.push({ sourceSubmissionCode: { $in: codes } });
  const shortageRows = sourceFilter.length
    ? await deliveryCashShortageRepository.findAll({ $or: sourceFilter }, { limit: Math.min(1000, rows.length * 3) })
    : [];
  const shortageBySource = new Map();
  for (const shortage of shortageRows) {
    const keys = [shortageMapKey(shortage.sourceSubmissionId, ''), shortageMapKey('', shortage.sourceSubmissionCode)].filter(Boolean);
    for (const key of keys) {
      if (!shortageBySource.has(key)) shortageBySource.set(key, {});
      shortageBySource.get(key)[canonicalFundType(shortage.fundType)] = shortage;
    }
  }
  rows = rows.map((row) => {
    const shortages = shortageBySource.get(shortageMapKey(row.id, '')) || shortageBySource.get(shortageMapKey('', row.code)) || {};
    return {
      ...row,
      cashShortage: shortages.cash || null,
      bankShortage: shortages.bank || null
    };
  });
  return { submissions: rows };
}


function isLockedVoucher(row = {}) {
  return ['confirmed', 'matched', 'posted'].includes(String(row.status || '').toLowerCase()) || row.fundPosted === true;
}

function lockedError(name) {
  return { error: `${name} đã xác nhận, không được sửa nghiệp vụ`, status: 409 };
}

function isSameDeliveryCashSubmission(left = {}, right = {}) {
  const leftId = String(left.id || '').trim();
  const rightId = String(right.id || '').trim();
  if (leftId && rightId) return leftId === rightId;
  const leftCode = String(left.code || '').trim();
  const rightCode = String(right.code || '').trim();
  return Boolean(leftCode && rightCode && leftCode === rightCode);
}

async function updateDeliveryCashSubmission(idOrCode, body = {}) {
  const current = await deliveryCashSubmissionRepository.findByIdOrCode(idOrCode);
  if (!current) return { error: 'Không tìm thấy phiếu nộp quỹ', status: 404 };
  if (isLockedVoucher(current)) return lockedError('Phiếu nộp quỹ');

  const submittedCashAmount = money(body.submittedCashAmount ?? current.submittedCashAmount ?? current.reportCashAmount);
  const submittedBankAmount = money(body.submittedBankAmount ?? current.submittedBankAmount ?? current.reportBankAmount);
  const deliveryDate = body.deliveryDate ?? body.date ?? current.deliveryDate;
  const deliveryStaffCode = String(
    pickDeliveryStaffCode(body) || body.delivery || current.deliveryStaffCode || ''
  ).trim();

  // Rebuild the report snapshot from the current delivery orders. Previously an edit
  // only changed submitted amounts, leaving reportCashAmount/reportBankAmount stale.
  const rebuilt = await buildDeliverySubmissionDraft({
    ...current,
    ...body,
    id: current.id,
    deliveryDate,
    deliveryStaffCode,
    submittedCashAmount,
    submittedBankAmount,
    status: 'pending',
    note: String(body.note ?? current.note ?? '').trim(),
    createdBy: current.createdBy || body.createdBy || ''
  });
  if (rebuilt.error) return rebuilt;

  const refreshed = rebuilt.draft;
  if (String(refreshed.code || '') !== String(current.code || '')) {
    const collision = await deliveryCashSubmissionRepository.findByIdOrCode(refreshed.code);
    if (collision && !isSameDeliveryCashSubmission(current, collision)) {
      return {
        error: `Đã có phiếu nộp quỹ ${refreshed.code} cho ngày/NVGH này`,
        status: 409,
        submission: collision
      };
    }
  }

  const updated = {
    ...current,
    ...refreshed,
    id: current.id || refreshed.id,
    createdBy: current.createdBy || refreshed.createdBy || '',
    createdAt: current.createdAt || refreshed.createdAt,
    status: 'pending',
    fundPosted: false,
    postedAt: '',
    confirmedAt: '',
    confirmedBy: '',
    updatedAt: dateUtil.nowIso()
  };

  const persisted = await deliveryCashSubmissionRepository.patchByIdOrCode(idOrCode, updated);
  if (!persisted) return { error: 'Phiếu nộp quỹ đã thay đổi hoặc không còn tồn tại', status: 409 };
  return {
    submission: persisted,
    orders: rebuilt.orders,
    message: 'Đã cập nhật phiếu nộp quỹ và đồng bộ lại số báo cáo theo ngày/NVGH'
  };
}


async function listExpenseVouchers(query = {}) {
  const filter = {};
  if (query.dateFrom || query.dateTo) {
    const dateFrom = query.dateFrom ? dateOnly(query.dateFrom) : '';
    const dateTo = query.dateTo ? dateOnly(query.dateTo) : '';
    filter.date = { ...(dateFrom ? { $gte: dateFrom } : {}), ...(dateTo ? { $lte: dateTo } : {}) };
  }
  if (query.fundType && query.fundType !== 'all') filter.fundType = String(query.fundType);
  let rows = await expenseVoucherRepository.findAll(filter, { sort: { date: -1, createdAt: -1, code: -1 }, limit: query.limit || 500 });
  const q = normalizeText(query.q || query.search || '');
  if (q) rows = rows.filter((row) => [row.code, row.expenseType, row.receiverName, row.note, row.status].some((value) => normalizeText(value).includes(q)));
  return { vouchers: rows };
}

async function listFundTransfers(query = {}) {
  const filter = {};
  if (query.dateFrom || query.dateTo) {
    const dateFrom = query.dateFrom ? dateOnly(query.dateFrom) : '';
    const dateTo = query.dateTo ? dateOnly(query.dateTo) : '';
    filter.date = { ...(dateFrom ? { $gte: dateFrom } : {}), ...(dateTo ? { $lte: dateTo } : {}) };
  }
  let rows = await fundTransferRepository.findAll(filter, { sort: { date: -1, createdAt: -1, code: -1 }, limit: query.limit || 500 });
  const q = normalizeText(query.q || query.search || '');
  if (q) rows = rows.filter((row) => [row.code, row.fromFund, row.toFund, row.bankName, row.note, row.status].some((value) => normalizeText(value).includes(q)));
  return { transfers: rows };
}

async function confirmDeliveryCashSubmission(idOrCode, body = {}) {
  const submission = await deliveryCashSubmissionRepository.findByIdOrCode(idOrCode);
  if (!submission) return { error: 'Không tìm thấy phiếu nộp quỹ', status: 404 };
  if (['cancelled', 'canceled', 'void', 'deleted'].includes(String(submission.status || '').toLowerCase())) return { error: 'Phiếu nộp quỹ đã hủy', status: 400 };
  if (submission.fundPosted || String(submission.status || '').toLowerCase() === 'confirmed') {
    return { submission, ledgers: [], message: 'Phiếu đã ghi sổ quỹ trước đó' };
  }

  const submittedCashAmount = money(body.submittedCashAmount ?? submission.submittedCashAmount ?? submission.reportCashAmount);
  const submittedBankAmount = money(body.submittedBankAmount ?? submission.submittedBankAmount ?? submission.reportBankAmount);
  const differenceCashAmount = submittedCashAmount - money(submission.reportCashAmount);
  const differenceBankAmount = submittedBankAmount - money(submission.reportBankAmount);
  const actor = String(body.confirmedBy || body.updatedBy || body.actorCode || '').trim();
  const shortagePlanResult = prepareDeliveryShortagePlans({
    ...submission,
    submittedCashAmount,
    submittedBankAmount,
    differenceCashAmount,
    differenceBankAmount
  }, {
    ...body,
    submittedCashAmount,
    submittedBankAmount,
    differenceCashAmount,
    differenceBankAmount
  });
  if (shortagePlanResult.error) return shortagePlanResult;

  const updated = {
    ...submission,
    submittedCashAmount,
    submittedBankAmount,
    differenceCashAmount,
    differenceBankAmount,
    matchStatus: differenceCashAmount === 0 && differenceBankAmount === 0 ? 'matched' : 'mismatch',
    status: 'confirmed',
    fundPosted: true,
    postedAt: dateUtil.nowIso(),
    confirmedAt: dateUtil.nowIso(),
    confirmedBy: actor,
    shortageClassifiedAt: shortagePlanResult.plans.length ? dateUtil.nowIso() : '',
    shortageClassifiedBy: shortagePlanResult.plans.length ? actor : '',
    note: String(body.note ?? submission.note ?? '').trim(),
    updatedAt: dateUtil.nowIso()
  };
  const ledgers = [];
  let shortages = [];
  await withMongoTransaction(async (session) => {
    await deliveryCashSubmissionRepository.upsert(updated, { session });
    if (submittedCashAmount > 0) ledgers.push(await postFundLedger({
      date: updated.deliveryDate,
      fundType: 'cash',
      direction: 'in',
      amount: submittedCashAmount,
      sourceType: 'DELIVERY_CASH_SUBMISSION',
      sourceId: updated.id,
      sourceCode: updated.code,
      deliveryDate: updated.deliveryDate,
      deliveryStaffCode: updated.deliveryStaffCode,
      deliveryStaffName: updated.deliveryStaffName,
      createdBy: actor,
      note: `NVGH ${updated.deliveryStaffName || updated.deliveryStaffCode} nộp tiền mặt giao hàng ngày ${updated.deliveryDate}`
    }, { session }));
    if (submittedBankAmount > 0) ledgers.push(await postFundLedger({
      date: updated.deliveryDate,
      fundType: 'bank',
      direction: 'in',
      amount: submittedBankAmount,
      sourceType: 'DELIVERY_CASH_SUBMISSION',
      sourceId: updated.id,
      sourceCode: updated.code,
      deliveryDate: updated.deliveryDate,
      deliveryStaffCode: updated.deliveryStaffCode,
      deliveryStaffName: updated.deliveryStaffName,
      createdBy: actor,
      note: `NVGH ${updated.deliveryStaffName || updated.deliveryStaffCode} đối soát chuyển khoản giao hàng ngày ${updated.deliveryDate}`
    }, { session }));
    shortages = await persistDeliveryShortagePlans(updated, shortagePlanResult.plans, actor, { session });
  });
  await auditService.log('DELIVERY_CASH_SUBMISSION_CONFIRMED', {
    refType: 'DELIVERY_CASH_SUBMISSION',
    refId: updated.id,
    refCode: updated.code,
    user: actor,
    summary: {
      submittedCashAmount,
      submittedBankAmount,
      differenceCashAmount,
      differenceBankAmount,
      shortageCodes: shortages.map((row) => row.code)
    },
    note: `Xác nhận phiếu nộp quỹ ${updated.code}`
  });
  return { submission: updated, ledgers: ledgers.filter(Boolean), shortages, message: 'Đã xác nhận phiếu nộp quỹ, ghi fundLedgers và quản lý khoản thiếu' };
}

async function classifyConfirmedDeliveryShortages(idOrCode, body = {}) {
  const submission = await deliveryCashSubmissionRepository.findByIdOrCode(idOrCode);
  if (!submission) return { error: 'Không tìm thấy phiếu nộp quỹ', status: 404 };
  if (!submission.fundPosted && String(submission.status || '').toLowerCase() !== 'confirmed') {
    return { error: 'Chỉ phân loại bổ sung cho phiếu đã xác nhận', status: 409 };
  }
  const shortagePlanResult = prepareDeliveryShortagePlans(submission, body);
  if (shortagePlanResult.error) return shortagePlanResult;
  if (!shortagePlanResult.plans.length) return { error: 'Phiếu không có khoản thiếu cần phân loại', status: 400 };
  const actor = String(body.classifiedBy || body.updatedBy || body.actorCode || '').trim();
  let shortages = [];
  const updated = {
    ...submission,
    shortageClassifiedAt: dateUtil.nowIso(),
    shortageClassifiedBy: actor,
    updatedAt: dateUtil.nowIso()
  };
  await withMongoTransaction(async (session) => {
    shortages = await persistDeliveryShortagePlans(updated, shortagePlanResult.plans, actor, { session });
    await deliveryCashSubmissionRepository.patchByIdOrCode(idOrCode, {
      shortageClassifiedAt: updated.shortageClassifiedAt,
      shortageClassifiedBy: updated.shortageClassifiedBy,
      updatedAt: updated.updatedAt
    }, { session });
  });
  await auditService.log('DELIVERY_CASH_SHORTAGE_CLASSIFIED', {
    refType: 'DELIVERY_CASH_SUBMISSION',
    refId: submission.id,
    refCode: submission.code,
    user: actor,
    summary: { shortageCodes: shortages.map((row) => row.code) },
    note: `Phân loại khoản thiếu cho phiếu ${submission.code}`
  });
  return { submission: updated, shortages, message: 'Đã lưu phân loại khoản thiếu của phiếu đã xác nhận' };
}

async function getDeliveryCashShortageHistory(idOrCode) {
  const shortage = await deliveryCashShortageRepository.findByIdOrCode(idOrCode);
  if (!shortage) return { error: 'Không tìm thấy khoản thiếu quỹ', status: 404 };
  const repayments = await deliveryShortageRepaymentRepository.findAll(
    { $or: [{ shortageId: shortage.id }, { shortageCode: shortage.code }] },
    { sort: { createdAt: -1, code: -1 }, limit: 500 }
  );
  const pendingAmount = repayments
    .filter((row) => String(row.status || '').toLowerCase() === 'pending')
    .reduce((sum, row) => sum + money(row.amount), 0);
  return {
    shortage,
    repayments,
    summary: {
      originalShortageAmount: money(shortage.originalShortageAmount),
      settledAmount: money(shortage.settledAmount),
      adjustedAmount: money(shortage.adjustedAmount),
      outstandingAmount: money(shortage.outstandingAmount),
      pendingAmount,
      availableToRepay: Math.max(0, money(shortage.outstandingAmount) - pendingAmount)
    }
  };
}

async function createDeliveryShortageRepayment(idOrCode, body = {}) {
  const amount = money(body.amount);
  if (amount <= 0) return { error: 'Số tiền nộp bù phải lớn hơn 0', status: 400 };
  const actor = String(body.createdBy || body.actorCode || '').trim();
  let repayment = null;
  let shortage = null;
  await withMongoTransaction(async (session) => {
    shortage = await deliveryCashShortageRepository.findByIdOrCode(idOrCode, { session });
    if (!shortage) throw Object.assign(new Error('Không tìm thấy khoản thiếu quỹ'), { status: 404 });
    if (String(shortage.responsibleType || '') !== 'delivery_staff') {
      throw Object.assign(new Error('Khoản thiếu này không được ghi nhận là công nợ của NVGH'), { status: 409 });
    }
    if (!['open', 'partial'].includes(String(shortage.status || '').toLowerCase()) || money(shortage.outstandingAmount) <= 0) {
      throw Object.assign(new Error('Khoản thiếu đã tất toán hoặc không còn được phép nộp bù'), { status: 409 });
    }
    const reservedShortage = await deliveryCashShortageRepository.reservePendingRepayment(
      shortage.id || shortage.code,
      amount,
      dateUtil.nowIso(),
      { session }
    );
    if (!reservedShortage) {
      const pendingRows = await deliveryShortageRepaymentRepository.findAll(
        { $or: [{ shortageId: shortage.id }, { shortageCode: shortage.code }], status: 'pending' },
        { session, limit: 500 }
      );
      const pendingAmount = pendingRows.reduce((sum, row) => sum + money(row.amount), 0);
      const available = Math.max(0, money(shortage.outstandingAmount) - pendingAmount);
      throw Object.assign(new Error(`Số tiền nộp bù vượt số còn có thể lập phiếu (${available})`), { status: 409 });
    }
    shortage = reservedShortage;
    const now = dateUtil.nowIso();
    repayment = {
      id: makeId('DSR'),
      code: deliveryShortageRepaymentCode(shortage, body.repaymentDate || body.date),
      shortageId: shortage.id,
      shortageCode: shortage.code,
      sourceSubmissionId: shortage.sourceSubmissionId,
      sourceSubmissionCode: shortage.sourceSubmissionCode,
      deliveryDate: shortage.deliveryDate,
      deliveryStaffCode: shortage.deliveryStaffCode,
      deliveryStaffName: shortage.deliveryStaffName,
      repaymentDate: dateOnly(body.repaymentDate || body.date),
      fundType: canonicalFundType(body.fundType || body.paymentMethod),
      amount,
      status: 'pending',
      fundPosted: false,
      note: String(body.note || '').trim(),
      createdBy: actor,
      createdAt: now,
      updatedAt: now
    };
    await deliveryShortageRepaymentRepository.upsert(repayment, { session });
  });
  await auditService.log('DELIVERY_SHORTAGE_REPAYMENT_CREATED', {
    refType: 'DELIVERY_CASH_SHORTAGE',
    refId: shortage.id,
    refCode: shortage.code,
    user: actor,
    summary: repayment,
    note: `Tạo phiếu nộp bù ${repayment.code}`
  });
  return { shortage, repayment, message: 'Đã tạo phiếu nộp bù, chờ kế toán xác nhận ghi quỹ' };
}

async function confirmDeliveryShortageRepayment(idOrCode, body = {}) {
  let repayment = await deliveryShortageRepaymentRepository.findByIdOrCode(idOrCode);
  if (!repayment) return { error: 'Không tìm thấy phiếu nộp bù', status: 404 };
  if (repayment.fundPosted || String(repayment.status || '').toLowerCase() === 'confirmed') {
    const shortage = await deliveryCashShortageRepository.findByIdOrCode(repayment.shortageId || repayment.shortageCode);
    return { repayment, shortage, ledger: null, message: 'Phiếu nộp bù đã ghi quỹ trước đó' };
  }
  if (String(repayment.status || '').toLowerCase() !== 'pending') return { error: 'Phiếu nộp bù không ở trạng thái chờ xác nhận', status: 409 };
  const amount = money(repayment.amount);
  if (amount <= 0) return { error: 'Số tiền nộp bù không hợp lệ', status: 400 };
  const actor = String(body.confirmedBy || body.updatedBy || body.actorCode || '').trim();
  let shortage = null;
  let ledger = null;
  await withMongoTransaction(async (session) => {
    const currentRepayment = await deliveryShortageRepaymentRepository.findByIdOrCode(idOrCode, { session });
    if (!currentRepayment || currentRepayment.fundPosted || String(currentRepayment.status || '') !== 'pending') {
      throw Object.assign(new Error('Phiếu nộp bù đã được xử lý bởi phiên khác'), { status: 409 });
    }
    shortage = await deliveryCashShortageRepository.applyConfirmedRepayment(
      currentRepayment.shortageId || currentRepayment.shortageCode,
      amount,
      dateUtil.nowIso(),
      { session }
    );
    if (!shortage) throw Object.assign(new Error('Số tiền nộp bù vượt khoản còn thiếu hoặc khoản thiếu đã khóa'), { status: 409 });
    const now = dateUtil.nowIso();
    repayment = await deliveryShortageRepaymentRepository.markConfirmedIfPending(idOrCode, {
      status: 'confirmed',
      fundPosted: true,
      postedAt: now,
      confirmedAt: now,
      confirmedBy: actor,
      updatedAt: now
    }, { session });
    if (!repayment) throw Object.assign(new Error('Phiếu nộp bù đã được xác nhận trước đó'), { status: 409 });
    ledger = await postFundLedger({
      date: repayment.repaymentDate,
      fundType: repayment.fundType,
      direction: 'in',
      amount,
      sourceType: 'DELIVERY_SHORTAGE_REPAYMENT',
      sourceId: repayment.id,
      sourceCode: repayment.code,
      deliveryDate: repayment.deliveryDate,
      deliveryStaffCode: repayment.deliveryStaffCode,
      deliveryStaffName: repayment.deliveryStaffName,
      createdBy: actor,
      note: repayment.note || `NVGH ${repayment.deliveryStaffName || repayment.deliveryStaffCode} nộp bù thiếu quỹ ${repayment.shortageCode}`
    }, { session });
  });
  await auditService.log('DELIVERY_SHORTAGE_REPAYMENT_CONFIRMED', {
    refType: 'DELIVERY_CASH_SHORTAGE',
    refId: shortage.id,
    refCode: shortage.code,
    user: actor,
    summary: { repaymentCode: repayment.code, amount, outstandingAmount: shortage.outstandingAmount },
    note: `Xác nhận phiếu nộp bù ${repayment.code}`
  });
  return { repayment, shortage, ledger, message: 'Đã xác nhận nộp bù, tăng quỹ và giảm công nợ thiếu quỹ NVGH' };
}


async function createExpenseVoucher(body = {}) {
  const amount = money(body.amount);
  if (amount <= 0) return { error: 'Số tiền chi phải lớn hơn 0', status: 400 };
  const voucher = {
    id: String(body.id || makeId('PC')).trim(),
    code: String(body.code || await nextExpenseCode()).trim(),
    date: dateOnly(body.date),
    fundType: String(body.fundType || 'cash').toLowerCase() === 'bank' ? 'bank' : 'cash',
    amount,
    expenseType: String(body.expenseType || 'other').trim(),
    receiverName: String(body.receiverName || '').trim(),
    note: String(body.note || '').trim(),
    status: 'pending',
    fundPosted: false,
    createdBy: String(body.createdBy || '').trim(),
    createdAt: dateUtil.nowIso(),
    updatedAt: dateUtil.nowIso()
  };
  await expenseVoucherRepository.upsert(voucher);
  return { voucher, message: 'Đã tạo phiếu chi, chờ xác nhận ghi sổ quỹ' };
}

async function updateExpenseVoucher(idOrCode, body = {}) {
  const current = await expenseVoucherRepository.findByIdOrCode(idOrCode);
  if (!current) return { error: 'Không tìm thấy phiếu chi', status: 404 };
  if (isLockedVoucher(current)) return lockedError('Phiếu chi');
  const amount = money(body.amount ?? current.amount);
  if (amount <= 0) return { error: 'Số tiền chi phải lớn hơn 0', status: 400 };
  const updated = {
    ...current,
    date: dateOnly(body.date || current.date),
    fundType: String(body.fundType || current.fundType || 'cash').toLowerCase() === 'bank' ? 'bank' : 'cash',
    amount,
    expenseType: String(body.expenseType ?? current.expenseType ?? 'other').trim(),
    receiverName: String(body.receiverName ?? current.receiverName ?? '').trim(),
    note: String(body.note ?? current.note ?? '').trim(),
    status: 'pending',
    updatedAt: dateUtil.nowIso()
  };
  await expenseVoucherRepository.upsert(updated);
  return { voucher: updated, message: 'Đã cập nhật phiếu chi' };
}

async function confirmExpenseVoucher(idOrCode, body = {}) {
  const voucher = await expenseVoucherRepository.findByIdOrCode(idOrCode);
  if (!voucher) return { error: 'Không tìm thấy phiếu chi', status: 404 };
  if (['cancelled', 'canceled', 'void', 'deleted'].includes(String(voucher.status || '').toLowerCase())) return { error: 'Phiếu chi đã hủy', status: 400 };
  if (voucher.fundPosted || String(voucher.status || '').toLowerCase() === 'confirmed') return { voucher, ledger: null, message: 'Phiếu chi đã ghi sổ quỹ trước đó' };
  const amount = money(voucher.amount);
  if (amount <= 0) return { error: 'Số tiền chi phải lớn hơn 0', status: 400 };
  const updated = { ...voucher, status: 'confirmed', fundPosted: true, postedAt: dateUtil.nowIso(), confirmedAt: dateUtil.nowIso(), confirmedBy: String(body.confirmedBy || body.updatedBy || '').trim(), updatedAt: dateUtil.nowIso() };
  let ledger = null;
  await withMongoTransaction(async (session) => {
    ledger = await postFundLedger({ date: updated.date, fundType: updated.fundType, direction: 'out', amount, sourceType: 'EXPENSE_VOUCHER', sourceId: updated.id, sourceCode: updated.code, referenceType: 'EXPENSE_VOUCHER', referenceId: updated.id, referenceCode: updated.code, note: updated.note || `Phiếu chi ${updated.code}` }, { session });
    await expenseVoucherRepository.upsert(updated, { session });
  });
  return { voucher: updated, ledger, message: 'Đã xác nhận phiếu chi và ghi fundLedgers' };
}

async function createFundTransfer(body = {}) {
  const amount = money(body.amount);
  if (amount <= 0) return { error: 'Số tiền chuyển quỹ phải lớn hơn 0', status: 400 };
  const fromFund = String(body.fromFund || 'cash').toLowerCase() === 'bank' ? 'bank' : 'cash';
  const toFund = String(body.toFund || 'bank').toLowerCase() === 'cash' ? 'cash' : 'bank';
  if (fromFund === toFund) return { error: 'Quỹ nguồn và quỹ đích không được trùng nhau', status: 400 };
  const transfer = {
    id: String(body.id || makeId('CQ')).trim(),
    code: String(body.code || await nextTransferCode()).trim(),
    date: dateOnly(body.date),
    fromFund,
    toFund,
    amount,
    bankName: String(body.bankName || '').trim(),
    accountNumber: String(body.accountNumber || '').trim(),
    note: String(body.note || '').trim(),
    status: 'pending',
    fundPosted: false,
    createdBy: String(body.createdBy || '').trim(),
    createdAt: dateUtil.nowIso(),
    updatedAt: dateUtil.nowIso()
  };
  await fundTransferRepository.upsert(transfer);
  return { transfer, message: 'Đã tạo phiếu chuyển quỹ, chờ xác nhận ghi sổ quỹ' };
}

async function updateFundTransfer(idOrCode, body = {}) {
  const current = await fundTransferRepository.findByIdOrCode(idOrCode);
  if (!current) return { error: 'Không tìm thấy phiếu chuyển quỹ', status: 404 };
  if (isLockedVoucher(current)) return lockedError('Phiếu chuyển quỹ');
  const amount = money(body.amount ?? current.amount);
  if (amount <= 0) return { error: 'Số tiền chuyển quỹ phải lớn hơn 0', status: 400 };
  const fromFund = String(body.fromFund || current.fromFund || 'cash').toLowerCase() === 'bank' ? 'bank' : 'cash';
  const toFund = String(body.toFund || current.toFund || 'bank').toLowerCase() === 'cash' ? 'cash' : 'bank';
  if (fromFund === toFund) return { error: 'Quỹ nguồn và quỹ đích không được trùng nhau', status: 400 };
  const updated = {
    ...current,
    date: dateOnly(body.date || current.date),
    fromFund,
    toFund,
    amount,
    bankName: String(body.bankName ?? current.bankName ?? '').trim(),
    accountNumber: String(body.accountNumber ?? current.accountNumber ?? '').trim(),
    note: String(body.note ?? current.note ?? '').trim(),
    status: 'pending',
    updatedAt: dateUtil.nowIso()
  };
  await fundTransferRepository.upsert(updated);
  return { transfer: updated, message: 'Đã cập nhật phiếu chuyển quỹ' };
}

async function confirmFundTransfer(idOrCode, body = {}) {
  const transfer = await fundTransferRepository.findByIdOrCode(idOrCode);
  if (!transfer) return { error: 'Không tìm thấy phiếu chuyển quỹ', status: 404 };
  if (['cancelled', 'canceled', 'void', 'deleted'].includes(String(transfer.status || '').toLowerCase())) return { error: 'Phiếu chuyển quỹ đã hủy', status: 400 };
  if (transfer.fundPosted || String(transfer.status || '').toLowerCase() === 'confirmed') return { transfer, ledgers: [], message: 'Phiếu chuyển quỹ đã ghi sổ quỹ trước đó' };
  const amount = money(transfer.amount);
  if (amount <= 0) return { error: 'Số tiền chuyển quỹ phải lớn hơn 0', status: 400 };
  const updated = { ...transfer, status: 'confirmed', fundPosted: true, postedAt: dateUtil.nowIso(), confirmedAt: dateUtil.nowIso(), confirmedBy: String(body.confirmedBy || body.updatedBy || '').trim(), updatedAt: dateUtil.nowIso() };
  const ledgers = [];
  await withMongoTransaction(async (session) => {
    ledgers.push(await postFundLedger({ date: updated.date, fundType: updated.fromFund, direction: 'out', amount, sourceType: 'FUND_TRANSFER', sourceId: updated.id, sourceCode: updated.code, referenceType: 'FUND_TRANSFER', referenceId: updated.id, referenceCode: updated.code, note: updated.note || `Chuyển quỹ ${updated.fromFund} sang ${updated.toFund}` }, { session }));
    ledgers.push(await postFundLedger({ date: updated.date, fundType: updated.toFund, direction: 'in', amount, sourceType: 'FUND_TRANSFER', sourceId: updated.id, sourceCode: updated.code, referenceType: 'FUND_TRANSFER', referenceId: updated.id, referenceCode: updated.code, note: updated.note || `Nhận chuyển quỹ từ ${updated.fromFund}` }, { session }));
    await fundTransferRepository.upsert(updated, { session });
  });
  return { transfer: updated, ledgers: ledgers.filter(Boolean), message: 'Đã xác nhận chuyển quỹ và ghi fundLedgers' };
}

module.exports = {
  listFundLedgers,
  summarizeFundLedgers,
  buildDeliverySubmissionDraft,
  createDeliveryCashSubmission,
  listDeliveryCashSubmissions,
  listExpenseVouchers,
  listFundTransfers,
  confirmDeliveryCashSubmission,
  classifyConfirmedDeliveryShortages,
  getDeliveryCashShortageHistory,
  createDeliveryShortageRepayment,
  confirmDeliveryShortageRepayment,
  updateDeliveryCashSubmission,
  createExpenseVoucher,
  updateExpenseVoucher,
  confirmExpenseVoucher,
  createFundTransfer,
  updateFundTransfer,
  confirmFundTransfer,
  postFundLedger,
  buildFundLedgerIdempotencyKey
};
