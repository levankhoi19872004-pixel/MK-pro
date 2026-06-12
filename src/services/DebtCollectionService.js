'use strict';

const DebtCollection = require('../models/DebtCollection');
const DebtReadService = require('./DebtReadService');
const ArPostingService = require('../domain/posting/ArPostingService');
const FundPostingService = require('../domain/posting/FundPostingService');
const dateUtil = require('../utils/date.util');
const { makeId, toNumber } = require('../utils/common.util');
const { withMongoTransaction } = require('../utils/transaction.util');

const ACTIVE_STATUSES = ['submitted', 'accounting_confirmed'];

function text(value) {
  return String(value || '').trim();
}

function money(value) {
  return Math.max(0, Math.round(toNumber(value)));
}

function fail(status, message, extra = {}) {
  return { error: message, status, ...extra };
}

function okBody(body = {}, statusCode) {
  return statusCode ? { statusCode, body } : { body };
}

function collectorTypeOf(user = {}, body = {}) {
  const requested = text(body.collectorType).toLowerCase();
  if (requested === 'sales' || requested === 'delivery') return requested;
  return String(user.role || '').toLowerCase() === 'delivery' ? 'delivery' : 'sales';
}

function collectorCodeOf(user = {}) {
  return text(user.staffCode || user.code || user.salesStaffCode || user.deliveryStaffCode || user.username);
}

function collectorNameOf(user = {}) {
  return text(user.fullName || user.name || user.salesStaffName || user.deliveryStaffName || user.username);
}

function normalizePaymentMethod(value = '') {
  const raw = text(value || 'cash').toLowerCase();
  if (raw === 'bank' || raw === 'transfer' || raw === 'bank_transfer') return 'bank_transfer';
  if (raw === 'other') return 'other';
  return 'cash';
}

async function makeDebtCollectionCode(now = dateUtil.nowIso()) {
  const date = dateUtil.toDateOnly(now || dateUtil.todayVN()).replace(/-/g, '');
  const prefix = `DC${date}`;
  const count = await DebtCollection.countDocuments({ code: new RegExp(`^${prefix}`) }).catch(() => 0);
  return `${prefix}${String(count + 1).padStart(4, '0')}`;
}

function buildCollectorFields(mobileUser = {}, body = {}) {
  const collectorType = collectorTypeOf(mobileUser, body);
  const collectorCode = collectorCodeOf(mobileUser);
  const collectorName = collectorNameOf(mobileUser);
  const fields = {
    collectorType,
    collectorUserId: text(mobileUser.id || mobileUser._id),
    collectorCode,
    collectorName,
    salesStaffCode: text(body.salesStaffCode || mobileUser.salesStaffCode || mobileUser.salesmanCode || mobileUser.nvbhCode || (collectorType === 'sales' ? collectorCode : '')),
    salesStaffName: text(body.salesStaffName || mobileUser.salesStaffName || mobileUser.salesmanName || mobileUser.nvbhName || (collectorType === 'sales' ? collectorName : '')),
    deliveryStaffCode: text(body.deliveryStaffCode || mobileUser.deliveryStaffCode || mobileUser.shipperCode || mobileUser.nvghCode || (collectorType === 'delivery' ? collectorCode : '')),
    deliveryStaffName: text(body.deliveryStaffName || mobileUser.deliveryStaffName || mobileUser.shipperName || mobileUser.nvghName || (collectorType === 'delivery' ? collectorName : ''))
  };
  return fields;
}

function collectionIdentityFilter(idOrCode) {
  const id = text(idOrCode);
  const or = [{ id }, { code: id }];
  if (/^[a-fA-F0-9]{24}$/.test(id)) or.push({ _id: id });
  return { $or: or };
}

