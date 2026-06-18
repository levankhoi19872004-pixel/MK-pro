'use strict';

function registerHealthRoutes(app) {
  const EnterpriseStatusService = require('../services/EnterpriseStatusService');

  app.get('/api/health/readiness', async (req, res) => {
    try {
      const result = await EnterpriseStatusService.readiness({ tenantId: req.tenantId });
      res.status(result.ok ? 200 : 503).json({
        ok: result.ok,
        checks: result.checks
      });
    } catch (error) {
      res.status(503).json({ ok: false, checks: { database: false } });
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
