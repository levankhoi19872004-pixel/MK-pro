'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => require('./helpers/sourceBundle.util').readSource(file);

test('reconciliation model/service/job/script exist', () => {
  const files = [
    'src/models/ReconciliationReport.js',
    'src/domain/reconciliation/ReconciliationService.js',
    'src/jobs/reconciliationJob.js',
    'scripts/run-reconciliation.js'
  ];

  for (const file of files) {
    assert.equal(fs.existsSync(path.join(ROOT, file)), true, `${file} must exist`);
  }
});

test('ReconciliationService checks stock, AR, and fund ledgers', () => {
  const source = read('src/domain/reconciliation/ReconciliationService.js');

  assert.match(source, /async function reconcileStock/);
  assert.match(source, /StockTransaction\.aggregate/);
  assert.match(source, /InventoryLegacy\.aggregate/);

  assert.match(source, /async function reconcileAR/);
  assert.match(source, /ArLedger\.aggregate/);
  assert.match(source, /SalesOrder\.aggregate/);

  assert.match(source, /async function reconcileFund/);
  assert.match(source, /FundLedger\.aggregate/);
  assert.match(source, /Cashbook/);
  assert.match(source, /Bankbook/);

  assert.match(source, /reconciliation_reports|ReconciliationReport/);
  assert.match(source, /ok/);
  assert.match(source, /warning/);
  assert.match(source, /critical/);
});

test('reconciliation collection is registered and indexed', () => {
  const models = read('src/models/index.js');
  const indexes = read('src/services/mongoIndexService.js');

  assert.match(models, /reconciliationReports:\s*require\('\.\/ReconciliationReport'\)/);
  assert.match(indexes, /reconciliationReports:\s*\[/);
  assert.match(indexes, /uniq_reconciliation_reports_id/);
  assert.match(indexes, /uniq_reconciliation_reports_code/);
  assert.match(indexes, /idx_reconciliation_type_status_checked_at/);
});

test('system routes expose admin reconciliation endpoints', () => {
  const routes = read('src/routes/systemRoutes.js');
  const controller = read('src/controllers/systemController.js');

  assert.match(routes, /\/system\/reconciliation-reports/);
  assert.match(routes, /\/system\/reconciliation\/run/);
  assert.match(routes, /requireRole\(\['admin'\]\)/);

  assert.match(controller, /runReconciliation/);
  assert.match(controller, /listReconciliationReports/);
});

test('reconciliation job is env guarded and app startup uses it safely', () => {
  const job = read('src/jobs/reconciliationJob.js');
  const app = read('src/app.js');
  const env = read('.env.example');
  const pkg = JSON.parse(read('package.json'));

  assert.match(job, /AUTO_RECONCILIATION_JOB/);
  assert.match(job, /persistent_background_queue/);
  assert.match(job, /reconciliation:scheduled/);
  assert.match(job, /submitReconciliation/);
  assert.doesNotMatch(job, /ReconciliationService\.runReconciliation/);
  assert.match(app, /startReconciliationJob\(\)/);
  assert.match(env, /AUTO_RECONCILIATION_JOB=true/);
  assert.match(job, /process\.env\.AUTO_RECONCILIATION_JOB !== 'false'/);
  assert.match(job, /intervalTimer\.unref/);
  assert.match(job, /startupTimer\.unref/);
  assert.equal(pkg.scripts.reconcile, 'node scripts/run-reconciliation.js');
  assert.equal(pkg.scripts['reconcile:stock'], 'node scripts/run-reconciliation.js --type=stock');
  assert.equal(pkg.scripts['reconcile:ar'], 'node scripts/run-reconciliation.js --type=ar');
  assert.equal(pkg.scripts['reconcile:fund'], 'node scripts/run-reconciliation.js --type=fund');
});
