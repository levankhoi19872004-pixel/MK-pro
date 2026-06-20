'use strict';

const {
  ConfigurationError,
  readString,
  readBoolean,
  readInteger,
  readEnum,
  readCsv,
  readUrl,
  readMongoUri,
  readBodyLimit,
  readTrustProxy,
  isPlaceholderSecret
} = require('./env');

function buildRuntimeConfig(env = process.env) {
  const issues = [];
  const safe = (variable, reader, fallback) => {
    try {
      return reader();
    } catch (error) {
      issues.push({ variable, message: error.message });
      return fallback;
    }
  };

  const nodeEnv = safe('NODE_ENV', () => readEnum(env, 'NODE_ENV', ['development', 'test', 'staging', 'production'], {
    defaultValue: 'development'
  }), 'development');

  const mongoUri = safe('MONGO_URI', () => readMongoUri(env, 'MONGO_URI'), '');
  const accessSecret = safe('JWT_SECRET', () => readString(env, 'JWT_SECRET', {
    defaultValue: readString(env, 'MOBILE_JWT_SECRET')
  }), '');
  const explicitRefreshSecret = safe('JWT_REFRESH_SECRET', () => readString(env, 'JWT_REFRESH_SECRET', {
    defaultValue: readString(env, 'MOBILE_REFRESH_TOKEN_SECRET')
  }), '');
  const appUrl = safe('APP_URL', () => {
    const fallback = readString(env, 'PUBLIC_APP_ORIGIN', { defaultValue: readString(env, 'APP_ORIGIN') });
    return readUrl({ APP_URL: readString(env, 'APP_URL', { defaultValue: fallback }) }, 'APP_URL');
  }, '');

  const importMaxFileSize = safe('IMPORT_MAX_FILE_SIZE', () => readInteger(env, 'IMPORT_MAX_FILE_SIZE', {
    defaultValue: 10 * 1024 * 1024,
    min: 64 * 1024,
    max: 200 * 1024 * 1024
  }), 10 * 1024 * 1024);
  const importMaxFiles = safe('IMPORT_MAX_FILES', () => readInteger(env, 'IMPORT_MAX_FILES', {
    defaultValue: 2,
    min: 1,
    max: 20
  }), 2);

  const config = {
    app: {
      nodeEnv,
      bindHost: safe('BIND_HOST', () => readString(env, 'BIND_HOST', { defaultValue: '0.0.0.0', maxLength: 255 }), '0.0.0.0'),
      port: safe('PORT', () => readInteger(env, 'PORT', { defaultValue: 3000, min: 1, max: 65535 }), 3000),
      name: safe('APP_NAME', () => readString(env, 'APP_NAME', { defaultValue: 'KHO Minh Khai Pro V45', maxLength: 160 }), 'KHO Minh Khai Pro V45'),
      url: appUrl,
      logLevel: safe('LOG_LEVEL', () => readEnum(env, 'LOG_LEVEL', ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'], {
        defaultValue: 'info'
      }), 'info'),
      gracefulShutdownTimeoutMs: safe('GRACEFUL_SHUTDOWN_TIMEOUT_MS', () => readInteger(env, 'GRACEFUL_SHUTDOWN_TIMEOUT_MS', {
        defaultValue: 15000,
        min: 1000,
        max: 120000
      }), 15000)
    },
    database: {
      mongoUri,
      maxPoolSize: safe('MONGO_MAX_POOL_SIZE', () => readInteger(env, 'MONGO_MAX_POOL_SIZE', { defaultValue: 50, min: 1, max: 500 }), 50),
      minPoolSize: safe('MONGO_MIN_POOL_SIZE', () => readInteger(env, 'MONGO_MIN_POOL_SIZE', { defaultValue: 5, min: 0, max: 100 }), 5),
      serverSelectionTimeoutMs: safe('MONGO_SERVER_SELECTION_TIMEOUT_MS', () => readInteger(env, 'MONGO_SERVER_SELECTION_TIMEOUT_MS', {
        defaultValue: 5000,
        min: 1000,
        max: 120000
      }), 5000),
      socketTimeoutMs: safe('MONGO_SOCKET_TIMEOUT_MS', () => readInteger(env, 'MONGO_SOCKET_TIMEOUT_MS', {
        defaultValue: 45000,
        min: 1000,
        max: 600000
      }), 45000),
      writeConcern: safe('MONGO_WRITE_CONCERN', () => readEnum(env, 'MONGO_WRITE_CONCERN', ['majority', '1'], {
        defaultValue: 'majority',
        lowercase: false
      }), 'majority'),
      debug: safe('MONGOOSE_DEBUG', () => readBoolean(env, 'MONGOOSE_DEBUG', { defaultValue: nodeEnv === 'development' }), nodeEnv === 'development'),
      autoIndex: safe('MONGOOSE_AUTO_INDEX', () => readBoolean(env, 'MONGOOSE_AUTO_INDEX', { defaultValue: false }), false)
    },
    security: {
      accessSecret,
      refreshSecret: explicitRefreshSecret || accessSecret,
      explicitRefreshSecret,
      accessTokenExpiresIn: safe('ACCESS_TOKEN_EXPIRES_IN', () => readString(env, 'ACCESS_TOKEN_EXPIRES_IN', {
        defaultValue: readString(env, 'MOBILE_ACCESS_TOKEN_EXPIRES_IN', { defaultValue: '15m' }),
        pattern: /^\d+[smhd]$/i,
        patternMessage: 'phải có dạng 15m, 12h hoặc 7d'
      }), '15m'),
      refreshTokenExpiresIn: safe('REFRESH_TOKEN_EXPIRES_IN', () => readString(env, 'REFRESH_TOKEN_EXPIRES_IN', {
        defaultValue: readString(env, 'MOBILE_REFRESH_TOKEN_EXPIRES_IN', { defaultValue: '30d' }),
        pattern: /^\d+[smhd]$/i,
        patternMessage: 'phải có dạng 15m, 12h hoặc 30d'
      }), '30d'),
      authRateLimitWindowMs: safe('AUTH_RATE_LIMIT_WINDOW_MS', () => readInteger(env, 'AUTH_RATE_LIMIT_WINDOW_MS', { defaultValue: 15 * 60 * 1000, min: 1000, max: 24 * 60 * 60 * 1000 }), 15 * 60 * 1000),
      authRateLimitMax: safe('AUTH_RATE_LIMIT_MAX', () => readInteger(env, 'AUTH_RATE_LIMIT_MAX', { defaultValue: 20, min: 1, max: 10000 }), 20),
      authRefreshRateLimitMax: safe('AUTH_REFRESH_RATE_LIMIT_MAX', () => readInteger(env, 'AUTH_REFRESH_RATE_LIMIT_MAX', { defaultValue: 60, min: 1, max: 10000 }), 60),
      allowLegacyUntypedTokens: safe('ALLOW_LEGACY_UNTYPED_TOKENS', () => readBoolean(env, 'ALLOW_LEGACY_UNTYPED_TOKENS', { defaultValue: false }), false),
      allowRefreshTokenInBody: safe('ALLOW_REFRESH_TOKEN_IN_BODY', () => readBoolean(env, 'ALLOW_REFRESH_TOKEN_IN_BODY', { defaultValue: false }), false)
    },
    http: {
      corsOrigins: safe('CORS_ORIGIN', () => readCsv(env, 'CORS_ORIGIN'), []),
      corsAllowAll: safe('CORS_ALLOW_ALL', () => readBoolean(env, 'CORS_ALLOW_ALL', { defaultValue: false }), false),
      corsAllowCredentials: safe('CORS_ALLOW_CREDENTIALS', () => readBoolean(env, 'CORS_ALLOW_CREDENTIALS', { defaultValue: false }), false),
      trustProxy: safe('TRUST_PROXY', () => readTrustProxy(env, 'TRUST_PROXY', { defaultValue: 1 }), 1),
      apiRateLimitWindowMs: safe('API_RATE_LIMIT_WINDOW_MS', () => readInteger(env, 'API_RATE_LIMIT_WINDOW_MS', {
        defaultValue: 15 * 60 * 1000,
        min: 1000,
        max: 24 * 60 * 60 * 1000
      }), 15 * 60 * 1000),
      apiRateLimitMax: safe('API_RATE_LIMIT_MAX', () => readInteger(env, 'API_RATE_LIMIT_MAX', { defaultValue: 1200, min: 1, max: 100000 }), 1200),
      cspReportRateLimitWindowMs: safe('CSP_REPORT_RATE_LIMIT_WINDOW_MS', () => readInteger(env, 'CSP_REPORT_RATE_LIMIT_WINDOW_MS', {
        defaultValue: 60 * 1000,
        min: 1000,
        max: 60 * 60 * 1000
      }), 60 * 1000),
      cspReportRateLimitMax: safe('CSP_REPORT_RATE_LIMIT_MAX', () => readInteger(env, 'CSP_REPORT_RATE_LIMIT_MAX', { defaultValue: 120, min: 1, max: 10000 }), 120),
      jsonBodyLimit: safe('JSON_BODY_LIMIT', () => readBodyLimit(env, 'JSON_BODY_LIMIT', { defaultValue: '5mb' }), '5mb'),
      urlencodedBodyLimit: safe('URLENCODED_BODY_LIMIT', () => readBodyLimit(env, 'URLENCODED_BODY_LIMIT', { defaultValue: '1mb' }), '1mb')
    },
    docs: {
      openApiJsonPath: safe('OPENAPI_JSON_PATH', () => readString(env, 'OPENAPI_JSON_PATH', { defaultValue: 'docs/openapi.json', maxLength: 1024 }), 'docs/openapi.json'),
      rateLimitWindowMs: safe('DOCS_RATE_LIMIT_WINDOW_MS', () => readInteger(env, 'DOCS_RATE_LIMIT_WINDOW_MS', { defaultValue: 15 * 60 * 1000, min: 1000, max: 24 * 60 * 60 * 1000 }), 15 * 60 * 1000),
      rateLimitMax: safe('DOCS_RATE_LIMIT_MAX', () => readInteger(env, 'DOCS_RATE_LIMIT_MAX', { defaultValue: 60, min: 1, max: 10000 }), 60),
      public: safe('API_DOCS_PUBLIC', () => readBoolean(env, 'API_DOCS_PUBLIC', { defaultValue: false }), false),
      requireAuth: safe('API_DOCS_REQUIRE_AUTH', () => readBoolean(env, 'API_DOCS_REQUIRE_AUTH', { defaultValue: false }), false)
    },
    startup: {
      dbTimeoutMs: safe('STARTUP_DB_TIMEOUT_MS', () => readInteger(env, 'STARTUP_DB_TIMEOUT_MS', { defaultValue: 30000, min: 1000, max: 600000 }), 30000),
      indexTimeoutMs: safe('STARTUP_INDEX_TIMEOUT_MS', () => readInteger(env, 'STARTUP_INDEX_TIMEOUT_MS', { defaultValue: 180000, min: 1000, max: 1800000 }), 180000),
      backfillTimeoutMs: safe('STARTUP_BACKFILL_TIMEOUT_MS', () => readInteger(env, 'STARTUP_BACKFILL_TIMEOUT_MS', { defaultValue: 180000, min: 1000, max: 1800000 }), 180000),
      importRecoveryTimeoutMs: safe('STARTUP_IMPORT_RECOVERY_TIMEOUT_MS', () => readInteger(env, 'STARTUP_IMPORT_RECOVERY_TIMEOUT_MS', { defaultValue: 60000, min: 1000, max: 600000 }), 60000),
      ensureMongoIndexes: safe('AUTO_ENSURE_MONGO_INDEXES', () => readBoolean(env, 'AUTO_ENSURE_MONGO_INDEXES', { defaultValue: true }), true),
      backfillArLedgers: safe('AUTO_BACKFILL_ARLEDGERS', () => readBoolean(env, 'AUTO_BACKFILL_ARLEDGERS', { defaultValue: false }), false),
      recoverStaleImports: safe('AUTO_RECOVER_STALE_IMPORTS', () => readBoolean(env, 'AUTO_RECOVER_STALE_IMPORTS', { defaultValue: true }), true)
    },
    import: {
      maxFileSize: importMaxFileSize,
      maxFiles: importMaxFiles,
      maxTotalSize: safe('IMPORT_MAX_TOTAL_SIZE', () => readInteger(env, 'IMPORT_MAX_TOTAL_SIZE', {
        defaultValue: importMaxFileSize * importMaxFiles,
        min: importMaxFileSize,
        max: 500 * 1024 * 1024
      }), importMaxFileSize * importMaxFiles),
      maxRows: safe('IMPORT_MAX_ROWS', () => readInteger(env, 'IMPORT_MAX_ROWS', { defaultValue: 10000, min: 1, max: 1000000 }), 10000),
      maxColumns: safe('IMPORT_MAX_COLUMNS', () => readInteger(env, 'IMPORT_MAX_COLUMNS', { defaultValue: 100, min: 1, max: 1000 }), 100),
      maxSheets: safe('IMPORT_MAX_SHEETS', () => readInteger(env, 'IMPORT_MAX_SHEETS', { defaultValue: 5, min: 1, max: 100 }), 5),
      parseTimeoutMs: safe('IMPORT_PARSE_TIMEOUT_MS', () => readInteger(env, 'IMPORT_PARSE_TIMEOUT_MS', { defaultValue: 15000, min: 1000, max: 600000 }), 15000),
      parseMaxOldSpaceMb: safe('IMPORT_PARSE_MAX_OLD_SPACE_MB', () => readInteger(env, 'IMPORT_PARSE_MAX_OLD_SPACE_MB', { defaultValue: 128, min: 64, max: 4096 }), 128),
      jobTimeoutMs: safe('IMPORT_JOB_TIMEOUT_MS', () => readInteger(env, 'IMPORT_JOB_TIMEOUT_MS', { defaultValue: 120000, min: 1000, max: 3600000 }), 120000),
      jobMaxOldSpaceMb: safe('IMPORT_JOB_MAX_OLD_SPACE_MB', () => readInteger(env, 'IMPORT_JOB_MAX_OLD_SPACE_MB', { defaultValue: 256, min: 64, max: 4096 }), 256),
      jobMaxAttempts: safe('IMPORT_JOB_MAX_ATTEMPTS', () => readInteger(env, 'IMPORT_JOB_MAX_ATTEMPTS', { defaultValue: 2, min: 1, max: 10 }), 2),
      commitJobTimeoutMs: safe('IMPORT_COMMIT_JOB_TIMEOUT_MS', () => readInteger(env, 'IMPORT_COMMIT_JOB_TIMEOUT_MS', { defaultValue: 900000, min: 1000, max: 7200000 }), 900000),
      previewMaxConcurrency: safe('IMPORT_PREVIEW_MAX_CONCURRENCY', () => readInteger(env, 'IMPORT_PREVIEW_MAX_CONCURRENCY', { defaultValue: 2, min: 1, max: 32 }), 2),
      previewMaxQueue: safe('IMPORT_PREVIEW_MAX_QUEUE', () => readInteger(env, 'IMPORT_PREVIEW_MAX_QUEUE', { defaultValue: 50, min: 1, max: 10000 }), 50),
      workerLogLimit: safe('IMPORT_WORKER_LOG_LIMIT', () => readInteger(env, 'IMPORT_WORKER_LOG_LIMIT', { defaultValue: 4000, min: 500, max: 100000 }), 4000),
      salesTxChunkSize: safe('SALES_IMPORT_TX_CHUNK_SIZE', () => readInteger(env, 'SALES_IMPORT_TX_CHUNK_SIZE', { defaultValue: 25, min: 1, max: 1000 }), 25),
      sessionRowBatchSize: safe('IMPORT_SESSION_ROW_BATCH_SIZE', () => readInteger(env, 'IMPORT_SESSION_ROW_BATCH_SIZE', { defaultValue: 500, min: 1, max: 10000 }), 500),
      tempDir: safe('IMPORT_TMP_DIR', () => readString(env, 'IMPORT_TMP_DIR', { defaultValue: '', maxLength: 1024 }), '')
    },
    operations: {
      heartbeatIntervalMs: safe('OPERATIONS_HEARTBEAT_INTERVAL_MS', () => readInteger(env, 'OPERATIONS_HEARTBEAT_INTERVAL_MS', { defaultValue: 15000, min: 5000, max: 60000 }), 15000),
      heartbeatStaleMs: safe('OPERATIONS_HEARTBEAT_STALE_MS', () => readInteger(env, 'OPERATIONS_HEARTBEAT_STALE_MS', { defaultValue: 45000, min: 10000, max: 300000 }), 45000),
      heartbeatRetentionMs: safe('OPERATIONS_HEARTBEAT_RETENTION_MS', () => readInteger(env, 'OPERATIONS_HEARTBEAT_RETENTION_MS', { defaultValue: 24 * 60 * 60 * 1000, min: 60 * 60 * 1000, max: 30 * 24 * 60 * 60 * 1000 }), 24 * 60 * 60 * 1000),
      workerShutdownTimeoutMs: safe('WORKER_SHUTDOWN_TIMEOUT_MS', () => readInteger(env, 'WORKER_SHUTDOWN_TIMEOUT_MS', { defaultValue: 30000, min: 1000, max: 300000 }), 30000),
      readinessDependencyTimeoutMs: safe('READINESS_DEPENDENCY_TIMEOUT_MS', () => readInteger(env, 'READINESS_DEPENDENCY_TIMEOUT_MS', { defaultValue: 2000, min: 250, max: 30000 }), 2000)
    },
    worker: {
      backgroundConcurrency: safe('BACKGROUND_JOB_CONCURRENCY', () => readInteger(env, 'BACKGROUND_JOB_CONCURRENCY', { defaultValue: 2, min: 1, max: 64 }), 2),
      backgroundPollMs: safe('BACKGROUND_JOB_POLL_MS', () => readInteger(env, 'BACKGROUND_JOB_POLL_MS', { defaultValue: 1000, min: 250, max: 60000 }), 1000),
      backgroundMaxOldSpaceMb: safe('BACKGROUND_JOB_MAX_OLD_SPACE_MB', () => readInteger(env, 'BACKGROUND_JOB_MAX_OLD_SPACE_MB', { defaultValue: 512, min: 128, max: 8192 }), 512),
      backgroundWorkerId: safe('BACKGROUND_WORKER_ID', () => readString(env, 'BACKGROUND_WORKER_ID', { defaultValue: '', maxLength: 240 }), ''),
      exportJobTimeoutMs: safe('EXPORT_JOB_TIMEOUT_MS', () => readInteger(env, 'EXPORT_JOB_TIMEOUT_MS', { defaultValue: 600000, min: 1000, max: 7200000 }), 600000),
      exportJobMaxAttempts: safe('EXPORT_JOB_MAX_ATTEMPTS', () => readInteger(env, 'EXPORT_JOB_MAX_ATTEMPTS', { defaultValue: 3, min: 1, max: 10 }), 3),
      exportIdempotencyWindowMs: safe('EXPORT_IDEMPOTENCY_WINDOW_MS', () => readInteger(env, 'EXPORT_IDEMPOTENCY_WINDOW_MS', { defaultValue: 300000, min: 60000, max: 86400000 }), 300000),
      reconciliationJobTimeoutMs: safe('RECONCILIATION_JOB_TIMEOUT_MS', () => readInteger(env, 'RECONCILIATION_JOB_TIMEOUT_MS', { defaultValue: 1800000, min: 1000, max: 14400000 }), 1800000),
      reconciliationIdempotencyWindowMs: safe('RECONCILIATION_IDEMPOTENCY_WINDOW_MS', () => readInteger(env, 'RECONCILIATION_IDEMPOTENCY_WINDOW_MS', { defaultValue: 300000, min: 60000, max: 86400000 }), 300000)
    }
  };

  if (config.database.minPoolSize > config.database.maxPoolSize) {
    issues.push({ variable: 'MONGO_MIN_POOL_SIZE', message: 'không được lớn hơn MONGO_MAX_POOL_SIZE' });
  }
  if (config.import.maxTotalSize < config.import.maxFileSize) {
    issues.push({ variable: 'IMPORT_MAX_TOTAL_SIZE', message: 'không được nhỏ hơn IMPORT_MAX_FILE_SIZE' });
  }
  if (config.operations.heartbeatStaleMs <= config.operations.heartbeatIntervalMs) {
    issues.push({ variable: 'OPERATIONS_HEARTBEAT_STALE_MS', message: 'phải lớn hơn OPERATIONS_HEARTBEAT_INTERVAL_MS' });
  }

  Object.defineProperty(config, 'validationIssues', {
    value: Object.freeze(issues.map((issue) => Object.freeze({ ...issue }))),
    enumerable: false
  });
  return Object.freeze(config);
}

