'use strict';

const crypto = require('node:crypto');
const ReportExecutionPolicy = require('./ReportExecutionPolicy');
const { buildDataQualityRows, summarizeDataQuality } = require('./DataQualityProjectionBuilder');

const SNAPSHOT_VERSION = 'report-data-quality-v1';
const MAX_SNAPSHOT_ROWS = 5000;
const MAX_SNAPSHOT_BYTES = 8 * 1024 * 1024;
const DEFAULT_STALE_AFTER_MS = 30 * 60 * 1000;

let repositoryOverride = null;
let serviceFactoryOverride = null;

function text(value) { return String(value ?? '').trim(); }
function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).filter((key) => value[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
function sha256(value) { return crypto.createHash('sha256').update(stableJson(value)).digest('hex'); }
function tenantIdOf(user = {}, query = {}) { return text(query.tenantId || user.tenantId || user.tenantCode || 'default') || 'default'; }
function scopeKeyOf(user = {}, query = {}) { return text(query.scopeKey || query.scope || user.scopeKey || 'global') || 'global'; }
function rangeOf(query = {}) { return { dateFrom: text(query.dateFrom), dateTo: text(query.dateTo) }; }
function snapshotId({ tenantId, scopeKey, dateFrom, dateTo }) { return `${SNAPSHOT_VERSION}:${tenantId}:${scopeKey}:${dateFrom}:${dateTo}`; }

function defaultRepository() {
  const Model = require('../../models/ReportDataQualitySnapshot');
  return {
    async findOne(filter) { return Model.findOne(filter).lean(); },
    async upsert(filter, document) {
      return Model.findOneAndUpdate(filter, { $set: document }, { upsert: true, new: true, setDefaultsOnInsert: true }).lean();
    }
  };
}
function repository() { return repositoryOverride || defaultRepository(); }

function defaultServiceFactory() {
  return {
    sales: require('./SalesReportService'),
    inventory: require('./InventoryReportService'),
    delivery: require('./DeliveryReportService'),
    returns: require('./ReturnReportService')
  };
}
function services() { return serviceFactoryOverride ? serviceFactoryOverride() : defaultServiceFactory(); }

function staleAfterMs() {
  const parsed = Number(process.env.PERF_REPORT_SNAPSHOT_STALE_MS || DEFAULT_STALE_AFTER_MS);
  return Number.isFinite(parsed) ? Math.max(60_000, parsed) : DEFAULT_STALE_AFTER_MS;
}

function normalizeSnapshot(row = {}, nowMs = Date.now()) {
  const generatedAtMs = Date.parse(row.generatedAt || row.sourceTimestamp || '');
  const ageMs = Number.isFinite(generatedAtMs) ? Math.max(0, nowMs - generatedAtMs) : Number.POSITIVE_INFINITY;
  const stale = ageMs > staleAfterMs();
  return {
    ...row,
    rows: Array.isArray(row.rows) ? row.rows : [],
    summary: row.summary || {},
    snapshotVersion: row.snapshotVersion || SNAPSHOT_VERSION,
    generatedAt: row.generatedAt || '',
    sourceTimestamp: row.sourceTimestamp || row.generatedAt || '',
    sourceRange: row.sourceRange || { dateFrom: row.dateFrom || '', dateTo: row.dateTo || '' },
    stale,
    staleAgeMs: ageMs,
    staleWarning: stale ? 'Snapshot chất lượng dữ liệu đã quá ngưỡng freshness; cần chạy rebuild.' : ''
  };
}

async function readSnapshot(query = {}, user = {}, options = {}) {
  const range = rangeOf(query);
  const identity = {
    tenantId: tenantIdOf(user, query),
    scopeKey: scopeKeyOf(user, query),
    dateFrom: range.dateFrom,
    dateTo: range.dateTo
  };
  const row = await repository().findOne({ id: snapshotId(identity), status: 'ready' });
  if (!row) {
    const error = new Error('Snapshot chất lượng dữ liệu chưa sẵn sàng cho kỳ đã chọn');
    error.code = 'REPORT_DATA_QUALITY_SNAPSHOT_UNAVAILABLE';
    error.status = 503;
    error.sourceRange = range;
    throw error;
  }
  return normalizeSnapshot(row, options.nowMs);
}

function assertSnapshotBudget(rows) {
  if (rows.length > MAX_SNAPSHOT_ROWS) {
    const error = new Error(`Snapshot vượt giới hạn ${MAX_SNAPSHOT_ROWS} ngoại lệ`);
    error.code = 'REPORT_DATA_QUALITY_SNAPSHOT_ROW_LIMIT';
    error.status = 413;
    throw error;
  }
  const bytes = Buffer.byteLength(JSON.stringify(rows), 'utf8');
  if (bytes > MAX_SNAPSHOT_BYTES) {
    const error = new Error(`Snapshot vượt giới hạn ${MAX_SNAPSHOT_BYTES} byte`);
    error.code = 'REPORT_DATA_QUALITY_SNAPSHOT_SIZE_LIMIT';
    error.status = 413;
    throw error;
  }
  return bytes;
}

async function rebuildSnapshot(query = {}, user = {}, options = {}) {
  const range = rangeOf(query);
  if (!range.dateFrom || !range.dateTo) {
    const error = new Error('Thiếu dateFrom/dateTo để rebuild snapshot');
    error.code = 'REPORT_SNAPSHOT_DATE_RANGE_REQUIRED';
    error.status = 400;
    throw error;
  }
  const reportServices = services();
  const exportQuery = ReportExecutionPolicy.normalizeExportQuery({ ...query, __exportMaxRows: MAX_SNAPSHOT_ROWS * 4 });
  const execution = await ReportExecutionPolicy.runBounded([
    { name: 'sales', run: (ctx) => reportServices.sales.salesReport({ ...exportQuery, __executionContext: ctx }, ctx) },
    { name: 'inventory', run: (ctx) => reportServices.inventory.inventoryMovementReport({ ...exportQuery, __executionContext: ctx }, ctx) },
    { name: 'delivery', run: (ctx) => reportServices.delivery.deliveryTripsReport({ ...exportQuery, __executionContext: ctx }, ctx) },
    { name: 'returns', run: (ctx) => reportServices.returns.returnReport({ ...exportQuery, __executionContext: ctx }, ctx) }
  ], {
    concurrency: Number(process.env.PERF_REPORT_REBUILD_CONCURRENCY || 2),
    timeoutMs: Number(process.env.PERF_REPORT_REBUILD_TIMEOUT_MS || 120000),
    signal: options.signal,
    allowPartial: false
  });
  const [sales, inventory, delivery, returns] = execution.results;
  const rows = buildDataQualityRows({ sales, inventory, delivery, returns });
  const estimatedBytes = assertSnapshotBudget(rows);
  const summary = summarizeDataQuality(rows);
  const generatedAt = options.generatedAt || new Date().toISOString();
  const identity = {
    tenantId: tenantIdOf(user, query),
    scopeKey: scopeKeyOf(user, query),
    dateFrom: range.dateFrom,
    dateTo: range.dateTo
  };
  const document = {
    id: snapshotId(identity),
    ...identity,
    snapshotVersion: SNAPSHOT_VERSION,
    sourceVersion: sha256({ range, summary, rows }),
    sourceTimestamp: generatedAt,
    generatedAt,
    sourceRange: range,
    rows,
    summary,
    sourceCounts: {
      sales: Array.isArray(sales?.sales) ? sales.sales.length : 0,
      inventory: Array.isArray(inventory?.stock) ? inventory.stock.length : 0,
      delivery: Array.isArray(delivery?.delivery) ? delivery.delivery.length : 0,
      returns: Array.isArray(returns?.returns) ? returns.returns.length : 0
    },
    warnings: execution.warnings,
    status: 'ready'
  };
  const applied = options.apply === true;
  if (applied) await repository().upsert({ id: document.id }, document);
  return { applied, estimatedBytes, maxConcurrency: execution.maxActive, document };
}

module.exports = {
  SNAPSHOT_VERSION,
  MAX_SNAPSHOT_ROWS,
  MAX_SNAPSHOT_BYTES,
  readSnapshot,
  rebuildSnapshot,
  normalizeSnapshot,
  snapshotId,
  _testing: {
    setRepository(value) { repositoryOverride = value; },
    setServiceFactory(value) { serviceFactoryOverride = value; },
    reset() { repositoryOverride = null; serviceFactoryOverride = null; }
  }
};
