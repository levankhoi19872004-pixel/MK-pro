'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const { buildRuntimeConfig } = require('../src/config/app.config');
const {
  JOB_ORDER,
  createScheduledJobOrchestrator,
  resetActiveScheduledJobOrchestratorForTests
} = require('../src/jobs/scheduledJobOrchestrator');

function fakeSchedulerConfig(owner = 'none', enabled = []) {
  const selected = new Set(enabled);
  return {
    owner,
    outbox: { enabled: selected.has('outbox'), intervalMs: 15000 },
    integration: { enabled: selected.has('integration'), intervalMs: 30000 },
    reportingProjection: { enabled: selected.has('reportingProjection'), intervalMs: 3600000 },
    reconciliation: { enabled: selected.has('reconciliation'), runOnStart: false, intervalMs: 21600000, startDelayMs: 30000 },
    readinessRequireBackgroundWorker: false
  };
}

function fakeDescriptors(calls, options = {}) {
  return JOB_ORDER.map((id) => ({
    id,
    requiresBackgroundWorker: id === 'reconciliation',
    loadModule() {
      calls.push(`load:${id}`);
      if (options.failLoad === id) throw new Error(`load-${id}-failed`);
      return { id };
    },
    async start(_module, config) {
      calls.push(`start:${id}`);
      if (options.failStart === id) throw new Error(`start-${id}-failed`);
      return { started: true, reason: 'STARTED', intervalMs: config.intervalMs };
    },
    async stop() { calls.push(`stop:${id}`); return { stopped: true }; }
  }));
}

function createHarness({ role = 'web', owner = 'none', enabled = [], descriptorOptions = {} } = {}) {
  const calls = [];
  const orchestrator = createScheduledJobOrchestrator({
    processRole: role,
    schedulerConfig: fakeSchedulerConfig(owner, enabled),
    descriptors: fakeDescriptors(calls, descriptorOptions),
    activate: false,
    logger: { info() {}, warn() {} }
  });
  return { orchestrator, calls };
}

function clearModule(relativePath) {
  const resolved = require.resolve(path.join(ROOT, relativePath));
  delete require.cache[resolved];
}

function isCached(relativePath) {
  return Boolean(require.cache[require.resolve(path.join(ROOT, relativePath))]);
}

test('scheduler safe defaults are owner none with all jobs and strict readiness disabled', () => {
  const config = buildRuntimeConfig({});
  assert.equal(config.scheduler.owner, 'none');
  assert.equal(config.scheduler.reconciliation.enabled, false);
  assert.equal(config.scheduler.reconciliation.runOnStart, false);
  assert.equal(config.scheduler.outbox.enabled, false);
  assert.equal(config.scheduler.integration.enabled, false);
  assert.equal(config.scheduler.reportingProjection.enabled, false);
  assert.equal(config.scheduler.readinessRequireBackgroundWorker, false);
});

test('scheduler owner enum accepts none/web/worker and rejects auto/both/random', () => {
  for (const value of ['none', 'web', 'worker', '']) {
    const config = buildRuntimeConfig({ SCHEDULED_JOB_OWNER: value });
    assert.equal(config.validationIssues.some((issue) => issue.variable === 'SCHEDULED_JOB_OWNER'), false, value);
    assert.equal(config.scheduler.owner, value || 'none');
  }
  for (const value of ['auto', 'both', 'random']) {
    const config = buildRuntimeConfig({ SCHEDULED_JOB_OWNER: value });
    assert.equal(config.scheduler.owner, 'none');
    assert.equal(config.validationIssues.some((issue) => issue.variable === 'SCHEDULED_JOB_OWNER'), true, value);
  }
});

test('web owner loads and starts only explicitly enabled reconciliation job', async () => {
  const { orchestrator, calls } = createHarness({ role: 'web', owner: 'web', enabled: ['reconciliation'] });
  const snapshot = await orchestrator.start();
  assert.deepEqual(calls, ['load:reconciliation', 'start:reconciliation']);
  assert.equal(snapshot.jobs.reconciliation.started, true);
  for (const id of ['outbox', 'integration', 'reportingProjection']) assert.equal(snapshot.jobs[id].reason, 'JOB_DISABLED');
});

