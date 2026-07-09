'use strict';

const DebtCollection = require('../models/DebtCollection');
const DebtCollectionLock = require('../models/DebtCollectionLock');
const ExternalDebtOrder = require('../models/ExternalDebtOrder');
const DebtReadService = require('./DebtReadService');
const ArPostingService = require('../domain/posting/ArPostingService');
const FundPostingService = require('../domain/posting/FundPostingService');
const dateUtil = require('../utils/date.util');
const { makeId, toNumber } = require('../utils/common.util');
const { withMongoTransaction } = require('../utils/transaction.util');
const DebtCollectionPolicy = require('../policies/debtCollection.policy');
const { emitDomainEventSafe } = require('./events/domainEventBus');
const { EVENT_TYPES } = require('./events/domainEventTypes');
const { canonicalDebtOrderIdentity } = require('../utils/debtOrderIdentity.util');
const { createCommandTelemetry } = require('../utils/commandTelemetry');

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
  const authenticatedRole = text(user.role).toLowerCase();
  if (authenticatedRole === 'sales' || authenticatedRole === 'delivery') return authenticatedRole;

  const requested = text(body.collectorType).toLowerCase();
  if (requested === 'sales' || requested === 'delivery') return requested;
  return 'sales';
}

function collectorCodeOf(user = {}) {
  return text(user.staffCode || user.code || user.salesStaffCode || user.salesmanCode || user.deliveryStaffCode || user.shipperCode);
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
  const entropy = `${Date.now()}${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`.slice(-10);
  return `DC${date}${entropy}`;
}

