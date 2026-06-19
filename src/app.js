'use strict';

/**
 * Phase 3.0.1 application entry.
 *
 * Clean Mongo-first Express entry.
 * Legacy fallback is isolated outside this entry and is not loaded by default.
 */

require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const pino = require('pino');
const pinoHttp = require('pino-http');
const mongoose = require('mongoose');

const connectDB = require('./config/db');
const { registerApiRoutes } = require('./routes');
const { registerStaticRoutes } = require('./routes/static.routes');
const { registerHealthRoutes } = require('./routes/health.routes');
const { ensureMongoIndexes } = require('./services/mongoIndexService');
const { ensureArLedgersBackfillFromJournals } = require('./services/arLedgerMigrationService');
const { startReconciliationJob, stopReconciliationJob } = require('./jobs/reconciliationJob');
const importSessionService = require('./services/importSessionService');
const { apiMonitor } = require('./middlewares/apiMonitor.middleware');
const { apiSecurity } = require('./middlewares/apiSecurity.middleware');
const { requireAuth } = require('./middlewares/auth.middleware');
const { securityInputGuard } = require('./middlewares/securityInput.middleware');
const { maintenanceWriteGuard } = require('./middlewares/maintenance.middleware');
const { csrfProtection } = require('./middlewares/csrf.middleware');
const { tenantContext } = require('./middlewares/tenant.middleware');
const { startOutboxJob, stopOutboxJob } = require('./jobs/outboxJob');
const { startIntegrationJob, stopIntegrationJob } = require('./jobs/integrationJob');
const { registerDefaultOutboxHandlers } = require('./services/outbox/registerDefaultHandlers');
const { startReportingProjectionJob, stopReportingProjectionJob } = require('./jobs/reportingProjectionJob');
const startupState = require('./services/startupState');

const PORT = Number(process.env.PORT || 3000);
const BIND_HOST = String(process.env.BIND_HOST || '0.0.0.0').trim() || '0.0.0.0';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  redact: ['req.headers.authorization', 'req.body.password', 'req.body.refreshToken']
});

function inputSanitizer(req, res, next) {
  const sanitizeObject = (value) => {
    if (!value || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(sanitizeObject);
    for (const key of Object.keys(value)) {
      if (typeof value[key] === 'string') {
        value[key] = value[key].replace(/\0/g, '').trim();
      } else if (value[key] && typeof value[key] === 'object') {
        value[key] = sanitizeObject(value[key]);
      }
    }
    return value;
  };

  sanitizeObject(req.body);
  sanitizeObject(req.query);
  sanitizeObject(req.params);
  next();
}

function startupReadinessGuard(req, res, next) {
  if (!startupState.isGateEnabled() || startupState.isReady()) return next();

  const requestPath = String(req.originalUrl || req.url || '').split('?')[0];
  const healthPaths = new Set([
    '/api/health',
    '/api/health/db',
    '/api/health/readiness',
    '/api/system/status',
    '/api/system/health',
    '/api/system/health/db'
  ]);

  if (!requestPath.startsWith('/api') || healthPaths.has(requestPath)) return next();

  const snapshot = startupState.snapshot();
  res.set('Retry-After', '5');
  return res.status(503).json({
    ok: false,
    success: false,
    code: 'APP_STARTING',
    message: 'Hệ thống đang khởi động, vui lòng thử lại sau ít giây',
    startup: {
      phase: snapshot.phase,
      currentStep: snapshot.currentStep,
      startedAt: snapshot.startedAt
    }
  });
}

function responseFormatter(req, res, next) {
  res.success = (data = {}, message = 'OK', statusCode = 200) => res.status(statusCode).json({
    ok: true,
    success: true,
    message,
    data
  });

  res.fail = (message = 'Yêu cầu không hợp lệ', statusCode = 400, extra = {}) => res.status(statusCode).json({
    ok: false,
    success: false,
    message,
    ...extra
  });

  next();
}


function apiPerformanceProbe(req, res, next) {
  return apiMonitor(req, res, next);
}

function createCorsOptions() {
  const origins = String(process.env.CORS_ORIGIN || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const allowAll = process.env.CORS_ALLOW_ALL === 'true';
  return {
    // Without an explicit allowlist, do not emit cross-origin headers.
    // Same-origin web/mobile requests continue to work normally.
    origin: allowAll ? true : (origins.length ? origins : false),
    credentials: process.env.CORS_ALLOW_CREDENTIALS === 'true'
  };
}

function createApiLimiter() {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max: Number(process.env.API_RATE_LIMIT_MAX || 1200),
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      ok: false,
      success: false,
      message: 'Quá nhiều yêu cầu, vui lòng thử lại sau ít phút'
    }
  });
}

function configureTrustProxy(app) {
  const raw = String(process.env.TRUST_PROXY ?? '1').trim().toLowerCase();

  if (raw === 'false' || raw === '0' || raw === 'off') {
    return;
  }

  if (raw === 'true') {
    app.set('trust proxy', true);
    return;
  }

  const hops = Number(raw);
  app.set('trust proxy', Number.isFinite(hops) && hops >= 0 ? hops : 1);
}

