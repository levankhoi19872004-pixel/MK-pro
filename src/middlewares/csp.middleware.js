'use strict';

const CSP_REPORT_PATH = '/csp-report';
const VALID_MODES = new Set(['report-only', 'enforce', 'off']);

function directive(name, values) {
  return `${name} ${values.join(' ')}`;
}

function buildCspPolicy(req = {}) {
  const requestPath = String(req.path || req.originalUrl || '').split('?')[0];
  const docsPage = requestPath === '/api/docs' || requestPath.startsWith('/api/docs/');
  const scriptSources = ["'self'"];
  const styleSources = ["'self'", "'unsafe-inline'"];
  if (docsPage) {
    scriptSources.push('https://unpkg.com');
    styleSources.push('https://unpkg.com');
  }

  return [
    directive('default-src', ["'self'"]),
    directive('script-src', scriptSources),
    directive('script-src-attr', ["'none'"]),
    directive('style-src', styleSources),
    directive('img-src', ["'self'", 'data:', 'blob:']),
    directive('font-src', ["'self'", 'data:']),
    directive('connect-src', ["'self'"]),
    directive('worker-src', ["'self'", 'blob:']),
    directive('media-src', ["'self'", 'blob:']),
    directive('object-src', ["'none'"]),
    directive('base-uri', ["'self'"]),
    directive('form-action', ["'self'"]),
    directive('frame-ancestors', ["'none'"]),
    directive('manifest-src', ["'self'"]),
    `report-uri ${CSP_REPORT_PATH}`
  ].join('; ');
}

function getCspMode(env = process.env) {
  const requested = String(env.CSP_MODE || 'report-only').trim().toLowerCase();
  return VALID_MODES.has(requested) ? requested : 'report-only';
}

function cspHeaders(req, res, next) {
  const mode = getCspMode();
  if (mode === 'off') return next();
  const policy = buildCspPolicy(req);
  const header = mode === 'enforce'
    ? 'Content-Security-Policy'
    : 'Content-Security-Policy-Report-Only';
  res.set(header, policy);
  res.set('Reporting-Endpoints', `csp-endpoint="${CSP_REPORT_PATH}"`);
  return next();
}

function normalizeCspReport(body) {
  const raw = Array.isArray(body) ? body[0] : body;
  const report = raw && (raw['csp-report'] || raw.body || raw);
  if (!report || typeof report !== 'object') return null;
  const text = (value, max = 500) => String(value || '').replace(/[\r\n\0]+/g, ' ').slice(0, max);
  return {
    documentUri: text(report['document-uri'] || report.documentURL || report.url),
    violatedDirective: text(report['violated-directive'] || report.effectiveDirective),
    blockedUri: text(report['blocked-uri'] || report.blockedURL),
    sourceFile: text(report['source-file'] || report.sourceFile),
    lineNumber: Number(report['line-number'] || report.lineNumber || 0) || 0,
    columnNumber: Number(report['column-number'] || report.columnNumber || 0) || 0,
    disposition: text(report.disposition || 'report')
  };
}

function createCspReportHandler(logger = console) {
  return function cspReportHandler(req, res) {
    const report = normalizeCspReport(req.body);
    if (report) {
      const log = logger && typeof logger.warn === 'function' ? logger.warn.bind(logger) : console.warn;
      log({ event: 'csp_violation', csp: report }, 'CSP violation report');
    }
    return res.status(204).end();
  };
}

module.exports = {
  CSP_REPORT_PATH,
  buildCspPolicy,
  getCspMode,
  cspHeaders,
  normalizeCspReport,
  createCspReportHandler
};
