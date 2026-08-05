'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const canonicalConfig = require('../src/config/canonicalDeliveryFinancialRead.config');
const sharedResolver = require('../src/services/delivery/DeliveryPaymentStateReadService');
const { DeliveryEngine } = require('../src/engines/delivery.legacy.engine');

const ROOT = path.resolve(__dirname, '..');

function chain(rows, counters, key) {
  return {
    select() { return this; },
    sort() { return this; },
    session() { return this; },
    async lean() {
      counters[key] = (counters[key] || 0) + 1;
      return rows;
    }
  };
}

function readModel(rows, counters, key) {
  return {
    find() { return chain(rows, counters, key); },
    create() { counters.writes += 1; throw new Error('READ_MODEL_WRITE_FORBIDDEN'); },
    updateOne() { counters.writes += 1; throw new Error('READ_MODEL_WRITE_FORBIDDEN'); },
    updateMany() { counters.writes += 1; throw new Error('READ_MODEL_WRITE_FORBIDDEN'); },
    bulkWrite() { counters.writes += 1; throw new Error('READ_MODEL_WRITE_FORBIDDEN'); }
  };
}

function fixture() {
  const currentOrder = {
    _id: 'SO-FLAG-1',
    id: 'SO-FLAG-1',
    orderId: 'SO-FLAG-1',
    salesOrderId: 'SO-FLAG-1',
    code: 'B-FLAG-1',
    orderCode: 'B-FLAG-1',
    salesOrderCode: 'B-FLAG-1',
    tenantId: 'TENANT-A',
    customerCode: 'C-FLAG-1',
    customerName: 'Must not enter shadow telemetry',
    customerPhone: '0900000000',
    address: 'Must be redacted',
    status: 'delivered',
    deliveryStatus: 'delivered',
    totalAmount: 10000,
    cashAmount: 0,
    cashCollected: 0,
    bankAmount: 0,
    rewardAmount: 0,
    offsetAmount: 0,
    items: [{ productCode: 'SKU-1', productName: 'SKU 1', quantity: 1, salePrice: 10000 }]
  };
  const versions = [{
    _id: 'V-FLAG-1',
    id: 'V-FLAG-1',
    orderId: currentOrder.id,
    orderCode: currentOrder.orderCode,
    tenantId: 'TENANT-A',
    closeoutVersion: 1,
    status: 'accounting_confirmed',
    originalAmount: 10000,
    cashAmount: 1000,
    bankAmount: 0,
    rewardAmount: 0,
    offsetAmount: 0
  }];
  const allocations = [{
    _id: 'OPA-FLAG-1',
    id: 'OPA-FLAG-1',
    allocationCode: 'OPA-FLAG-1',
    orderId: currentOrder.id,
    orderCode: currentOrder.orderCode,
    tenantId: 'TENANT-A',
    sourceVersion: 1,
    status: 'posted',
    active: true,
    receivableAmount: 10000,
    cashAmount: 4000,
    bankAmount: 0,
    rewardAmount: 0,
    offsetAmount: 0
  }];
  const returns = [{
    _id: 'RO-FLAG-1',
    id: 'RO-FLAG-1',
    code: 'RO-FLAG-1',
    orderId: currentOrder.id,
    orderCode: currentOrder.orderCode,
    tenantId: 'TENANT-A',
    status: 'waiting_receive',
    returnAmount: 1000,
    totalAmount: 1000,
    items: [{ productCode: 'SKU-1', productName: 'SKU 1', returnQty: 1, price: 1000 }]
  }];
  return { currentOrder, versions, allocations, returns };
}

function createHarness() {
  const data = fixture();
  const counters = { writes: 0, resolverCalls: 0 };
  const instrumentedResolver = {
    ...sharedResolver,
    async resolvePaymentStatesForOrders(...args) {
      counters.resolverCalls += 1;
      return sharedResolver.resolvePaymentStatesForOrders(...args);
    }
  };
  const engine = new DeliveryEngine({
    SalesOrder: {},
    ReturnOrder: readModel(data.returns, counters, 'returnQueries'),
    OrderPaymentAllocation: readModel(data.allocations, counters, 'allocationQueries'),
    DeliveryCloseoutVersion: readModel(data.versions, counters, 'versionQueries'),
    DeliveryPaymentStateReadService: instrumentedResolver
  });
  engine.findOrders = async () => [data.currentOrder];
  engine.findReturnOrdersFor = async () => data.returns;
  return { engine, data, counters };
}

function financial(row) {
  return {
    cashAmount: row.cashAmount,
    returnAmount: row.returnAmount,
    debtRaw: row.debtRaw,
    debtAmount: row.debtAmount,
    remainingAmount: row.remainingAmount,
    cashCollected: row.cashCollected
  };
}

