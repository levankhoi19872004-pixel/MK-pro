'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const resolver = require('../src/services/delivery/DeliveryPaymentStateReadService');

const SCHEMA_VERSION = 'canonical-delivery-financial-audit-v1';
const POLICY_VERSION = 'delivery-financial-audit-policy-v1';
const WRITE_FLAGS = new Set(['--apply', '--write', '--fix']);
const EXIT = Object.freeze({ CLEAN: 0, WARNING: 2, BLOCKING: 3, CLI: 64, RUNTIME: 70 });
const SEVERITY_RANK = Object.freeze({ P0: 4, P1: 3, P2: 2, P3: 1 });
const CSV_COLUMNS = Object.freeze([
  'severity','findingCode','orderCode','deliveryDate','paymentVersion','paymentStateSource','returnStateSource',
  'receivableAmount','cashAmount','bankAmount','rewardAmount','offsetAmount','returnAmount','debtRaw','debtAmount',
  'legacyCashAmount','legacyReturnAmount','legacyDebtAmount','differenceAmount'
]);

const FINDING_SEVERITY = Object.freeze({
  LEGACY_WEB_APP_SPLIT_BRAIN: 'P1',
  CANONICAL_VS_LEGACY_PAYMENT_DIFF: 'P1',
  ALLOCATION_STALE: 'P1',
  ALLOCATION_VERSION_MISMATCH: 'P1',
  ALLOCATION_VERSION_UNVERIFIED: 'P2',
  VERSION_NEWER_THAN_ALLOCATION: 'P1',
  DUPLICATE_PAYMENT_IDENTITY: 'P1',
  IDENTITY_AMBIGUOUS: 'P1',
  RETURN_SNAPSHOT_DIFF: 'P1',
  UNKNOWN_RETURN_STATE_INCLUDED: 'P2',
  STORED_DEBT_DIFF: 'P1',
  PAYMENT_AND_FULL_RETURN_OVERHANDLED: 'P1',
  NEGATIVE_INPUT_COMPONENT: 'P1',
  COMPONENT_EXCEEDS_RECEIVABLE: 'P1',
  INVALID_MONEY: 'P1',
  TENANT_UNVERIFIED: 'P1'
});

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}
function text(value) { return String(value == null ? '' : value).trim(); }
function finiteMoney(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : null;
}
function firstMoney(source, fields, fallback = 0) {
  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(source || {}, field)) {
      const value = finiteMoney(source[field]);
      if (value !== null) return value;
    }
  }
  return fallback;
}
function orderCode(order = {}) {
  return text(order.orderCode || order.code || order.salesOrderCode || order.id || order._id);
}
function orderDate(order = {}) {
  const value = order.deliveryDate || order.accountingDate || order.orderDate || order.createdAt || null;
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? text(value) : date.toISOString();
}
function absoluteDiff(a, b) { return Math.abs((finiteMoney(a) || 0) - (finiteMoney(b) || 0)); }
function pickFinancial(state = {}) {
  return {
    receivableAmount: finiteMoney(state.receivableAmount) || 0,
    cashAmount: finiteMoney(state.cashAmount) || 0,
    bankAmount: finiteMoney(state.bankAmount) || 0,
    rewardAmount: finiteMoney(state.rewardAmount) || 0,
    offsetAmount: finiteMoney(state.offsetAmount) || 0,
    returnAmount: finiteMoney(state.returnAmount) || 0,
    debtRaw: finiteMoney(state.debtRaw) || 0,
    debtAmount: finiteMoney(state.debtAmount) || 0
  };
}

