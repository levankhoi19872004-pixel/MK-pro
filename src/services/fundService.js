'use strict';

const dateUtil = require('../utils/date.util');
const { makeId, normalizeText, toNumber } = require('../utils/common.util');
const { withMongoTransaction } = require('../utils/transaction.util');
const fundLedgerRepository = require('../repositories/fundLedgerRepository');
const deliveryCashSubmissionRepository = require('../repositories/deliveryCashSubmissionRepository');
const expenseVoucherRepository = require('../repositories/expenseVoucherRepository');
const fundTransferRepository = require('../repositories/fundTransferRepository');
const masterOrderService = require('./masterOrderService');

function today() { return dateUtil.todayVN(); }
function nowIso() { return new Date().toISOString(); }
function dateOnly(value) { return dateUtil.toDateOnly(value || today()); }
function money(value) { return Math.max(0, Math.round(toNumber(value))); }
function activeStatus(row = {}) { return !['void', 'cancelled', 'canceled', 'deleted'].includes(String(row.status || '').toLowerCase()); }

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
  const filter = {};
  if (query.fundType && query.fundType !== 'all') filter.fundType = String(query.fundType);
  if (query.direction && query.direction !== 'all') filter.direction = String(query.direction);
  const dateFrom = query.dateFrom ? dateOnly(query.dateFrom) : '';
  const dateTo = query.dateTo ? dateOnly(query.dateTo) : '';
  if (dateFrom || dateTo) filter.date = { ...(dateFrom ? { $gte: dateFrom } : {}), ...(dateTo ? { $lte: dateTo } : {}) };
  let rows = await fundLedgerRepository.findAll(filter, { sort: { date: -1, createdAt: -1, code: -1 }, limit: query.limit || 1000 });
  const q = normalizeText(query.q || query.search || '');
  if (q) rows = rows.filter((row) => matchQuery(row, q));
  return { fundLedgers: rows, summary: summarizeFundLedgers(rows) };
}

async function findExistingFundLedger(sourceType, sourceCode, fundType, direction) {
  const rows = await fundLedgerRepository.findAll({ sourceType, sourceCode, fundType, direction }, { limit: 1 });
  return rows[0] || null;
}

