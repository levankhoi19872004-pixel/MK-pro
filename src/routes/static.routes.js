'use strict';

const path = require('path');
const { renderIndexPage } = require('../services/web/indexPageRenderer');

function registerStaticRoutes(app) {
  app.get('/mobile', (req, res) => {
    res.sendFile(path.join(__dirname, '..', '..', 'public', 'mobile', 'login.html'));
  });

  app.get('/mobile/delivery', (req, res) => {
    res.sendFile(path.join(__dirname, '..', '..', 'public', 'mobile', 'delivery.html'));
  });

  const renderApplication = async (req, res, next) => {
    try {
      const html = await renderIndexPage();
      res.set('Cache-Control', 'no-cache');
      res.type('html').send(html);
    } catch (error) {
      next(error);
    }
  };

  app.get('/', renderApplication);
  app.get('/index.html', renderApplication);
}

module.exports = { registerStaticRoutes };
