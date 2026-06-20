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
const { cspHeaders, createCspReportHandler } = require('./middlewares/csp.middleware');
const { startOutboxJob, stopOutboxJob } = require('./jobs/outboxJob');
const { startIntegrationJob, stopIntegrationJob } = require('./jobs/integrationJob');
const { registerDefaultOutboxHandlers } = require('./services/outbox/registerDefaultHandlers');
const { startReportingProjectionJob, stopReportingProjectionJob } = require('./jobs/reportingProjectionJob');
const startupState = require('./services/startupState');
const { getRuntimeConfig, validateRuntimeConfig } = require('./config/app.config');
const { logger } = require('./observability/logger');
const { requestContextMiddleware } = require('./observability/requestContext');
const { classifyError } = require('./observability/errorClassification');
const { createHeartbeat } = require('./operations/heartbeatService');
const { internalReleaseSummary } = require('./operations/releaseMetadata');
const { closeMongoForShutdown: closeMongoConnectionForShutdown } = require('./operations/mongoShutdown');

const INITIAL_CONFIG = getRuntimeConfig();
const PORT = INITIAL_CONFIG.app.port;
const BIND_HOST = INITIAL_CONFIG.app.bindHost;
// Kept as a named constant for deployment regression checks; source is centralized.
const TRUST_PROXY = INITIAL_CONFIG.http.trustProxy;

let webHeartbeat = null;
let shutdownRequested = false;

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
    '/api/health/live',
    '/api/health/ready',
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
  const { http } = getRuntimeConfig();
  const origins = http.corsOrigins;
  const CORS_ALLOW_ALL = http.corsAllowAll;
  return {
    // Without an explicit allowlist, do not emit cross-origin headers.
    // Same-origin web/mobile requests continue to work normally.
    origin: CORS_ALLOW_ALL ? true : (origins.length ? origins : false),
    credentials: http.corsAllowCredentials
  };
}

function createApiLimiter() {
  const { http } = getRuntimeConfig();
  return rateLimit({
    windowMs: http.apiRateLimitWindowMs,
    max: http.apiRateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      ok: false,
      success: false,
      message: 'Quá nhiều yêu cầu, vui lòng thử lại sau ít phút'
    }
  });
}

function createCspReportLimiter() {
  const { http } = getRuntimeConfig();
  const CSP_REPORT_RATE_LIMIT_MAX = http.cspReportRateLimitMax;
  return rateLimit({
    windowMs: http.cspReportRateLimitWindowMs,
    max: CSP_REPORT_RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    message: ''
  });
}

function configureTrustProxy(app, configuredValue = TRUST_PROXY) {
  if (configuredValue === false || configuredValue === 0) return;
  app.set('trust proxy', configuredValue);
}

function createApp() {
  const app = express();

  configureTrustProxy(app);
  app.use(requestContextMiddleware);

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cspHeaders);
  app.post('/csp-report',
    createCspReportLimiter(),
    express.json({ type: ['application/csp-report', 'application/reports+json', 'application/json'], limit: '64kb' }),
    createCspReportHandler(logger)
  );
  app.use(cors(createCorsOptions()));
  const requestLogger = pinoHttp({
    logger,
    genReqId: (req) => req.requestId,
    autoLogging: {
      ignore: (req) => String(req.url || '').startsWith('/api/health/')
    },
    customProps: (req) => ({
      userId: req.user?._id || req.user?.id || undefined,
      role: req.user?.role || undefined
    })
  });
  if (INITIAL_CONFIG.app.nodeEnv !== 'test') {
    app.use(requestLogger);
  } else {
    app.use((req, res, next) => {
      req.log = logger.child({ requestId: req.requestId });
      next();
    });
  }
  const { http } = getRuntimeConfig();
  const URLENCODED_BODY_LIMIT = http.urlencodedBodyLimit;
  app.use(express.json({ limit: http.jsonBodyLimit }));
  app.use(express.urlencoded({ extended: true, limit: URLENCODED_BODY_LIMIT, parameterLimit: 2000 }));

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

  // Mobile UI: online-first cache policy. CSP is applied globally by cspHeaders above;
  // mobile pages no longer require an inline script exception.
  app.use('/mobile', (req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
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

  app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
    const status = Number(err.status || err.statusCode || 500);
    const safeStatus = status >= 400 && status < 600 ? status : 500;
    const errorCode = classifyError(err, safeStatus);
    req.log?.error({
      err,
      errorCode,
      requestId: req.requestId,
      route: String(req.originalUrl || req.url || '').split('?')[0],
      method: req.method,
      statusCode: safeStatus
    }, 'Unhandled application error');
    return res.status(safeStatus).json({
      ok: false,
      success: false,
      message: safeStatus >= 500 ? 'Lỗi hệ thống, vui lòng thử lại sau' : (err.message || 'Yêu cầu không hợp lệ'),
      error: getRuntimeConfig().app.nodeEnv === 'production' ? undefined : err.message
    });
  });

  return app;
}

