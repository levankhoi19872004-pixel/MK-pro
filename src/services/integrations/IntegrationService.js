'use strict';

const os = require('node:os');
const IntegrationJob = require('../../models/IntegrationJob');
const dateUtil = require('../../utils/date.util');
const { makeId } = require('../../utils/common.util');
const { tenantIdOf, scopeTenant } = require('../../utils/tenant.util');

function text(value) {
  return String(value || '').trim();
}

function allowedHosts() {
  return new Set(String(process.env.INTEGRATION_ALLOWED_HOSTS || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean));
}

function validateEndpoint(endpoint) {
  let url;
  try {
    url = new URL(endpoint);
  } catch (_) {
    throw Object.assign(new Error('Endpoint tích hợp không hợp lệ'), { status: 400 });
  }
  if (url.protocol !== 'https:' && process.env.ALLOW_INSECURE_INTEGRATION_HTTP !== 'true') {
    throw Object.assign(new Error('Endpoint tích hợp phải dùng HTTPS'), { status: 400 });
  }
  const allowlist = allowedHosts();
  if (!allowlist.size || !allowlist.has(url.hostname.toLowerCase())) {
    throw Object.assign(new Error(`Host tích hợp chưa được cho phép: ${url.hostname}`), {
      status: 403,
      code: 'INTEGRATION_HOST_NOT_ALLOWED'
    });
  }
  return url.toString();
}

function sanitizeHeaders(headers = {}) {
  const allowed = new Set(['content-type', 'authorization', 'x-api-key', 'x-signature']);
  return Object.fromEntries(Object.entries(headers || {})
    .filter(([key]) => allowed.has(String(key).toLowerCase()))
    .map(([key, value]) => [String(key), String(value)]));
}

async function enqueue(input = {}, context = {}) {
  const tenantId = tenantIdOf({ tenantId: context.tenantId });
  const endpoint = validateEndpoint(text(input.endpoint));
  const now = dateUtil.nowIso();
  const document = {
    id: text(input.id || makeId('INT')),
    tenantId,
    provider: text(input.provider || 'webhook'),
    eventType: text(input.eventType || 'generic.event'),
    endpoint,
    method: ['PUT', 'PATCH'].includes(text(input.method).toUpperCase()) ? text(input.method).toUpperCase() : 'POST',
    headers: sanitizeHeaders(input.headers),
    payload: input.payload || {},
    status: 'pending',
    attemptCount: 0,
    maxAttempts: Math.max(1, Math.min(Number(input.maxAttempts || 8), 20)),
    nextRetryAt: input.nextRetryAt || now,
    responseStatus: 0,
    responseBody: '',
    lastError: '',
    externalReference: text(input.externalReference),
    createdAt: now,
    updatedAt: now,
    completedAt: ''
  };
  const created = await IntegrationJob.create([document]);
  return created[0].toObject();
}

function retryDelayMs(attempt) {
  return Math.min(60 * 60 * 1000, 5000 * (2 ** Math.min(Number(attempt || 0), 8)));
}

async function claimNext() {
  const now = dateUtil.nowIso();
  const stale = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  return IntegrationJob.findOneAndUpdate({
    $or: [
      { status: 'pending', nextRetryAt: { $lte: now } },
      { status: 'processing', updatedAt: { $lt: stale } }
    ],
    $expr: { $lt: ['$attemptCount', '$maxAttempts'] }
  }, {
    $set: { status: 'processing', updatedAt: now, workerId: `${os.hostname()}:${process.pid}` },
    $inc: { attemptCount: 1 }
  }, { sort: { nextRetryAt: 1, createdAt: 1 }, new: true }).lean();
}

async function processOne() {
  const job = await claimNext();
  if (!job) return { processed: false };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(1000, Number(process.env.INTEGRATION_TIMEOUT_MS || 15000)));
  try {
    const response = await fetch(validateEndpoint(job.endpoint), {
      method: job.method,
      headers: { 'content-type': 'application/json', ...sanitizeHeaders(job.headers) },
      body: JSON.stringify(job.payload || {}),
      signal: controller.signal
    });
    const body = (await response.text()).slice(0, 10000);
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${body.slice(0, 500)}`);
    await IntegrationJob.updateOne({ id: job.id }, {
      $set: {
        status: 'completed',
        responseStatus: response.status,
        responseBody: body,
        lastError: '',
        completedAt: dateUtil.nowIso(),
        updatedAt: dateUtil.nowIso()
      }
    });
    return { processed: true, id: job.id, status: response.status };
  } catch (error) {
    const exhausted = Number(job.attemptCount || 1) >= Number(job.maxAttempts || 8);
    await IntegrationJob.updateOne({ id: job.id }, {
      $set: {
        status: exhausted ? 'failed' : 'pending',
        nextRetryAt: new Date(Date.now() + retryDelayMs(job.attemptCount)).toISOString(),
        lastError: text(error.message || error).slice(0, 2000),
        updatedAt: dateUtil.nowIso()
      }
    });
    return { processed: false, id: job.id, error: error.message };
  } finally {
    clearTimeout(timeout);
  }
}

async function retry(id, context = {}) {
  const tenantId = tenantIdOf({ tenantId: context.tenantId });
  return IntegrationJob.findOneAndUpdate(scopeTenant({ id: text(id) }, tenantId), {
    $set: { status: 'pending', nextRetryAt: dateUtil.nowIso(), lastError: '', updatedAt: dateUtil.nowIso() }
  }, { new: true }).lean();
}

async function list(query = {}, context = {}) {
  const filter = scopeTenant({}, tenantIdOf({ tenantId: context.tenantId }));
  if (query.status && query.status !== 'all') filter.status = text(query.status);
  if (query.provider) filter.provider = text(query.provider);
  return IntegrationJob.find(filter).sort({ createdAt: -1 }).limit(Math.min(Number(query.limit || 200), 1000)).lean();
}

module.exports = { enqueue, processOne, retry, list, validateEndpoint, sanitizeHeaders, retryDelayMs };