function legacyAppProjection(order = {}, canonicalState = {}) {
  const receivableAmount = firstMoney(order, ['receivableAmount','totalReceivable','originalAmount','totalAmount'], canonicalState.receivableAmount || 0);
  const cashAmount = firstMoney(order, ['cashAmount','cashCollected','collectedCash'], 0);
  const bankAmount = firstMoney(order, ['bankAmount','bankCollected','transferAmount'], 0);
  const rewardAmount = firstMoney(order, ['rewardAmount','bonusAmount','displayRewardAmount'], 0);
  const offsetAmount = firstMoney(order, ['offsetAmount','paymentOffsetAmount'], 0);
  const returnAmount = finiteMoney(canonicalState.returnAmount) || 0;
  const debtRaw = receivableAmount - cashAmount - bankAmount - rewardAmount - offsetAmount - returnAmount;
  return { receivableAmount, cashAmount, bankAmount, rewardAmount, offsetAmount, returnAmount, debtRaw, debtAmount: Math.abs(debtRaw) <= 1000 ? 0 : debtRaw };
}

function snapshotReturn(source = {}) {
  return firstMoney(source, ['returnAmount','returnedAmount','totalReturnAmount','returnAdjustmentAmount'], 0);
}

function legacyWebProjection(order = {}, canonicalState = {}) {
  const payment = canonicalState.rawPostedAllocation || canonicalState.postedAllocation || canonicalState.latestVersion || order.deliveryCloseout || order;
  const receivableAmount = firstMoney(payment, ['receivableAmount','originalAmount','totalReceivable','totalAmount'], canonicalState.receivableAmount || 0);
  const cashAmount = firstMoney(payment, ['cashAmount','cashCollected'], firstMoney(order, ['cashAmount','cashCollected'], 0));
  const bankAmount = firstMoney(payment, ['bankAmount','bankCollected','transferAmount'], firstMoney(order, ['bankAmount','bankCollected','transferAmount'], 0));
  const rewardAmount = firstMoney(payment, ['rewardAmount','bonusAmount'], firstMoney(order, ['rewardAmount','bonusAmount'], 0));
  const offsetAmount = firstMoney(payment, ['offsetAmount'], firstMoney(order, ['offsetAmount'], 0));
  const returnAmount = snapshotReturn(payment) || snapshotReturn(order.deliveryCloseout || {}) || snapshotReturn(order);
  const debtRaw = receivableAmount - cashAmount - bankAmount - rewardAmount - offsetAmount - returnAmount;
  return { receivableAmount, cashAmount, bankAmount, rewardAmount, offsetAmount, returnAmount, debtRaw, debtAmount: Math.abs(debtRaw) <= 1000 ? 0 : debtRaw };
}

function finding(code, state, order, extra = {}) {
  const severity = extra.severity || FINDING_SEVERITY[code] || 'P2';
  return {
    severity,
    findingCode: code,
    orderCode: orderCode(order),
    deliveryDate: orderDate(order),
    paymentVersion: state.paymentVersion ?? '',
    paymentStateSource: text(state.paymentStateSource),
    returnStateSource: text(state.returnStateSource),
    receivableAmount: finiteMoney(state.receivableAmount) || 0,
    cashAmount: finiteMoney(state.cashAmount) || 0,
    bankAmount: finiteMoney(state.bankAmount) || 0,
    rewardAmount: finiteMoney(state.rewardAmount) || 0,
    offsetAmount: finiteMoney(state.offsetAmount) || 0,
    returnAmount: finiteMoney(state.returnAmount) || 0,
    debtRaw: finiteMoney(state.debtRaw) || 0,
    debtAmount: finiteMoney(state.debtAmount) || 0,
    legacyCashAmount: finiteMoney(extra.legacyCashAmount) || 0,
    legacyReturnAmount: finiteMoney(extra.legacyReturnAmount) || 0,
    legacyDebtAmount: finiteMoney(extra.legacyDebtAmount) || 0,
    differenceAmount: finiteMoney(extra.differenceAmount) || 0,
    details: extra.details || undefined
  };
}

