'use strict';

const DEFAULT_CONCURRENCY = 1;
const MAX_WITHOUT_RUNTIME_EVIDENCE = 3;
const DEFAULT_TRANSIENT_RETRY_LIMIT = 1;
const MAX_TRANSIENT_RETRY_LIMIT = 2;
const DUPLICATE_KEY_CODES = new Set([11000, 11001]);
const TRANSIENT_TRANSACTION_CODES = new Set([24, 112, 244, 251]);
const TRANSIENT_CODE_NAMES = new Set(['LockTimeout', 'WriteConflict', 'TransientTransactionError', 'NoSuchTransaction']);

function text(value = '') {
  return String(value ?? '').trim();
}

function numberOption(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : fallback;
}

function resolveConcurrency(options = {}) {
  const configured = options.bulkConcurrency
    ?? options.perfBulkConcurrency
    ?? (options.featureFlags && options.featureFlags.PERF_BULK_CONCURRENCY)
    ?? process.env.PERF_BULK_CONCURRENCY;
  const parsed = numberOption(configured, DEFAULT_CONCURRENCY);
  return Math.max(1, Math.min(MAX_WITHOUT_RUNTIME_EVIDENCE, parsed));
}

function resolveRetryLimit(options = {}) {
  const configured = options.bulkTransientRetryLimit
    ?? options.perfBulkTransientRetryLimit
    ?? process.env.PERF_BULK_TRANSIENT_RETRY_LIMIT;
  const parsed = numberOption(configured, DEFAULT_TRANSIENT_RETRY_LIMIT);
  return Math.max(0, Math.min(MAX_TRANSIENT_RETRY_LIMIT, parsed));
}

function errorLabels(error) {
  const labels = new Set(Array.isArray(error && error.errorLabels) ? error.errorLabels.map(text) : []);
  if (error && typeof error.hasErrorLabel === 'function') {
    for (const label of ['TransientTransactionError', 'UnknownTransactionCommitResult']) {
      try {
        if (error.hasErrorLabel(label)) labels.add(label);
      } catch (_) {
        // Error-label probing must never hide the original failure.
      }
    }
  }
  return labels;
}

function isDuplicateKeyError(error) {
  return DUPLICATE_KEY_CODES.has(Number(error && error.code))
    || /duplicate\s+key/i.test(text(error && error.message));
}

function isBusinessOrValidationError(error) {
  const status = Number(error && (error.status || error.statusCode));
  if (status >= 400 && status < 500) return true;
  if (isDuplicateKeyError(error)) return true;
  const identifiers = [error && error.name, error && error.code].map(text);
  return identifiers.some((identifier) => [
    'ValidationError', 'CastError', 'BULK_ADJUSTMENT_ORDER_REQUIRED',
    'BULK_ADJUSTMENT_LIMIT_EXCEEDED', 'NEGATIVE_MONEY', 'DEBT_ZERO_TOLERANCE'
  ].includes(identifier));
}

function isTransientTransactionError(error) {
  if (!error || isBusinessOrValidationError(error)) return false;
  const labels = errorLabels(error);
  // session.withTransaction already owns commit-result retries. Retrying the
  // whole business command on an unknown commit result could double-post.
  if (labels.has('UnknownTransactionCommitResult')) return false;
  if (labels.has('TransientTransactionError')) return true;
  if (TRANSIENT_TRANSACTION_CODES.has(Number(error.code))) return true;
  return TRANSIENT_CODE_NAMES.has(text(error.codeName || error.name));
}

async function runWithBoundedTransientRetry(work, options = {}) {
  if (typeof work !== 'function') throw new TypeError('work must be a function');
  const retryLimit = resolveRetryLimit(options);
  const classifier = typeof options.isTransient === 'function'
    ? options.isTransient
    : isTransientTransactionError;
  let attempt = 0;
  for (;;) {
    try {
      return await work(attempt);
    } catch (error) {
      const retryable = classifier(error) === true;
      if (!retryable || attempt >= retryLimit) {
        if (error && typeof error === 'object') {
          try {
            Object.defineProperty(error, 'perfBulkAttempts', {
              value: attempt + 1,
              enumerable: false,
              configurable: true
            });
          } catch (_) {
            // Frozen error objects must keep their original identity and stack.
          }
        }
        throw error;
      }
      attempt += 1;
      if (typeof options.onRetry === 'function') {
        await options.onRetry({ attempt, retryLimit, error });
      }
    }
  }
}

