'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_OUTPUT_DIR = path.join(ROOT, 'qa-reports');

const CRITICAL_TESTS_QUICK = [
  'test/inventory-ledger-invariants-static.test.js',
  'test/no-direct-ledger-write.test.js',
  'test/phase78-cross-ledger-reconciliation-gate.test.js',
  'test/inventory-source-contract.test.js',
  'test/s3-import-data-integrity.test.js'
];

const CRITICAL_TESTS_CORE = [
  ...CRITICAL_TESTS_QUICK,
  'test/request-idempotency-service.test.js',
  'test/inventory-posting-idempotency.test.js',
  'test/fund-ledger-idempotency.test.js',
  'test/ar-sale-idempotency.test.js',
  'test/ar-return-idempotency-service.test.js',
  'test/order-payment-debt-reconcile-contract.test.js',
  'test/dms-import-sales-atomic-transaction.test.js',
  'test/master-order-concurrent-merge.test.js',
  'test/delivery-money-inventory-debt-flow.test.js'
];

function parseArgs(argv = process.argv.slice(2)) {
  const result = {
    profile: 'core',
    withDb: false,
    requireDb: false,
    outputDir: DEFAULT_OUTPUT_DIR,
    jsonOnly: false,
    noReport: false,
    failOnWarn: false
  };

  for (const arg of argv) {
    if (arg.startsWith('--profile=')) result.profile = arg.slice('--profile='.length).trim().toLowerCase();
    else if (arg === '--with-db') result.withDb = true;
    else if (arg === '--require-db') { result.withDb = true; result.requireDb = true; }
    else if (arg.startsWith('--output-dir=')) result.outputDir = path.resolve(ROOT, arg.slice('--output-dir='.length));
    else if (arg === '--json-only') result.jsonOnly = true;
    else if (arg === '--no-report') result.noReport = true;
    else if (arg === '--fail-on-warn') result.failOnWarn = true;
  }

  if (!['quick', 'core', 'forensic', 'full'].includes(result.profile)) {
    throw new Error(`Unknown QA profile: ${result.profile}. Expected quick|core|forensic|full.`);
  }
  if (result.profile === 'forensic') result.withDb = true;
  return result;
}

function hasMongoUri(env = process.env) {
  return Boolean(String(env.QA_MONGO_URI || env.MONGO_URI || env.MONGODB_URI || '').trim());
}

function dependencyPreflight(root = ROOT) {
  const required = ['mongoose', 'express'];
  const missing = required.filter((name) => !fs.existsSync(path.join(root, 'node_modules', name, 'package.json')));
  return {
    ok: missing.length === 0,
    required,
    missing,
    message: missing.length ? `Missing dependencies: ${missing.join(', ')}. Run npm ci first.` : 'Dependencies installed.'
  };
}

function nodeTestArgs(files) {
  return [
    '--test',
    '--test-force-exit',
    '--test-concurrency=1',
    '--experimental-test-isolation=none',
    ...files
  ];
}

