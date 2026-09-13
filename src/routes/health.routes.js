'use strict';

const bootTrace = require('../observability/bootTrace');
const startupState = require('../services/startupState');

function lightweightLiveness() {
  return {
    status: 'ok',
    service: 'mk-pro-web',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    boot: bootTrace.publicSnapshot()
  };
}

function registerHealthRoutes(app) {
  // Liveness is intentionally dependency-free: no Mongo ping, model read,
  // auth, tenant resolution, scheduler or operationsService import.
  app.get('/api/health/live', (req, res) => {
    res.status(200).json(lightweightLiveness());
  });

  const ready = async (req, res) => {
    // Lazy-load the heavier operations service only for readiness requests so
    // the basic HTTP process can expose liveness as early as possible.
    const operationsService = require('../services/operationsService');
    const result = await operationsService.readiness();
    const startup = startupState.snapshot();
    return res.status(result.ok ? 200 : 503).json({
      ...result,
      startup: {
        phase: startup.phase,
        currentStep: startup.currentStep,
        startedAt: startup.startedAt,
        readyAt: startup.readyAt,
        failedAt: startup.failedAt,
        error: startup.error ? {
          name: startup.error.name,
          code: startup.error.code
        } : null
      },
      boot: bootTrace.publicSnapshot()
    });
  };

  app.get('/api/health/ready', ready);
  app.get('/api/health/readiness', ready);

  app.get('/api/health/db', (req, res) => {
    const mongoose = require('mongoose');
    const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
    const ok = mongoose.connection.readyState === 1;
    res.status(ok ? 200 : 503).json({
      ok,
      state: states[mongoose.connection.readyState] || 'unknown',
      readyState: mongoose.connection.readyState,
      boot: bootTrace.publicSnapshot()
    });
  });
}

module.exports = { registerHealthRoutes, lightweightLiveness };
