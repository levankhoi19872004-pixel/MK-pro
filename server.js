'use strict';

const bootTrace = require('./src/observability/bootTrace');
bootTrace.emit('process_start', {
  nodeVersion: process.version,
  nodeEnv: process.env.NODE_ENV || 'unset'
});
const cancelPrelistenWatchdog = bootTrace.installPrelistenWatchdog();

let logger = null;

try {
  bootTrace.emit('dotenv_load_start');
  require('dotenv').config();
  bootTrace.emit('dotenv_loaded');

  bootTrace.emit('runtime_config_load_start');
  const { validateRuntimeConfig } = require('./src/config/app.config');
  bootTrace.emit('runtime_config_module_loaded');
  validateRuntimeConfig(process.env, { profile: 'server' });
  bootTrace.emit('runtime_config_validated');

  bootTrace.emit('app_module_load_start');
  const { startServer } = require('./src/app');
  bootTrace.emit('app_module_loaded');

  ({ logger } = require('./src/observability/logger'));
  bootTrace.emit('start_server_invoked');

  startServer().then(() => {
    cancelPrelistenWatchdog();
    bootTrace.emit('start_server_resolved');
  }).catch((err) => {
    cancelPrelistenWatchdog();
    bootTrace.emit('start_server_rejected', {
      errorName: err?.name || 'Error',
      errorCode: err?.code || 'STARTUP_FAILED',
      errorMessage: err?.message || 'Startup failed'
    });
    logger?.fatal?.({ err }, 'Không thể khởi động server');
    process.exit(1);
  });
} catch (err) {
  cancelPrelistenWatchdog();
  bootTrace.emit('prelisten_failure', {
    errorName: err?.name || 'Error',
    errorCode: err?.code || 'PRELISTEN_FAILURE',
    errorMessage: err?.message || 'Pre-listen startup failed'
  });
  if (logger?.fatal) logger.fatal({ err }, 'Không thể khởi động server trước khi bind HTTP');
  else console.error(err);
  process.exit(1);
}