function buildPlan(options, env = process.env) {
  const plan = [];
  const add = (step) => plan.push({ blocking: true, ...step });

  add({ id: 'syntax', category: 'source', title: 'JavaScript syntax', command: process.execPath, args: ['scripts/check-js-syntax.js'] });

  const tests = options.profile === 'quick' ? CRITICAL_TESTS_QUICK : CRITICAL_TESTS_CORE;
  add({
    id: 'critical-contracts',
    category: 'business-invariants',
    title: `Critical business contracts (${tests.length} files)`,
    command: process.execPath,
    args: nodeTestArgs(tests),
    needsDependencies: options.profile !== 'quick'
  });

  if (options.profile !== 'quick') {
    add({
      id: 'global-rules',
      category: 'architecture',
      title: 'Global Stock/AR/Fund access rules',
      command: process.execPath,
      args: ['scripts/audit-global-software-rules.js', '--strict', '--json']
    });
    add({
      id: 'source-size',
      category: 'maintainability',
      title: 'Source size budget',
      command: process.execPath,
      args: ['scripts/check-source-size-budget.js'],
      blocking: false
    });
  }

  if (options.profile === 'full') {
    add({
      id: 'full-tests',
      category: 'regression',
      title: 'Complete regression suite',
      command: process.execPath,
      args: ['scripts/run-tests.js'],
      needsDependencies: true
    });
  }

  if (options.withDb || (options.profile === 'full' && hasMongoUri(env))) {
    add({
      id: 'db-forensics',
      category: 'database',
      title: 'Read-only database forensic invariants',
      command: process.execPath,
      args: ['scripts/qa-db-forensics.js', '--json'],
      needsDependencies: true,
      needsDb: true,
      blocking: true
    });
    add({
      id: 'core-read-models',
      category: 'database',
      title: 'Core read-model reconciliation',
      command: process.execPath,
      args: ['scripts/reconcile-core-read-models.js', '--json'],
      needsDependencies: true,
      needsDb: true,
      blocking: true
    });
  }

  return plan;
}

function stripAnsi(value = '') {
  return String(value).replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, '');
}

function clip(value = '', max = 30000) {
  const text = stripAnsi(value);
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n...[truncated ${text.length - max} chars]`;
}

function runStep(step, options = {}) {
  const root = options.root || ROOT;
  const env = { ...process.env, NODE_ENV: process.env.NODE_ENV || 'test', TERM: process.env.TERM || 'dumb' };
  const startedAt = new Date();

  if (step.needsDb && !hasMongoUri(env)) {
    const required = Boolean(options.requireDb);
    return {
      ...step,
      status: required ? 'FAIL' : 'SKIP',
      exitCode: required ? 3 : 0,
      startedAt: startedAt.toISOString(),
      durationMs: 0,
      stdout: '',
      stderr: required ? 'Database URI required but not configured.' : '',
      reason: 'db-uri-missing'
    };
  }

  const preflight = dependencyPreflight(root);
  if (step.needsDependencies && !preflight.ok) {
    return {
      ...step,
      status: step.blocking ? 'FAIL' : 'WARN',
      exitCode: 127,
      startedAt: startedAt.toISOString(),
      durationMs: 0,
      stdout: '',
      stderr: preflight.message,
      reason: 'dependencies-missing'
    };
  }

  if (step.needsDb && String(env.QA_MONGO_URI || '').trim()) {
    env.MONGO_URI = String(env.QA_MONGO_URI).trim();
    env.MONGODB_URI = String(env.QA_MONGO_URI).trim();
  }

  const result = spawnSync(step.command, step.args, {
    cwd: root,
    env,
    encoding: 'utf8',
    shell: false,
    maxBuffer: 16 * 1024 * 1024
  });
  const endedAt = new Date();
  const exitCode = result.error ? 126 : (result.status ?? 1);
  const ok = exitCode === 0;
  return {
    ...step,
    status: ok ? 'PASS' : (step.blocking ? 'FAIL' : 'WARN'),
    exitCode,
    signal: result.signal || null,
    startedAt: startedAt.toISOString(),
    durationMs: endedAt.getTime() - startedAt.getTime(),
    stdout: clip(result.stdout || ''),
    stderr: clip(result.error ? `${result.error.message}\n${result.stderr || ''}` : (result.stderr || ''))
  };
}

function summarize(results, options) {
  const counts = { PASS: 0, FAIL: 0, WARN: 0, SKIP: 0 };
  for (const row of results) counts[row.status] = (counts[row.status] || 0) + 1;
  const blockingFailures = results.filter((row) => row.status === 'FAIL' && row.blocking !== false).length;
  const warningFailures = results.filter((row) => row.status === 'WARN').length;
  const ok = blockingFailures === 0 && (!options.failOnWarn || warningFailures === 0);
  return { ...counts, blockingFailures, warningFailures, ok };
}

function commandText(step) {
  return [step.command, ...(step.args || [])].map((x) => String(x).includes(' ') ? JSON.stringify(String(x)) : String(x)).join(' ');
}

function toMarkdown(report) {
  const lines = [];
  lines.push('# MK-Pro Automated QA / Forensic Report', '');
  lines.push(`- Generated: ${report.generatedAt}`);
  lines.push(`- Profile: \`${report.profile}\``);
  lines.push(`- Result: **${report.summary.ok ? 'PASS' : 'FAIL'}**`);
  lines.push(`- PASS ${report.summary.PASS} · FAIL ${report.summary.FAIL} · WARN ${report.summary.WARN} · SKIP ${report.summary.SKIP}`);
  lines.push(`- Node: ${report.environment.node} · Platform: ${report.environment.platform}`);
  lines.push('', '| Check | Category | Result | Blocking | Duration |', '|---|---|---:|---:|---:|');
  for (const step of report.results) {
    lines.push(`| ${step.title} | ${step.category} | **${step.status}** | ${step.blocking === false ? 'No' : 'Yes'} | ${step.durationMs} ms |`);
  }
  lines.push('');
  const findings = report.results.filter((step) => step.status !== 'PASS');
  if (findings.length) {
    lines.push('## Findings', '');
    for (const step of findings) {
      lines.push(`### ${step.status} — ${step.title}`, '');
      if (step.reason) lines.push(`Reason: \`${step.reason}\``, '');
      lines.push(`Command: \`${commandText(step).replace(/`/g, '\\`')}\``, '');
      const text = [step.stderr, step.stdout].filter(Boolean).join('\n').trim();
      if (text) lines.push('```text', clip(text, 12000), '```', '');
    }
  }
  lines.push('## Release gate', '');
  lines.push(report.summary.ok
    ? 'No blocking QA failures were detected by this profile.'
    : `Release is blocked by ${report.summary.blockingFailures} blocking failure(s).`);
  lines.push('');
  lines.push('Database forensic checks are read-only. Repair/rebuild scripts are intentionally excluded from this suite.');
  return `${lines.join('\n')}\n`;
}

