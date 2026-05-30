'use strict';

const receiptRepository = require('../repositories/receiptRepository');
const cashbookRepository = require('../repositories/cashbookRepository');
const bankbookRepository = require('../repositories/bankbookRepository');
const paymentRepository = require('../repositories/paymentRepository');
const customerRepository = require('../repositories/customerRepository');
const { makeId, normalizeText, toNumber } = require('../utils/common.util');
const { withMongoTransaction } = require('../utils/transaction.util');

function today() {
  return new Date().toISOString().slice(0, 10);
}

function nowIso() {
  return new Date().toISOString();
}

function isActive(row = {}) {
  return !['void', 'cancelled', 'canceled', 'deleted'].includes(String(row.status || '').toLowerCase());
}

function buildRunningCode(prefix, rows = []) {
  const max = rows.reduce((result, row) => {
    const match = String(row.code || '').match(/(\d+)$/);
    return Math.max(result, match ? Number(match[1]) : 0);
  }, 0);
  return `${prefix}${String(max + 1).padStart(5, '0')}`;
}

async function buildCashCode(type = 'in') {
  const rows = await cashbookRepository.findAll();
  return buildRunningCode(type === 'out' ? 'CT' : 'PT', rows);
}

async function buildBankCode() {
  const rows = await bankbookRepository.findAll();
  return buildRunningCode('NH', rows);
}

async function buildReceiptCode() {
  const rows = await receiptRepository.findAll();
  return buildRunningCode('TH', rows);
}

function cashSummary(rows = []) {
  const active = rows.filter(isActive);
  const cashIn = active.filter((e) => e.type === 'in').reduce((sum, e) => sum + toNumber(e.amount), 0);
  const cashOut = active.filter((e) => e.type === 'out').reduce((sum, e) => sum + toNumber(e.amount), 0);
  return { cashIn, cashOut, balance: cashIn - cashOut };
}

function bankSummary(rows = []) {
  const active = rows.filter(isActive);
  const bankIn = active.filter((e) => e.type === 'in').reduce((sum, e) => sum + toNumber(e.amount), 0);
  const bankOut = active.filter((e) => e.type === 'out').reduce((sum, e) => sum + toNumber(e.amount), 0);
  return { bankIn, bankOut, balance: bankIn - bankOut };
}

function matchMoneyQuery(row, q) {
  return [row.code, row.source, row.refCode, row.customerCode, row.customerName, row.staffName, row.note]
    .some((value) => normalizeText(value).includes(q));
}

async function listCashbook(query = {}) {
  const q = normalizeText(query.q);
  let cashbooks = await cashbookRepository.findAll({}, { sort: { createdAt: -1, code: -1 } });
  let bankbooks = await bankbookRepository.findAll({}, { sort: { createdAt: -1, code: -1 } });
  if (q) {
    cashbooks = cashbooks.filter((row) => matchMoneyQuery(row, q));
    bankbooks = bankbooks.filter((row) => matchMoneyQuery(row, q));
  }
  return { cashbook: cashbooks, cashbooks, bankbooks, summary: cashSummary(cashbooks), bankSummary: bankSummary(bankbooks) };
}

async function createCashbook(body = {}) {
  const amount = toNumber(body.amount);
  if (amount <= 0) return { error: 'Số tiền phải lớn hơn 0', status: 400 };
  const type = String(body.type || 'in').toLowerCase() === 'out' ? 'out' : 'in';
  const entry = {
    id: String(body.id || makeId('CB')).trim(),
    code: String(body.code || await buildCashCode(type)).trim(),
    date: String(body.date || today()).slice(0, 10),
    type,
    source: String(body.source || 'manual_cashbook').trim(),
    refType: String(body.refType || 'manual_cashbook').trim(),
    refId: String(body.refId || '').trim(),
    refCode: String(body.refCode || '').trim(),
    customerId: String(body.customerId || '').trim(),
    customerCode: String(body.customerCode || '').trim(),
    customerName: String(body.customerName || '').trim(),
    staffName: String(body.staffName || '').trim(),
    method: 'cash',
    amount,
    note: String(body.note || '').trim(),
    status: body.status || 'posted',
    createdAt: body.createdAt || nowIso(),
    updatedAt: nowIso()
  };
  await withMongoTransaction(async (session) => {
    await cashbookRepository.upsert(entry, { session });
  });
  return { entry };
}

async function listBankbook() {
  const bankbooks = await bankbookRepository.findAll({}, { sort: { createdAt: -1, code: -1 } });
  return { bankbooks, summary: bankSummary(bankbooks) };
}

async function listReceipts(query = {}) {
  const q = normalizeText(query.q);
  let receipts = await receiptRepository.findAll({}, { sort: { createdAt: -1, code: -1 } });
  if (q) {
    receipts = receipts.filter((r) => [r.code, r.customerCode, r.customerName, r.staffName, r.refCode, r.note]
      .some((value) => normalizeText(value).includes(q)));
  }
  return receipts;
}

async function resolveCustomer(body = {}) {
  const identity = String(body.customerId || body.customerCode || body.customerName || '').trim();
  if (!identity) return null;
  return customerRepository.findByIdOrCode(identity);
}

