'use strict';

const PREVIEW_DEFAULT_LIMIT = 50;
const PREVIEW_MAX_LIMIT = 200;
const EXPORT_MAX_ROWS = 50000;
const EXPORT_MAX_BYTES = 64 * 1024 * 1024;
const DEFAULT_REPORT_TIMEOUT_MS = 30000;
const DEFAULT_CONCURRENCY = 2;
const MAX_CONCURRENCY = 3;
const MAX_ACTIVE_REQUESTS = Math.max(1, Math.min(Number(process.env.PERF_REPORT_MAX_ACTIVE_REQUESTS || 4), 16));

let activeRequests = 0;

function truthy(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

function dbPaginationEnabled() {
  return truthy(process.env.PERF_REPORT_DB_PAGINATION_V1);
}


function reportPaginationAllowlist() {
  return new Set(String(process.env.PERF_REPORT_DB_PAGINATION_ALLOWLIST || '').split(',').map((v) => v.trim()).filter(Boolean));
}

function isReportPaginationEnabled(reportCode = '') {
  if (!dbPaginationEnabled()) return false;
  const allowlist = reportPaginationAllowlist();
  return allowlist.has(String(reportCode || '').trim());
}

function snapshotEnabled() {
  return truthy(process.env.PERF_REPORT_CENTER_SNAPSHOT_V1);
}

function clampInteger(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), min), max);
}

function normalizePreviewQuery(query = {}) {
  const normalized = { ...query };
  delete normalized.full;
  delete normalized.export;
  delete normalized.__exportAll;
  delete normalized.__exportMaxRows;
  normalized.page = clampInteger(query.page, 1, 1, 1_000_000);
  normalized.limit = clampInteger(query.limit, PREVIEW_DEFAULT_LIMIT, 1, PREVIEW_MAX_LIMIT);
  normalized.__reportPreview = true;
  return normalized;
}

function normalizeExportQuery(query = {}) {
  const normalized = { ...query };
  delete normalized.full;
  delete normalized.export;
  normalized.__exportAll = true;
  normalized.__exportMaxRows = clampInteger(query.__exportMaxRows, EXPORT_MAX_ROWS, 1, EXPORT_MAX_ROWS);
  normalized.__reportExport = true;
  return normalized;
}

function isPreviewQuery(query = {}) {
  return query.__reportPreview === true || (dbPaginationEnabled() && query.__exportAll !== true && query.__reportExport !== true);
}

function timeoutError(name, timeoutMs) {
  const error = new Error(`Báo cáo ${name} vượt thời gian xử lý ${timeoutMs}ms`);
  error.code = 'REPORT_EXECUTION_TIMEOUT';
  error.status = 504;
  error.report = name;
  error.timeoutMs = timeoutMs;
  return error;
}

function abortError(name) {
  const error = new Error(`Báo cáo ${name} đã bị hủy`);
  error.code = 'REPORT_EXECUTION_ABORTED';
  error.status = 499;
  error.report = name;
  return error;
}

async function runWithTimeout(task, options = {}) {
  const name = String(options.name || task.name || 'unknown').trim() || 'unknown';
  const timeoutMs = clampInteger(options.timeoutMs, DEFAULT_REPORT_TIMEOUT_MS, 100, 10 * 60 * 1000);
  const parentSignal = options.signal;
  if (parentSignal?.aborted) throw abortError(name);

  const controller = new AbortController();
  let timeout;
  let abortListener;
  let terminalError = null;
  const executionId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const deadlineAt = new Date(Date.now() + timeoutMs).toISOString();
  const workPromise = Promise.resolve().then(() => task({ signal: controller.signal, maxTimeMS: timeoutMs, executionId, deadlineAt }));
  const triggerPromise = new Promise((resolve) => {
    if (parentSignal) {
      abortListener = () => { terminalError = abortError(name); controller.abort(terminalError); resolve('aborted'); };
      parentSignal.addEventListener('abort', abortListener, { once: true });
    }
    timeout = setTimeout(() => { terminalError = timeoutError(name, timeoutMs); controller.abort(terminalError); resolve('timeout'); }, timeoutMs);
  });
  try {
    const winner = await Promise.race([workPromise.then(() => 'work', () => 'work'), triggerPromise]);
    if (winner === 'work') return await workPromise;
    // Do not release admission while underlying work is still executing. Cooperative tasks abort immediately;
    // Mongo paths must also receive maxTimeMS to guarantee eventual termination.
    try { await workPromise; } catch (_) { /* terminal timeout/abort remains authoritative */ }
    throw terminalError;
  } finally {
    clearTimeout(timeout);
    if (parentSignal && abortListener) parentSignal.removeEventListener('abort', abortListener);
  }
}