function classifyOrder(order, state, options = {}) {
  const tolerance = Number.isFinite(Number(options.tolerance)) ? Number(options.tolerance) : 1000;
  const findings = [];
  const canonical = pickFinancial(state);
  const app = legacyAppProjection(order, state);
  const web = legacyWebProjection(order, state);
  const parityFields = ['receivableAmount','cashAmount','bankAmount','rewardAmount','offsetAmount','returnAmount','debtRaw','debtAmount'];
  const webAppDiff = parityFields.reduce((sum, key) => sum + absoluteDiff(web[key], app[key]), 0);
  if (webAppDiff > 0) findings.push(finding('LEGACY_WEB_APP_SPLIT_BRAIN', state, order, {
    legacyCashAmount: app.cashAmount,
    legacyReturnAmount: app.returnAmount,
    legacyDebtAmount: app.debtAmount,
    differenceAmount: webAppDiff,
    details: { web, app }
  }));
  const canonicalLegacyPaymentDiff = ['cashAmount','bankAmount','rewardAmount','offsetAmount'].reduce((sum, key) => sum + absoluteDiff(canonical[key], app[key]), 0);
  if (canonicalLegacyPaymentDiff > 0) findings.push(finding('CANONICAL_VS_LEGACY_PAYMENT_DIFF', state, order, {
    severity: canonicalLegacyPaymentDiff > tolerance ? 'P1' : 'P2',
    legacyCashAmount: app.cashAmount,
    legacyReturnAmount: app.returnAmount,
    legacyDebtAmount: app.debtAmount,
    differenceAmount: canonicalLegacyPaymentDiff
  }));

  const warningCodes = new Set([
    ...(state.diagnostics?.warnings || []),
    ...(state.diagnostics?.codes || []),
    ...(state.diagnostics?.paymentWarnings || []),
    ...(state.diagnostics?.returnWarnings || [])
  ].map((item) => text(item && item.code ? item.code : item)).filter(Boolean));
  if (state.stalePaymentAllocationIgnored || warningCodes.has('ALLOCATION_STALE')) findings.push(finding('ALLOCATION_STALE', state, order));
  if (warningCodes.has('ALLOCATION_VERSION_MISMATCH') || warningCodes.has('ALLOCATION_FUTURE')) findings.push(finding('ALLOCATION_VERSION_MISMATCH', state, order));
  if (warningCodes.has('ALLOCATION_VERSION_UNVERIFIED')) findings.push(finding('ALLOCATION_VERSION_UNVERIFIED', state, order));
  if (warningCodes.has('DUPLICATE_PAYMENT_IDENTITY')) findings.push(finding('DUPLICATE_PAYMENT_IDENTITY', state, order));
  if (warningCodes.has('IDENTITY_AMBIGUOUS')) findings.push(finding('IDENTITY_AMBIGUOUS', state, order));
  if (warningCodes.has('UNKNOWN_RETURN_STATE_INCLUDED')) findings.push(finding('UNKNOWN_RETURN_STATE_INCLUDED', state, order));
  if (warningCodes.has('INVALID_MONEY')) findings.push(finding('INVALID_MONEY', state, order));
  if (warningCodes.has('TENANT_UNVERIFIED')) findings.push(finding('TENANT_UNVERIFIED', state, order));

  const allocationVersion = finiteMoney(state.rawPostedAllocation?.sourceVersion ?? state.rawPostedAllocation?.version);
  const latestVersion = finiteMoney(state.latestCorrectionVersion);
  if (allocationVersion !== null && latestVersion !== null && latestVersion > allocationVersion) findings.push(finding('VERSION_NEWER_THAN_ALLOCATION', state, order, { differenceAmount: latestVersion - allocationVersion }));
  if (allocationVersion === null && state.rawPostedAllocation) findings.push(finding('ALLOCATION_VERSION_UNVERIFIED', state, order));

  const snapshots = [state.rawPostedAllocation, state.latestVersion, order.deliveryCloseout, order].filter(Boolean).map(snapshotReturn);
  const maxSnapshotDiff = snapshots.reduce((max, amount) => Math.max(max, absoluteDiff(amount, canonical.returnAmount)), 0);
  if (maxSnapshotDiff > tolerance) findings.push(finding('RETURN_SNAPSHOT_DIFF', state, order, { differenceAmount: maxSnapshotDiff }));

  const storedDebt = firstMoney(order, ['debtAmount','debt','remainingAmount','currentDebt'], 0);
  const debtDiff = absoluteDiff(storedDebt, canonical.debtAmount);
  if (debtDiff > tolerance) findings.push(finding('STORED_DEBT_DIFF', state, order, { legacyDebtAmount: storedDebt, differenceAmount: debtDiff }));

  const inputs = [
    ['cashAmount', canonical.cashAmount], ['bankAmount', canonical.bankAmount], ['rewardAmount', canonical.rewardAmount],
    ['offsetAmount', canonical.offsetAmount], ['returnAmount', canonical.returnAmount]
  ];
  const negative = inputs.filter(([, value]) => value < 0).map(([name]) => name);
  if (negative.length) findings.push(finding('NEGATIVE_INPUT_COMPONENT', state, order, { details: { fields: negative } }));
  const totalCollected = canonical.cashAmount + canonical.bankAmount + canonical.rewardAmount + canonical.offsetAmount;
  const totalHandled = totalCollected + canonical.returnAmount;
  if (inputs.some(([, value]) => value > canonical.receivableAmount + tolerance) || totalHandled > canonical.receivableAmount + tolerance) {
    findings.push(finding('COMPONENT_EXCEEDS_RECEIVABLE', state, order, { differenceAmount: Math.max(0, totalHandled - canonical.receivableAmount) }));
  }
  const paymentCovers = totalCollected >= Math.max(0, canonical.receivableAmount - tolerance);
  const returnCovers = canonical.returnAmount >= Math.max(0, canonical.receivableAmount - tolerance);
  if ((paymentCovers && returnCovers) || totalHandled > canonical.receivableAmount + tolerance) {
    findings.push(finding('PAYMENT_AND_FULL_RETURN_OVERHANDLED', state, order, { differenceAmount: Math.max(0, totalHandled - canonical.receivableAmount) }));
  }
  return findings;
}

