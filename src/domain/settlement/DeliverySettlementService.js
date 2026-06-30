'use strict';

// Phase87: delivery settlement/closeout is operational data only.

const AccountingCloseoutService = require('../../services/accounting/AccountingCloseoutService');
const DeliveryCashInTransitReportService = require('./DeliveryCashInTransitReportService');
const fundService = require('../../services/fundService');
const dateUtil = require('../../utils/date.util');

function toMoney(value) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return 0;
  return Math.max(0, Math.round(amount));
}

function pickDeliveryStaffCode(body = {}) {
  return String(body.deliveryStaffCode || body.staffCode || body.deliveryCode || body.nvgh || '').trim();
}

function pickDeliveryStaffName(body = {}) {
  return String(body.deliveryStaffName || body.staffName || body.deliveryName || '').trim();
}


function legacyAccountingRequested() {
  return String(process.env.USE_LEGACY_DELIVERY_ACCOUNTING || '').toLowerCase() === 'true';
}

function assertUnsafeLegacyRollbackAllowed() {
  if (!legacyAccountingRequested()) return false;
  const production = String(process.env.NODE_ENV || '').toLowerCase() === 'production';
  const allowed = String(process.env.ALLOW_UNSAFE_LEGACY_AR_ROLLBACK || '').toLowerCase() === 'true';
  if (production && !allowed) {
    const err = new Error('Legacy delivery accounting bị chặn ở production vì có thể sinh AR-SALE/AR-RETURN/AR-RECEIPT.');
    err.code = 'UNSAFE_LEGACY_DELIVERY_ACCOUNTING_BLOCKED_IN_PRODUCTION';
    err.severity = 'P0';
    throw err;
  }
  return true;
}

function getLegacyAccountingImplementation() {
  // Lazy-load retained only as emergency rollback for USE_LEGACY_DELIVERY_ACCOUNTING=true.
  return require('../../services/master-order/deliveryAccountingCommand.impl');
}

async function recordCollectedMoney(order = {}, options = {}) {
  const cashAmount = toMoney(order.cashCollected ?? order.cashAmount ?? 0);
  const bankAmount = toMoney(order.bankCollected ?? order.bankAmount ?? order.transferAmount ?? 0);
  return {
    posted: false,
    arPosted: false,
    source: 'delivery_closeout_operational_cash',
    policy: 'delivery cash is captured in salesOrders.deliveryCloseout and does not create AR-RECEIPT',
    cashAmount,
    bankAmount,
    collectedAmount: cashAmount + bankAmount,
    paymentIds: [
      cashAmount > 0 ? `delivery-cash:${order.id || order.code || ''}` : '',
      bankAmount > 0 ? `delivery-bank:${order.id || order.code || ''}` : ''
    ].filter(Boolean),
    optionsApplied: Boolean(options && options.session)
  };
}

async function confirmAccounting(masterOrderIdOrBody = {}, body = {}, options = {}) {
  // Phase87 active path: accounting closeout posts exactly one AR-DEBT-OPEN when finalDebtAmount > 0.
  // Emergency rollback marker retained for static/rollback compatibility:
  // getLegacyAccountingImplementation().confirmDeliveryAccounting(masterOrderIdOrBody, body || options || {});
  if (assertUnsafeLegacyRollbackAllowed()) {
    if (masterOrderIdOrBody && typeof masterOrderIdOrBody === 'object') {
      return getLegacyAccountingImplementation().confirmDeliveryAccounting(masterOrderIdOrBody, body || options || {});
    }
    return getLegacyAccountingImplementation().confirmDeliveryAccounting({
      ...(body || {}),
      masterOrderId: masterOrderIdOrBody || body.masterOrderId || body.id || ''
    }, options);
  }

  if (masterOrderIdOrBody && typeof masterOrderIdOrBody === 'object') {
    return AccountingCloseoutService.confirmDeliveryAccounting(masterOrderIdOrBody, body || options || {});
  }

  return AccountingCloseoutService.confirmDeliveryAccounting({
    ...(body || {}),
    masterOrderId: masterOrderIdOrBody || body.masterOrderId || body.id || ''
  }, options);
}

async function unlockAccounting(idOrCode, body = {}, options = {}) {
  if (assertUnsafeLegacyRollbackAllowed()) {
    return getLegacyAccountingImplementation().adminUnlockDeliveryAccounting(idOrCode, body, options);
  }
  return {
    error: 'Đơn đã accounting_confirmed không được mở khóa sửa in-place. Hãy dùng DeliveryCloseoutCorrectionService để tạo correction và AR-DEBT-ADJUSTMENT.',
    status: 400,
    orderId: idOrCode,
    correctionRequired: true
  };
}

async function submitCashToFund(idOrCode, body = {}) {
  const target = String(idOrCode || body.id || body.code || body.submissionId || body.submissionCode || '').trim();
  const submittedCashAmount = toMoney(body.submittedCashAmount ?? body.amount ?? body.cashAmount ?? body.cashCollected ?? 0);
  const submittedBankAmount = toMoney(body.submittedBankAmount ?? body.bankAmount ?? body.bankCollected ?? body.transferAmount ?? 0);
  const payload = {
    ...body,
    submittedCashAmount,
    submittedBankAmount
  };

  if (target) {
    return fundService.confirmDeliveryCashSubmission(target, payload);
  }

  const deliveryStaffCode = pickDeliveryStaffCode(body);
  if (!deliveryStaffCode) return { error: 'Thiếu nhân viên giao hàng để nộp quỹ', status: 400 };

  const draftInput = {
    ...payload,
    deliveryDate: body.deliveryDate || body.date || dateUtil.todayVN(),
    deliveryStaffCode,
    deliveryStaffName: pickDeliveryStaffName(body),
    status: 'pending'
  };

  let created = await fundService.createDeliveryCashSubmission(draftInput);
  if (created && created.error && created.status === 409 && created.submission) {
    created = { submission: created.submission, reused: true };
  }
  if (created && created.error) return created;

  const submission = created && created.submission;
  const confirmationTarget = submission && (submission.id || submission.code);
  if (!confirmationTarget) return created || { error: 'Không tạo được phiếu nộp quỹ', status: 500 };

  return fundService.confirmDeliveryCashSubmission(confirmationTarget, {
    ...payload,
    confirmedBy: body.confirmedBy || body.updatedBy || '',
    note: body.note
  });
}

async function cashInTransitReport(query = {}) {
  return DeliveryCashInTransitReportService.listDeliveryCashInTransit(query);
}

module.exports = {
  recordCollectedMoney,
  confirmAccounting,
  unlockAccounting,
  submitCashToFund,
  cashInTransitReport,
  _internal: { assertUnsafeLegacyRollbackAllowed, legacyAccountingRequested }
};