async function submitDebtCollection({ body = {}, mobileUser = {} } = {}) {
  const amount = money(body.amount);
  if (amount <= 0) return fail(400, 'Số tiền thu phải lớn hơn 0');

  const allocations = Array.isArray(body.allocations) ? body.allocations : [];
  if (!allocations.length) return fail(400, 'Cần chọn ít nhất một đơn nợ');

  const totalAllocated = allocations.reduce((sum, row) => sum + money(row.allocatedAmount ?? row.amount ?? row.paymentAmount), 0);
  if (totalAllocated !== amount) return fail(400, 'Tổng tiền phân bổ phải bằng số tiền thu');

  const idempotencyKey = text(body.idempotencyKey);
  if (idempotencyKey) {
    const existed = await DebtCollection.findOne({ idempotencyKey, status: { $in: ACTIVE_STATUSES } }).lean();
    if (existed) {
      return okBody({
        ok: true,
        message: 'Phiếu thu nợ đã được ghi nhận trước đó',
        collection: existed
      });
    }
  }

  const now = dateUtil.nowIso();
  const collector = buildCollectorFields(mobileUser, body);
  const debtScope = collector.collectorType === 'delivery'
    ? { delivery: collector.deliveryStaffCode || collector.deliveryStaffName }
    : { salesman: collector.salesStaffCode || collector.salesStaffName };

  const debtCheck = await DebtReadService.checkAvailableDebt({
    customerCode: body.customerCode,
    customerId: body.customerId,
    allocations,
    scope: debtScope
  });

  if (!debtCheck.ok) return fail(debtCheck.status || 409, debtCheck.message || 'Công nợ không hợp lệ');
  const collection = {
    id: makeId('DC'),
    code: await makeDebtCollectionCode(now),
    status: 'submitted',

    customerId: debtCheck.customerId || text(body.customerId),
    customerCode: debtCheck.customerCode || text(body.customerCode),
    customerName: debtCheck.customerName || text(body.customerName),

    ...collector,

    amount,
    paymentMethod: normalizePaymentMethod(body.paymentMethod),
    note: text(body.note),

    allocations: debtCheck.allocations,

    submittedAt: now,
    submittedBy: text(mobileUser.username || mobileUser.name || mobileUser.fullName),
    createdAt: now,
    updatedAt: now
  };

  if (idempotencyKey) collection.idempotencyKey = idempotencyKey;

  const created = await DebtCollection.create([collection]);

  return okBody({
    ok: true,
    message: 'Đã ghi nhận thu nợ, chờ kế toán xác nhận',
    collection: created[0]
  }, 201);
}

function buildListFilter(query = {}) {
  const filter = {};
  const status = text(query.status || '');
  if (status && status !== 'all') filter.status = status;
  const fromDate = dateUtil.toDateOnly(query.fromDate || query.dateFrom || '');
  const toDate = dateUtil.toDateOnly(query.toDate || query.dateTo || '');
  if (fromDate || toDate) {
    filter.submittedAt = {};
    if (fromDate) filter.submittedAt.$gte = `${fromDate}T00:00:00.000Z`;
    if (toDate) filter.submittedAt.$lte = `${toDate}T23:59:59.999Z`;
  }
  if (query.collectorType) filter.collectorType = text(query.collectorType);
  if (query.customerCode) filter.customerCode = text(query.customerCode);
  if (query.collectorCode) filter.collectorCode = text(query.collectorCode);
  return filter;
}

async function listDebtCollections(query = {}) {
  const limit = Math.min(Math.max(Number(query.limit || 200), 1), 1000);
  const items = await DebtCollection.find(buildListFilter(query))
    .sort({ submittedAt: -1, createdAt: -1, code: -1 })
    .limit(limit)
    .lean();

  const summary = {
    totalAmount: items.reduce((sum, row) => sum + money(row.amount), 0),
    count: items.length,
    submittedCount: items.filter((row) => row.status === 'submitted').length,
    confirmedCount: items.filter((row) => row.status === 'accounting_confirmed').length,
    rejectedCount: items.filter((row) => row.status === 'rejected').length
  };

  return { items, summary };
}