test('owner mismatch and owner none do not load modules or start timers even when flags are true', async () => {
  for (const setup of [
    { role: 'web', owner: 'worker' },
    { role: 'worker', owner: 'web' },
    { role: 'web', owner: 'none' }
  ]) {
    const { orchestrator, calls } = createHarness({ ...setup, enabled: JOB_ORDER });
    const snapshot = await orchestrator.start();
    assert.deepEqual(calls, [], `${setup.role}/${setup.owner}`);
    for (const job of Object.values(snapshot.jobs)) {
      assert.equal(job.loaded, false);
      assert.equal(job.started, false);
      assert.equal(job.reason, setup.owner === 'none' ? 'OWNER_NONE' : 'OWNER_MISMATCH');
    }
  }
});

test('worker owner starts only enabled worker-owned jobs in deterministic order', async () => {
  const { orchestrator, calls } = createHarness({ role: 'worker', owner: 'worker', enabled: ['outbox', 'integration'] });
  await orchestrator.start();
  assert.deepEqual(calls, ['load:outbox', 'start:outbox', 'load:integration', 'start:integration']);
});

test('orchestrator duplicate start and repeated stop are idempotent with reverse stop order', async () => {
  const { orchestrator, calls } = createHarness({ role: 'web', owner: 'web', enabled: ['outbox', 'integration', 'reconciliation'] });
  await orchestrator.start();
  await orchestrator.start();
  await orchestrator.stop();
  await orchestrator.stop();
  assert.equal(calls.filter((value) => value.startsWith('start:')).length, 3);
  assert.deepEqual(calls.filter((value) => value.startsWith('stop:')), ['stop:reconciliation', 'stop:integration', 'stop:outbox']);
});

test('orchestrator fails closed on loader/start failure and reports the failed job', async () => {
  for (const descriptorOptions of [{ failLoad: 'integration' }, { failStart: 'outbox' }]) {
    const { orchestrator } = createHarness({ role: 'web', owner: 'web', enabled: ['outbox', 'integration'], descriptorOptions });
    await assert.rejects(orchestrator.start(), (error) => error.code === 'SCHEDULED_JOB_START_FAILED');
    const snapshot = orchestrator.snapshot();
    assert.equal(snapshot.lifecycle, 'failed');
    assert.ok(snapshot.failedJob);
    assert.equal(snapshot.jobs[snapshot.failedJob].reason, 'FAILED');
  }
});

test('reconciliation startup timer is created only when enabled and runOnStart are both true', () => {
  const originalSetInterval = global.setInterval;
  const originalSetTimeout = global.setTimeout;
  const originalClearInterval = global.clearInterval;
  const originalClearTimeout = global.clearTimeout;
  const counts = { interval: 0, timeout: 0 };
  global.setInterval = () => { counts.interval += 1; return { unref() {} }; };
  global.setTimeout = () => { counts.timeout += 1; return { unref() {} }; };
  global.clearInterval = () => {};
  global.clearTimeout = () => {};
  clearModule('src/jobs/reconciliationJob.js');
  const job = require('../src/jobs/reconciliationJob');
  try {
    job.startReconciliationJob({ enabled: true, runOnStart: false, intervalMs: 300000, startDelayMs: 1000 });
    assert.deepEqual(counts, { interval: 1, timeout: 0 });
    job.stopReconciliationJob();
    job.startReconciliationJob({ enabled: true, runOnStart: true, intervalMs: 300000, startDelayMs: 1000 });
    assert.deepEqual(counts, { interval: 2, timeout: 1 });
    job.stopReconciliationJob();
    const disabled = job.startReconciliationJob({ enabled: false, runOnStart: true, intervalMs: 300000, startDelayMs: 1000 });
    assert.equal(disabled.started, false);
    assert.deepEqual(counts, { interval: 2, timeout: 1 });
  } finally {
    job.stopReconciliationJob();
    global.setInterval = originalSetInterval;
    global.setTimeout = originalSetTimeout;
    global.clearInterval = originalClearInterval;
    global.clearTimeout = originalClearTimeout;
  }
});

