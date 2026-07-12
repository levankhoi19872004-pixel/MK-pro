'use strict';

const state = {
  gateEnabled: false,
  phase: 'idle',
  currentStep: null,
  startedAt: null,
  readyAt: null,
  failedAt: null,
  error: null,
  steps: {}
};

function nowIso() {
  return new Date().toISOString();
}

function begin() {
  state.gateEnabled = true;
  state.phase = 'starting';
  state.currentStep = 'http-listen';
  state.startedAt = nowIso();
  state.readyAt = null;
  state.failedAt = null;
  state.error = null;
  state.steps = {};
}

function markStepStarted(name) {
  const key = String(name || 'unknown');
  state.currentStep = key;
  state.steps[key] = {
    status: 'running',
    startedAt: nowIso(),
    completedAt: null,
    durationMs: null,
    error: null
  };
}

function markStepCompleted(name, startedAtMs, evidence = undefined) {
  const key = String(name || 'unknown');
  const current = state.steps[key] || {};
  state.steps[key] = {
    ...current,
    status: 'completed',
    completedAt: nowIso(),
    durationMs: Number.isFinite(startedAtMs) ? Math.max(0, Date.now() - startedAtMs) : current.durationMs,
    error: null,
    ...(evidence === undefined ? {} : { evidence })
  };
}

function markStepSkipped(name, reason = '') {
  const key = String(name || 'unknown');
  state.steps[key] = {
    status: 'skipped',
    startedAt: nowIso(),
    completedAt: nowIso(),
    durationMs: 0,
    reason: String(reason || ''),
    error: null
  };
}

function markReady() {
  state.phase = 'ready';
  state.currentStep = null;
  state.readyAt = nowIso();
  state.failedAt = null;
  state.error = null;
}

function markFailed(error) {
  state.phase = 'failed';
  state.failedAt = nowIso();
  state.readyAt = null;
  state.error = {
    name: error?.name || 'Error',
    code: error?.code || null,
    message: error?.message || String(error || 'Startup failed')
  };

  if (state.currentStep && state.steps[state.currentStep]) {
    const current = state.steps[state.currentStep];
    const startedAtMs = Date.parse(current.startedAt || '');
    state.steps[state.currentStep] = {
      ...current,
      status: 'failed',
      completedAt: nowIso(),
      durationMs: Number.isFinite(startedAtMs) ? Math.max(0, Date.now() - startedAtMs) : current.durationMs,
      error: state.error
    };
  }
}

function isReady() {
  return state.phase === 'ready';
}

function isGateEnabled() {
  return state.gateEnabled;
}

function snapshot() {
  return {
    gateEnabled: state.gateEnabled,
    phase: state.phase,
    currentStep: state.currentStep,
    startedAt: state.startedAt,
    readyAt: state.readyAt,
    failedAt: state.failedAt,
    error: state.error ? { ...state.error } : null,
    steps: Object.fromEntries(
      Object.entries(state.steps).map(([key, value]) => [key, { ...value }])
    )
  };
}

function resetForTests() {
  state.gateEnabled = false;
  state.phase = 'idle';
  state.currentStep = null;
  state.startedAt = null;
  state.readyAt = null;
  state.failedAt = null;
  state.error = null;
  state.steps = {};
}

module.exports = {
  begin,
  markStepStarted,
  markStepCompleted,
  markStepSkipped,
  markReady,
  markFailed,
  isReady,
  isGateEnabled,
  snapshot,
  resetForTests
};
