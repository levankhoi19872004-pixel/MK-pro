'use strict';

const ArPostingService = require('../posting/ArPostingService');
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

function getMasterOrderLegacyService() {
  // Lazy require trực tiếp legacy implementation để tránh vòng lặp:
  // masterOrderAccounting.service -> DeliverySettlementService -> masterOrderService -> masterOrderAccounting.service.
  return require('../../services/master-order/masterOrderLegacy.service');
}

async function recordCollectedMoney(order = {}, options = {}) {
  const posted = [];

  const cashAmount = toMoney(order.cashCollected ?? order.cashAmount ?? 0);
  const bankAmount = toMoney(order.bankCollected ?? order.bankAmount ?? order.transferAmount ?? 0);

  if (cashAmount > 0) {
    posted.push(await ArPostingService.postReceipt({
      ...order,
      id: `DELIVERY-CASH-${order.id || order.code}`,
      code: `DELIVERY-CASH-${order.code || order.id}`,
      method: 'cash',
      amount: cashAmount,
      source: 'delivery_settlement'
    }, options));
  }

  if (bankAmount > 0) {
    posted.push(await ArPostingService.postReceipt({
      ...order,
      id: `DELIVERY-BANK-${order.id || order.code}`,
      code: `DELIVERY-BANK-${order.code || order.id}`,
      method: 'transfer',
      amount: bankAmount,
      source: 'delivery_settlement'
    }, options));
  }

  return posted.filter(Boolean);
}

async function confirmAccounting(masterOrderIdOrBody = {}, body = {}, options = {}) {
  // Phase 1 Strangler: domain boundary đã tồn tại nhưng lõi accounting vẫn giữ legacy.
  // Hỗ trợ cả contract hiện tại confirmDeliveryAccounting(body) và contract mở rộng
  // confirmAccounting(masterOrderId, body, options) cho phase sau.
  if (masterOrderIdOrBody && typeof masterOrderIdOrBody === 'object') {
    return getMasterOrderLegacyService().confirmDeliveryAccounting(masterOrderIdOrBody, body || options || {});
  }

  return getMasterOrderLegacyService().confirmDeliveryAccounting({
    ...(body || {}),
    masterOrderId: masterOrderIdOrBody || body.masterOrderId || body.id || ''
  }, options);
}

async function unlockAccounting(idOrCode, body = {}, options = {}) {
  return getMasterOrderLegacyService().adminUnlockDeliveryAccounting(idOrCode, body, options);
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
  return fundService.buildDeliverySubmissionDraft(query);
}

module.exports = {
  recordCollectedMoney,
  confirmAccounting,
  unlockAccounting,
  submitCashToFund,
  cashInTransitReport
};
