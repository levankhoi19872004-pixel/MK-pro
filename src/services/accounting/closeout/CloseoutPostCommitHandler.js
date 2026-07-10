'use strict';

const readModelSyncJobService = require('../../readModelSyncJob.service');

function clean(value = '') {
  return String(value ?? '').trim();
}

async function enqueueReadModelSync(syncGroups = [], options = {}) {
  const jobs = [];
  const warnings = [];
  for (const group of Array.isArray(syncGroups) ? syncGroups : []) {
    try {
      jobs.push(await readModelSyncJobService.enqueueArDebtSyncJobs({
        customerCode: clean(group.customerCode),
        sourceIds: Array.isArray(group.sourceIds) ? group.sourceIds : [],
        reason: clean(options.reason || 'Delivery closeout read-model sync'),
        actor: clean(options.actor || 'accountant'),
        source: clean(options.source || 'DELIVERY_CLOSEOUT'),
        metadata: options.metadata && typeof options.metadata === 'object' ? options.metadata : {}
      }));
    } catch (err) {
      warnings.push({
        code: clean(err && err.code) || 'READ_MODEL_SYNC_ENQUEUE_FAILED',
        message: clean(err && err.message) || 'Khong enqueue duoc read-model sync sau khi commit.',
        customerCode: clean(group.customerCode),
        sourceIds: Array.isArray(group.sourceIds) ? group.sourceIds : []
      });
    }
  }

  const queued = jobs.reduce((sum, row) => sum + Number(row.queued || 0), 0);
  if (queued > 0) readModelSyncJobService.scheduleDrain({
    limit: Number(options.limit || 10),
    actor: clean(options.actor || 'accountant'),
    reason: clean(options.reason || 'Delivery closeout read-model sync')
  });

  return {
    mode: syncGroups.length ? 'post_commit_queued' : 'skipped',
    queued,
    status: warnings.length ? 'warning' : (queued > 0 ? 'pending' : 'not_needed'),
    jobs: jobs.flatMap((row) => row.jobs || []),
    warnings
  };
}

module.exports = {
  enqueueReadModelSync
};
