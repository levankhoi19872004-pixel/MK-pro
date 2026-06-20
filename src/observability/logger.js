'use strict';

const pino = require('pino');
const { getRuntimeConfig } = require('../config/app.config');
const { readReleaseManifest } = require('../operations/releaseMetadata');
const { safeError, redactValue } = require('./redaction');
const { getRequestContext } = require('./requestContext');

const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers.set-cookie',
  'headers.authorization',
  'headers.cookie',
  'authorization',
  'cookie',
  'password',
  'token',
  'accessToken',
  'refreshToken',
  'mongoUri',
  '*.password',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.mongoUri'
];

function createLogger(options = {}) {
  const config = getRuntimeConfig();
  const release = readReleaseManifest();
  return pino({
    level: options.level || config.app.logLevel,
    base: {
      service: options.service || 'mk-pro-web',
      environment: config.app.nodeEnv,
      version: release.version,
      releaseId: release.releaseId,
      pid: process.pid
    },
    redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
    serializers: {
      err: safeError,
      error: safeError,
      req(req) {
        return {
          id: req?.id,
          method: req?.method,
          url: String(req?.url || '').split('?')[0],
          remoteAddress: req?.remoteAddress
        };
      },
      res(res) {
        return { statusCode: res?.statusCode };
      }
    },
    mixin() {
      const context = getRequestContext();
      return context?.requestId ? { requestId: context.requestId } : {};
    },
    hooks: {
      logMethod(args, method) {
        const sanitized = args.map((arg) => {
          if (arg instanceof Error) return { err: safeError(arg) };
          if (arg && typeof arg === 'object') return redactValue(arg);
          if (typeof arg === 'string') return require('./redaction').redactText(arg);
          return arg;
        });
        return method.apply(this, sanitized);
      }
    }
  });
}

const logger = createLogger();

module.exports = { logger, createLogger, REDACT_PATHS };
