'use strict';

const SECRET_KEY = /(authorization|cookie|token|secret|password|passwd|mongo(?:db)?_?uri|connectionstring|accountnumber|bankaccount)/i;
const BEARER_PATTERN = /Bearer\s+[A-Za-z0-9._~+\/-]+=*/gi;
const MONGO_URI_PATTERN = /mongodb(?:\+srv)?:\/\/[^\s"']+/gi;
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;

function redactText(value) {
  return String(value ?? '')
    .replace(BEARER_PATTERN, 'Bearer [REDACTED]')
    .replace(MONGO_URI_PATTERN, 'mongodb://[REDACTED]')
    .replace(JWT_PATTERN, '[REDACTED_JWT]');
}

function redactValue(value, options = {}, seen = new WeakSet()) {
  if (value == null) return value;
  if (typeof value === 'string') return redactText(value);
  if (typeof value !== 'object') return value;
  if (value instanceof Error) return safeError(value);
  if (seen.has(value)) return '[Circular]';
  seen.add(value);
  if (Array.isArray(value)) return value.slice(0, options.maxArray || 100).map((item) => redactValue(item, options, seen));
  const result = {};
  for (const [key, child] of Object.entries(value)) {
    result[key] = SECRET_KEY.test(key) ? '[REDACTED]' : redactValue(child, options, seen);
  }
  return result;
}

function safeError(error) {
  if (!error) return error;
  return {
    type: error.name || 'Error',
    code: error.code || undefined,
    message: redactText(error.message || String(error)),
    stack: redactText(error.stack || ''),
    details: redactValue(error.details)
  };
}

module.exports = { SECRET_KEY, redactText, redactValue, safeError };