test('FLAG-001: off keeps legacy output', async () => {
  const { engine, counters } = createHarness();
  const result = await engine.listOrders({ includeCompleted: true }, { financialReadMode: 'off' });
  assert.equal(result.financialReadMode, 'off');
  assert.equal(result.shadowSampled, null);
  assert.equal(result.rows[0].cashAmount, 0);
  assert.equal(result.rows[0].returnAmount, 0, 'off must preserve the current legacy projection');
  assert.equal(counters.resolverCalls, 0);
});

test('FLAG-002: shadow computes canonical read-only and returns legacy output', async () => {
  const { engine, counters } = createHarness();
  const result = await engine.listOrders({ includeCompleted: true }, {
    financialReadMode: 'shadow',
    shadowSampleRate: 1,
    random: () => 0
  });
  assert.equal(result.financialReadMode, 'shadow');
  assert.equal(result.shadowSampled, true);
  assert.equal(result.rows[0].cashAmount, 0, 'shadow must preserve legacy response');
  assert.equal(counters.resolverCalls, 1, 'shadow must compute canonical state');
  assert.equal(counters.writes, 0);
  assert.equal(result.shadowDiffSummary.mismatchedOrderCount, 1);
});

test('FLAG-003: on returns canonical output plus aliases', async () => {
  const { engine, counters } = createHarness();
  const result = await engine.listOrders({ includeCompleted: true }, { financialReadMode: 'on' });
  const row = result.rows[0];
  assert.equal(result.financialReadMode, 'on');
  assert.equal(result.shadowSampled, null);
  assert.equal(row.cashAmount, 4000);
  assert.equal(row.cashCollected, 4000);
  assert.equal(row.returnAmount, 1000);
  assert.equal(row.returnedAmount, 1000);
  assert.equal(row.debtRaw, 5000);
  assert.equal(row.debtAmount, 5000);
  assert.equal(row.remainingAmount, 5000);
  assert.equal(row.financial.cashAmount, 4000);
  assert.equal(counters.resolverCalls, 1);
  assert.deepStrictEqual(
    { allocations: counters.allocationQueries, versions: counters.versionQueries, returns: counters.returnQueries },
    { allocations: 1, versions: 1, returns: 1 },
    'canonical app list must use exactly three batch joins and no duplicate return query'
  );
});

test('FLAG-004: invalid production flag fails closed to off', () => {
  assert.equal(canonicalConfig.normalizeMode('unexpected'), 'off');
  assert.throws(
    () => canonicalConfig.normalizeMode('unexpected', { strict: true }),
    (error) => error && error.code === 'CANONICAL_DELIVERY_FINANCIAL_READ_MODE_INVALID'
  );
  assert.equal(canonicalConfig.normalizeShadowSampleRate('invalid'), 0);
  assert.throws(
    () => canonicalConfig.normalizeShadowSampleRate('invalid', { strict: true }),
    (error) => error && error.code === 'CANONICAL_DELIVERY_FINANCIAL_SHADOW_SAMPLE_RATE_INVALID'
  );
});

test('FLAG-005: both routes use one shared mode config', () => {
  const appRoute = fs.readFileSync(path.join(ROOT, 'src/routes/deliveryRoutes.js'), 'utf8');
  const webRoute = fs.readFileSync(path.join(ROOT, 'src/routes/newOperationsRoutes.js'), 'utf8');
  for (const source of [appRoute, webRoute]) {
    assert.match(source, /canonicalDeliveryFinancialRead\.config/);
    assert.match(source, /getCanonicalDeliveryFinancialReadMode\(\)/);
  }
  assert.equal(canonicalConfig.ENV_KEY, 'CANONICAL_DELIVERY_FINANCIAL_READ_V1');
});

test('FLAG-006: shadow does not cut over response', async () => {
  const offHarness = createHarness();
  const shadowHarness = createHarness();
  const off = await offHarness.engine.listOrders({ includeCompleted: true }, { financialReadMode: 'off' });
  const shadow = await shadowHarness.engine.listOrders({ includeCompleted: true }, {
    financialReadMode: 'shadow',
    shadowSampleRate: 1,
    random: () => 0
  });
  assert.deepStrictEqual(financial(shadow.rows[0]), financial(off.rows[0]));
  assert.ok(shadow.shadowDiffSummary.mismatchedOrderCount > 0);
});

test('FLAG-007: all modes perform zero writes on GET', async () => {
  for (const mode of ['off', 'shadow', 'on']) {
    const { engine, counters } = createHarness();
    await engine.listOrders({ includeCompleted: true }, { financialReadMode: mode, shadowSampleRate: 1, random: () => 0 });
    assert.equal(counters.writes, 0, `${mode} must remain read-only`);
  }
});