function createApp() {
  const app = express();

  configureTrustProxy(app);

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors(createCorsOptions()));
  const requestLogger = pinoHttp({ logger });
  if (process.env.NODE_ENV !== 'test') {
    app.use(requestLogger);
  }
  app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '5mb' }));
  app.use(express.urlencoded({ extended: true, limit: process.env.URLENCODED_BODY_LIMIT || '1mb', parameterLimit: 2000 }));

  // Docs has its own limiter/auth guard inside swaggerRoutes, but this keeps
  // the global API protection behavior for all other endpoints.
  app.use('/api', createApiLimiter());

  app.use(maintenanceWriteGuard);
  app.use(securityInputGuard);
  app.use(inputSanitizer);
  app.use(responseFormatter);
  app.use(startupReadinessGuard);
  app.use(apiPerformanceProbe);

  // GLOBAL_API_SECURITY_BOUNDARY_APPLY_START
  app.use(apiSecurity(requireAuth));
  app.use(csrfProtection);
  app.use('/api', tenantContext);
  // GLOBAL_API_SECURITY_BOUNDARY_APPLY_END

  registerApiRoutes(app);

  // Mobile delivery UI V45: prevent browser/Render cache from showing old HTML.
  app.use('/mobile', (req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    next();
  });

  // Register application HTML before express.static so / and /index.html
  // are assembled from maintainable fragments instead of a monolithic file.
  registerStaticRoutes(app);

  app.use(express.static(path.join(__dirname, '..', 'public'), {
    etag: false,
    lastModified: false,
    setHeaders: (res, filePath) => {
      if (filePath.includes(`${path.sep}public${path.sep}mobile${path.sep}`)) {
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');
      }
    }
  }));

  registerHealthRoutes(app);

  app.use('/api', (req, res) => {
    res.status(404).json({ ok: false, success: false, message: 'API không tồn tại' });
  });

  app.use((err, req, res, next) => {
    req.log?.error({ err }, 'Unhandled application error');
    const status = err.status || err.statusCode || 500;
    return res.status(status).json({
      ok: false,
      success: false,
      message: status >= 500 ? 'Lỗi hệ thống, vui lòng thử lại sau' : (err.message || 'Yêu cầu không hợp lệ'),
      error: process.env.NODE_ENV === 'production' ? undefined : err.message
    });
  });

  return app;
}

const app = createApp();

process.on('unhandledRejection', (reason) => logger.error({ err: reason }, 'Unhandled Promise rejection'));
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception');
  process.exit(1);
});


function installGracefulShutdown(server, options = {}) {
  if (!server || typeof server.close !== 'function') return () => {};
  const timeoutMs = Math.max(1000, Number(options.timeoutMs || process.env.GRACEFUL_SHUTDOWN_TIMEOUT_MS || 15000));
  let shuttingDown = false;

  const shutdown = async (signal = 'SIGTERM') => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Graceful shutdown started');
    stopReconciliationJob();
    stopOutboxJob();
    stopIntegrationJob();
    stopReportingProjectionJob();

    const forceTimer = setTimeout(() => {
      logger.error({ signal, timeoutMs }, 'Graceful shutdown timed out');
      if (options.exit !== false) process.exit(1);
    }, timeoutMs);
    forceTimer.unref?.();

    try {
      await new Promise((resolve) => server.close(resolve));
      if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
      clearTimeout(forceTimer);
      logger.info({ signal }, 'Graceful shutdown completed');
      if (options.exit !== false) process.exit(0);
    } catch (err) {
      clearTimeout(forceTimer);
      logger.error({ err, signal }, 'Graceful shutdown failed');
      if (options.exit !== false) process.exit(1);
    }
  };

  if (options.bindSignals !== false) {
    process.once('SIGTERM', () => shutdown('SIGTERM'));
    process.once('SIGINT', () => shutdown('SIGINT'));
  }

  return shutdown;
}

function startupTimeoutMs(envName, fallbackMs) {
  const value = Number(process.env[envName] || fallbackMs);
  return Number.isFinite(value) && value > 0 ? value : fallbackMs;
}

async function runStartupStep(name, task, timeoutMs) {
  const startedAt = Date.now();
  startupState.markStepStarted(name);
  let timeoutId;

  try {
    const result = await Promise.race([
      Promise.resolve().then(task),
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          const error = new Error(`Startup step "${name}" exceeded ${timeoutMs}ms`);
          error.code = 'STARTUP_STEP_TIMEOUT';
          error.step = name;
          reject(error);
        }, timeoutMs);
      })
    ]);
    startupState.markStepCompleted(name, startedAt);
    return result;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function listenHttpServer() {
  if (!Number.isInteger(PORT) || PORT <= 0 || PORT > 65535) {
    const error = new Error(`PORT không hợp lệ: ${process.env.PORT}`);
    error.code = 'INVALID_PORT';
    return Promise.reject(error);
  }

  return new Promise((resolve, reject) => {
    const server = app.listen(PORT, BIND_HOST);
    const onError = (error) => reject(error);
    server.once('error', onError);
    server.once('listening', () => {
      server.off('error', onError);
      resolve(server);
    });
  });
}

