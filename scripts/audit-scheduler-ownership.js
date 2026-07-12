'use strict';

const { createScheduledJobOrchestrator, JOB_ORDER } = require('../src/jobs/scheduledJobOrchestrator');

function parseArgs(argv = process.argv.slice(2)) {
  const out = { processRole: 'web', owner: 'none', jobs: [] };
  for (const arg of argv) {
    if (arg.startsWith('--process-role=')) out.processRole = arg.split('=')[1];
    if (arg.startsWith('--owner=')) out.owner = arg.split('=')[1];
    if (arg.startsWith('--jobs=')) out.jobs = arg.split('=')[1].split(',').map((value) => value.trim()).filter(Boolean);
  }
  return out;
}

function buildConfig(owner, jobs = []) {
  const selected = new Set(jobs);
  return {
    owner,
    outbox: { enabled: selected.has('outbox'), intervalMs: 15000 },
    integration: { enabled: selected.has('integration'), intervalMs: 30000 },
    reportingProjection: { enabled: selected.has('reportingProjection'), intervalMs: 3600000 },
    reconciliation: { enabled: selected.has('reconciliation'), runOnStart: false, intervalMs: 21600000, startDelayMs: 30000 },
    readinessRequireBackgroundWorker: false
  };
}

async function runAudit(options = {}) {
  const calls = [];
  const descriptors = JOB_ORDER.map((id) => ({
    id,
    requiresBackgroundWorker: id === 'reconciliation',
    loadModule() { calls.push(`load:${id}`); return { id }; },
    async start(_module, config) { calls.push(`start:${id}`); return { started: true, intervalMs: config.intervalMs, reason: 'STARTED' }; },
    async stop() { calls.push(`stop:${id}`); return { stopped: true }; }
  }));
  const config = buildConfig(options.owner || 'none', options.jobs || []);
  const orchestrator = createScheduledJobOrchestrator({
    processRole: options.processRole || 'web',
    schedulerConfig: config,
    descriptors,
    activate: false,
    logger: { info() {}, warn() {} }
  });
  const started = await orchestrator.start();
  await orchestrator.stop();
  return {
    processRole: started.processRole,
    configuredOwner: started.configuredOwner,
    ownerMatched: started.ownerMatched,
    requestedJobs: JOB_ORDER.filter((id) => config[id]?.enabled),
    loadedJobs: Object.values(started.jobs).filter((job) => job.loaded).map((job) => job.id),
    startedJobs: Object.values(started.jobs).filter((job) => job.started).map((job) => job.id),
    reasons: Object.fromEntries(Object.entries(started.jobs).map(([id, job]) => [id, job.reason])),
    calls
  };
}

if (require.main === module) {
  runAudit(parseArgs()).then((result) => {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }).catch((error) => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}

module.exports = { parseArgs, buildConfig, runAudit };