test('FLAG-008: shadow telemetry is sampled and redacted', async () => {
  const skippedHarness = createHarness();
  const skipped = await skippedHarness.engine.listOrders({ includeCompleted: true }, {
    financialReadMode: 'shadow',
    shadowSampleRate: 0.25,
    random: () => 0.9
  });
  assert.equal(skipped.shadowSampled, false);
  assert.equal(skippedHarness.counters.resolverCalls, 0);
  assert.equal(skipped.shadowDiffSummary, null);

  const sampledHarness = createHarness();
  const sampled = await sampledHarness.engine.listOrders({ includeCompleted: true }, {
    financialReadMode: 'shadow',
    shadowSampleRate: 0.25,
    random: () => 0.1
  });
  assert.equal(sampled.shadowSampled, true);
  assert.equal(sampledHarness.counters.resolverCalls, 1);
  const telemetry = JSON.stringify(sampled.shadowDiffSummary);
  for (const forbidden of ['B-FLAG-1', 'Must not enter', '0900000000', 'Must be redacted']) {
    assert.equal(telemetry.includes(forbidden), false, `telemetry must redact ${forbidden}`);
  }
  assert.deepStrictEqual(Object.keys(sampled.shadowDiffSummary).sort(), [
    'comparedOrderCount',
    'mismatchCounts',
    'mismatchedOrderCount'
  ]);
});


function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function releaseZipPath() {
  return process.env.PHASE_A_RELEASE_ZIP || path.join(ROOT, 'MK-pro-phaseA-gate4-verification-not-ready.zip');
}

test('ROLLBACK-001: flag rollback restores legacy output', async () => {
  const onHarness = createHarness();
  const offHarness = createHarness();
  const on = await onHarness.engine.listOrders({ includeCompleted: true }, { financialReadMode: 'on' });
  const off = await offHarness.engine.listOrders({ includeCompleted: true }, { financialReadMode: 'off' });
  assert.equal(on.rows[0].cashAmount, 4000);
  assert.equal(off.rows[0].cashAmount, 0);
  assert.equal(off.rows[0].returnAmount, 0);
  assert.equal(offHarness.counters.writes, 0);
});

test('ROLLBACK-002: previous release rollback is documented', () => {
  const runbook = fs.readFileSync(path.join(ROOT, 'PHASE_A_ROLLBACK_RUNBOOK.md'), 'utf8');
  assert.match(runbook, /previous known-good release/i);
  assert.match(runbook, /release ID\/hash/i);
});

test('ROLLBACK-003: rollback never mutates data', () => {
  const runbook = fs.readFileSync(path.join(ROOT, 'PHASE_A_ROLLBACK_RUNBOOK.md'), 'utf8');
  assert.match(runbook, /Không update, delete, backfill hoặc reverse MongoDB/i);
  assert.match(runbook, /rollback chỉ gồm feature flag và code release/i);
});

test('ROLLBACK-004: performance and parity triggers block rollout', () => {
  const runbook = fs.readFileSync(path.join(ROOT, 'PHASE_A_ROLLBACK_RUNBOOK.md'), 'utf8');
  for (const pattern of [/parity mismatch/i, /p95 tăng >20%/i, />3 join queries/i, /Heap\/RSS/i]) {
    assert.match(runbook, pattern);
  }
});

test('ROLLBACK-005: smoke failure blocks on mode', () => {
  const runbook = fs.readFileSync(path.join(ROOT, 'PHASE_A_ROLLBACK_RUNBOOK.md'), 'utf8');
  assert.match(runbook, /Production smoke test thất bại/i);
  assert.match(runbook, /Không bật `shadow` hoặc `on`/i);
});

test('ROLLBACK-006: manifest traces baseline and release hashes', () => {
  const manifest = readJson('PHASE_A_RELEASE_MANIFEST.json');
  assert.match(manifest.baseline.sha256, /^[a-f0-9]{64}$/);
  assert.match(manifest.gate3Input.sha256, /^[a-f0-9]{64}$/);
  assert.equal(manifest.baseline.sha256, '08a10b69da53a7cd2b314f502b8d13e7f1274dd8098cb23ae26193024eace892');
  assert.equal(manifest.gate3Input.sha256, 'd01d5425a5355ed842ed056dbcd4dd3c1de8795ea1b9ced94c01277b25ca0b40');
  assert.match(manifest.releaseArtifact.sha256 || '', /^[a-f0-9]{64}$/);
});

test('ART-001: implementation report exists', () => {
  assert.ok(fs.statSync(path.join(ROOT, 'PHASE_A_CANONICAL_DELIVERY_FINANCIAL_READ_MODEL_IMPLEMENTATION_REPORT.md')).size > 500);
});

