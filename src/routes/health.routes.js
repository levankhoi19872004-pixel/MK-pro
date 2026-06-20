'use strict';

const operationsService = require('../services/operationsService');

function registerHealthRoutes(app) {
  app.get('/api/health/live', (req, res) => {
    res.status(200).json(operationsService.liveness());
  });

  const ready = async (req, res) => {
    const result = await operationsService.readiness();
    return res.status(result.ok ? 200 : 503).json(result);
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
      readyState: mongoose.connection.readyState
    });
  });
}

module.exports = { registerHealthRoutes };
