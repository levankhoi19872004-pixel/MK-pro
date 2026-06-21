'use strict';

const { FLAGS, readBoolean } = require('../../config/featureFlags');

function clampNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function legacyDrainExpiry(env = process.env) {
  const raw = String(env.MOBILE_LEGACY_SYNC_DRAIN_UNTIL || '').trim();
  if (!raw) return '';
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : '';
}

function isLegacyDrainAvailable(env = process.env, now = Date.now()) {
  if (!FLAGS.mobileLegacySyncDrain()) return false;
  const expiry = legacyDrainExpiry(env);
  return !expiry || Date.parse(expiry) > now;
}

function getMobileRuntimeConfig(env = process.env) {
  const offlineQueueEnabled = FLAGS.mobileOfflineSync() && FLAGS.mobileOfflineQueue();
  return {
    onlineFirst: !offlineQueueEnabled,
    offlineQueueEnabled,
    legacySyncDrainEnabled: isLegacyDrainAvailable(env),
    legacySyncDrainUntil: legacyDrainExpiry(env),
    clientTelemetryEnabled: readBoolean('MOBILE_CLIENT_TELEMETRY_ENABLED', true),
    clientTelemetrySampleRate: clampNumber(env.MOBILE_CLIENT_TELEMETRY_SAMPLE_RATE, 1, 0, 1),
    clientTelemetryBatchSize: Math.round(clampNumber(env.MOBILE_CLIENT_TELEMETRY_BATCH_SIZE, 20, 5, 50)),
    clientTelemetryFlushMs: Math.round(clampNumber(env.MOBILE_CLIENT_TELEMETRY_FLUSH_MS, 60000, 10000, 300000)),
    apiTimeoutMs: Math.round(clampNumber(env.MOBILE_API_TIMEOUT_MS, 15000, 3000, 60000)),
    commandTimeoutMs: Math.round(clampNumber(env.MOBILE_COMMAND_TIMEOUT_MS, 30000, 5000, 120000))
  };
}

module.exports = {
  clampNumber,
  legacyDrainExpiry,
  isLegacyDrainAvailable,
  getMobileRuntimeConfig
};