async function closeServerAfterStartupFailure(server) {
  if (!server || !server.listening) return;
  await new Promise((resolve) => server.close(resolve));
}

async function startServer() {
  startupState.begin();
  startupState.markStepStarted('http-listen');
  const listenStartedAt = Date.now();
  let server;

  try {
    server = await listenHttpServer();
    startupState.markStepCompleted('http-listen', listenStartedAt);
  } catch (error) {
    startupState.markFailed(error);
    throw error;
  }

  installGracefulShutdown(server);
  console.log(`✅ HTTP server listening on http://${BIND_HOST}:${PORT}; application bootstrap is starting`);

  try {
    registerDefaultOutboxHandlers();

    await runStartupStep(
      'mongodb-connect',
      () => connectDB(),
      startupTimeoutMs('STARTUP_DB_TIMEOUT_MS', 30000)
    );

    if (process.env.AUTO_ENSURE_MONGO_INDEXES !== 'false') {
      const indexResults = await runStartupStep(
        'mongodb-indexes',
        () => ensureMongoIndexes({ logger }),
        startupTimeoutMs('STARTUP_INDEX_TIMEOUT_MS', 180000)
      );
      console.log(`✅ Mongo indexes ready: ${indexResults.length} indexes checked/created`);
    } else {
      startupState.markStepSkipped('mongodb-indexes', 'AUTO_ENSURE_MONGO_INDEXES=false');
      console.log('⏭️ Bỏ qua tạo/check index Mongo khi khởi động (AUTO_ENSURE_MONGO_INDEXES=false)');
    }

    if (process.env.AUTO_BACKFILL_ARLEDGERS === 'true') {
      const arBackfill = await runStartupStep(
        'ar-ledger-backfill',
        () => ensureArLedgersBackfillFromJournals({ logger }),
        startupTimeoutMs('STARTUP_BACKFILL_TIMEOUT_MS', 180000)
      );
      if (!arBackfill.skipped) console.log(`✅ Backfill arLedgers từ journals: ${arBackfill.inserted || 0} dòng`);
    } else {
      startupState.markStepSkipped('ar-ledger-backfill', 'AUTO_BACKFILL_ARLEDGERS!=true');
    }

    if (process.env.AUTO_RECOVER_STALE_IMPORTS !== 'false') {
      const recoveredImports = await runStartupStep(
        'stale-import-recovery',
        () => importSessionService.recoverStaleImportSessions(),
        startupTimeoutMs('STARTUP_IMPORT_RECOVERY_TIMEOUT_MS', 60000)
      );
      if (recoveredImports.recovered) {
        console.warn(`⚠️ Đã đánh dấu thất bại ${recoveredImports.recovered} import bị gián đoạn`);
      }
    } else {
      startupState.markStepSkipped('stale-import-recovery', 'AUTO_RECOVER_STALE_IMPORTS=false');
    }

    startupState.markStepStarted('background-jobs');
    const jobsStartedAt = Date.now();
    const outboxJob = startOutboxJob();
    if (outboxJob.started) console.log(`✅ Outbox worker enabled: intervalMs=${outboxJob.intervalMs}`);
    const integrationJob = startIntegrationJob();
    if (integrationJob.started) console.log(`✅ Integration worker enabled: intervalMs=${integrationJob.intervalMs}`);
    const reportingProjectionJob = startReportingProjectionJob();
    if (reportingProjectionJob.started) console.log(`✅ Reporting projection job enabled: intervalMs=${reportingProjectionJob.intervalMs}`);

    const reconciliationJob = startReconciliationJob();
    if (reconciliationJob.started) {
      console.log(`✅ Reconciliation job enabled: intervalMs=${reconciliationJob.intervalMs}`);
    }
    startupState.markStepCompleted('background-jobs', jobsStartedAt);

    startupState.markReady();
    console.log(`✅ Application ready on http://${BIND_HOST}:${PORT}`);
    return server;
  } catch (error) {
    startupState.markFailed(error);
    logger.fatal({ err: error, startup: startupState.snapshot() }, 'Application bootstrap failed');
    stopReconciliationJob();
    stopOutboxJob();
    stopIntegrationJob();
    stopReportingProjectionJob();
    await closeServerAfterStartupFailure(server);
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect().catch((disconnectError) => {
        logger.error({ err: disconnectError }, 'Mongo disconnect after startup failure failed');
      });
    }
    throw error;
  }
}

module.exports = {
  app,
  createApp,
  startServer,
  inputSanitizer,
  securityInputGuard,
  maintenanceWriteGuard,
  responseFormatter,
  startupReadinessGuard,
  csrfProtection,
  configureTrustProxy,
  installGracefulShutdown
};