test('reconciliation scheduler preserves queue submission contract and scheduled idempotency bucket', async () => {
  clearModule('src/jobs/reconciliationJob.js');
  const submission = require('../src/services/background-jobs/JobSubmissionService');
  const original = submission.submitReconciliation;
  let captured = null;
  submission.submitReconciliation = async (payload) => {
    captured = payload;
    return { created: true, job: { id: 'job-1' } };
  };
  try {
    const job = require('../src/jobs/reconciliationJob');
    const result = await job.runOnce('scheduled_job');
    assert.equal(result.jobId, 'job-1');
    assert.equal(captured.type, 'all');
    assert.equal(captured.source, 'scheduled_job');
    assert.match(captured.idempotencyKey, /^reconciliation:scheduled:\d+$/);
    assert.equal(fs.readFileSync(path.join(ROOT, 'src/jobs/reconciliationJob.js'), 'utf8').includes('ReconciliationService'), false);
  } finally {
    submission.submitReconciliation = original;
  }
});

test('Enterprise manual outbox drain support registers handlers without starting outbox timer', () => {
  clearModule('src/jobs/outboxJob.js');
  clearModule('src/services/outbox/registerDefaultHandlers.js');
  const outbox = require('../src/jobs/outboxJob');
  const handlers = require('../src/services/outbox/registerDefaultHandlers');
  handlers.ensureDefaultOutboxHandlersRegistered();
  handlers.ensureDefaultOutboxHandlersRegistered();
  assert.equal(handlers.isDefaultOutboxHandlersRegistered(), true);
  assert.equal(outbox.getOutboxJobState().handlerCount, 1);
  const result = outbox.startOutboxJob({ enabled: false, intervalMs: 15000 });
  assert.equal(result.started, false);
  assert.equal(outbox.getOutboxJobState().started, false);
});

test('web app import with owner none and Enterprise off keeps scheduler job graph out of require.cache', () => {
  process.env.NODE_ENV = 'test';
  process.env.ENABLE_ENTERPRISE_CORE = 'false';
  process.env.SCHEDULED_JOB_OWNER = 'none';
  process.env.AUTO_RECONCILIATION_JOB = 'false';
  process.env.ENABLE_OUTBOX_WORKER = 'false';
  process.env.ENABLE_INTEGRATION_WORKER = 'false';
  process.env.ENABLE_REPORTING_PROJECTION_JOB = 'false';
  for (const file of [
    'src/jobs/reconciliationJob.js', 'src/jobs/outboxJob.js', 'src/jobs/integrationJob.js',
    'src/jobs/reportingProjectionJob.js', 'src/services/outbox/registerDefaultHandlers.js', 'src/app.js'
  ]) clearModule(file);
  resetActiveScheduledJobOrchestratorForTests();
  require('../src/app');
  for (const file of [
    'src/jobs/reconciliationJob.js', 'src/jobs/outboxJob.js', 'src/jobs/integrationJob.js',
    'src/jobs/reportingProjectionJob.js', 'src/services/outbox/registerDefaultHandlers.js'
  ]) assert.equal(isCached(file), false, file);
});

test('worker dependency is advisory by default and strict mode requires healthy same-release worker', () => {
  const { _private } = require('../src/services/operationsService');
  const release = { releaseId: 'release-1' };
  const baseConfig = { scheduler: { readinessRequireBackgroundWorker: false, reconciliation: { enabled: true } } };
  let summary = _private.evaluateWorkerDependency([], baseConfig, release);
  assert.equal(summary.status, 'ADVISORY');
  assert.deepEqual(summary.warnings, ['RECONCILIATION_EXECUTOR_UNAVAILABLE']);

  const strict = { scheduler: { readinessRequireBackgroundWorker: true, reconciliation: { enabled: true } } };
  summary = _private.evaluateWorkerDependency([], strict, release);
  assert.equal(summary.status, 'NOT_READY');
  summary = _private.evaluateWorkerDependency([{ role: 'worker', healthy: true, releaseId: 'other' }], strict, release);
  assert.equal(summary.status, 'NOT_READY');
  summary = _private.evaluateWorkerDependency([{ role: 'worker', healthy: true, releaseId: 'release-1' }], strict, release);
  assert.equal(summary.status, 'READY');
  assert.equal(summary.sameReleaseWorkerCount, 1);
});

