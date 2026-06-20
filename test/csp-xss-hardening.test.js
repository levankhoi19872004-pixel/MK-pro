'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  buildCspPolicy,
  getCspMode,
  cspHeaders,
  normalizeCspReport,
  createCspReportHandler
} = require('../src/middlewares/csp.middleware');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

function fakeResponse() {
  return {
    headers: {},
    statusCode: 200,
    set(name, value) { this.headers[name] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    end() { this.ended = true; return this; }
  };
}

test('CSP policy blocks executable attributes, eval, objects and framing without wildcard origins', () => {
  const policy = buildCspPolicy({ path: '/' });
  assert.match(policy, /script-src 'self'/);
  assert.match(policy, /script-src-attr 'none'/);
  assert.match(policy, /object-src 'none'/);
  assert.match(policy, /frame-ancestors 'none'/);
  assert.match(policy, /report-uri \/csp-report/);
  assert.doesNotMatch(policy, /unsafe-eval/);
  assert.doesNotMatch(policy, /(?:^|\s)\*(?:\s|;|$)/);
});

test('Swagger policy allowlists only the explicit CDN used by the page', () => {
  const policy = buildCspPolicy({ path: '/api/docs' });
  assert.match(policy, /script-src 'self' https:\/\/unpkg\.com/);
  assert.match(policy, /style-src 'self' 'unsafe-inline' https:\/\/unpkg\.com/);
});

test('CSP rollout defaults to report-only and supports explicit enforcement', () => {
  assert.equal(getCspMode({}), 'report-only');
  assert.equal(getCspMode({ CSP_MODE: 'enforce' }), 'enforce');
  assert.equal(getCspMode({ CSP_MODE: 'invalid' }), 'report-only');

  const previous = process.env.CSP_MODE;
  process.env.CSP_MODE = 'report-only';
  const reportResponse = fakeResponse();
  cspHeaders({ path: '/' }, reportResponse, () => {});
  assert.ok(reportResponse.headers['Content-Security-Policy-Report-Only']);
  assert.equal(reportResponse.headers['Content-Security-Policy'], undefined);

  process.env.CSP_MODE = 'enforce';
  const enforceResponse = fakeResponse();
  cspHeaders({ path: '/' }, enforceResponse, () => {});
  assert.ok(enforceResponse.headers['Content-Security-Policy']);
  assert.equal(enforceResponse.headers['Content-Security-Policy-Report-Only'], undefined);
  if (previous === undefined) delete process.env.CSP_MODE;
  else process.env.CSP_MODE = previous;
});

test('CSP report endpoint is body-limited and rate-limited before logging', () => {
  const appSource = read('src/app.js');
  assert.match(appSource, /createCspReportLimiter\(\)/);
  assert.match(appSource, /CSP_REPORT_RATE_LIMIT_MAX/);
  assert.match(appSource, /limit: '64kb'/);
});

test('CSP report payload is bounded and normalized before logging', () => {
  const report = normalizeCspReport({
    'csp-report': {
      'document-uri': 'https://example.local/\nforged',
      'violated-directive': 'script-src-attr',
      'blocked-uri': 'inline',
      'source-file': 'x'.repeat(900),
      'line-number': '12'
    }
  });
  assert.equal(report.documentUri.includes('\n'), false);
  assert.equal(report.sourceFile.length, 500);
  assert.equal(report.lineNumber, 12);

  const logs = [];
  const handler = createCspReportHandler({ warn(payload, message) { logs.push({ payload, message }); } });
  const response = fakeResponse();
  handler({ body: { 'csp-report': { 'violated-directive': 'script-src' } } }, response);
  assert.equal(response.statusCode, 204);
  assert.equal(response.ended, true);
  assert.equal(logs.length, 1);
  assert.equal(logs[0].payload.event, 'csp_violation');
});

test('runtime HTML has no inline scripts and executable inline event attributes', () => {
  const htmlFiles = [
    'public/mobile/sales.html',
    'public/mobile/delivery.html',
    'public/mobile/login.html',
    'public/index.shell.html',
    'public/fragments/index/07-index-body.html'
  ];
  for (const file of htmlFiles) {
    const source = read(file);
    assert.doesNotMatch(source, /<script(?![^>]*\bsrc=)/i, file);
    assert.doesNotMatch(source, /\son(?:click|change|input|submit|error|load)\s*=/i, file);
  }
});

test('priority customer, sales, return, debt and fund screens use delegated data actions', () => {
  const files = [
    'public/js/app/03-customers-autocomplete.js',
    'public/js/app/04-import-orders.js',
    'public/js/app/05-sales-orders.source/part-01.jsfrag',
    'public/js/app/05-sales-orders.source/part-02.jsfrag',
    'public/js/app/05-sales-orders.source/part-03.jsfrag',
    'public/js/app/debt/07a-debt-core.js',
    'public/js/app/debt/07b-return-orders.js',
    'public/js/app/debt/07d-master-return-orders.js',
    'public/js/app/debt/07e-debt-collections.js',
    'public/js/app/debt/07f-fund-ledger.source/part-01.jsfrag',
    'public/js/app/debt/07f-fund-ledger.source/part-02.jsfrag'
  ];
  for (const file of files) {
    assert.doesNotMatch(read(file), /\son(?:click|change|input|submit)\s*=/i, file);
  }
  assert.match(read('public/js/app/03-customers-autocomplete.js'), /data-customer-action/);
  assert.match(read('public/js/app/05-sales-orders.source/part-03.jsfrag'), /data-sales-order-action/);
  assert.match(read('public/js/app/debt/07f-fund-ledger.source/part-03.jsfrag'), /data-fund-action/);
});

test('print and Swagger pages use external scripts instead of inline executable blocks', () => {
  const printService = read('services/printService.js');
  const printTemplate = read('templates/printTemplates.source/part-01.jsfrag');
  const dmsTemplate = read('templates/print/dmsExactSalesInvoice.template.js');
  const swagger = read('src/routes/swaggerRoutes.js');
  for (const source of [printService, printTemplate, dmsTemplate]) {
    assert.match(source, /data-print-action="print"/);
    assert.match(source, /\/js\/print-preview-actions\.js/);
    assert.doesNotMatch(source, /onclick="window\.(?:print|close)/);
  }
  assert.match(swagger, /\/js\/swagger-init\.js/);
  assert.doesNotMatch(swagger, /window\.onload\s*=/);
});

test('mobile customer and product summary data no longer passes through innerHTML', () => {
  const customerSource = read('public/mobile/js/sales.source/part-01b.jsfrag');
  const productSource = read('public/mobile/js/sales.source/part-02.jsfrag');
  const safeDomSource = read('public/js/security/safe-dom.js');

  assert.match(customerSource, /window\.SafeDom\.renderSummary/);
  assert.doesNotMatch(customerSource, /selectedCustomerBox\.innerHTML/);
  assert.doesNotMatch(customerSource, /cartCustomerContext\.innerHTML/);

  assert.match(productSource, /window\.SafeDom\.renderMetricCard/);
  assert.doesNotMatch(productSource, /selectedProductBox\.innerHTML/);
  assert.doesNotMatch(productSource, /productGroupFilter\.innerHTML/);

  assert.match(safeDomSource, /renderSummary/);
  assert.match(safeDomSource, /renderMetricCard/);
  assert.match(safeDomSource, /textContent/);
  assert.doesNotMatch(safeDomSource, /\.innerHTML/);
});
