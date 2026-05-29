'use strict';

function registerHealthRoutes(app) {
  app.get('/api/health/db', (req, res) => {
    const mongoose = require('mongoose');
    const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
    res.json({
      ok: mongoose.connection.readyState === 1,
      state: states[mongoose.connection.readyState] || 'unknown',
      readyState: mongoose.connection.readyState
    });
  });
}

module.exports = { registerHealthRoutes };
