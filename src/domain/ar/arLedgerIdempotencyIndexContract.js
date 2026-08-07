'use strict';

const AR_LEDGER_IDEMPOTENCY_UNIQUE_INDEX = Object.freeze({
  collection: 'arLedgers',
  fields: Object.freeze({ idempotencyKey: 1 }),
  options: Object.freeze({
    name: 'uniq_arledger_idempotency_key_v1',
    unique: true,
    partialFilterExpression: Object.freeze({
      idempotencyKey: Object.freeze({ $type: 'string', $gt: '' })
    })
  }),
  deploymentState: 'PENDING_PRODUCTION_APPLY',
  autoApply: false,
  owner: 'PERF-A2C'
});

module.exports = { AR_LEDGER_IDEMPOTENCY_UNIQUE_INDEX };