test('ART-002: test evidence exists', () => {
  const evidence = readJson('PHASE_A_TEST_EVIDENCE.json');
  assert.equal(evidence.schemaVersion, 'phase-a-test-evidence-v1');
  assert.ok(Array.isArray(evidence.commands));
  assert.ok(evidence.commands.length >= 5);
});

test('ART-003: performance evidence exists', () => {
  const evidence = readJson('PHASE_A_PERFORMANCE_EVIDENCE.json');
  assert.equal(evidence.pass, true);
  assert.deepStrictEqual(evidence.results.map((item) => item.queryCount), [3, 3, 3, 3]);
  assert.ok(evidence.results.every((item) => item.writes === 0));
});

test('ART-004: dry-run audit artifacts exist or are explicitly NOT_RUN', () => {
  const evidence = readJson('PHASE_A_DATA_AUDIT_DRY_RUN.json');
  assert.equal(evidence.dryRun, true);
  assert.equal(evidence.writesAttempted, 0);
  assert.ok(['COMPLETED', 'NOT_RUN_ENV_UNAVAILABLE'].includes(evidence.status));
  assert.ok(fs.existsSync(path.join(ROOT, 'PHASE_A_DATA_AUDIT_DRY_RUN.csv')));
});

test('ART-005: changed-files evidence exists', () => {
  const evidence = readJson('PHASE_A_CHANGED_FILES.json');
  assert.ok(Array.isArray(evidence.cumulativeChangedFiles));
  assert.ok(Array.isArray(evidence.gate4ChangedFiles));
  assert.equal(evidence.denylistViolations.length, 0);
});

test('ART-006: release manifest exists', () => {
  const manifest = readJson('PHASE_A_RELEASE_MANIFEST.json');
  assert.equal(manifest.schemaVersion, 'phase-a-release-manifest-v1');
  assert.ok(['NOT_READY', 'READY_FOR_SHADOW', 'READY_FOR_ON'].includes(manifest.decision));
  assert.equal(manifest.dataMutation, false);
});

test('ART-007: rollback runbook exists', () => {
  const runbook = fs.readFileSync(path.join(ROOT, 'PHASE_A_ROLLBACK_RUNBOOK.md'), 'utf8');
  assert.match(runbook, /CANONICAL_DELIVERY_FINANCIAL_READ_V1=off\|shadow\|on/);
});

test('ART-008: release ZIP excludes dependencies and secrets', () => {
  const zipPath = releaseZipPath();
  assert.ok(fs.existsSync(zipPath), `release/verification ZIP missing: ${zipPath}`);
  const entries = execFileSync('unzip', ['-Z1', zipPath], { encoding: 'utf8' }).trim().split(/\r?\n/).filter(Boolean);
  assert.ok(entries.length > 0);
  const forbidden = entries.filter((entry) =>
    /(^|\/)node_modules\//.test(entry)
    || /(^|\/)\.env($|\.)/.test(entry) && !entry.endsWith('/.env.example')
    || /(^|\/)(credentials?|secrets?|production[-_]?dump)(\/|\.|$)/i.test(entry)
  );
  assert.deepStrictEqual(forbidden, []);
});

test('ART-009: source-bundle hash is verified', () => {
  const manifest = readJson('PHASE_A_RELEASE_MANIFEST.json');
  assert.equal(
    manifest.sourceBundleCheck.status,
    'PASS',
    `official source-bundle gate is not PASS: ${manifest.sourceBundleCheck.status} (${manifest.sourceBundleCheck.reason || 'no reason'})`
  );
  assert.equal(manifest.sourceBundleCheck.passed, true);
});

test('ART-010: baseline hash is verified', () => {
  const manifest = readJson('PHASE_A_RELEASE_MANIFEST.json');
  assert.equal(manifest.baseline.sha256, '08a10b69da53a7cd2b314f502b8d13e7f1274dd8098cb23ae26193024eace892');
});

test('ART-011: command metadata records real exit codes', () => {
  const evidence = readJson('PHASE_A_TEST_EVIDENCE.json');
  for (const command of evidence.commands) {
    assert.equal(typeof command.command, 'string');
    assert.equal(Number.isInteger(command.exitCode), true, JSON.stringify(command));
    assert.equal(typeof command.status, 'string');
  }
});

test('ART-012: production evidence status is explicit', () => {
  const evidence = readJson('PHASE_A_PRODUCTION_EVIDENCE_STATUS.json');
  for (const key of ['productionDryRun', 'mongoExplain', 'httpSmokeParity', 'b0040961ProductionCheck']) {
    assert.equal(evidence[key].status, 'NOT_RUN_ENV_UNAVAILABLE');
    assert.ok(evidence[key].reason);
  }
  assert.equal(evidence.readyForOn, false);
});
