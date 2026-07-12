'use strict';

const JOB_ORDER = Object.freeze(['outbox', 'integration', 'reportingProjection', 'reconciliation']);
const PROCESS_ROLES = Object.freeze(['web', 'worker']);

let activeOrchestrator = null;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeRole(value) {
  const role = String(value || '').trim().toLowerCase();
  if (!PROCESS_ROLES.includes(role)) {
    const error = new Error(`processRole không hợp lệ: ${role || '(empty)'}`);
    error.code = 'INVALID_SCHEDULER_PROCESS_ROLE';
    throw error;
  }
  return role;
}

function defaultDescriptors() {
  return Object.freeze([
    {
      id: 'outbox',
      requiresBackgroundWorker: false,
      loadModule: () => require('./outboxJob'),
      start: async (jobModule, jobConfig) => {
        const { ensureDefaultOutboxHandlersRegistered } = require('../services/outbox/registerDefaultHandlers');
        ensureDefaultOutboxHandlersRegistered();
        return jobModule.startOutboxJob(jobConfig);
      },
      stop: async (jobModule) => jobModule.stopOutboxJob()
    },
    {
      id: 'integration',
      requiresBackgroundWorker: false,
      loadModule: () => require('./integrationJob'),
      start: async (jobModule, jobConfig) => jobModule.startIntegrationJob(jobConfig),
      stop: async (jobModule) => jobModule.stopIntegrationJob()
    },
    {
      id: 'reportingProjection',
      requiresBackgroundWorker: false,
      loadModule: () => require('./reportingProjectionJob'),
      start: async (jobModule, jobConfig) => jobModule.startReportingProjectionJob(jobConfig),
      stop: async (jobModule) => jobModule.stopReportingProjectionJob()
    },
    {
      id: 'reconciliation',
      requiresBackgroundWorker: true,
      loadModule: () => require('./reconciliationJob'),
      start: async (jobModule, jobConfig) => jobModule.startReconciliationJob(jobConfig),
      stop: async (jobModule) => jobModule.stopReconciliationJob()
    }
  ]);
}

function createInitialJobState(id, requested, config, requiresBackgroundWorker) {
  return {
    id,
    requested: Boolean(requested),
    loaded: false,
    started: false,
    reason: 'NOT_EVALUATED',
    intervalMs: Number(config?.intervalMs || 0),
    runOnStart: Boolean(config?.runOnStart),
    requiresBackgroundWorker: Boolean(requiresBackgroundWorker),
    errorCode: null,
    errorMessage: ''
  };
}

