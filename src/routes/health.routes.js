'use strict';

function registerHealthRoutes(app) {
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