async function postFundLedger(input = {}, options = {}) {
  const amount = money(input.amount);
  if (amount <= 0) return null;
  const fundType = String(input.fundType || 'cash').toLowerCase() === 'bank' ? 'bank' : 'cash';
  const direction = String(input.direction || 'in').toLowerCase() === 'out' ? 'out' : 'in';
  const sourceType = String(input.sourceType || 'MANUAL_FUND').trim();
  const sourceCode = String(input.sourceCode || input.refCode || '').trim();
  if (sourceCode) {
    const existed = await findExistingFundLedger(sourceType, sourceCode, fundType, direction);
    if (existed) return existed;
  }
  const entry = {
    id: String(input.id || makeId('FL')).trim(),
    code: String(input.code || await nextFundLedgerCode()).trim(),
    date: dateOnly(input.date),
    fundType,
    direction,
    amount,
    sourceType,
    sourceId: String(input.sourceId || '').trim(),
    sourceCode,
    refType: String(input.refType || sourceType).trim(),
    refId: String(input.refId || input.sourceId || '').trim(),
    refCode: String(input.refCode || sourceCode).trim(),
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
    createdAt: input.createdAt || nowIso(),
    updatedAt: nowIso()
  };
  await fundLedgerRepository.upsert(entry, options);
  return entry;
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
  const deliveryStaffCode = String(query.deliveryStaffCode || query.delivery || query.staffCode || '').trim();
  if (!deliveryStaffCode) return { error: 'Thiếu nhân viên giao hàng để tạo phiếu nộp quỹ', status: 400 };
  const data = await masterOrderService.listDeliveryToday({ date: deliveryDate, delivery: deliveryStaffCode, deliveryStaffCode, page: 1, limit: 5000 });
  const orders = data.orders || [];
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
      status: (submittedCashAmount === reportCashAmount && submittedBankAmount === reportBankAmount) ? 'matched' : 'mismatch',
      fundPosted: false,
      note: String(query.note || '').trim(),
      createdBy: String(query.createdBy || '').trim(),
      createdAt: nowIso(),
      updatedAt: nowIso()
    },
    orders,
    deliverySummary: data.kpi || {}
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
  if (query.deliveryStaffCode || query.delivery) filter.deliveryStaffCode = String(query.deliveryStaffCode || query.delivery).trim();
  let rows = await deliveryCashSubmissionRepository.findAll(filter, { sort: { deliveryDate: -1, createdAt: -1, code: -1 }, limit: query.limit || 500 });
  const q = normalizeText(query.q || query.search || '');
  if (q) rows = rows.filter((row) => matchQuery(row, q));
  return { submissions: rows };
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
  if (submission.fundPosted) return { submission, ledgers: [], message: 'Phiếu đã ghi sổ quỹ trước đó' };
  const submittedCashAmount = money(body.submittedCashAmount ?? submission.submittedCashAmount ?? submission.reportCashAmount);
  const submittedBankAmount = money(body.submittedBankAmount ?? submission.submittedBankAmount ?? submission.reportBankAmount);
  const updated = {
    ...submission,
    submittedCashAmount,
    submittedBankAmount,
    differenceCashAmount: submittedCashAmount - money(submission.reportCashAmount),
    differenceBankAmount: submittedBankAmount - money(submission.reportBankAmount),
    status: 'confirmed',
    fundPosted: true,
    postedAt: nowIso(),
    note: String(body.note ?? submission.note ?? '').trim(),
    updatedAt: nowIso()
  };
  const ledgers = [];
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
      note: `NVGH ${updated.deliveryStaffName || updated.deliveryStaffCode} đối soát chuyển khoản giao hàng ngày ${updated.deliveryDate}`
    }, { session }));
  });
  return { submission: updated, ledgers: ledgers.filter(Boolean), message: 'Đã xác nhận phiếu nộp quỹ và ghi fundLedgers' };
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
    status: body.status || 'confirmed',
    fundPosted: false,
    createdBy: String(body.createdBy || '').trim(),
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  const result = { voucher, ledger: null };
  await withMongoTransaction(async (session) => {
    await expenseVoucherRepository.upsert(voucher, { session });
    if (voucher.status === 'confirmed') {
      result.ledger = await postFundLedger({ date: voucher.date, fundType: voucher.fundType, direction: 'out', amount, sourceType: 'EXPENSE_VOUCHER', sourceId: voucher.id, sourceCode: voucher.code, note: voucher.note || `Phiếu chi ${voucher.code}` }, { session });
      voucher.fundPosted = true;
      voucher.postedAt = nowIso();
      await expenseVoucherRepository.upsert(voucher, { session });
    }
  });
  return result;
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
    status: body.status || 'confirmed',
    fundPosted: false,
    createdBy: String(body.createdBy || '').trim(),
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  const ledgers = [];
  await withMongoTransaction(async (session) => {
    await fundTransferRepository.upsert(transfer, { session });
    if (transfer.status === 'confirmed') {
      ledgers.push(await postFundLedger({ date: transfer.date, fundType: fromFund, direction: 'out', amount, sourceType: 'FUND_TRANSFER', sourceId: transfer.id, sourceCode: transfer.code, note: transfer.note || `Chuyển quỹ ${fromFund} sang ${toFund}` }, { session }));
      ledgers.push(await postFundLedger({ date: transfer.date, fundType: toFund, direction: 'in', amount, sourceType: 'FUND_TRANSFER', sourceId: transfer.id, sourceCode: transfer.code, note: transfer.note || `Nhận chuyển quỹ từ ${fromFund}` }, { session }));
      transfer.fundPosted = true;
      transfer.postedAt = nowIso();
      await fundTransferRepository.upsert(transfer, { session });
    }
  });
  return { transfer, ledgers: ledgers.filter(Boolean) };
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
  createExpenseVoucher,
  createFundTransfer,
  postFundLedger
};