function validateCorsOrigin(origin, production) {
  if (origin === '*') return 'không được dùng wildcard *';
  let url;
  try {
    url = new URL(origin);
  } catch (_) {
    return 'phải là URL origin hợp lệ';
  }
  if (!['http:', 'https:'].includes(url.protocol)) return 'chỉ chấp nhận http/https';
  if (production && url.protocol !== 'https:') return 'production bắt buộc dùng https';
  if (production && ['localhost', '127.0.0.1', '0.0.0.0'].includes(url.hostname)) return 'production không được dùng host local';
  if (url.pathname !== '/' || url.search || url.hash) return 'chỉ khai báo origin, không kèm path/query/hash';
  return '';
}

function validateRuntimeConfig(env = process.env, options = {}) {
  const profile = options.profile || 'server';
  const config = buildRuntimeConfig(env);
  const issues = [...config.validationIssues];
  const production = config.app.nodeEnv === 'production';

  if (!config.database.mongoUri) issues.push({ variable: 'MONGO_URI', message: 'bắt buộc cho mọi process truy cập dữ liệu' });

  if (profile === 'server') {
    if (!config.security.accessSecret) issues.push({ variable: 'JWT_SECRET', message: 'bắt buộc cho HTTP server' });
    if (production && !config.security.explicitRefreshSecret) {
      issues.push({ variable: 'JWT_REFRESH_SECRET', message: 'production phải có refresh secret riêng' });
    }
    if (production && !config.app.url) {
      issues.push({ variable: 'APP_URL', message: 'production phải có APP_URL hoặc PUBLIC_APP_ORIGIN hợp lệ' });
    }
    if (production && config.app.url && !config.app.url.startsWith('https://')) {
      issues.push({ variable: 'APP_URL', message: 'production bắt buộc dùng https' });
    }
    if (production && config.http.corsAllowAll) {
      issues.push({ variable: 'CORS_ALLOW_ALL', message: 'production không được bật allow-all' });
    }
    if (production && !config.http.corsOrigins.length) {
      issues.push({ variable: 'CORS_ORIGIN', message: 'production phải có allowlist origin rõ ràng' });
    }
  }

  if (production && profile === 'server') {
    if (config.security.accessSecret.length < 32) issues.push({ variable: 'JWT_SECRET', message: 'production phải có tối thiểu 32 ký tự' });
    if (isPlaceholderSecret(config.security.accessSecret)) issues.push({ variable: 'JWT_SECRET', message: 'không được dùng giá trị mẫu/mặc định trong production' });
    if (config.security.explicitRefreshSecret.length < 32) issues.push({ variable: 'JWT_REFRESH_SECRET', message: 'production phải có tối thiểu 32 ký tự' });
    if (isPlaceholderSecret(config.security.explicitRefreshSecret)) issues.push({ variable: 'JWT_REFRESH_SECRET', message: 'không được dùng giá trị mẫu/mặc định trong production' });
    if (config.security.accessSecret && config.security.explicitRefreshSecret && config.security.accessSecret === config.security.explicitRefreshSecret) {
      issues.push({ variable: 'JWT_REFRESH_SECRET', message: 'phải khác JWT_SECRET trong production' });
    }
  }

  for (const origin of config.http.corsOrigins) {
    const message = validateCorsOrigin(origin, production);
    if (message) issues.push({ variable: 'CORS_ORIGIN', message });
  }
  if (config.http.corsAllowCredentials && config.http.corsOrigins.includes('*')) {
    issues.push({ variable: 'CORS_ORIGIN', message: 'không thể dùng wildcard khi CORS_ALLOW_CREDENTIALS=true' });
  }

  if (issues.length) throw new ConfigurationError(issues);
  return config;
}

