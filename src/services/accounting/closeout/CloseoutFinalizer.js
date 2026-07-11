'use strict';

function buildCloseoutResult(context = {}, execution = {}, telemetry = null) {
  const results = Array.isArray(execution.results) ? execution.results : [];
  const confirmedOrders = results.filter((row) => row.confirmed).length;
  const skippedOrders = results.filter((row) => row.skipped).length;
  const diagnostics = results.map((row) => row.diagnostic).filter(Boolean);
  const warnings = diagnostics
    .filter((row) => row.normalizedDebtAmount < 0)
    .map((row) => ({
      code: 'DELIVERY_CLOSEOUT_OVERPAID',
      orderCode: row.orderCode,
      customerCode: row.customerCode,
      overpaymentAmount: Math.abs(Number(row.normalizedDebtAmount || 0))
    }));

  const status = confirmedOrders > 0 ? (skippedOrders > 0 ? 'partial' : 'confirmed') : 'idempotent';

  return {
    ok: true,
    status,
    processed: confirmedOrders,
    skipped: skippedOrders,
    date: context.command.date,
    confirmedOrders,
    skippedOrders,
    totalOrders: context.orders.length,
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
    message: confirmedOrders > 0
      ? `Kế toán đã xác nhận ${confirmedOrders} đơn theo deliveryCloseout. Bỏ qua ${skippedOrders} đơn đã chốt trước đó. Công nợ được đồng bộ nền.`
      : 'Các đơn đã được kế toán chốt trước đó.'
  };
}

module.exports = {
  buildCloseoutResult
};
