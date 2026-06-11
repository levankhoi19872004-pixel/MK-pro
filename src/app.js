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

const connectDB = require('./config/db');
const { registerApiRoutes } = require('./routes');
const { registerStaticRoutes } = require('./routes/static.routes');
const { registerHealthRoutes } = require('./routes/health.routes');
const { ensureMongoIndexes } = require('./services/mongoIndexService');
const { ensureArLedgersBackfillFromJournals } = require('./services/arLedgerMigrationService');
const { apiMonitor } = require('./middlewares/apiMonitor.middleware');
const { apiSecurity } = require('./middlewares/apiSecurity.middleware');
const { requireAuth } = require('./middlewares/auth.middleware');

const PORT = process.env.PORT || 3000;

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
  app.use(cors({
    origin: process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN.split(',').map((value) => value.trim()).filter(Boolean)
      : true
  }));
  const requestLogger = pinoHttp({ logger });
  if (process.env.NODE_ENV !== 'test') {
    app.use(requestLogger);
  }
  app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Docs has its own limiter/auth guard inside swaggerRoutes, but this keeps
  // the global API protection behavior for all other endpoints.
  app.use('/api', createApiLimiter());

  app.use(inputSanitizer);
  app.use(responseFormatter);
  app.use(apiPerformanceProbe);

  // GLOBAL_API_SECURITY_BOUNDARY_APPLY_START
  app.use(apiSecurity(requireAuth));
  // GLOBAL_API_SECURITY_BOUNDARY_APPLY_END

  registerApiRoutes(app);

  // Mobile delivery UI V45: prevent browser/Render cache from showing old HTML.
  app.use('/mobile', (req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    next();
  });

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

  registerStaticRoutes(app);
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

async function startServer() {
  await connectDB();

  if (process.env.AUTO_ENSURE_MONGO_INDEXES !== 'false') {
    const indexResults = await ensureMongoIndexes({ logger });
    console.log(`✅ Mongo indexes ready: ${indexResults.length} indexes checked/created`);
  } else {
    console.log('⏭️ Bỏ qua tạo/check index Mongo khi khởi động (AUTO_ENSURE_MONGO_INDEXES=false)');
  }

  if (process.env.AUTO_BACKFILL_ARLEDGERS !== 'false') {
    const arBackfill = await ensureArLedgersBackfillFromJournals({ logger });
    if (!arBackfill.skipped) console.log(`✅ Backfill arLedgers từ journals: ${arBackfill.inserted || 0} dòng`);
  }

  return app.listen(PORT, () => {
    console.log(`Server V45 Mongo-only shell đang chạy tại http://localhost:${PORT}`);
  });
}

module.exports = {
  app,
  createApp,
  startServer,
  inputSanitizer,
  responseFormatter,
  configureTrustProxy
};
