'use strict';

const mongoose = require('mongoose');
const OutboxEvent = require('../models/OutboxEvent');
const IntegrationJob = require('../models/IntegrationJob');
const ReconciliationReport = require('../models/ReconciliationReport');
const { snapshot: featureSnapshot } = require('../config/featureFlags');
const { tenantIdOf } = require('../utils/tenant.util');

async function status(context = {}) {
  const tenantId = tenantIdOf({ tenantId: context.tenantId });
  const tenantFilter = { tenantId };
  const [outboxRows, integrationRows, latestReconciliation] = await Promise.all([
    OutboxEvent.aggregate([
      { $match: tenantFilter },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]).catch(() => []),
    IntegrationJob.aggregate([
      { $match: tenantFilter },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]).catch(() => []),
    ReconciliationReport.findOne({}).sort({ createdAt: -1 }).lean().catch(() => null)
  ]);

  return {
    tenantId,
    database: {
      connected: mongoose.connection.readyState === 1,
      readyState: mongoose.connection.readyState
    },
    features: featureSnapshot(),
    workers: {
      outboxEnabled: process.env.ENABLE_OUTBOX_WORKER === 'true',
      integrationsEnabled: process.env.ENABLE_INTEGRATION_WORKER === 'true',
      reconciliationEnabled: process.env.ENABLE_RECONCILIATION_JOB !== 'false'
    },
    outbox: Object.fromEntries(outboxRows.map((row) => [row._id, row.count])),
    integrations: Object.fromEntries(integrationRows.map((row) => [row._id, row.count])),
    latestReconciliation: latestReconciliation ? {
      id: latestReconciliation.id,
      type: latestReconciliation.type,
      status: latestReconciliation.status,
      createdAt: latestReconciliation.createdAt
    } : null
  };
}

async function readiness(context = {}) {
  const data = await status(context);
  const failedOutbox = Number(data.outbox.failed || 0);
  const failedIntegrations = Number(data.integrations.failed || 0);
  const pendingOutbox = Number(data.outbox.pending || 0);
  const maxPending = Math.max(10, Number(process.env.READINESS_MAX_PENDING_OUTBOX || 10000));
  const checks = {
    database: data.database.connected,
    outboxBacklog: pendingOutbox <= maxPending,
    outboxFailures: failedOutbox <= Number(process.env.READINESS_MAX_FAILED_OUTBOX || 100),
    integrationFailures: failedIntegrations <= Number(process.env.READINESS_MAX_FAILED_INTEGRATIONS || 100)
  };
  return { ok: Object.values(checks).every(Boolean), checks, status: data };
}

module.exports = { status, readiness };
