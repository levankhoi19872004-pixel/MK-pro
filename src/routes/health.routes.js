'use strict';

function registerHealthRoutes(app) {
  const EnterpriseStatusService = require('../services/EnterpriseStatusService');
  const startupState = require('../services/startupState');

  app.get('/api/health/readiness', async (req, res) => {
    const startup = startupState.snapshot();
    if (!startupState.isReady()) {
      return res.status(503).json({
        ok: false,
        checks: {
          bootstrap: false,
          database: false
        },
        startup: {
          phase: startup.phase,
          currentStep: startup.currentStep,
          startedAt: startup.startedAt,
          error: startup.error
        }
      });
    }

    try {
      const result = await EnterpriseStatusService.readiness({ tenantId: req.tenantId });
      return res.status(result.ok ? 200 : 503).json({
        ok: result.ok,
        checks: { bootstrap: true, ...result.checks },
        startup: {
          phase: startup.phase,
          readyAt: startup.readyAt
        }
      });
    } catch (error) {
      return res.status(503).json({
        ok: false,
        checks: { bootstrap: true, database: false },
        startup: { phase: startup.phase, readyAt: startup.readyAt }
      });
    }
  });

  app.get('/api/health/db', (req, res) => {
    const mongoose = require('mongoose');
    const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
    const ok = mongoose.connection.readyState === 1;
    res.status(ok ? 200 : 503).json({
      ok,
      state: states[mongoose.connection.readyState] || 'unknown',
      readyState: mongoose.connection.readyState
    });
  });
}

module.exports = { registerHealthRoutes };
