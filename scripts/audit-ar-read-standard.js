#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SCAN_DIRS = ['src', 'public/js', 'scripts'];
const DEFAULT_ALLOW = new Set([
  'src/services/arLedgerRead.service.js',
  'src/services/arDebtReadModel.service.js',
  'src/services/arPosting.service.js',
  'src/domain/ar/arLedgerContract.js',
  'src/domain/ar/arLedgerValidator.js',
  'src/domain/ar/arLedgerQueryPolicy.js',
  'scripts/audit-ar-ledger-contract.js',
  'scripts/plan-ar-clean-rebuild.js',
  'scripts/rebuild-ar-debt-read-model.js',
  'scripts/reconcile-ar-debt-after-rebuild.js',
  'scripts/audit-ar-read-standard.js'
]);

const LEGACY_P3_ALLOW = new Set([
  'src/services/mobile/sales.service.js',
  'src/services/mobileService.js',
  'src/services/accounting/arCustomerDebtReadModel.service.js',
  'src/services/reportLegacy.service.js',
  'src/services/reportLegacy.service.source/part-01.jsfrag',
  'src/services/reportLegacy.service.source/part-02.jsfrag',
  'src/services/reportLegacy.service.source/part-03.jsfrag',
  'src/services/DebtReadService.js'
]);

const RULES = [
  { code: 'DIRECT_AR_LEDGER_READ', severity: 'P1', pattern: /\bArLedger\.(find|aggregate|findOne|countDocuments)\s*\(/g, message: 'Đọc arLedgers trực tiếp thay vì arLedgerRead.service.' },
  { code: 'RAW_AR_LEDGER_COLLECTION', severity: 'P1', pattern: /\barLedgers\b/g, message: 'Tham chiếu raw collection arLedgers cần được kiểm soát.' },
  { code: 'PAYMENT_REPOSITORY_AR_READ', severity: 'P1', pattern: /paymentRepository\.findAll\s*\(/g, message: 'paymentRepository.findAll có thể bypass AR read standard.' },
  { code: 'SALES_ORDER_DEBT_CALC', severity: 'P0', pattern: /(totalAmount\s*-\s*paidAmount|Math\.max\(0,\s*[^\n;]*totalAmount[^\n;]*paidAmount|debtAmount\s*:\s*[^\n;]*totalAmount[^\n;]*paidAmount)/g, message: 'Có dấu hiệu tính công nợ từ salesOrders/totalAmount-paidAmount.' },
  { code: 'AR_SALE_REGEX_FALLBACK', severity: 'P0', pattern: /\^AR-SALE-|\/\^AR-SALE-|code\s*:\s*\/\^AR-SALE-/g, message: 'Không được dùng regex code /^AR-SALE-/ làm canonical ledger.' },
  { code: 'LEGACY_DEBT_COLLECTION_NAME', severity: 'P2', pattern: /\b(debtCustomers|debtOrders)\b/g, message: 'Cần thống nhất collection read model arDebtCustomers/arDebtOrders.' },
  { code: 'STAFF_NAME_FILTER_DRIFT', severity: 'P2', pattern: /(salesStaffName|salesmanName|deliveryStaffName|deliveryName)\s*:/g, message: 'Kiểm tra filter staff name; chuẩn là code-only khi có mã.' }
];

function rel(file) {
  return path.relative(ROOT, file).replace(/\\/g, '/');
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(js|mjs|cjs|html|source|jsfrag)$/.test(entry.name)) out.push(full);
  }
  return out;
}

function lineOf(source, index) {
  return source.slice(0, index).split(/\r?\n/).length;
}

function classify(relPath, rule) {
  if (DEFAULT_ALLOW.has(relPath)) return 'allowed-standard';
  if (LEGACY_P3_ALLOW.has(relPath)) return 'P3-legacy-compatibility';
  if (relPath.includes('.legacy.') || relPath.includes('Legacy') || relPath.includes('.source/')) return 'P3-legacy-compatibility';
  return rule.severity;
}

function stripComments(source = '') {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (block) => '\n'.repeat(block.split(/\r?\n/).length - 1))
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function analyzeText(source, relPath = 'inline.js') {
  const scannedSource = stripComments(source);
  const issues = [];
  for (const rule of RULES) {
    rule.pattern.lastIndex = 0;
    let match;
    while ((match = rule.pattern.exec(scannedSource))) {
      const severity = classify(relPath, rule);
      if (severity === 'allowed-standard') continue;
      issues.push({
        code: rule.code,
        severity,
        file: relPath,
        line: lineOf(scannedSource, match.index),
        snippet: scannedSource.slice(Math.max(0, match.index - 80), Math.min(scannedSource.length, match.index + 140)).replace(/\s+/g, ' ').trim(),
        message: rule.message
      });
    }
  }
  return issues;
}

function runAudit(options = {}) {
  const files = SCAN_DIRS.flatMap((dir) => walk(path.join(ROOT, dir)));
  const issues = files.flatMap((file) => analyzeText(fs.readFileSync(file, 'utf8'), rel(file)));
  const grouped = issues.reduce((acc, issue) => {
    acc[issue.severity] = (acc[issue.severity] || 0) + 1;
    return acc;
  }, {});
  return { generatedAt: new Date().toISOString(), root: ROOT, summary: grouped, issueCount: issues.length, issues };
}

function toMarkdown(report) {
  const lines = [];
  lines.push('# PHASE80 AR Read Standard Audit');
  lines.push('');
  lines.push(`- Generated at: ${report.generatedAt}`);
  lines.push(`- Issue count: ${report.issueCount}`);
  lines.push(`- P0: ${report.summary.P0 || 0}`);
  lines.push(`- P1: ${report.summary.P1 || 0}`);
  lines.push(`- P2: ${report.summary.P2 || 0}`);
  lines.push(`- P3 legacy compatibility: ${report.summary['P3-legacy-compatibility'] || 0}`);
  lines.push('');
  lines.push('| Severity | Code | File | Line | Message |');
  lines.push('|---|---|---:|---:|---|');
  for (const issue of report.issues) {
    lines.push(`| ${issue.severity} | ${issue.code} | ${issue.file} | ${issue.line} | ${issue.message} |`);
  }
  return `${lines.join('\n')}\n`;
}

if (require.main === module) {
  const args = new Set(process.argv.slice(2));
  const report = runAudit();
  if (args.has('--json')) console.log(JSON.stringify(report, null, 2));
  else console.log(toMarkdown(report));
  if (args.has('--strict') && report.issues.some((issue) => ['P0', 'P1'].includes(issue.severity))) process.exitCode = 1;
}

module.exports = { runAudit, analyzeText, toMarkdown, RULES, stripComments };