function createScheduledJobOrchestrator(options = {}) {
  const processRole = normalizeRole(options.processRole);
  const schedulerConfig = Object.freeze({ ...(options.schedulerConfig || {}) });
  const configuredOwner = String(schedulerConfig.owner || 'none').toLowerCase();
  const logger = options.logger || console;
  const descriptors = Object.freeze((options.descriptors || defaultDescriptors()).slice());
  const byId = new Map(descriptors.map((descriptor) => [descriptor.id, descriptor]));
  const loadedModules = new Map();
  let startPromise = null;
  let stopPromise = null;

  const state = {
    processRole,
    configuredOwner,
    ownerMatched: configuredOwner === processRole,
    lifecycle: 'idle',
    startedAt: null,
    stoppedAt: null,
    startCount: 0,
    stopCount: 0,
    failedJob: null,
    jobs: {}
  };

  for (const id of JOB_ORDER) {
    const descriptor = byId.get(id);
    if (!descriptor) continue;
    const config = schedulerConfig[id] || {};
    state.jobs[id] = createInitialJobState(id, config.enabled, config, descriptor.requiresBackgroundWorker);
  }

  function snapshot() {
    return clone(state);
  }

  function updateActiveSnapshot() {
    if (activeOrchestrator === api) return;
  }

  async function start() {
    if (startPromise) {
      await startPromise;
      return { ...snapshot(), repeatedStart: true, reason: 'ALREADY_STARTED' };
    }
    if (state.lifecycle === 'started') return { ...snapshot(), repeatedStart: true, reason: 'ALREADY_STARTED' };

    startPromise = (async () => {
      state.lifecycle = 'starting';
      state.startCount += 1;
      state.startedAt = new Date().toISOString();
      state.stoppedAt = null;

      if (configuredOwner === 'none') {
        state.ownerMatched = false;
        for (const job of Object.values(state.jobs)) job.reason = 'OWNER_NONE';
        state.lifecycle = 'started';
        return snapshot();
      }

      if (!state.ownerMatched) {
        for (const job of Object.values(state.jobs)) job.reason = 'OWNER_MISMATCH';
        state.lifecycle = 'started';
        return snapshot();
      }

      for (const id of JOB_ORDER) {
        const descriptor = byId.get(id);
        if (!descriptor) continue;
        const jobState = state.jobs[id];
        const jobConfig = schedulerConfig[id] || {};
        if (!jobState.requested) {
          jobState.reason = 'JOB_DISABLED';
          continue;
        }

        try {
          const jobModule = descriptor.loadModule();
          loadedModules.set(id, jobModule);
          jobState.loaded = true;
          const result = await descriptor.start(jobModule, jobConfig, { processRole, schedulerConfig });
          jobState.started = Boolean(result?.started);
          jobState.reason = result?.reason || (jobState.started ? 'STARTED' : 'START_DECLINED');
          if (Number.isFinite(Number(result?.intervalMs))) jobState.intervalMs = Number(result.intervalMs);
        } catch (error) {
          jobState.reason = 'FAILED';
          jobState.errorCode = error?.code || 'SCHEDULED_JOB_START_FAILED';
          jobState.errorMessage = String(error?.message || error).slice(0, 500);
          state.failedJob = id;
          state.lifecycle = 'failed';
          const wrapped = new Error(`Scheduled job ${id} startup failed: ${jobState.errorMessage}`);
          wrapped.code = 'SCHEDULED_JOB_START_FAILED';
          wrapped.jobId = id;
          wrapped.cause = error;
          throw wrapped;
        }
      }

      state.lifecycle = 'started';
      logger.info?.({ scheduler: snapshot() }, 'Scheduled job ownership evaluated');
      return snapshot();
    })();

    try {
      return await startPromise;
    } finally {
      if (state.lifecycle === 'failed') startPromise = null;
    }
  }

  async function stop() {
    if (stopPromise) return stopPromise;
    stopPromise = (async () => {
      state.stopCount += 1;
      if (state.lifecycle === 'stopped') return snapshot();
      state.lifecycle = 'stopping';
      for (const id of [...JOB_ORDER].reverse()) {
        const descriptor = byId.get(id);
        const jobState = state.jobs[id];
        const jobModule = loadedModules.get(id);
        if (!descriptor || !jobState?.started || !jobModule) continue;
        try {
          await descriptor.stop(jobModule, schedulerConfig[id] || {}, { processRole, schedulerConfig });
          jobState.started = false;
          jobState.reason = 'STOPPED';
        } catch (error) {
          jobState.errorCode = error?.code || 'SCHEDULED_JOB_STOP_FAILED';
          jobState.errorMessage = String(error?.message || error).slice(0, 500);
          logger.warn?.({ err: error, jobId: id }, 'Scheduled job stop failed');
        }
      }
      state.lifecycle = 'stopped';
      state.stoppedAt = new Date().toISOString();
      return snapshot();
    })();
    return stopPromise;
  }

  const api = { start, stop, snapshot };
  if (options.activate !== false) activeOrchestrator = api;
  updateActiveSnapshot();
  return api;
}

function getActiveScheduledJobSnapshot() {
  if (!activeOrchestrator) {
    return {
      processRole: 'web',
      configuredOwner: 'none',
      ownerMatched: false,
      lifecycle: 'uninitialized',
      startedAt: null,
      stoppedAt: null,
      startCount: 0,
      stopCount: 0,
      failedJob: null,
      jobs: {}
    };
  }
  return activeOrchestrator.snapshot();
}

function resetActiveScheduledJobOrchestratorForTests() {
  activeOrchestrator = null;
}

module.exports = {
  JOB_ORDER,
  PROCESS_ROLES,
  createScheduledJobOrchestrator,
  getActiveScheduledJobSnapshot,
  resetActiveScheduledJobOrchestratorForTests,
  _private: { defaultDescriptors, normalizeRole }
};
