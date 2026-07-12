'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const ENTERPRISE_FILES = Object.freeze({
  route: 'src/routes/enterpriseRoutes.js',
  controller: 'src/controllers/enterpriseController.js',
  service: 'src/services/EnterpriseStatusService.js'
});

function parseArgs(argv) {
  const args = { enabled: false, output: null };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--enabled') {
      args.enabled = String(argv[index + 1] || '').toLowerCase() === 'true';
      index += 1;
    } else if (arg.startsWith('--enabled=')) {
      args.enabled = arg.slice('--enabled='.length).toLowerCase() === 'true';
    } else if (arg === '--output') {
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

function absolute(relativePath) {
  return path.join(ROOT, relativePath);
}

function clearEnterpriseCache() {
  for (const relativePath of Object.values(ENTERPRISE_FILES)) {
    const resolved = require.resolve(absolute(relativePath));
    delete require.cache[resolved];
  }
  for (const relativePath of ['src/routes/index.js', 'src/routes/enterpriseFeatureRegistry.js']) {
    const resolved = require.resolve(absolute(relativePath));
    delete require.cache[resolved];
  }
}

function isCached(relativePath) {
  return Boolean(require.cache[require.resolve(absolute(relativePath))]);
}

function createMountRecorder() {
  return {
    mounts: [],
    use(prefix, ...handlers) {
      this.mounts.push({ prefix: typeof prefix === 'string' ? prefix : null, handlers });
    },
    get(routePath, ...handlers) {
      this.mounts.push({ prefix: routePath, method: 'GET', handlers });
    }
  };
}

function createStaticEvidence(enabled) {
  const app = createMountRecorder();
  const { registerStaticRoutes } = require('../src/routes/static.routes');
  const result = registerStaticRoutes(app, { featureSnapshot: { enterpriseCore: enabled } });
  const paths = ['/enterprise.html', '/css/enterprise.css', '/js/enterprise-app.js'];
  return {
    evidence: result.enterpriseStaticEvidence,
    paths: Object.fromEntries(paths.map((routePath) => {
      const blocked = app.mounts.some((mount) => mount.method === 'GET' && mount.prefix === routePath);
      return [routePath, {
        blocked,
        fileExists: fs.existsSync(path.join(ROOT, 'public', routePath.replace(/^\//, ''))),
        reachable: enabled && !blocked
      }];
    }))
  };
}

async function runAudit(options = {}) {
  process.env.NODE_ENV = 'test';
  process.env.ENABLE_ENTERPRISE_CORE = options.enabled ? 'true' : 'false';
  clearEnterpriseCache();

  const featureSnapshot = Object.freeze({ enterpriseCore: options.enabled === true });
  const app = createMountRecorder();
  const beforeCount = Object.keys(require.cache).length;
  const startedAt = process.hrtime.bigint();
  const { registerApiRoutes } = require('../src/routes');
  let apiEvidence;
  registerApiRoutes(app, {
    featureSnapshot,
    onEnterpriseRouteEvidence: (value) => { apiEvidence = value; }
  });
  const registrationDurationMs = Number((Number(process.hrtime.bigint() - startedAt) / 1e6).toFixed(3));

  const { renderIndexPage, clearIndexPageCache } = require('../src/services/web/indexPageRenderer');
  clearIndexPageCache();
  const html = await renderIndexPage({ featureSnapshot });
  const staticSurface = createStaticEvidence(options.enabled === true);

  return {
    generatedAt: new Date().toISOString(),
    nodeVersion: process.version,
    featureValue: options.enabled ? 'true' : 'false',
    enterpriseEnabled: featureSnapshot.enterpriseCore,
    api: {
      routeLoaded: isCached(ENTERPRISE_FILES.route),
      controllerLoaded: isCached(ENTERPRISE_FILES.controller),
      serviceLoaded: isCached(ENTERPRISE_FILES.service),
      mounted: apiEvidence?.mounted === true,
      disabledBoundaryMounted: apiEvidence?.disabledBoundaryMounted === true,
      evidence: apiEvidence
    },
    static: {
      enterpriseHtmlReachable: staticSurface.paths['/enterprise.html'].reachable,
      enterpriseCssReachable: staticSurface.paths['/css/enterprise.css'].reachable,
      enterpriseJsReachable: staticSurface.paths['/js/enterprise-app.js'].reachable,
      paths: staticSurface.paths
    },
    index: {
      enterpriseLinkCount: (html.match(/href=["']\/enterprise\.html["']/g) || []).length,
      markerCount: (html.match(/ENTERPRISE_CORE_ENTRY_(?:START|END)/g) || []).length
    },
    loadedModuleCountBefore: beforeCount,
    loadedModuleCount: Object.keys(require.cache).length,
    registrationDurationMs
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const result = await runAudit(args);
  const serialized = `${JSON.stringify(result, null, 2)}\n`;
  if (args.output) fs.writeFileSync(path.resolve(ROOT, args.output), serialized);
  process.stdout.write(serialized);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}

module.exports = { ENTERPRISE_FILES, parseArgs, runAudit };