const app = createApp();

function closeMongoForShutdown(timeoutMs, log = logger) {
  return closeMongoConnectionForShutdown(timeoutMs, log, {
    connection: mongoose.connection,
    disconnect: () => mongoose.disconnect()
  });
}

function installGracefulShutdown(server, options = {}) {
  if (!server || typeof server.close !== 'function') return () => Promise.resolve();
  const timeoutMs = Math.max(1000, Number(options.timeoutMs || getRuntimeConfig().app.gracefulShutdownTimeoutMs));
  let shuttingDown = false;
  let shutdownPromise = null;

  const shutdown = async (signal = 'SIGTERM', context = {}) => {
    if (shutdownPromise) return shutdownPromise;
    shuttingDown = true;
    shutdownRequested = true;
    const exitCode = Number.isInteger(context.exitCode) ? context.exitCode : 0;
    const fatalError = context.error instanceof Error ? context.error : null;

    shutdownPromise = (async () => {
      logger[exitCode ? 'fatal' : 'info']({ signal, err: fatalError || undefined }, 'Graceful shutdown started');
      stopReconciliationJob();
      stopOutboxJob();
      stopIntegrationJob();
      stopReportingProjectionJob();

      const forceTimer = setTimeout(() => {
        logger.fatal({ signal, timeoutMs }, 'Graceful shutdown timed out');
        if (options.exit !== false) process.exit(1);
      }, timeoutMs);
      forceTimer.unref?.();

      try {
        if (server.listening) {
          await new Promise((resolve, reject) => {
            server.close((error) => error ? reject(error) : resolve());
          });
        }
        if (webHeartbeat) await webHeartbeat.stop(exitCode ? 'failed' : 'stopped');
        await closeMongoForShutdown(timeoutMs, logger);
        clearTimeout(forceTimer);
        logger.info({ signal, exitCode }, 'Graceful shutdown completed');
        if (options.exit !== false) process.exit(exitCode);
      } catch (err) {
        clearTimeout(forceTimer);
        logger.fatal({ err, signal }, 'Graceful shutdown failed');
        if (options.exit !== false) process.exit(1);
        throw err;
      }
    })();

    return shutdownPromise;
  };

  if (options.bindSignals !== false) {
    process.once('SIGTERM', () => void shutdown('SIGTERM', { exitCode: 0 }));
    process.once('SIGINT', () => void shutdown('SIGINT', { exitCode: 0 }));
    process.once('unhandledRejection', (reason) => {
      const error = reason instanceof Error ? reason : new Error(String(reason));
      void shutdown('unhandledRejection', { exitCode: 1, error });
    });
    process.once('uncaughtException', (error) => {
      void shutdown('uncaughtException', { exitCode: 1, error });
    });
  }

  shutdown.isShuttingDown = () => shuttingDown;
  return shutdown;
}

