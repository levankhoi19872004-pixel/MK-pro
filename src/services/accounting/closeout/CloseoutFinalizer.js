'use strict';

function normalizeOutcome(row = {}) {
  const explicit = String(row.outcome || '').trim().toLowerCase();
  if (explicit) return explicit;
  if (row.confirmed === true) return 'confirmed';
  if (row.accountingConfirmed === true && row.idempotent === true) return 'already_confirmed';
  if (row.rejected === true || row.reason || row.reasonCode) return 'rejected';
  if (row.failed === true || row.error) return 'failed';
  return 'rejected';
}

function normalizeReasonCode(row = {}, outcome = '') {
  if (row.reasonCode) return String(row.reasonCode).trim();
  if (row.reason) return String(row.reason).trim().toUpperCase();
  if (outcome === 'already_confirmed') return 'ALREADY_ACCOUNTING_CONFIRMED';
  if (outcome === 'confirmed') return null;
  if (outcome === 'failed') return 'CLOSEOUT_FAILED';
  return 'CLOSEOUT_REJECTED';
}

function normalizeResultRow(row = {}) {
  const outcome = normalizeOutcome(row);
  const reasonCode = normalizeReasonCode(row, outcome);
  return {
    ...row,
    outcome,
    status: outcome,
    reasonCode,
    accountingConfirmed: outcome === 'confirmed' || outcome === 'already_confirmed' ? row.accountingConfirmed !== false : false,
    persistence: row.persistence || {
      salesOrderUpdated: false,
      allocationWritten: false,
      arPosted: false,
      fundPosted: false
    }
  };
}

function classifyStatus(counts = {}, total = 0) {
  const success = counts.confirmed + counts.alreadyConfirmed;
  const rejectedOrFailed = counts.rejected + counts.failed;
  if (counts.failed > 0 && success === 0) return 'failed';
  if (counts.failed > 0 && success > 0) return 'partial';
  if (counts.rejected > 0 && success > 0) return 'partial';
  if (counts.confirmed > 0 && rejectedOrFailed === 0) return 'confirmed';
  if (counts.alreadyConfirmed === total && total > 0) return 'idempotent';
  if (counts.rejected > 0 && success === 0) return 'rejected';
  return 'empty';
}

function httpStatusFor(status = '') {
  if (status === 'failed') return 500;
  if (status === 'rejected') return 409;
  if (status === 'empty') return 422;
  return 200;
}

function messageFor(status = '', counts = {}) {
  if (status === 'confirmed') {
    return `Ke toan da xac nhan ${counts.confirmed} don theo deliveryCloseout. Cong no duoc dong bo nen.`;
  }
  if (status === 'partial') {
    return `Da chot ${counts.confirmed} don, ${counts.alreadyConfirmed} don da chot truoc do, tu choi ${counts.rejected} don.`;
  }
  if (status === 'idempotent') return 'Cac don da duoc ke toan chot truoc do.';
  if (status === 'failed') return 'Chot so giao hang that bai.';
  if (status === 'rejected') return 'Khong co don nao du dieu kien chot so giao hang.';
  return 'Khong co ket qua chot so giao hang.';
}

function buildCloseoutResult(context = {}, execution = {}, telemetry = null) {
  const results = (Array.isArray(execution.results) ? execution.results : []).map(normalizeResultRow);
  const counts = results.reduce((acc, row) => {
    if (row.outcome === 'confirmed') acc.confirmed += 1;
    else if (row.outcome === 'already_confirmed') acc.alreadyConfirmed += 1;
    else if (row.outcome === 'failed') acc.failed += 1;
    else acc.rejected += 1;
    return acc;
  }, { confirmed: 0, alreadyConfirmed: 0, rejected: 0, failed: 0 });
  const skippedOrders = counts.alreadyConfirmed + counts.rejected;
  const diagnostics = results.map((row) => row.diagnostic).filter(Boolean);
  const warnings = diagnostics
    .filter((row) => row.normalizedDebtAmount < 0)
    .map((row) => ({
      code: 'DELIVERY_CLOSEOUT_OVERPAID',
      orderCode: row.orderCode,
      customerCode: row.customerCode,
      overpaymentAmount: Math.abs(Number(row.normalizedDebtAmount || 0))
    }));

  const status = classifyStatus(counts, results.length);
  const ok = ['confirmed', 'partial', 'idempotent'].includes(status);

  return {
    ok,
    status,
    httpStatus: httpStatusFor(status),
    code: ok ? 'DELIVERY_CLOSEOUT_ACCEPTED' : (status === 'failed' ? 'DELIVERY_CLOSEOUT_FAILED' : 'DELIVERY_CLOSEOUT_REJECTED'),
    processed: counts.confirmed,
    skipped: skippedOrders,
    date: context.command.date,
    confirmedOrders: counts.confirmed,
    alreadyConfirmedOrders: counts.alreadyConfirmed,
    rejectedOrders: counts.rejected,
    failedOrders: counts.failed,
    skippedOrders,
    totalOrders: Array.isArray(context.orders) ? context.orders.length : results.length,
    closeoutScope: context.closeoutScope,
    closeoutScopeHash: context.closeoutScopeHash,
    selectedOrderCodes: context.selectedOrderCodes || [],
    selectedSalesStaffCodes: context.selectedSalesStaffCodes || [],
    architecture: 'canonical-context-v1 -> salesOrders.deliveryCloseout -> orderPaymentAllocations -> detailed arLedgers/fundLedgers',
    arPolicy: 'AR-SALE/AR-RECEIPT-CASH/AR-RECEIPT-BANK/AR-REWARD-ALLOWANCE/AR-RETURN are posted from orderPaymentAllocations',
    implementation: 'canonical-context-v1',
    results,
    diagnostics,
    warnings,
    readModelRebuilds: [],
    readModelSync: execution.readModelSync || { mode: 'skipped', queued: 0, status: 'not_needed' },
    performance: telemetry && typeof telemetry.finish === 'function' ? telemetry.finish() : undefined,
    reason: context.command.reason,
    message: messageFor(status, counts)
  };
}

module.exports = {
  buildCloseoutResult,
  _internal: {
    normalizeResultRow,
    classifyStatus
  }
};