async function runBounded(tasks = [], options = {}) {
  const list = Array.isArray(tasks) ? tasks : [];
  const concurrency = clampInteger(options.concurrency, DEFAULT_CONCURRENCY, 1, MAX_CONCURRENCY);
  const allowPartial = options.allowPartial === true;
  const results = new Array(list.length);
  const warnings = [];
  let nextIndex = 0;
  let maxActive = 0;
  let active = 0;

  async function worker() {
    while (true) {
      const index = nextIndex++;
      if (index >= list.length) return;
      const descriptor = list[index] || {};
      const name = String(descriptor.name || `task-${index + 1}`);
      active += 1;
      maxActive = Math.max(maxActive, active);
      try {
        results[index] = await runWithTimeout(
          (context) => descriptor.run(context),
          { name, timeoutMs: descriptor.timeoutMs || options.timeoutMs, signal: options.signal }
        );
      } catch (error) {
        if (!allowPartial) throw error;
        warnings.push({ name, code: error.code || 'REPORT_TASK_FAILED', message: error.message });
        results[index] = null;
      } finally {
        active -= 1;
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, Math.max(1, list.length)) }, () => worker());
  await Promise.all(workers);
  return { results, warnings, maxActive, concurrency };
}

async function withAdmission(operation, options = {}) {
  const limit = clampInteger(options.maxActive, MAX_ACTIVE_REQUESTS, 1, 16);
  if (activeRequests >= limit) {
    const error = new Error('Hệ thống báo cáo đang bận, vui lòng thử lại sau');
    error.code = 'REPORT_ADMISSION_LIMIT_REACHED';
    error.status = 429;
    error.retryAfterSeconds = 2;
    throw error;
  }
  activeRequests += 1;
  try {
    return await operation();
  } finally {
    activeRequests -= 1;
  }
}

function assertExportBudget({ rowCount = 0, estimatedBytes = 0 } = {}) {
  if (Number(rowCount) > EXPORT_MAX_ROWS) {
    const error = new Error(`Export vượt giới hạn ${EXPORT_MAX_ROWS} dòng`);
    error.code = 'REPORT_EXPORT_ROW_LIMIT_EXCEEDED';
    error.status = 413;
    error.limit = EXPORT_MAX_ROWS;
    throw error;
  }
  if (Number(estimatedBytes) > EXPORT_MAX_BYTES) {
    const error = new Error(`Export vượt giới hạn ${EXPORT_MAX_BYTES} byte`);
    error.code = 'REPORT_EXPORT_SIZE_LIMIT_EXCEEDED';
    error.status = 413;
    error.limit = EXPORT_MAX_BYTES;
    throw error;
  }
}

function describe() {
  return {
    preview: { defaultLimit: PREVIEW_DEFAULT_LIMIT, maxLimit: PREVIEW_MAX_LIMIT, pagination: 'repository-first-contract' },
    export: { maxRows: EXPORT_MAX_ROWS, maxBytes: EXPORT_MAX_BYTES, mode: 'background-job' },
    orchestration: { defaultConcurrency: DEFAULT_CONCURRENCY, maxConcurrency: MAX_CONCURRENCY, maxActiveRequests: MAX_ACTIVE_REQUESTS },
    featureFlags: {
      dbPagination: 'PERF_REPORT_DB_PAGINATION_V1',
      dataQualitySnapshot: 'PERF_REPORT_CENTER_SNAPSHOT_V1'
    }
  };
}

module.exports = {
  PREVIEW_DEFAULT_LIMIT,
  PREVIEW_MAX_LIMIT,
  EXPORT_MAX_ROWS,
  EXPORT_MAX_BYTES,
  DEFAULT_REPORT_TIMEOUT_MS,
  DEFAULT_CONCURRENCY,
  MAX_CONCURRENCY,
  dbPaginationEnabled,
  reportPaginationAllowlist,
  isReportPaginationEnabled,
  snapshotEnabled,
  normalizePreviewQuery,
  normalizeExportQuery,
  isPreviewQuery,
  runWithTimeout,
  runBounded,
  withAdmission,
  assertExportBudget,
  describe,
  _testing: {
    resetAdmission() { activeRequests = 0; },
    getActiveRequests() { return activeRequests; }
  }
};
