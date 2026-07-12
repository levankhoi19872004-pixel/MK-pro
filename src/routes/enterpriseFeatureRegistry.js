'use strict';

const { snapshot: createFeatureSnapshot } = require('../config/featureFlags');
const { createFeatureDisabledHandler } = require('../middlewares/featureFlag.middleware');

const ENTERPRISE_ROUTE = Object.freeze({
  id: 'enterpriseCore',
  prefix: '/api/enterprise',
  featureName: 'Enterprise',
  modulePath: './enterpriseRoutes',
  enabled: (flags) => flags.enterpriseCore === true,
  loadRouter: () => require('./enterpriseRoutes')
});

let enterpriseRouteStartupEvidence = null;

function cloneEvidence(value) {
  return value ? JSON.parse(JSON.stringify(value)) : value;
}

function buildEnterpriseFeatureSnapshot(featureSnapshot) {
  const source = featureSnapshot || createFeatureSnapshot();
  return Object.freeze({ enterpriseCore: source.enterpriseCore === true });
}

function registerEnterpriseApiRoute({
  app,
  featureSnapshot,
  onEvidence,
  route = ENTERPRISE_ROUTE
} = {}) {
  if (!app || typeof app.use !== 'function') {
    throw new TypeError('registerEnterpriseApiRoute requires an Express app');
  }

  const startedAt = process.hrtime.bigint();
  const snapshot = buildEnterpriseFeatureSnapshot(featureSnapshot);
  const evidence = {
    enterpriseCore: snapshot.enterpriseCore,
    routeModule: route.modulePath,
    prefix: route.prefix,
    loaded: false,
    mounted: false,
    disabledBoundaryMounted: false,
    registrationDurationMs: 0
  };

  try {
    if (route.enabled(snapshot)) {
      const router = route.loadRouter();
      app.use(route.prefix, router);
      evidence.loaded = true;
      evidence.mounted = true;
    } else {
      app.use(route.prefix, createFeatureDisabledHandler(route.featureName));
      evidence.disabledBoundaryMounted = true;
    }
  } catch (error) {
    evidence.failed = { message: error.message, code: error.code };
    evidence.registrationDurationMs = Number((Number(process.hrtime.bigint() - startedAt) / 1e6).toFixed(3));
    enterpriseRouteStartupEvidence = cloneEvidence(evidence);
    if (typeof onEvidence === 'function') onEvidence(cloneEvidence(evidence));
    throw new Error('Enterprise route bootstrap failed', { cause: error });
  }

  evidence.registrationDurationMs = Number((Number(process.hrtime.bigint() - startedAt) / 1e6).toFixed(3));
  enterpriseRouteStartupEvidence = cloneEvidence(evidence);
  if (typeof onEvidence === 'function') onEvidence(cloneEvidence(evidence));
  return cloneEvidence(evidence);
}

function getEnterpriseRouteStartupEvidence() {
  return cloneEvidence(enterpriseRouteStartupEvidence);
}

module.exports = {
  ENTERPRISE_ROUTE,
  buildEnterpriseFeatureSnapshot,
  registerEnterpriseApiRoute,
  getEnterpriseRouteStartupEvidence
};