test('startup state stores scheduler ownership evidence without changing readiness lifecycle', () => {
  const startupState = require('../src/services/startupState');
  startupState.resetForTests();
  startupState.begin();
  startupState.markStepStarted('background-jobs');
  startupState.markStepCompleted('background-jobs', Date.now(), {
    ownerConfigured: 'none', processRole: 'web', ownerMatched: false, startedJobs: [], failedJob: null
  });
  startupState.markReady();
  const snapshot = startupState.snapshot();
  assert.equal(snapshot.phase, 'ready');
  assert.equal(snapshot.steps['background-jobs'].evidence.ownerConfigured, 'none');
});

test('worker entry passes hard-coded worker role to orchestrator before queue loop', async () => {
  const env = {
    NODE_ENV: 'test',
    MONGO_URI: 'mongodb://example.invalid/mkpro-test',
    SCHEDULED_JOB_OWNER: 'worker',
    ENABLE_OUTBOX_WORKER: 'true'
  };
  const calls = [];
  const fakeHeartbeat = { async start() { calls.push('heartbeat:start'); }, async beat() { calls.push('heartbeat:beat'); }, async stop() {} };
  const worker = require('../scripts/background-job-worker');
  worker._private.resetForTests();
  const result = await worker.main({
    env,
    connectDB: async () => { calls.push('mongo:connect'); },
    createHeartbeat: () => fakeHeartbeat,
    createOrchestrator: (options) => {
      assert.equal(options.processRole, 'worker');
      calls.push('orchestrator:create');
      return {
        async start() { calls.push('orchestrator:start'); return { configuredOwner: 'worker', jobs: { outbox: { id: 'outbox', started: true } } }; },
        async stop() {},
        snapshot() { return {}; }
      };
    },
    runLoop: async () => { calls.push('queue:run'); },
    once: true,
    autoShutdown: false,
    exit: false
  });
  assert.equal(result.schedulerSnapshot.configuredOwner, 'worker');
  assert.deepEqual(calls.slice(0, 5), ['mongo:connect', 'heartbeat:start', 'orchestrator:create', 'orchestrator:start', 'heartbeat:beat']);
  assert.equal(calls.at(-1), 'queue:run');
});

test('scheduler audit is deterministic and non-mutating', async () => {
  const { snapshotTree } = require('../scripts/lib/release-artifact-policy');
  const before = snapshotTree(ROOT);
  const { runAudit } = require('../scripts/audit-scheduler-ownership');
  const first = await runAudit({ processRole: 'web', owner: 'worker', jobs: JOB_ORDER });
  const second = await runAudit({ processRole: 'web', owner: 'worker', jobs: JOB_ORDER });
  assert.deepEqual(first, second);
  assert.deepEqual(first.loadedJobs, []);
  const after = snapshotTree(ROOT);
  assert.deepEqual(after, before);
});

test('scheduler interval configuration keeps existing operational defaults when jobs are explicitly enabled', () => {
  const config = buildRuntimeConfig({
    RECONCILIATION_INTERVAL_MS: '21600000',
    RECONCILIATION_START_DELAY_MS: '30000',
    OUTBOX_POLL_INTERVAL_MS: '15000',
    INTEGRATION_POLL_INTERVAL_MS: '30000',
    REPORTING_PROJECTION_INTERVAL_MS: '3600000'
  });
  assert.equal(config.scheduler.reconciliation.intervalMs, 21600000);
  assert.equal(config.scheduler.reconciliation.startDelayMs, 30000);
  assert.equal(config.scheduler.outbox.intervalMs, 15000);
  assert.equal(config.scheduler.integration.intervalMs, 30000);
  assert.equal(config.scheduler.reportingProjection.intervalMs, 3600000);
});

