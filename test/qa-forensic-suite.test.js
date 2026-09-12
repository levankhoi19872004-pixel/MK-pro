'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const suite = require('../scripts/lib/qaForensicSuite');
const dbAudit = require('../scripts/qa-db-forensics');

test('QA profile parser defaults to core and keeps DB disabled', () => {
  const options = suite.parseArgs([]);
  assert.equal(options.profile, 'core');
  assert.equal(options.withDb, false);
  assert.equal(options.requireDb, false);
});

test('forensic profile always enables read-only DB phase', () => {
  const options = suite.parseArgs(['--profile=forensic']);
  assert.equal(options.profile, 'forensic');
  assert.equal(options.withDb, true);
  const plan = suite.buildPlan(options, {});
  assert.ok(plan.some((step) => step.id === 'db-forensics'));
  assert.ok(plan.some((step) => step.id === 'core-read-models'));
  assert.ok(plan.filter((step) => step.category === 'database').every((step) => step.blocking === true));
});

test('quick profile is a small critical-path source/business gate', () => {
  const plan = suite.buildPlan(suite.parseArgs(['--profile=quick']), {});
  assert.deepEqual(plan.map((step) => step.id), ['syntax', 'critical-contracts']);
  const contract = plan.find((step) => step.id === 'critical-contracts');
  for (const file of suite.CRITICAL_TESTS_QUICK) assert.ok(contract.args.includes(file));
});

test('source size is advisory while business invariants block release', () => {
  const plan = suite.buildPlan(suite.parseArgs(['--profile=core']), {});
  assert.equal(plan.find((step) => step.id === 'source-size').blocking, false);
  assert.equal(plan.find((step) => step.id === 'critical-contracts').blocking, true);
  assert.equal(plan.find((step) => step.id === 'global-rules').blocking, true);
});

test('release summary distinguishes blocking failures from warnings', () => {
  const options = suite.parseArgs(['--profile=core']);
  let summary = suite.summarize([
    { status: 'PASS', blocking: true },
    { status: 'WARN', blocking: false }
  ], options);
  assert.equal(summary.ok, true);
  assert.equal(summary.warningFailures, 1);

  summary = suite.summarize([
    { status: 'FAIL', blocking: true },
    { status: 'WARN', blocking: false }
  ], options);
  assert.equal(summary.ok, false);
  assert.equal(summary.blockingFailures, 1);
});

test('report writer emits versioned and latest JSON/Markdown artifacts', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mkpro-qa-test-'));
  try {
    const report = suite.reportBase(suite.parseArgs(['--profile=quick']), [{
      id: 'syntax', title: 'Syntax', category: 'source', status: 'PASS', blocking: true,
      command: process.execPath, args: ['--version'], exitCode: 0, durationMs: 1, stdout: '', stderr: ''
    }]);
    const paths = suite.writeReport(report, dir);
    assert.ok(fs.existsSync(paths.jsonPath));
    assert.ok(fs.existsSync(paths.mdPath));
    assert.ok(fs.existsSync(paths.latestJson));
    assert.ok(fs.existsSync(paths.latestMd));
    assert.match(fs.readFileSync(paths.mdPath, 'utf8'), /Release gate/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});


test('DB step skips cleanly without URI before dependency preflight', () => {
  const previous = { QA_MONGO_URI: process.env.QA_MONGO_URI, MONGO_URI: process.env.MONGO_URI, MONGODB_URI: process.env.MONGODB_URI };
  delete process.env.QA_MONGO_URI;
  delete process.env.MONGO_URI;
  delete process.env.MONGODB_URI;
  try {
    const result = suite.runStep({
      id: 'db', title: 'DB', category: 'database', command: process.execPath, args: ['--version'],
      needsDb: true, needsDependencies: true, blocking: true
    }, { root: path.join(os.tmpdir(), 'definitely-missing-mkpro-root'), requireDb: false });
    assert.equal(result.status, 'SKIP');
    assert.equal(result.reason, 'db-uri-missing');
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test('DB forensic URI prefers dedicated QA_MONGO_URI', () => {
  assert.equal(dbAudit.getUri({ QA_MONGO_URI: 'mongodb://qa', MONGO_URI: 'mongodb://prod' }), 'mongodb://qa');
  assert.equal(dbAudit.getUri({ MONGO_URI: 'mongodb://fallback' }), 'mongodb://fallback');
});

test('DB forensic severity normalization never blocks P2 advisory', () => {
  const result = dbAudit.normalizeCheck({ id: 'stale', ok: false, severity: 'P2', blocking: false });
  assert.equal(result.status, 'WARN');
});