function startupTimeoutMs(key) {
  const startup = getRuntimeConfig().startup;
  if (!Object.prototype.hasOwnProperty.call(startup, key)) {
    throw new Error(`Startup timeout key không hợp lệ: ${key}`);
  }
  return startup[key];
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
    const error = new Error(`PORT không hợp lệ: ${PORT}`);
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
  shutdownRequested = false;
  const runtimeConfig = validateRuntimeConfig(process.env, { profile: 'server' });
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
  logger.info({ bindHost: BIND_HOST, port: PORT, release: internalReleaseSummary() }, `HTTP server listening on http://${BIND_HOST}:${PORT}; application bootstrap is starting`);

  try {
    registerDefaultOutboxHandlers();

    await runStartupStep(
      'mongodb-connect',
      () => connectDB(),
      startupTimeoutMs('dbTimeoutMs')
    );

    webHeartbeat = createHeartbeat({
      service: 'mk-pro-web',
      role: 'web',
      initialStatus: 'starting',
      logger,
      metadata: { bindHost: BIND_HOST, port: PORT }
    });
    await webHeartbeat.start().catch((error) => {
      logger.warn({ err: error }, 'Web operational heartbeat could not start');
    });

    if (runtimeConfig.startup.ensureMongoIndexes) {
      const indexResults = await runStartupStep(
        'mongodb-indexes',
        () => ensureMongoIndexes({ logger }),
        startupTimeoutMs('indexTimeoutMs')
      );
      console.log(`✅ Mongo indexes ready: ${indexResults.length} indexes checked/created`);
    } else {
      startupState.markStepSkipped('mongodb-indexes', 'AUTO_ENSURE_MONGO_INDEXES=false');
      console.log('⏭️ Bỏ qua tạo/check index Mongo khi khởi động (AUTO_ENSURE_MONGO_INDEXES=false)');
    }

    if (runtimeConfig.startup.backfillArLedgers) {
      const arBackfill = await runStartupStep(
        'ar-ledger-backfill',
        () => ensureArLedgersBackfillFromJournals({ logger }),
        startupTimeoutMs('backfillTimeoutMs')
      );
      if (!arBackfill.skipped) console.log(`✅ Backfill arLedgers từ journals: ${arBackfill.inserted || 0} dòng`);
    } else {
      startupState.markStepSkipped('ar-ledger-backfill', 'AUTO_BACKFILL_ARLEDGERS!=true');
    }

    if (runtimeConfig.startup.recoverStaleImports) {
      const recoveredImports = await runStartupStep(
        'stale-import-recovery',
        () => importSessionService.recoverStaleImportSessions(),
        startupTimeoutMs('importRecoveryTimeoutMs')
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
    await webHeartbeat?.beat({ status: 'ready' }).catch((error) => logger.warn({ err: error }, 'Web ready heartbeat failed'));
    logger.info({ bindHost: BIND_HOST, port: PORT, startup: startupState.snapshot() }, 'Application ready');
    return server;
  } catch (error) {
    if (shutdownRequested) {
      logger.info({ err: error }, 'Application bootstrap cancelled by shutdown');
      return server;
    }
    startupState.markFailed(error);
    await webHeartbeat?.beat({ status: 'failed', metadata: { startupErrorCode: error.code || 'STARTUP_FAILED' } }).catch(() => null);
    logger.fatal({ err: error, startup: startupState.snapshot() }, 'Application bootstrap failed');
    stopReconciliationJob();
    stopOutboxJob();
    stopIntegrationJob();
    stopReportingProjectionJob();
    await closeServerAfterStartupFailure(server);
    if (mongoose.connection.readyState !== 0) {
      await closeMongoForShutdown(getRuntimeConfig().app.gracefulShutdownTimeoutMs, logger);
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
  installGracefulShutdown,
  closeMongoForShutdown
};
