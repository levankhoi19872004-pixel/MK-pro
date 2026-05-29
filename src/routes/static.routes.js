'use strict';

const path = require('path');

function registerStaticRoutes(app) {
  app.get('/mobile', (req, res) => {
    res.sendFile(path.join(__dirname, '..', '..', 'public', 'mobile', 'login.html'));
  });

  app.get('/mobile/delivery', (req, res) => {
    res.sendFile(path.join(__dirname, '..', '..', 'public', 'mobile', 'delivery.html'));
  });

  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', '..', 'public', 'index.html'));
  });
}

module.exports = { registerStaticRoutes };