async function confirmDebtCollection(idOrCode, command = {}) {
  return withMongoTransaction(async (session) => {
    const collection = await DebtCollection.findOne({
      ...collectionIdentityFilter(idOrCode),
      status: 'submitted'
    }).session(session);

    if (!collection) return fail(404, 'Không tìm thấy phiếu thu nợ chờ xác nhận');

    const actualReceivedAmount = money(command.actualReceivedAmount ?? collection.amount);
    if (actualReceivedAmount !== money(collection.amount)) {
      return fail(409, 'Số tiền kế toán nhận không khớp số tiền nhân viên báo thu');
    }

    const debtCheck = await DebtReadService.checkAvailableDebt({
      customerCode: collection.customerCode,
      allocations: collection.allocations,
      excludeCollectionId: collection.id
    });
    if (!debtCheck.ok) return fail(debtCheck.status || 409, debtCheck.message || 'Công nợ đã thay đổi, không thể xác nhận phiếu thu');

    const receiptDoc = {
      id: collection.id,
      code: collection.code,
      date: dateUtil.todayVN(),
      customerId: collection.customerId,
      customerCode: collection.customerCode,
      customerName: collection.customerName,
      amount: collection.amount,
      allocations: collection.allocations.map((row) => ({
        orderId: row.salesOrderId || '',
        orderCode: row.salesOrderCode || '',
        amount: row.allocatedAmount
      })),
      refType: 'debtCollection',
      refId: collection.id,
      refCode: collection.code,
      source: 'DebtCollectionPostingService',
      method: collection.paymentMethod,
      paymentMethod: collection.paymentMethod,
      salesmanCode: collection.salesStaffCode,
      salesmanName: collection.salesStaffName,
      deliveryStaffCode: collection.deliveryStaffCode,
      deliveryStaffName: collection.deliveryStaffName,
      note: `Xác nhận thu nợ ${collection.code}`
    };

    const arPosted = await ArPostingService.postReceipt(receiptDoc, { session });
    const arLedgers = (Array.isArray(arPosted) ? arPosted : [arPosted]).filter(Boolean);

    const fundLedger = await FundPostingService.postCashIn({
      amount: collection.amount,
      date: dateUtil.todayVN(),
      sourceType: 'debtCollection',
      sourceId: collection.id,
      sourceCode: collection.code,
      refType: 'debtCollection',
      refId: collection.id,
      refCode: collection.code,
      referenceType: 'debtCollection',
      referenceId: collection.id,
      referenceCode: collection.code,
      customerCode: collection.customerCode,
      customerName: collection.customerName,
      collectorCode: collection.collectorCode,
      collectorName: collection.collectorName,
      staffCode: collection.collectorCode,
      staffName: collection.collectorName,
      deliveryStaffCode: collection.deliveryStaffCode,
      deliveryStaffName: collection.deliveryStaffName,
      paymentMethod: collection.paymentMethod,
      note: `Thu nợ chờ xác nhận ${collection.code}`,
      createdBy: text(command.accountingUserName || command.accountingConfirmedBy || '')
    }, { session });

    collection.status = 'accounting_confirmed';
    collection.accountingConfirmedAt = dateUtil.nowIso();
    collection.accountingConfirmedBy = text(command.accountingUserName || command.accountingConfirmedBy || command.user?.name || command.user?.username);
    collection.accountingNote = text(command.accountingNote);
    collection.arLedgerIds = arLedgers.map((row) => row.id).filter(Boolean);
    collection.fundLedgerIds = fundLedger && fundLedger.id ? [fundLedger.id] : [];
    collection.updatedAt = dateUtil.nowIso();

    await collection.save({ session });

    return {
      body: {
        ok: true,
        message: 'Đã xác nhận thu nợ và trừ công nợ',
        collection
      }
    };
  });
}

async function rejectDebtCollection(idOrCode, command = {}) {
  const now = dateUtil.nowIso();
  const collection = await DebtCollection.findOneAndUpdate({
    ...collectionIdentityFilter(idOrCode),
    status: 'submitted'
  }, {
    $set: {
      status: 'rejected',
      rejectedAt: now,
      rejectedBy: text(command.accountingUserName || command.rejectedBy || command.user?.name || command.user?.username),
      rejectReason: text(command.reason || command.rejectReason),
      updatedAt: now
    }
  }, { new: true, lean: true });

  if (!collection) return fail(404, 'Không tìm thấy phiếu thu nợ chờ xác nhận');

  return {
    body: {
      ok: true,
      message: 'Đã từ chối phiếu thu nợ. Công nợ không đổi.',
      collection
    }
  };
}

module.exports = {
  submitDebtCollection,
  listDebtCollections,
  confirmDebtCollection,
  rejectDebtCollection,
  _internal: {
    makeDebtCollectionCode,
    buildCollectorFields,
    buildListFilter,
    normalizePaymentMethod
  }
};
