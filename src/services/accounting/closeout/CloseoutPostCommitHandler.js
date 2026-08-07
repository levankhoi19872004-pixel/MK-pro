'use strict';

const readModelSyncJobService = require('../../readModelSyncJob.service');
const featureFlags = require('../../../config/featureFlags');

function clean(value = '') {
  return String(value ?? '').trim();
}

function buildPayload(group = {}, options = {}) {
  return {
    customerCode: clean(group.customerCode),
    sourceIds: Array.isArray(group.sourceIds) ? group.sourceIds : [],
    reason: clean(options.reason || 'Delivery closeout read-model sync'),
    actor: clean(options.actor || 'accountant'),
    source: clean(options.source || 'DELIVERY_CLOSEOUT'),
    metadata: options.metadata && typeof options.metadata === 'object' ? options.metadata : {}
  };
}

async function enqueueReadModelSync(syncGroups = [], options = {}) {
  const groups = Array.isArray(syncGroups) ? syncGroups : [];
  const jobs = [];
  const warnings = [];
  const bulkEnabled = featureFlags.FLAGS.closeoutSyncBulkV1();

  if (bulkEnabled && groups.length) {
    try {
      const bulk = await readModelSyncJobService.enqueueArDebtSyncJobsBulk(groups.map((group) => buildPayload(group, options)));
      jobs.push(bulk);
      warnings.push(...(bulk.warnings || []));
    } catch (err) {
      warnings.push({
        code: clean(err && err.code) || 'READ_MODEL_SYNC_BULK_ENQUEUE_FAILED',
        message: clean(err && err.message) || 'Khong bulk enqueue duoc read-model sync sau khi financial transaction da commit.',
        retryRequired: true,
        retryAttempted: err && err.bulkRetryAttempted === true,
        validGroupCount: Number(err && err.validGroupCount || groups.length),
        pendingJobs: Array.isArray(err && err.pendingJobs) ? err.pendingJobs : groups.map((group) => buildPayload(group, options))
      });
    }
  } else {
    for (const group of groups) {
      try {
        jobs.push(await readModelSyncJobService.enqueueArDebtSyncJobs(buildPayload(group, options)));
      } catch (err) {
        warnings.push({
          code: clean(err && err.code) || 'READ_MODEL_SYNC_ENQUEUE_FAILED',
          message: clean(err && err.message) || 'Khong enqueue duoc read-model sync sau khi commit.',
          customerCode: clean(group.customerCode),
          sourceIds: Array.isArray(group.sourceIds) ? group.sourceIds : []
        });
      }
    }
  }

  const queued = jobs.reduce((sum, row) => sum + Number(row.queued || 0), 0);
  if (queued > 0 || warnings.some((row) => row.retryRequired === true)) {
    try {
      readModelSyncJobService.scheduleDrain({
        limit: Number(options.limit || 10),
        actor: clean(options.actor || 'accountant'),
        reason: clean(options.reason || 'Delivery closeout read-model sync')
      });
    } catch (err) {
      warnings.push({
        code: clean(err && err.code) || 'READ_MODEL_SYNC_SCHEDULE_FAILED',
        message: clean(err && err.message) || 'Read-model sync da enqueue sau commit nhưng worker scheduling bi loi.',
        retryRequired: true
      });
    }
  }

  return {
    mode: groups.length ? 'post_commit_queued' : 'skipped',
    queued,
    status: warnings.length ? 'warning' : (queued > 0 ? 'pending' : 'not_needed'),
    jobs: jobs.flatMap((row) => row.jobs || []),
    warnings,
    syncBulkEnabled: bulkEnabled
  };
}

module.exports = {
  enqueueReadModelSync,
  _internal: { buildPayload }
};