function reportBase(options, results) {
  return {
    schemaVersion: 1,
    suite: 'mkpro-qa-forensic',
    generatedAt: new Date().toISOString(),
    profile: options.profile,
    options: {
      withDb: options.withDb,
      requireDb: options.requireDb,
      failOnWarn: options.failOnWarn
    },
    environment: {
      node: process.version,
      platform: `${process.platform}/${process.arch}`,
      hostname: os.hostname(),
      hasMongoUri: hasMongoUri(process.env)
    },
    summary: summarize(results, options),
    results
  };
}

function safeTimestamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-');
}

function writeReport(report, outputDir = DEFAULT_OUTPUT_DIR) {
  fs.mkdirSync(outputDir, { recursive: true });
  const stem = `qa-${report.profile}-${safeTimestamp(new Date(report.generatedAt))}`;
  const jsonPath = path.join(outputDir, `${stem}.json`);
  const mdPath = path.join(outputDir, `${stem}.md`);
  const latestJson = path.join(outputDir, `latest-${report.profile}.json`);
  const latestMd = path.join(outputDir, `latest-${report.profile}.md`);
  const json = `${JSON.stringify(report, null, 2)}\n`;
  const markdown = toMarkdown(report);
  fs.writeFileSync(jsonPath, json);
  fs.writeFileSync(mdPath, markdown);
  fs.writeFileSync(latestJson, json);
  fs.writeFileSync(latestMd, markdown);
  return { jsonPath, mdPath, latestJson, latestMd };
}

module.exports = {
  ROOT,
  DEFAULT_OUTPUT_DIR,
  CRITICAL_TESTS_QUICK,
  CRITICAL_TESTS_CORE,
  parseArgs,
  hasMongoUri,
  dependencyPreflight,
  buildPlan,
  runStep,
  summarize,
  toMarkdown,
  reportBase,
  writeReport,
  stripAnsi,
  clip
};
