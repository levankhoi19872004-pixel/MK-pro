'use strict';

const ENV_KEY = 'CANONICAL_DELIVERY_FINANCIAL_READ_V1';
const SHADOW_SAMPLE_RATE_ENV_KEY = 'CANONICAL_DELIVERY_FINANCIAL_SHADOW_SAMPLE_RATE';
const MODES = Object.freeze({ OFF: 'off', SHADOW: 'shadow', ON: 'on' });
const VALID_MODES = new Set(Object.values(MODES));

function normalizeMode(value, options = {}) {
  const raw = String(value == null ? '' : value).trim().toLowerCase();
  if (!raw) return options.defaultMode || MODES.OFF;
  if (VALID_MODES.has(raw)) return raw;
  if (options.strict === true) {
    const error = new Error(`Giá trị ${ENV_KEY} không hợp lệ: ${raw}`);
    error.code = 'CANONICAL_DELIVERY_FINANCIAL_READ_MODE_INVALID';
    throw error;
  }
  return MODES.OFF;
}

function normalizeShadowSampleRate(value, options = {}) {
  if (value == null || String(value).trim() === '') return options.defaultRate ?? 1;
  const rate = Number(value);
  if (Number.isFinite(rate) && rate >= 0 && rate <= 1) return rate;
  if (options.strict === true) {
    const error = new Error(`Giá trị ${SHADOW_SAMPLE_RATE_ENV_KEY} không hợp lệ: ${String(value)}`);
    error.code = 'CANONICAL_DELIVERY_FINANCIAL_SHADOW_SAMPLE_RATE_INVALID';
    throw error;
  }
  // Invalid production configuration must fail closed to no shadow computation.
  return 0;
}

function getCanonicalDeliveryFinancialReadMode(options = {}) {
  const explicit = options.financialReadMode ?? options.mode;
  const value = explicit !== undefined ? explicit : process.env[ENV_KEY];
  return normalizeMode(value, {
    defaultMode: options.defaultMode || MODES.OFF,
    strict: options.strict === true
  });
}

function getShadowSampleRate(options = {}) {
  const explicit = options.shadowSampleRate ?? options.sampleRate;
  const value = explicit !== undefined ? explicit : process.env[SHADOW_SAMPLE_RATE_ENV_KEY];
  return normalizeShadowSampleRate(value, {
    defaultRate: options.defaultShadowSampleRate ?? 1,
    strict: options.strict === true
  });
}

function isCanonicalComputationEnabled(mode) {
  return mode === MODES.SHADOW || mode === MODES.ON;
}

function isCanonicalResponseEnabled(mode) {
  return mode === MODES.ON;
}

function shouldComputeCanonicalRead(mode, options = {}) {
  if (mode === MODES.ON) return true;
  if (mode !== MODES.SHADOW) return false;
  const rate = getShadowSampleRate(options);
  if (rate <= 0) return false;
  if (rate >= 1) return true;
  const random = typeof options.random === 'function' ? options.random : Math.random;
  const sample = Number(random());
  return Number.isFinite(sample) && sample >= 0 && sample < rate;
}

module.exports = {
  ENV_KEY,
  SHADOW_SAMPLE_RATE_ENV_KEY,
  MODES,
  VALID_MODES,
  normalizeMode,
  normalizeShadowSampleRate,
  getCanonicalDeliveryFinancialReadMode,
  getShadowSampleRate,
  isCanonicalComputationEnabled,
  isCanonicalResponseEnabled,
  shouldComputeCanonicalRead
};
