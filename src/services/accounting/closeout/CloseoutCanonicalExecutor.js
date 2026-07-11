'use strict';

const CloseoutTransactionRunner = require('./CloseoutTransactionRunner');
const CloseoutPostCommitHandler = require('./CloseoutPostCommitHandler');
const closeoutQueryAudit = require('../../../observability/closeoutQueryAudit');

function writerCacheOptions(context = {}) {
  const writerIdempotency = context.writerIdempotency || {};
  return {
    existingArLedgerByIdempotencyKey: writerIdempotency.existingArLedgerByIdempotencyKey,
    existingFundLedgerByIdempotencyKey: writerIdempotency.existingFundLedgerByIdempotencyKey,
    closeoutContextImplementation: 'canonical-context-v1'
  };
}

async function executeCanonicalCloseoutWriters(context = {}, helpers = {}, options = {}) {
  const results = Array.isArray(context.alreadyConfirmedOrders)
    ? context.alreadyConfirmedOrders.map((order) => helpers.buildAlreadyConfirmedResult(order))
    : [];

  if (!Array.isArray(context.pendingConfirmOrders) || !context.pendingConfirmOrders.length) {
    return {
      results,
      transactionResult: {
        results,
        criticalReads: [],
        syncGroups: []
      },
      readModelSync: { mode: 'skipped', queued: 0, status: 'not_needed' }
    };
  }

  const transactionResult = await closeoutQueryAudit.withCloseoutAuditStage('transaction.begin', () => CloseoutTransactionRunner.runCloseoutTransaction({
    pendingConfirmOrders: context.pendingConfirmOrders,
    results,
    confirmOneOrder: helpers.confirmOneOrder,
    assertReturnOrdersInventoryReady: helpers.assertReturnOrdersInventoryReady,
    perOrderOptions: {
      actor: context.command.actor,
      confirmedBy: context.command.actor,
      reason: context.command.reason,
      note: context.command.reason,
      date: context.command.date,
      closeoutScope: context.closeoutScope,
      closeoutScopeHash: context.closeoutScopeHash,
      selectedOrderCodes: context.selectedOrderCodes,
      selectedSalesStaffCodes: context.selectedSalesStaffCodes,
      ...writerCacheOptions(context),
      ...(options.perOrderOptions || {})
    }
  }));

  closeoutQueryAudit.updateCardinality({ criticalOrderCount: transactionResult.criticalReads.length });

  const readModelSync = await closeoutQueryAudit.withCloseoutAuditStage('postCommit.readModelSync', () => CloseoutPostCommitHandler.enqueueReadModelSync(transactionResult.syncGroups, {
    actor: context.command.actor,
    reason: context.command.reason,
    source: 'DELIVERY_CLOSEOUT',
    metadata: { route: 'POST /api/new/delivery-today/closeout', implementation: 'canonical-context-v1' }
  }));

  return {
    results,
    transactionResult,
    readModelSync
  };
}

module.exports = {
  executeCanonicalCloseoutWriters,
  writerCacheOptions
};
