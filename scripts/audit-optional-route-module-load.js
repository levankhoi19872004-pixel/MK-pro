'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');

const OPTIONAL_ROUTES = Object.freeze([
  {
    id: 'purchasing',
    envName: 'ENABLE_PURCHASING',
    prefix: '/api/purchase',
    routeFile: 'src/routes/purchaseRoutes.js',
    controllerFile: 'src/controllers/purchaseController.js'
  },
  {
    id: 'warehouseAdvanced',
    envName: 'ENABLE_WAREHOUSE_ADVANCED',
    prefix: '/api/warehouse-advanced',
    routeFile: 'src/routes/warehouseAdvancedRoutes.js',
    controllerFile: 'src/controllers/warehouseController.js'
  },
  {
    id: 'analyticsProjections',
    envName: 'ENABLE_ANALYTICS_PROJECTIONS',
    prefix: '/api/analytics',
    routeFile: 'src/routes/analyticsRoutes.js',
    controllerFile: 'src/controllers/analyticsController.js'
  },
  {
    id: 'fieldOperations',
    envName: 'ENABLE_FIELD_OPERATIONS',
    prefix: '/api/field-operations',
    routeFile: 'src/routes/fieldOperationRoutes.js',
    controllerFile: 'src/controllers/fieldOperationController.js'
  },
  {
    id: 'deliveryPlanning',
    envName: 'ENABLE_DELIVERY_PLANNING',
    prefix: '/api/delivery-planning',
    routeFile: 'src/routes/deliveryPlanningRoutes.js',
    controllerFile: 'src/controllers/deliveryPlanningController.js'
  },
  {
    id: 'integrations',
    envName: 'ENABLE_INTEGRATIONS',
    prefix: '/api/integrations',
    routeFile: 'src/routes/integrationRoutes.js',
    controllerFile: 'src/controllers/integrationController.js'
  },
  {
    id: 'multiTenant',
    envName: 'TENANT_MODE',
    prefix: '/api/platform',
    routeFile: 'src/routes/platformRoutes.js',
    controllerFile: 'src/controllers/platformController.js'
  }
]);

function parseArgs(argv) {
  const args = { output: null };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--output') {
      args.output = argv[index + 1];
      index += 1;
    } else if (arg.startsWith('--output=')) {
      args.output = arg.slice('--output='.length);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function configureDisabledFlags() {
  process.env.NODE_ENV = process.env.NODE_ENV || 'test';
  process.env.ENABLE_PURCHASING = 'false';
  process.env.ENABLE_WAREHOUSE_ADVANCED = 'false';
  process.env.ENABLE_ANALYTICS_PROJECTIONS = 'false';
  process.env.ENABLE_FIELD_OPERATIONS = 'false';
  process.env.ENABLE_DELIVERY_PLANNING = 'false';
  process.env.ENABLE_INTEGRATIONS = 'false';
  process.env.TENANT_MODE = 'single';
}

function listSourceFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      listSourceFiles(fullPath, out);
    } else {
      out.push(fullPath);
    }
  }
  return out;
}

function hashFiles(files) {
  const hash = crypto.createHash('sha256');
  for (const file of files.slice().sort()) {
    const relativePath = path.relative(ROOT, file).replace(/\\/g, '/');
    hash.update(relativePath);
    hash.update('\0');
    hash.update(fs.readFileSync(file));
    hash.update('\0');
  }
  return hash.digest('hex');
}

function createMountRecorder() {
  return {
    mounts: [],
    use(prefix, ...handlers) {
      if (typeof prefix === 'string') {
        this.mounts.push({ prefix, handlerCount: handlers.length });
      } else {
        this.mounts.push({ prefix: null, handlerCount: 1 + handlers.length });
      }
    }
  };
}

function relativePath(file) {
  return path.relative(ROOT, file).replace(/\\/g, '/');
}

function sourceBytes(files) {
  return files.reduce((total, file) => total + fs.statSync(file).size, 0);
}

function runAudit() {
  configureDisabledFlags();

  const sourceFiles = listSourceFiles(ROOT);
  const sourceSha256 = hashFiles(sourceFiles);
  const app = createMountRecorder();

  const startedAt = process.hrtime.bigint();
  const { registerApiRoutes } = require('../src/routes');
  registerApiRoutes(app);
  const registrationDurationMs = Number((Number(process.hrtime.bigint() - startedAt) / 1e6).toFixed(3));

  const loadedModulePaths = Object.keys(require.cache)
    .filter((modulePath) => path.resolve(modulePath).startsWith(ROOT))
    .sort();
  const loadedSet = new Set(loadedModulePaths.map((modulePath) => path.normalize(modulePath)));
  const routeModuleFiles = OPTIONAL_ROUTES.map((route) => path.normalize(path.join(ROOT, route.routeFile)));
  const controllerModuleFiles = OPTIONAL_ROUTES.map((route) => path.normalize(path.join(ROOT, route.controllerFile)));
  const optionalRouteModulesLoaded = routeModuleFiles.filter((file) => loadedSet.has(file));
  const optionalControllerModulesLoaded = controllerModuleFiles.filter((file) => loadedSet.has(file));

  const loadedOptionalFiles = [...optionalRouteModulesLoaded, ...optionalControllerModulesLoaded];
  const { snapshot: featureSnapshotFactory } = require('../src/config/featureFlags');
  const { getOptionalRouteStartupEvidence } = require('../src/routes/optionalRouteRegistry');

  return {
    timestamp: new Date().toISOString(),
    nodeVersion: process.version,
    sourceSha256,
    sourceFileCount: sourceFiles.length,
    featureSnapshot: featureSnapshotFactory(),
    totalLoadedModules: loadedModulePaths.length,
    optionalRouteModulesLoaded: optionalRouteModulesLoaded.map(relativePath),
    optionalControllerModulesLoaded: optionalControllerModulesLoaded.map(relativePath),
    optionalLoadedSourceBytes: sourceBytes(loadedOptionalFiles),
    registrationDurationMs,
    optionalRouteStartupEvidence: getOptionalRouteStartupEvidence(),
    mountedPrefixes: app.mounts.map((mount) => mount.prefix).filter(Boolean),
    loadedModulePaths: loadedModulePaths.map(relativePath)
  };
}

function main() {
  const args = parseArgs(process.argv);
  const audit = runAudit();
  const serialized = `${JSON.stringify(audit, null, 2)}\n`;
  if (args.output) {
    fs.writeFileSync(path.resolve(ROOT, args.output), serialized);
  }
  process.stdout.write(serialized);
}

if (require.main === module) {
  main();
}

module.exports = {
  OPTIONAL_ROUTES,
  runAudit
};