function csvEscape(value) {
  const string = value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
  return /[",\r\n]/.test(string) ? `"${string.replace(/"/g, '""')}"` : string;
}
function toCsv(rows) {
  return `${CSV_COLUMNS.join(',')}\n${rows.map((row) => CSV_COLUMNS.map((key) => csvEscape(row[key])).join(',')).join('\n')}${rows.length ? '\n' : ''}`;
}
function atomicWrite(file, content) {
  const target = path.resolve(file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temp, content);
  fs.renameSync(temp, target);
}
function exitCodeFor(summary) {
  if ((summary.P0 || 0) + (summary.P1 || 0) > 0) return EXIT.BLOCKING;
  if ((summary.P2 || 0) + (summary.P3 || 0) > 0) return EXIT.WARNING;
  return EXIT.CLEAN;
}

async function auditOrders(orders, options = {}) {
  const startedAt = new Date().toISOString();
  const batchSize = Math.max(1, Math.min(Number(options.batchSize) || 200, 500));
  const limit = Math.max(0, Math.min(Number(options.limit) || orders.length, 100000));
  const sampleLimit = Math.max(0, Math.min(Number(options.sampleLimit) ?? 50, 200));
  const selected = orders.slice(0, limit);
  const findings = [];
  const queryCount = { allocations: 0, versions: 0, returns: 0 };
  for (let index = 0; index < selected.length; index += batchSize) {
    const batch = selected.slice(index, index + batchSize);
    const result = await resolver.resolvePaymentStatesForOrders(batch, {
      models: options.models,
      includeReturnState: true,
      maxOrders: Math.max(1000, batchSize),
      maxPaymentCandidates: options.maxPaymentCandidates || 200000,
      maxReturnCandidates: options.maxReturnCandidates || 200000
    });
    queryCount.allocations += batch.length ? 1 : 0;
    queryCount.versions += batch.length ? 1 : 0;
    queryCount.returns += batch.length ? 1 : 0;
    batch.forEach((order, offset) => findings.push(...classifyOrder(order, result.states[offset], options)));
  }
  const summaryByCode = {};
  const summaryBySeverity = {};
  const samples = {};
  for (const item of findings) {
    summaryByCode[item.findingCode] = (summaryByCode[item.findingCode] || 0) + 1;
    summaryBySeverity[item.severity] = (summaryBySeverity[item.severity] || 0) + 1;
    if (!samples[item.findingCode]) samples[item.findingCode] = [];
    if (samples[item.findingCode].length < sampleLimit) samples[item.findingCode].push(item);
  }
  const report = {
    schemaVersion: SCHEMA_VERSION,
    policyVersion: POLICY_VERSION,
    status: 'COMPLETED',
    dryRun: true,
    sourceSha256: options.sourceSha256 || '',
    filters: options.filters || {},
    startedAt,
    finishedAt: new Date().toISOString(),
    ordersScanned: selected.length,
    queryCount,
    summaryByCode,
    summaryBySeverity,
    samples,
    findings: options.includeAllFindings ? findings : undefined,
    performance: options.performance || {},
    writesAttempted: 0,
    redaction: { customerName: 'omitted', phone: 'omitted', address: 'omitted' }
  };
  report.exitCode = exitCodeFor(summaryBySeverity);
  return { report, findings };
}

function parseArgs(argv = process.argv.slice(2)) {
  for (const arg of argv) if (WRITE_FLAGS.has(arg) || /^--(?:apply|write|fix)=/i.test(arg)) {
    const error = new Error(`Write flag is forbidden in dry-run audit: ${arg}`);
    error.code = 'WRITE_FLAG_FORBIDDEN';
    error.exitCode = EXIT.CLI;
    throw error;
  }
  const values = {};
  for (const arg of argv) {
    if (!arg.startsWith('--')) continue;
    const [key, ...rest] = arg.slice(2).split('=');
    values[key] = rest.length ? rest.join('=') : true;
  }
  const batchSize = Number(values['batch-size'] || 200);
  const limit = Number(values.limit || 1000);
  const sampleLimit = Number(values['sample-limit'] || 50);
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 500) throw Object.assign(new Error('batch-size must be 1..500'), { exitCode: EXIT.CLI });
  if (!Number.isInteger(limit) || limit < 1 || limit > 100000) throw Object.assign(new Error('limit must be 1..100000'), { exitCode: EXIT.CLI });
  if (!Number.isInteger(sampleLimit) || sampleLimit < 0 || sampleLimit > 200) throw Object.assign(new Error('sample-limit must be 0..200'), { exitCode: EXIT.CLI });
  if (values['order-code'] && /[.*+?^${}()|[\]\\]/.test(String(values['order-code']))) throw Object.assign(new Error('order-code must be exact, not regex'), { exitCode: EXIT.CLI });
  return {
    from: values.from || '', to: values.to || '', orderCode: values['order-code'] || '', batchSize, limit, sampleLimit,
    json: values.json || '', csv: values.csv || '', explain: values.explain === true || values.explain === 'true',
    includeClean: values['include-clean'] === true || values['include-clean'] === 'true', dryRun: true
  };
}

function buildOrderFilter(options = {}) {
  const filter = {};
  if (options.orderCode) filter.$or = [{ orderCode: options.orderCode }, { code: options.orderCode }, { salesOrderCode: options.orderCode }];
  if (options.from || options.to) {
    const range = {};
    if (options.from) range.$gte = new Date(`${options.from}T00:00:00.000Z`);
    if (options.to) range.$lte = new Date(`${options.to}T23:59:59.999Z`);
    if ((range.$gte && Number.isNaN(range.$gte.getTime())) || (range.$lte && Number.isNaN(range.$lte.getTime()))) throw Object.assign(new Error('Invalid date filter'), { exitCode: EXIT.CLI });
    filter.$orDate = range;
  }
  return filter;
}

async function loadProductionOrders(options) {
  const uri = process.env.CANONICAL_DELIVERY_AUDIT_MONGODB_URI || process.env.MONGODB_URI || process.env.MONGO_URI || '';
  if (!uri) return { status: 'NOT_RUN_ENV_UNAVAILABLE', reason: 'READ_ONLY_MONGODB_URI_NOT_PROVIDED', orders: [], models: null, disconnect: async () => {} };
  const mongoose = require('mongoose');
  const SalesOrder = require('../src/models/SalesOrder');
  const models = {
    DeliveryCloseoutVersion: require('../src/models/DeliveryCloseoutVersion'),
    OrderPaymentAllocation: require('../src/models/OrderPaymentAllocation'),
    ReturnOrder: require('../src/models/ReturnOrder')
  };
  await mongoose.connect(uri, { autoIndex: false, maxPoolSize: 2, serverSelectionTimeoutMS: 10000, readPreference: 'secondaryPreferred', appName: 'mkpro-canonical-delivery-financial-audit' });
  const rawFilter = buildOrderFilter(options);
  const query = {};
  if (rawFilter.$or) query.$or = rawFilter.$or;
  if (rawFilter.$orDate) query.$or = [
    { deliveryDate: rawFilter.$orDate }, { accountingDate: rawFilter.$orDate }, { orderDate: rawFilter.$orDate }, { createdAt: rawFilter.$orDate }
  ];
  const projection = 'id code orderCode salesOrderCode tenantId deliveryDate accountingDate orderDate createdAt totalAmount originalAmount receivableAmount totalReceivable cashAmount cashCollected bankAmount bankCollected transferAmount rewardAmount bonusAmount offsetAmount returnAmount returnedAmount debtAmount debt remainingAmount currentDebt deliveryCloseout status deliveryStatus accountingStatus';
  const orders = await SalesOrder.find(query).select(projection).sort({ _id: 1 }).limit(options.limit).read('secondaryPreferred').lean();
  return { status: 'READY', orders, models, disconnect: () => mongoose.disconnect().catch(() => {}) };
}

function notRunReport(options, reason) {
  return {
    schemaVersion: SCHEMA_VERSION, policyVersion: POLICY_VERSION, status: 'NOT_RUN_ENV_UNAVAILABLE', dryRun: true,
    sourceSha256: '', filters: options, startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(),
    ordersScanned: 0, queryCount: {}, summaryByCode: {}, summaryBySeverity: {}, samples: {}, performance: {}, writesAttempted: 0,
    redaction: { customerName: 'omitted', phone: 'omitted', address: 'omitted' }, reason, exitCode: EXIT.CLEAN
  };
}

async function main(argv = process.argv.slice(2)) {
  let options;
  try { options = parseArgs(argv); } catch (error) {
    console.error(`CANONICAL_DELIVERY_AUDIT_CLI_ERROR: ${error.message}`);
    process.exitCode = error.exitCode || EXIT.CLI;
    return;
  }
  let loaded;
  try {
    loaded = await loadProductionOrders(options);
    if (loaded.status !== 'READY') {
      const report = notRunReport(options, loaded.reason);
      if (options.json) atomicWrite(options.json, `${JSON.stringify(report, null, 2)}\n`);
      if (options.csv) atomicWrite(options.csv, toCsv([]));
      console.log(JSON.stringify(report, null, 2));
      process.exitCode = EXIT.CLEAN;
      return;
    }
    const { report, findings } = await auditOrders(loaded.orders, { ...options, models: loaded.models, filters: options, sourceSha256: process.env.SOURCE_SHA256 || '' });
    if (options.json) atomicWrite(options.json, `${JSON.stringify(report, null, 2)}\n`);
    if (options.csv) atomicWrite(options.csv, toCsv(findings));
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.exitCode;
  } catch (error) {
    console.error(`CANONICAL_DELIVERY_AUDIT_FAILED: ${error.stack || error.message}`);
    process.exitCode = EXIT.RUNTIME;
  } finally {
    if (loaded && loaded.disconnect) await loaded.disconnect();
  }
}

if (require.main === module) main();

module.exports = {
  SCHEMA_VERSION, POLICY_VERSION, EXIT, CSV_COLUMNS, FINDING_SEVERITY,
  parseArgs, buildOrderFilter, legacyAppProjection, legacyWebProjection, classifyOrder,
  auditOrders, toCsv, atomicWrite, exitCodeFor, notRunReport, sha256
};
