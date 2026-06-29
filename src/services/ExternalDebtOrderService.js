'use strict';

const ExternalDebtOrder = require('../models/ExternalDebtOrder');
const Customer = require('../models/Customer');
const User = require('../models/User');
const ArPostingService = require('../domain/posting/ArPostingService');
const dateUtil = require('../utils/date.util');
const { makeId, toNumber } = require('../utils/common.util');
const { withMongoTransaction } = require('../utils/transaction.util');

function text(value) {
  return String(value || '').trim();
}

function money(value) {
  return Math.max(0, Math.round(toNumber(value)));
}

function fail(status, message, extra = {}) {
  return { error: message, status, ...extra };
}

function applySession(query, session) {
  return session && query && typeof query.session === 'function' ? query.session(session) : query;
}

function staffCodeFilter(code, role) {
  const value = text(code);
  return {
    role,
    isActive: { $ne: false },
    $or: role === 'delivery'
      ? [
          { code: value },
          { staffCode: value },
          { deliveryStaffCode: value },
          { shipperCode: value }
        ]
      : [
          { code: value },
          { staffCode: value },
          { salesStaffCode: value },
          { salesmanCode: value }
        ]
  };
}

function canonicalStaff(user = {}) {
  return {
    id: text(user._id || user.id),
    code: text(user.code || user.staffCode || user.salesStaffCode || user.salesmanCode || user.deliveryStaffCode || user.shipperCode),
    name: text(user.fullName || user.name)
  };
}

function makeExternalDebtCode(documentDate = dateUtil.todayVN()) {
  const date = dateUtil.toDateOnly(documentDate || dateUtil.todayVN()).replace(/-/g, '');
  const entropy = `${Date.now()}${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`.slice(-9);
  return `NDNBLH${date}${entropy}`;
}

function buildListFilter(query = {}) {
  const filter = {};
  const status = text(query.status);
  if (status && status !== 'all') filter.status = status;
  if (query.customerCode) filter.customerCode = text(query.customerCode);
  if (query.salesStaffCode) filter.salesStaffCode = text(query.salesStaffCode);
  if (query.deliveryStaffCode) filter.deliveryStaffCode = text(query.deliveryStaffCode);
  if (query.fromDate || query.toDate) {
    filter.documentDate = {};
    if (query.fromDate) filter.documentDate.$gte = dateUtil.toDateOnly(query.fromDate);
    if (query.toDate) filter.documentDate.$lte = dateUtil.toDateOnly(query.toDate);
  }
  return filter;
}

function buildExternalDebtLedgerInput(orderDoc = {}, actor = {}, now = dateUtil.nowIso()) {
  const id = text(orderDoc.id || orderDoc._id);
  const code = text(orderDoc.code);
  const amount = money(orderDoc.totalAmount ?? orderDoc.amount);
  const reason = text(orderDoc.reason);
  const referenceCode = text(orderDoc.referenceCode);
  const documentDate = dateUtil.toDateOnly(orderDoc.documentDate || orderDoc.date || dateUtil.todayVN());
  const createdBy = text(actor.name || actor.fullName || actor.username || actor.code || orderDoc.createdBy || 'system');

  return {
    id: `AR-EXTERNAL-${id}`,
    code: `AR-EXTERNAL-${code}`,
    type: 'ar_external_debt',
    account: 'AR',
    date: documentDate,
    orderType: 'external_debt',
    orderId: id,
    orderCode: code,
    salesOrderId: id,
    salesOrderCode: code,
    refType: 'EXTERNAL_DEBT_ORDER',
    refId: id,
    refCode: code,
    sourceType: 'externalDebt',
    sourceModel: 'ExternalDebtOrder',
    sourceId: id,
    sourceCode: code,

    customerId: text(orderDoc.customerId),
    customerCode: text(orderDoc.customerCode),
    customerName: text(orderDoc.customerName),

    salesStaffCode: text(orderDoc.salesStaffCode || orderDoc.salesmanCode),
    salesStaffName: text(orderDoc.salesStaffName || orderDoc.salesmanName),
    salesmanCode: text(orderDoc.salesmanCode || orderDoc.salesStaffCode),
    salesmanName: text(orderDoc.salesmanName || orderDoc.salesStaffName),
    deliveryStaffCode: text(orderDoc.deliveryStaffCode),
    deliveryStaffName: text(orderDoc.deliveryStaffName),

    debit: amount,
    credit: 0,
    amount,
    reason,
    reasonText: reason,
    idempotencyKey: `AR-EXTERNAL-DEBT:${id}`,
    createdBy,
    status: 'posted',
    accountingStatus: 'confirmed',
    accountingConfirmed: true,
    note: `${reason}${referenceCode ? ` · Chứng từ ${referenceCode}` : ''}`,
    source: 'ExternalDebtOrderService',
    createdAt: orderDoc.createdAt || now,
    updatedAt: now
  };
}