async function createReceipt(body = {}) {
  const amount = toNumber(body.amount);
  if (amount <= 0) return { error: 'Số tiền thu phải lớn hơn 0', status: 400 };
  const customer = await resolveCustomer(body);
  if (!customer) return { error: 'Không tìm thấy khách hàng', status: 404 };
  const method = ['transfer', 'bank'].includes(String(body.method || '').toLowerCase()) ? 'transfer' : 'cash';
  const now = nowIso();
  const receipt = {
    ...body,
    id: String(body.id || makeId('RC')).trim(),
    code: String(body.code || await buildReceiptCode()).trim(),
    date: String(body.date || today()).slice(0, 10),
    customerId: customer.id || body.customerId || customer.code || '',
    customerCode: customer.code || body.customerCode || '',
    customerName: customer.name || body.customerName || '',
    method,
    amount,
    staffName: String(body.staffName || '').trim(),
    note: String(body.note || '').trim(),
    refType: body.refType || 'receipt',
    refId: body.refId || body.orderId || body.salesOrderId || '',
    refCode: body.refCode || body.orderCode || body.salesOrderCode || '',
    orderId: body.orderId || body.salesOrderId || body.refId || '',
    salesOrderId: body.salesOrderId || body.orderId || body.refId || '',
    status: body.status === 'void' || body.status === 'cancelled' ? 'void' : 'posted',
    voidReason: body.voidReason || '',
    voidedAt: body.voidedAt || '',
    createdAt: body.createdAt || now,
    updatedAt: now
  };
  const payment = {
    id: makeId('PM'),
    date: receipt.date,
    type: 'ar_receipt',
    account: 'AR',
    refType: 'RECEIPT',
    refId: receipt.id,
    refCode: receipt.code,
    orderId: receipt.orderId || receipt.salesOrderId || '',
    orderCode: receipt.orderCode || receipt.salesOrderCode || receipt.refCode || '',
    customerId: receipt.customerId,
    customerCode: receipt.customerCode,
    customerName: receipt.customerName,
    debit: 0,
    credit: receipt.amount,
    amount: receipt.amount,
    note: receipt.note || `Thu công nợ ${receipt.code}`,
    status: 'posted',
    source: 'financial_service',
    createdAt: now,
    updatedAt: now
  };
  const moneyEntry = {
    id: makeId(method === 'transfer' ? 'BB' : 'CB'),
    code: method === 'transfer' ? await buildBankCode() : await buildCashCode('in'),
    date: receipt.date,
    type: 'in',
    source: 'receipt',
    refType: 'receipt',
    refId: receipt.id,
    refCode: receipt.code,
    orderId: receipt.orderId || receipt.salesOrderId || '',
    orderCode: receipt.orderCode || receipt.salesOrderCode || receipt.refCode || '',
    customerId: receipt.customerId,
    customerCode: receipt.customerCode,
    customerName: receipt.customerName,
    staffName: receipt.staffName,
    method,
    amount: receipt.amount,
    amount: receipt.amount,
    note: receipt.note || `Thu công nợ ${receipt.code}`,
    status: 'posted',
    source: 'financial_service',
    createdAt: now,
    updatedAt: now
  };
  await withMongoTransaction(async (session) => {
    await receiptRepository.upsert(receipt, { session });
    await paymentRepository.upsert(payment, { session });
    if (method === 'transfer') await bankbookRepository.upsert(moneyEntry, { session });
    else await cashbookRepository.upsert(moneyEntry, { session });
  });

  return { receipt };
}

async function voidReceipt(id, body = {}, query = {}) {
  const receipt = await receiptRepository.findByIdOrCode(id);
  if (!receipt) return { error: 'Không tìm thấy phiếu thu', status: 404 };
  const now = nowIso();
  const voided = {
    ...receipt,
    status: 'void',
    voidReason: String(query.reason || body.reason || body.voidReason || 'Hủy phiếu thu').trim(),
    voidedAt: now,
    updatedAt: now
  };
  const sameRef = (entry) => entry.refType === 'receipt' && (entry.refId === receipt.id || entry.refCode === receipt.code);
  const [payments, cashbooks, bankbooks] = await Promise.all([
    paymentRepository.findAll(),
    cashbookRepository.findAll(),
    bankbookRepository.findAll()
  ]);
  await withMongoTransaction(async (session) => {
    await receiptRepository.upsert(voided, { session });
    await Promise.all([
      ...payments.filter(sameRef).map((entry) => paymentRepository.upsert({ ...entry, status: 'void', updatedAt: now }, { session })),
      ...cashbooks.filter(sameRef).map((entry) => cashbookRepository.upsert({ ...entry, status: 'void', updatedAt: now }, { session })),
      ...bankbooks.filter(sameRef).map((entry) => bankbookRepository.upsert({ ...entry, status: 'void', updatedAt: now }, { session }))
    ]);
  });
  return { receipt: voided };
}

module.exports = {
  listCashbook,
  createCashbook,
  listBankbook,
  listReceipts,
  createReceipt,
  voidReceipt,
  cashSummary,
  bankSummary
};
