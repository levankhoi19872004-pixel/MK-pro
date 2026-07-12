'use strict';

const { snapshot: createFeatureSnapshot } = require('../config/featureFlags');
const { createFeatureDisabledHandler } = require('../middlewares/featureFlag.middleware');

function freezeRoute(route) {
  return Object.freeze(route);
}

const OPTIONAL_ROUTES = Object.freeze([
  freezeRoute({
    id: 'purchasing',
    prefix: '/api/purchase',
    flagKey: 'purchasing',
    featureName: 'mua hàng',
    modulePath: './purchaseRoutes',
    enabled: (flags) => flags.purchasing === true,
    loadRouter: () => require('./purchaseRoutes')
  }),
  freezeRoute({
    id: 'warehouseAdvanced',
    prefix: '/api/warehouse-advanced',
    flagKey: 'warehouseAdvanced',
    featureName: 'kho nâng cao',
    modulePath: './warehouseAdvancedRoutes',
    enabled: (flags) => flags.warehouseAdvanced === true,
    loadRouter: () => require('./warehouseAdvancedRoutes')
  }),
  freezeRoute({
    id: 'analyticsProjections',
    prefix: '/api/analytics',
    flagKey: 'analyticsProjections',
    featureName: 'projection báo cáo',
    modulePath: './analyticsRoutes',
    enabled: (flags) => flags.analyticsProjections === true,
    loadRouter: () => require('./analyticsRoutes')
  }),
  freezeRoute({
    id: 'fieldOperations',
    prefix: '/api/field-operations',
    flagKey: 'fieldOperations',
    featureName: 'quản lý tuyến bán hàng',
    modulePath: './fieldOperationRoutes',
    enabled: (flags) => flags.fieldOperations === true,
    loadRouter: () => require('./fieldOperationRoutes')
  }),
  freezeRoute({
    id: 'deliveryPlanning',
    prefix: '/api/delivery-planning',
    flagKey: 'deliveryPlanning',
    featureName: 'điều hành tuyến giao hàng',
    modulePath: './deliveryPlanningRoutes',
    enabled: (flags) => flags.deliveryPlanning === true,
    loadRouter: () => require('./deliveryPlanningRoutes')
  }),
  freezeRoute({
    id: 'integrations',
    prefix: '/api/integrations',
    flagKey: 'integrations',
    featureName: 'tích hợp hệ thống ngoài',
    modulePath: './integrationRoutes',
    enabled: (flags) => flags.integrations === true,
    loadRouter: () => require('./integrationRoutes')
  }),
  freezeRoute({
    id: 'multiTenant',
    prefix: '/api/platform',
    flagKey: 'multiTenant',
    featureName: 'nền tảng nhiều doanh nghiệp',
    modulePath: './platformRoutes',
    enabled: (flags) => flags.multiTenant === true,
    loadRouter: () => require('./platformRoutes')
  })
]);

let optionalRouteStartupEvidence = null;

function cloneEvidence(evidence) {
  return JSON.parse(JSON.stringify(evidence));
}

function buildOptionalFeatureSnapshot(featureSnapshot, routes = OPTIONAL_ROUTES) {
  const sourceSnapshot = featureSnapshot || createFeatureSnapshot();
  return Object.fromEntries(routes.map((route) => [
    route.id,
    route.enabled(sourceSnapshot) === true
  ]));
}

function createEvidence(snapshot) {
  return {
    snapshot,
    enabled: [],
    disabled: [],
    mounted: [],
    loadedRouteModules: [],
    registrationDurationMs: 0
  };
}

function registerOptionalApiRoutes({
  app,
  featureSnapshot,
  onEvidence,
  routes = OPTIONAL_ROUTES
} = {}) {
  if (!app || typeof app.use !== 'function') {
    throw new TypeError('registerOptionalApiRoutes requires an Express app');
  }

  const startedAt = process.hrtime.bigint();
  const snapshot = buildOptionalFeatureSnapshot(featureSnapshot, routes);
  const evidence = createEvidence(snapshot);

  try {
    for (const route of routes) {
      if (snapshot[route.id] === true) {
        evidence.enabled.push(route.id);
        const router = route.loadRouter();
        app.use(route.prefix, router);
        evidence.mounted.push(route.id);
        evidence.loadedRouteModules.push(route.modulePath);
      } else {
        evidence.disabled.push(route.id);
        app.use(route.prefix, createFeatureDisabledHandler(route.featureName));
      }
    }
  } catch (error) {
    evidence.failed = {
      message: error.message,
      code: error.code
    };
    evidence.registrationDurationMs = Number((Number(process.hrtime.bigint() - startedAt) / 1e6).toFixed(3));
    optionalRouteStartupEvidence = cloneEvidence(evidence);
    if (typeof onEvidence === 'function') onEvidence(cloneEvidence(evidence));

    throw new Error('Optional route bootstrap failed', { cause: error });
  }

  evidence.registrationDurationMs = Number((Number(process.hrtime.bigint() - startedAt) / 1e6).toFixed(3));
  optionalRouteStartupEvidence = cloneEvidence(evidence);
  if (typeof onEvidence === 'function') onEvidence(cloneEvidence(evidence));
  return cloneEvidence(evidence);
}

function getOptionalRouteStartupEvidence() {
  return optionalRouteStartupEvidence ? cloneEvidence(optionalRouteStartupEvidence) : null;
}

module.exports = {
  OPTIONAL_ROUTES,
  buildOptionalFeatureSnapshot,
  registerOptionalApiRoutes,
  getOptionalRouteStartupEvidence
};