async function ensureArLedgerForExternalDebtOrder(orderDoc = {}, actor = {}, options = {}) {
  if (!orderDoc || !text(orderDoc.id || orderDoc._id || orderDoc.code)) return null;
  const now = dateUtil.nowIso();
  const ledgerInput = buildExternalDebtLedgerInput(orderDoc, actor, now);
  const ledger = await ArPostingService.postExternalDebt(ledgerInput, options);
  if (ledger && (!orderDoc.arLedgerId || !orderDoc.arLedgerCode)) {
    const updateQuery = ExternalDebtOrder.findOneAndUpdate(
      { id: text(orderDoc.id || orderDoc._id) },
      { $set: { arLedgerId: ledger.id, arLedgerCode: ledger.code, updatedAt: now } },
      { new: true, lean: true, session: options.session }
    );
    return { ledger, order: await updateQuery };
  }
  return { ledger, order: orderDoc };
}

async function createExternalDebtOrder(body = {}, actor = {}) {
  const customerCode = text(body.customerCode);
  const salesStaffCode = text(body.salesStaffCode);
  const deliveryStaffCode = text(body.deliveryStaffCode);
  const amount = money(body.amount ?? body.totalAmount);
  const documentDate = dateUtil.toDateOnly(body.documentDate || body.date || dateUtil.todayVN());
  const dueDate = dateUtil.toDateOnly(body.dueDate || '');
  const reason = text(body.reason);
  const referenceCode = text(body.referenceCode);
  const idempotencyKey = text(body.idempotencyKey);

  if (!customerCode) return fail(400, 'Cần chọn khách hàng');
  if (!salesStaffCode) return fail(400, 'Cần chọn nhân viên bán hàng phụ trách');
  if (!deliveryStaffCode) return fail(400, 'Cần chọn nhân viên giao hàng phụ trách');
  if (amount <= 0) return fail(400, 'Số tiền công nợ phải lớn hơn 0');
  if (!documentDate) return fail(400, 'Ngày ghi nhận không hợp lệ');
  if (!reason) return fail(400, 'Cần nhập lý do tạo công nợ');

  if (idempotencyKey) {
    const existed = await ExternalDebtOrder.findOne({ idempotencyKey }).lean();
    if (existed) {
      const ensured = await ensureArLedgerForExternalDebtOrder(existed, actor);
      return { order: ensured.order || existed, arLedger: ensured.ledger || null, idempotent: true, message: `Công nợ ${existed.code} đã được tạo trước đó` };
    }
  }

  let createdOrder = null;
  let createdLedger = null;

  try {
    await withMongoTransaction(async (session) => {
      if (idempotencyKey) {
        const existedQuery = ExternalDebtOrder.findOne({ idempotencyKey });
        const existed = await applySession(existedQuery, session).lean();
        if (existed) {
          const ensured = await ensureArLedgerForExternalDebtOrder(existed, actor, { session });
          createdOrder = ensured.order || existed;
          createdLedger = ensured.ledger || null;
          return;
        }
      }

      const customerQuery = Customer.findOne({
        isActive: { $ne: false },
        $or: [{ code: customerCode }, { customerCode }]
      });

      const salesQuery = User.findOne(staffCodeFilter(salesStaffCode, 'sales'));
      const deliveryQuery = User.findOne(staffCodeFilter(deliveryStaffCode, 'delivery'));

      const [customer, salesUser, deliveryUser] = await Promise.all([
        applySession(customerQuery, session).lean(),
        applySession(salesQuery, session).lean(),
        applySession(deliveryQuery, session).lean()
      ]);

      if (!customer) {
        const err = new Error('Không tìm thấy khách hàng hợp lệ');
        err.status = 400;
        throw err;
      }
      if (!salesUser) {
        const err = new Error('Không tìm thấy nhân viên bán hàng hợp lệ');
        err.status = 400;
        throw err;
      }
      if (!deliveryUser) {
        const err = new Error('Không tìm thấy nhân viên giao hàng hợp lệ');
        err.status = 400;
        throw err;
      }

      const salesStaff = canonicalStaff(salesUser);
      const deliveryStaff = canonicalStaff(deliveryUser);
      if (!salesStaff.code || !deliveryStaff.code) {
        const err = new Error('Nhân viên phụ trách chưa có mã nghiệp vụ hợp lệ');
        err.status = 400;
        throw err;
      }

      const now = dateUtil.nowIso();
      const id = makeId('EDO');
      const code = makeExternalDebtCode(documentDate);
      const orderDoc = {
        id,
        code,
        orderType: 'external_debt',
        orderName: 'Nợ ngoài luồng bán hàng',

        customerId: text(customer._id || customer.id || customer.code),
        customerCode: text(customer.code || customer.customerCode),
        customerName: text(customer.name || customer.customerName),

        salesStaffId: salesStaff.id,
        salesStaffCode: salesStaff.code,
        salesStaffName: salesStaff.name,

        deliveryStaffId: deliveryStaff.id,
        deliveryStaffCode: deliveryStaff.code,
        deliveryStaffName: deliveryStaff.name,

        totalAmount: amount,
        paidAmount: 0,
        remainingDebt: amount,

        documentDate,
        dueDate,
        referenceCode,
        reason,

        status: 'active',
        accountingStatus: 'confirmed',
        accountingConfirmed: true,
        createdBy: text(actor.name || actor.fullName || actor.username || actor.code),
        createdAt: now,
        updatedAt: now
      };
      if (idempotencyKey) orderDoc.idempotencyKey = idempotencyKey;

      const rows = await ExternalDebtOrder.create([orderDoc], { session });
      createdOrder = rows[0].toObject ? rows[0].toObject() : rows[0];

      createdLedger = buildExternalDebtLedgerInput(orderDoc, actor, now);

      createdLedger = await ArPostingService.postExternalDebt(createdLedger, { session });

      const updated = await ExternalDebtOrder.findOneAndUpdate(
        { id },
        { $set: { arLedgerId: createdLedger.id, arLedgerCode: createdLedger.code, updatedAt: now } },
        { new: true, lean: true, session }
      );
      createdOrder = updated || { ...createdOrder, arLedgerId: createdLedger.id, arLedgerCode: createdLedger.code };
    });
  } catch (err) {
    if (err && err.code === 11000 && idempotencyKey) {
      const existed = await ExternalDebtOrder.findOne({ idempotencyKey }).lean();
      if (existed) {
        const ensured = await ensureArLedgerForExternalDebtOrder(existed, actor);
        return { order: ensured.order || existed, arLedger: ensured.ledger || null, idempotent: true, message: `Công nợ ${existed.code} đã được tạo trước đó` };
      }
    }
    throw err;
  }

  return {
    order: createdOrder,
    arLedger: createdLedger,
    message: createdOrder ? `Đã tạo công nợ ngoài luồng ${createdOrder.code}` : 'Đã tạo công nợ ngoài luồng'
  };
}

async function listExternalDebtOrders(query = {}) {
  const limit = Math.min(Math.max(Number(query.limit || 200), 1), 1000);
  const items = await ExternalDebtOrder.find(buildListFilter(query))
    .sort({ documentDate: -1, createdAt: -1, code: -1 })
    .limit(limit)
    .lean();
  return {
    items,
    summary: {
      count: items.length,
      totalAmount: items.reduce((sum, row) => sum + money(row.totalAmount), 0),
      remainingDebt: items.reduce((sum, row) => sum + money(row.remainingDebt), 0)
    }
  };
}

module.exports = {
  createExternalDebtOrder,
  listExternalDebtOrders,
  _internal: {
    staffCodeFilter,
    canonicalStaff,
    makeExternalDebtCode,
    buildListFilter,
    buildExternalDebtLedgerInput,
    ensureArLedgerForExternalDebtOrder
  }
};