test('public runtime config summary exposes scheduler decisions without environment secrets', () => {
  const { publicConfigSummary } = require('../src/config/app.config');
  const config = buildRuntimeConfig({ SCHEDULED_JOB_OWNER: 'web', AUTO_RECONCILIATION_JOB: 'true', JWT_SECRET: 'do-not-expose' });
  const summary = publicConfigSummary(config);
  assert.equal(summary.scheduler.owner, 'web');
  assert.equal(summary.scheduler.reconciliationEnabled, true);
  assert.equal(JSON.stringify(summary).includes('do-not-expose'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(summary, 'security'), false);
});

test('all four job modules expose read-only operational state contract', () => {
  for (const [file, getter] of [
    ['../src/jobs/outboxJob', 'getOutboxJobState'],
    ['../src/jobs/integrationJob', 'getIntegrationJobState'],
    ['../src/jobs/reportingProjectionJob', 'getReportingProjectionJobState'],
    ['../src/jobs/reconciliationJob', 'getReconciliationJobState']
  ]) {
    const module = require(file);
    const state = module[getter]();
    for (const key of ['enabled', 'started', 'running', 'intervalMs', 'lastStartedAt', 'lastStoppedAt', 'lastRunAt', 'lastSuccessAt', 'lastFailureAt', 'lastError']) {
      assert.ok(Object.prototype.hasOwnProperty.call(state, key), `${file}:${key}`);
    }
    assert.equal(JSON.stringify(state).includes('mongodb://'), false);
    assert.equal(JSON.stringify(state).includes('JWT_SECRET'), false);
  }
});

test('web bootstrap source contains no eager scheduler or default-handler imports', () => {
  const source = fs.readFileSync(path.join(ROOT, 'src/app.js'), 'utf8');
  const topLevel = source.split('function inputSanitizer')[0];
  for (const fragment of [
    "require('./jobs/reconciliationJob')",
    "require('./jobs/outboxJob')",
    "require('./jobs/integrationJob')",
    "require('./jobs/reportingProjectionJob')",
    "require('./services/outbox/registerDefaultHandlers')"
  ]) assert.equal(topLevel.includes(fragment), false, fragment);
  assert.match(source, /createScheduledJobOrchestrator/);
  assert.match(source, /if \(BOOTSTRAP_FEATURE_SNAPSHOT\.enterpriseCore\)/);
});

test('system status reads scheduler runtime evidence without eager reconciliation job import', async () => {
  clearModule('src/jobs/reconciliationJob.js');
  clearModule('src/services/systemService.js');
  const systemService = require('../src/services/systemService');
  assert.equal(isCached('src/jobs/reconciliationJob.js'), false);
  const status = await systemService.status();
  assert.equal(typeof status.reconciliation, 'object');
  assert.equal(status.reconciliation.reason, 'SCHEDULER_UNINITIALIZED');
});

test('worker heartbeat ready metadata includes scheduler owner and started job IDs', async () => {
  const patches = [];
  const env = { NODE_ENV: 'test', MONGO_URI: 'mongodb://example.invalid/mkpro-test', SCHEDULED_JOB_OWNER: 'worker', ENABLE_INTEGRATION_WORKER: 'true' };
  const worker = require('../scripts/background-job-worker');
  worker._private.resetForTests();
  await worker.main({
    env,
    connectDB: async () => {},
    createHeartbeat: () => ({ async start() {}, async beat(patch) { patches.push(patch); }, async stop() {} }),
    createOrchestrator: () => ({
      async start() { return { configuredOwner: 'worker', jobs: { integration: { id: 'integration', started: true } } }; },
      async stop() {}, snapshot() { return {}; }
    }),
    runLoop: async () => {}, once: true, autoShutdown: false, exit: false
  });
  assert.equal(patches.at(-1).metadata.schedulerOwner, 'worker');
  assert.deepEqual(patches.at(-1).metadata.schedulerJobsStarted, ['integration']);
});

test('unhealthy or stale worker heartbeat never satisfies strict readiness', () => {
  const { _private } = require('../src/services/operationsService');
  const config = { scheduler: { readinessRequireBackgroundWorker: true, reconciliation: { enabled: true } } };
  const release = { releaseId: 'same' };
  const summary = _private.evaluateWorkerDependency([
    { role: 'worker', healthy: false, releaseId: 'same' },
    { role: 'web', healthy: true, releaseId: 'same' }
  ], config, release);
  assert.equal(summary.status, 'NOT_READY');
  assert.equal(summary.healthyWorkerCount, 0);
});

test('audit matrix distinguishes owner mismatch from disabled jobs without loading modules', async () => {
  const { runAudit } = require('../scripts/audit-scheduler-ownership');
  const mismatch = await runAudit({ processRole: 'web', owner: 'worker', jobs: ['outbox'] });
  assert.equal(mismatch.reasons.outbox, 'OWNER_MISMATCH');
  assert.deepEqual(mismatch.loadedJobs, []);
  const matched = await runAudit({ processRole: 'web', owner: 'web', jobs: [] });
  assert.equal(matched.reasons.outbox, 'JOB_DISABLED');
  assert.deepEqual(matched.loadedJobs, []);
});