function normalizeIdentity(value, index) {
  return text(value) || `__input_position_${index}`;
}

async function runBoundedByIdentity(tasks = [], options = {}) {
  if (!Array.isArray(tasks)) throw new TypeError('tasks must be an array');
  const worker = options.worker;
  if (typeof worker !== 'function') throw new TypeError('worker must be a function');
  const identityOf = typeof options.identityOf === 'function'
    ? options.identityOf
    : (task, index) => task && (task.identity || task.canonicalOrderKey || task.orderCode) || index;
  const concurrency = Math.max(1, Math.min(MAX_WITHOUT_RUNTIME_EVIDENCE, numberOption(options.concurrency, DEFAULT_CONCURRENCY)));
  const pending = tasks.map((task, index) => ({ task, index, identity: normalizeIdentity(identityOf(task, index), index) }));
  const results = new Array(tasks.length);
  const activeIdentities = new Set();
  const startsByIdentity = new Map();
  const metrics = {
    configuredConcurrency: concurrency,
    totalTasks: tasks.length,
    completedTasks: 0,
    failedTasks: 0,
    maxActive: 0,
    maxActivePerIdentity: 0,
    identityGroupCount: new Set(pending.map((entry) => entry.identity)).size
  };
  let active = 0;
  let finished = 0;
  let firstError = null;

  if (!tasks.length) return { results, metrics };

  return new Promise((resolve, reject) => {
    const pump = () => {
      if (finished === tasks.length) {
        metrics.completedTasks = finished;
        if (firstError && options.settleErrors !== true) reject(firstError);
        else resolve({ results, metrics });
        return;
      }

      while (active < concurrency) {
        const nextPendingIndex = pending.findIndex((entry) => !activeIdentities.has(entry.identity));
        if (nextPendingIndex < 0) break;
        const entry = pending.splice(nextPendingIndex, 1)[0];
        active += 1;
        activeIdentities.add(entry.identity);
        const identityActive = Number(startsByIdentity.get(entry.identity) || 0) + 1;
        startsByIdentity.set(entry.identity, identityActive);
        metrics.maxActive = Math.max(metrics.maxActive, active);
        metrics.maxActivePerIdentity = Math.max(metrics.maxActivePerIdentity, identityActive);
        if (typeof options.onTaskStart === 'function') {
          options.onTaskStart({ ...entry, active, concurrency });
        }

        Promise.resolve()
          .then(() => worker(entry.task, entry.index, { identity: entry.identity, concurrency }))
          .then((value) => {
            results[entry.index] = value;
          })
          .catch((error) => {
            metrics.failedTasks += 1;
            if (!firstError) firstError = error;
            if (options.settleErrors === true) {
              results[entry.index] = typeof options.errorResult === 'function'
                ? options.errorResult(error, entry.task, entry.index)
                : { status: 'rejected', error };
            }
          })
          .finally(() => {
            active -= 1;
            finished += 1;
            activeIdentities.delete(entry.identity);
            startsByIdentity.set(entry.identity, Math.max(0, Number(startsByIdentity.get(entry.identity) || 1) - 1));
            if (typeof options.onTaskFinish === 'function') {
              options.onTaskFinish({ ...entry, active, concurrency });
            }
            queueMicrotask(pump);
          });
      }
    };

    pump();
  });
}

module.exports = {
  DEFAULT_CONCURRENCY,
  MAX_WITHOUT_RUNTIME_EVIDENCE,
  DEFAULT_TRANSIENT_RETRY_LIMIT,
  MAX_TRANSIENT_RETRY_LIMIT,
  resolveConcurrency,
  resolveRetryLimit,
  isDuplicateKeyError,
  isBusinessOrValidationError,
  isTransientTransactionError,
  runWithBoundedTransientRetry,
  runBoundedByIdentity,
  _internal: { text, numberOption, errorLabels, normalizeIdentity }
};