function getRuntimeConfig(env = process.env) {
  const config = buildRuntimeConfig(env);
  if (config.validationIssues.length) throw new ConfigurationError(config.validationIssues);
  return config;
}

function publicConfigSummary(config = getRuntimeConfig()) {
  return {
    environment: config.app.nodeEnv,
    bindHost: config.app.bindHost,
    port: config.app.port,
    corsOriginCount: config.http.corsOrigins.length,
    corsAllowAll: config.http.corsAllowAll,
    trustProxy: config.http.trustProxy,
    mongoPool: {
      min: config.database.minPoolSize,
      max: config.database.maxPoolSize
    },
    importLimits: {
      maxFileSize: config.import.maxFileSize,
      maxFiles: config.import.maxFiles,
      maxTotalSize: config.import.maxTotalSize,
      maxRows: config.import.maxRows
    },
    worker: {
      concurrency: config.worker.backgroundConcurrency,
      pollMs: config.worker.backgroundPollMs
    },
    operations: {
      heartbeatIntervalMs: config.operations.heartbeatIntervalMs,
      heartbeatStaleMs: config.operations.heartbeatStaleMs
    }
  };
}

module.exports = {
  buildRuntimeConfig,
  getRuntimeConfig,
  validateRuntimeConfig,
  publicConfigSummary
};