async function ensureDebtCollectionLocks(orderKeys = []) {
  for (const orderCode of orderKeys) {
    try {
      await DebtCollectionLock.findOneAndUpdate(
        { orderCode },
        { $setOnInsert: { orderCode, version: 0 }, $set: { updatedAt: dateUtil.nowIso() } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    } catch (err) {
      // Hai request đầu tiên có thể cùng tạo lock. Unique index đảm bảo chỉ một dòng;
      // request còn lại tiếp tục vì lock đã tồn tại.
      if (!err || err.code !== 11000) throw err;
    }
  }
}

function buildCollectorFields(mobileUser = {}, body = {}) {
  const collectorType = collectorTypeOf(mobileUser, body);
  const collectorCode = collectorCodeOf(mobileUser);
  const collectorName = collectorNameOf(mobileUser);
  const authenticatedRole = text(mobileUser.role).toLowerCase();
  const canUseClientStaffScope = !['sales', 'delivery'].includes(authenticatedRole);
  const fields = {
    collectorType,
    collectorUserId: text(mobileUser.id || mobileUser._id),
    collectorCode,
    collectorName,
    salesStaffCode: text((canUseClientStaffScope ? body.salesStaffCode : '') || mobileUser.salesStaffCode || mobileUser.salesmanCode || mobileUser.nvbhCode || (collectorType === 'sales' ? collectorCode : '')),
    salesStaffName: text((canUseClientStaffScope ? body.salesStaffName : '') || mobileUser.salesStaffName || mobileUser.salesmanName || mobileUser.nvbhName || (collectorType === 'sales' ? collectorName : '')),
    deliveryStaffCode: text((canUseClientStaffScope ? body.deliveryStaffCode : '') || mobileUser.deliveryStaffCode || mobileUser.shipperCode || mobileUser.nvghCode || (collectorType === 'delivery' ? collectorCode : '')),
    deliveryStaffName: text((canUseClientStaffScope ? body.deliveryStaffName : '') || mobileUser.deliveryStaffName || mobileUser.shipperName || mobileUser.nvghName || (collectorType === 'delivery' ? collectorName : ''))
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
  const telemetry = createCommandTelemetry('debtCollection.submit');
  const amount = money(body.amount);
  if (amount <= 0) return fail(400, 'Số tiền thu phải lớn hơn 0');

  const allocations = Array.isArray(body.allocations) ? body.allocations : [];
  if (!allocations.length) return fail(400, 'Cần chọn ít nhất một đơn nợ');

  const totalAllocated = allocations.reduce((sum, row) => sum + money(row.allocatedAmount ?? row.amount ?? row.paymentAmount), 0);
  if (totalAllocated !== amount) return fail(400, 'Tổng tiền phân bổ phải bằng số tiền thu');

  const idempotencyKey = text(body.idempotencyKey);
  const collector = buildCollectorFields(mobileUser, body);
  if (!collector.collectorCode) return fail(403, 'Không xác định được mã nhân viên thực tế thu tiền');

  const orderKeys = [...new Set(allocations
    .map((row) => {
      const identity = canonicalDebtOrderIdentity(row);
      return text(identity.canonicalOrderKey || identity.canonicalOrderCode || identity.canonicalOrderId || row.salesOrderCode || row.orderCode || row.salesOrderId || row.orderId);
    })
    .filter(Boolean))]
    .sort();
  if (!orderKeys.length) return fail(400, 'Cần chọn ít nhất một đơn nợ hợp lệ');

  await ensureDebtCollectionLocks(orderKeys);
  telemetry.mark('ensureDebtCollectionLocks', { orderKeyCount: orderKeys.length });

  return withMongoTransaction(async (session) => {
    if (idempotencyKey) {
      telemetry.mark('idempotencyLookup');
      const existed = await DebtCollection.findOne({ idempotencyKey, status: { $in: ACTIVE_STATUSES } }).session(session).lean();
      if (existed) {
        return okBody({
          ok: true,
          message: 'Phiếu thu nợ đã được ghi nhận trước đó',
          collection: existed,
          performance: telemetry.finish({ idempotent: true })
        });
      }
    }

    const now = dateUtil.nowIso();

    // Khóa logic theo từng đơn nợ. Hai NVBH/NVGH thu đồng thời trên cùng đơn
    // sẽ tranh chấp cùng document lock và được Mongo transaction tuần tự hóa.
    for (const orderCode of orderKeys) {
      await DebtCollectionLock.findOneAndUpdate(
        { orderCode },
        { $inc: { version: 1 }, $set: { updatedAt: now } },
        { new: true, session }
      );
    }

    telemetry.mark('lockOrders', { orderKeyCount: orderKeys.length });

    const access = DebtCollectionPolicy.debtCollectionCreateScopeForUser(mobileUser, body, collector);
    if (!access.allowed) return fail(403, 'Bạn không có quyền lập phiếu thu công nợ');

    const debtCheck = await DebtReadService.checkAvailableDebt({
      customerCode: body.customerCode,
      customerId: body.customerId,
      allocations,
      scope: access.queryScope,
      actor: mobileUser,
      collector,
      collectionScope: access.scope,
      session
    });

    telemetry.mark('checkAvailableDebt', { allocationCount: allocations.length });

    if (!debtCheck.ok) return fail(debtCheck.status || 409, debtCheck.message || 'Công nợ không hợp lệ', { code: debtCheck.code, detail: debtCheck.detail, performance: telemetry.finish({ failed: true }) });

    const collection = {
      id: makeId('DC'),
      code: await makeDebtCollectionCode(now),
      status: 'submitted',

      customerId: debtCheck.customerId || text(body.customerId),
      customerCode: debtCheck.customerCode || text(body.customerCode),
      customerName: debtCheck.customerName || text(body.customerName),

      collectorType: collector.collectorType,
      collectorUserId: collector.collectorUserId,
      collectorCode: collector.collectorCode,
      collectorName: collector.collectorName,

      // Người phụ trách lấy từ AR gốc của đơn, không tin tên/mã do frontend gửi.
      salesStaffCode: debtCheck.salesStaffCode || '',
      salesStaffName: debtCheck.salesStaffName || '',
      deliveryStaffCode: debtCheck.deliveryStaffCode || '',
      deliveryStaffName: debtCheck.deliveryStaffName || '',

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

    const created = await DebtCollection.create([collection], { session });
    telemetry.mark('createDebtCollection');

    return okBody({
      ok: true,
      message: 'Đã ghi nhận thu nợ, chờ kế toán xác nhận',
      collection: created[0],
      performance: telemetry.finish()
    }, 201);
  });
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


function ensureConfirmPostingContracts() {
  if (!ArPostingService || typeof ArPostingService.postReceipt !== 'function') {
    throw new TypeError('ArPostingService.postReceipt contract is required to confirm debt collections.');
  }
  if (!FundPostingService || typeof FundPostingService.postCashIn !== 'function') {
    throw new TypeError('FundPostingService.postCashIn contract is required to confirm debt collections.');
  }
}

function receiptIdempotencyKey(collection = {}) {
  return `AR-RECEIPT:${text(collection.id || collection.code)}`;
}

function fundReceiptIdempotencyKey(collection = {}) {
  return `FUND-RECEIPT:${text(collection.id || collection.code)}`;
}

function isAccountingConfirmedCollection(collection = {}) {
  return collection.status === 'accounting_confirmed'
    || collection.accountingConfirmed === true
    || collection.accountingStatus === 'confirmed';
}

async function confirmDebtCollection(idOrCode, command = {}) {
  const telemetry = createCommandTelemetry('debtCollection.confirm');
  const confirmedResult = await withMongoTransaction(async (session) => {
    ensureConfirmPostingContracts();

    const collection = await DebtCollection.findOne({
      ...collectionIdentityFilter(idOrCode),
      status: { $in: ['submitted', 'accounting_confirmed'] }
    }).session(session);

    telemetry.mark('loadCollection');

    if (!collection) return fail(404, 'Không tìm thấy phiếu thu nợ chờ xác nhận', { performance: telemetry.finish({ failed: true }) });

    if (isAccountingConfirmedCollection(collection)) {
      return {
        body: {
          ok: true,
          skipped: true,
          message: 'Phiếu thu nợ đã được kế toán xác nhận trước đó',
          collection,
          performance: telemetry.finish({ idempotent: true })
        }
      };
    }

    const actualReceivedAmount = money(command.actualReceivedAmount ?? collection.amount);
    if (actualReceivedAmount !== money(collection.amount)) {
      return fail(409, 'Số tiền kế toán nhận không khớp số tiền nhân viên báo thu');
    }

    const debtCheck = await DebtReadService.checkAvailableDebt({
      customerCode: collection.customerCode,
      allocations: collection.allocations,
      excludeCollectionId: collection.id,
      session
    });
    telemetry.mark('checkAvailableDebt', { allocationCount: Array.isArray(collection.allocations) ? collection.allocations.length : 0 });
    if (!debtCheck.ok) return fail(debtCheck.status || 409, debtCheck.message || 'Công nợ đã thay đổi, không thể xác nhận phiếu thu', { code: debtCheck.code, detail: debtCheck.detail, performance: telemetry.finish({ failed: true }) });

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
        orderType: row.orderType || '',
        salesStaffCode: row.salesStaffCode || collection.salesStaffCode || '',
        salesStaffName: row.salesStaffName || collection.salesStaffName || '',
        deliveryStaffCode: row.deliveryStaffCode || collection.deliveryStaffCode || '',
        deliveryStaffName: row.deliveryStaffName || collection.deliveryStaffName || '',
        amount: row.allocatedAmount
      })),
      refType: 'debtCollection',
      refId: collection.id,
      refCode: collection.code,
      source: 'DebtCollectionPostingService',
      method: collection.paymentMethod,
      paymentMethod: collection.paymentMethod,
      orderType: collection.allocations?.[0]?.orderType || '',
      salesStaffCode: collection.salesStaffCode,
      salesStaffName: collection.salesStaffName,
      salesmanCode: collection.salesStaffCode,
      salesmanName: collection.salesStaffName,
      deliveryStaffCode: collection.deliveryStaffCode,
      deliveryStaffName: collection.deliveryStaffName,
      collectorType: collection.collectorType,
      collectorCode: collection.collectorCode,
      collectorName: collection.collectorName,
      sourceType: 'debtCollection',
      sourceId: collection.id,
      sourceCode: collection.code,
      idempotencyKey: receiptIdempotencyKey(collection),
      accountingConfirmedBy: text(command.accountingUserName || command.accountingConfirmedBy || command.user?.name || command.user?.username),
      note: `Xác nhận thu nợ ${collection.code}`
    };

    const arPosted = await ArPostingService.postReceipt(receiptDoc, { session });
    telemetry.mark('postArReceipt');
    const arLedgers = (Array.isArray(arPosted) ? arPosted : [arPosted]).filter(Boolean);

    for (const allocation of debtCheck.allocations || []) {
      if (allocation.orderType !== 'external_debt') continue;
      const remainingDebt = Math.max(0, money(allocation.beforeDebt) - money(allocation.allocatedAmount));
      await ExternalDebtOrder.findOneAndUpdate({
        $or: [
          { id: allocation.salesOrderId },
          { code: allocation.salesOrderCode }
        ]
      }, {
        $inc: { paidAmount: money(allocation.allocatedAmount) },
        $set: {
          remainingDebt,
          status: remainingDebt > 0 ? 'active' : 'paid',
          updatedAt: dateUtil.nowIso()
        }
      }, { session });
    }

    telemetry.mark('updateExternalDebtOrders');

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
      collectorType: collection.collectorType,
      collectorCode: collection.collectorCode,
      collectorName: collection.collectorName,
      salesStaffCode: collection.salesStaffCode,
      salesStaffName: collection.salesStaffName,
      staffCode: collection.collectorCode,
      staffName: collection.collectorName,
      deliveryStaffCode: collection.deliveryStaffCode,
      deliveryStaffName: collection.deliveryStaffName,
      paymentMethod: collection.paymentMethod,
      idempotencyKey: fundReceiptIdempotencyKey(collection),
      note: `Thu nợ chờ xác nhận ${collection.code}`,
      createdBy: text(command.accountingUserName || command.accountingConfirmedBy || '')
    }, { session });

    collection.status = 'accounting_confirmed';
    collection.accountingStatus = 'confirmed';
    collection.accountingConfirmed = true;
    collection.accountingConfirmedAt = dateUtil.nowIso();
    collection.accountingConfirmedBy = text(command.accountingUserName || command.accountingConfirmedBy || command.user?.name || command.user?.username);
    collection.accountingNote = text(command.accountingNote);
    collection.arPosted = true;
    collection.fundPosted = true;
    collection.arLedgerIds = arLedgers.map((row) => row.id).filter(Boolean);
    collection.fundLedgerIds = fundLedger && fundLedger.id ? [fundLedger.id] : [];
    collection.updatedAt = dateUtil.nowIso();

    await collection.save({ session });
    telemetry.mark('postFundAndSaveCollection');

    return {
      body: {
        ok: true,
        message: 'Đã xác nhận thu nợ và trừ công nợ',
        collection,
        performance: telemetry.finish()
      }
    };
  });

  try {
    const collection = confirmedResult?.body?.collection;
    if (collection && !confirmedResult?.body?.skipped) {
      await emitDomainEventSafe({
        eventType: EVENT_TYPES.AR_RECEIPT_CONFIRMED,
        entityType: 'debtCollection',
        entityId: text(collection.id || collection._id),
        entityCode: text(collection.code),
        severity: 'info',
        actor: command.user || {
          name: text(command.accountingUserName || command.accountingConfirmedBy || collection.accountingConfirmedBy),
          role: 'accountant'
        },
        before: { status: 'submitted', amount: money(collection.amount) },
        after: { status: collection.status, amount: money(collection.amount), accountingConfirmed: true },
        diff: { amount: money(collection.amount) },
        metadata: {
          customerCode: text(collection.customerCode),
          customerName: text(collection.customerName),
          amount: money(collection.amount),
          receiptCode: text(collection.code),
          ledgerId: Array.isArray(collection.arLedgerIds) ? text(collection.arLedgerIds[0]) : '',
          paymentMethod: text(collection.paymentMethod),
          deliveryStaffCode: text(collection.deliveryStaffCode),
          salesStaffCode: text(collection.salesStaffCode)
        },
        idempotencyKey: `AR_RECEIPT_CONFIRMED:${text(collection.id || collection.code)}`
      });
    }
  } catch (err) {
    console.error('[DEBT_COLLECTION_NOTIFICATION_ERROR]', err && (err.stack || err.message || err));
  }

  return confirmedResult;
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
    ensureDebtCollectionLocks,
    buildCollectorFields,
    buildListFilter,
    normalizePaymentMethod,
    canCreateDebtCollection: DebtCollectionPolicy.canCreateDebtCollection,
    debtCollectionCreateScopeForUser: DebtCollectionPolicy.debtCollectionCreateScopeForUser,
    ensureConfirmPostingContracts,
    receiptIdempotencyKey,
    fundReceiptIdempotencyKey,
    isAccountingConfirmedCollection
  }
};
