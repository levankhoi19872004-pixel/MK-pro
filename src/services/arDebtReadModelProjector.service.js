'use strict';

const arDebtReadModel = require('./arDebtReadModel.service');

function clean(value = '') {
  return String(value ?? '').trim();
}

function unique(values = []) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map((value) => clean(value))
    .filter(Boolean))];
}

async function projectArDebtReadModel(job = {}, options = {}) {
  const customerCode = clean(job.customerCode || options.customerCode);
  const sourceIds = unique(job.sourceIds || options.sourceIds);
  const actor = clean(options.actor || job.actor || 'readmodel-projector');
  const reason = clean(options.reason || job.reason || 'AR debt read-model sync');
  const sourceResults = [];

  for (const sourceId of sourceIds) {
    sourceResults.push(await arDebtReadModel.rebuildDebtForSource(sourceId, {
      actor,
      reason,
      source: 'AR_DEBT_READMODEL_SYNC_JOB'
    }));
  }

  let customerResult = null;
  if (customerCode) {
    customerResult = await arDebtReadModel.refreshDebtCustomerFromOrders(customerCode, {
      actor,
      reason,
      source: 'AR_DEBT_READMODEL_SYNC_JOB'
    });
  }

  return {
    ok: true,
    type: 'AR_DEBT_READMODEL_SYNC',
    customerCode,
    sourceIds,
    sourceResults: sourceResults.map((row) => ({
      scope: row.scope,
      sourceId: row.sourceId,
      writtenOrders: row.persist?.writtenOrders || 0,
      upsertedOrders: row.persist?.upsertedOrders || 0
    })),
    customerResult: customerResult ? {
      scope: customerResult.scope,
      customerCode: customerResult.customerCode,
      orderCount: customerResult.orderCount || 0,
      writtenCustomers: customerResult.persist?.writtenCustomers || 0
    } : null
  };
}

module.exports = {
  projectArDebtReadModel
};
