'use strict';

const OPERATIONS = Object.freeze([
  'findOrder', 'batchFindOrders',
  'findLatestVersion', 'batchFindVersions',
  'findReturns', 'batchFindReturns',
  'findAllocation', 'batchFindAllocations',
  'findArBalance', 'batchFindArContext',
  'findIdempotency', 'batchFindCorrectionIdempotency',
  'postLedger', 'updateOrder', 'insertVersion', 'upsertAllocation',
  'transactionStart', 'transactionCommit', 'transactionAbort'
]);

const GROUPS = Object.freeze({
  initialContextReads: new Set(['findOrder', 'findLatestVersion', 'findReturns', 'findAllocation']),
  safetyRereads: new Set(['findArBalance']),
  idempotencyRereads: new Set(['findIdempotency']),
  writes: new Set(['postLedger', 'updateOrder', 'insertVersion', 'upsertAllocation']),
  transactions: new Set(['transactionStart', 'transactionCommit', 'transactionAbort'])
});

const READ_OPERATIONS = new Set([
  'findOrder', 'batchFindOrders', 'findLatestVersion', 'batchFindVersions',
  'findReturns', 'batchFindReturns', 'findAllocation', 'batchFindAllocations',
  'findArBalance', 'batchFindArContext', 'findIdempotency', 'batchFindCorrectionIdempotency'
]);

class LogicalQueryCounter {
  constructor() {
    this.counts = Object.fromEntries(OPERATIONS.map((name) => [name, 0]));
    this.timeline = [];
  }

  record(operation, meta = {}) {
    if (!Object.prototype.hasOwnProperty.call(this.counts, operation)) {
      throw new Error(`Unsupported logical operation: ${operation}`);
    }
    this.counts[operation] += 1;
    this.timeline.push({ sequence: this.timeline.length + 1, operation, ...meta });
  }

  count(operation) {
    return this.counts[operation] || 0;
  }

  totalFor(operationSet) {
    return [...operationSet].reduce((sum, name) => sum + this.count(name), 0);
  }

  snapshot({ batchSize = 0 } = {}) {
    const logicalReads = this.totalFor(READ_OPERATIONS);
    const writes = this.totalFor(GROUPS.writes);
    const transactionStarts = this.count('transactionStart');
    const totalCalls = Object.values(this.counts).reduce((sum, value) => sum + value, 0);
    return {
      operations: { ...this.counts },
      groups: {
        initialContextReads: this.totalFor(GROUPS.initialContextReads),
        safetyRereads: this.totalFor(GROUPS.safetyRereads),
        idempotencyRereads: this.totalFor(GROUPS.idempotencyRereads),
        writes,
        transactionCalls: this.totalFor(GROUPS.transactions)
      },
      logicalReads,
      writes,
      transactions: transactionStarts,
      transactionCommits: this.count('transactionCommit'),
      transactionAborts: this.count('transactionAbort'),
      totalCalls,
      callsPerOrder: batchSize > 0 ? Number((totalCalls / batchSize).toFixed(3)) : 0
    };
  }
}

module.exports = { LogicalQueryCounter, OPERATIONS, GROUPS, READ_OPERATIONS };
