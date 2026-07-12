'use strict';

const path = require('path');
const { renderIndexPage } = require('../services/web/indexPageRenderer');

const ENTERPRISE_STATIC_PATHS = Object.freeze([
  '/enterprise.html',
  '/css/enterprise.css',
  '/js/enterprise-app.js'
]);

function createEnterpriseStaticDisabledHandler() {
  return function enterpriseStaticDisabledHandler(req, res) {
    res.set('Cache-Control', 'no-store');
    return res.status(404).type('text/plain').send('Not Found');
  };
}

function registerEnterpriseStaticBoundary(app, featureSnapshot = {}) {
  const enabled = featureSnapshot.enterpriseCore === true;
  const evidence = {
    enterpriseCore: enabled,
    blockedPaths: [],
    enabledPaths: enabled ? [...ENTERPRISE_STATIC_PATHS] : []
  };

  if (!enabled) {
    const handler = createEnterpriseStaticDisabledHandler();
    for (const routePath of ENTERPRISE_STATIC_PATHS) {
      app.get(routePath, handler);
      evidence.blockedPaths.push(routePath);
    }
  }

  return evidence;
}

function registerStaticRoutes(app, options = {}) {
  const featureSnapshot = Object.freeze({ ...(options.featureSnapshot || {}) });
  const enterpriseStaticEvidence = registerEnterpriseStaticBoundary(app, featureSnapshot);
  if (typeof options.onEnterpriseStaticEvidence === 'function') {
    options.onEnterpriseStaticEvidence(JSON.parse(JSON.stringify(enterpriseStaticEvidence)));
  }

  app.get('/mobile', (req, res) => {
    res.sendFile(path.join(__dirname, '..', '..', 'public', 'mobile', 'login.html'));
  });

  app.get('/mobile/delivery', (req, res) => {
    res.sendFile(path.join(__dirname, '..', '..', 'public', 'mobile', 'delivery.html'));
  });

  app.get('/mobile/warehouse', (req, res) => {
    res.sendFile(path.join(__dirname, '..', '..', 'public', 'mobile', 'warehouse.html'));
  });

  const renderApplication = async (req, res, next) => {
    try {
      const html = await renderIndexPage({ featureSnapshot });
      res.set('Cache-Control', 'no-cache');
      res.type('html').send(html);
    } catch (error) {
      next(error);
    }
  };

  app.get('/', renderApplication);
  app.get('/index.html', renderApplication);
  return { enterpriseStaticEvidence };
}

module.exports = {
  ENTERPRISE_STATIC_PATHS,
  createEnterpriseStaticDisabledHandler,
  registerEnterpriseStaticBoundary,
  registerStaticRoutes
};
