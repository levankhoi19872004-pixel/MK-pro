'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');

function normalizePath(value = '') {
  return String(value || '').replace(/\\/g, '/');
}

function rel(file) {
  return normalizePath(path.relative(ROOT, file));
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'coverage') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(js|mjs|cjs|html)$/.test(entry.name)) out.push(full);
  }
  return out;
}

function stripComments(source = '') {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (block) => '\n'.repeat(block.split(/\r?\n/).length - 1))
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function lineOf(source, index) {
  return source.slice(0, index).split(/\r?\n/).length;
}

function matchesAny(relPath, allow = []) {
  return allow.some((rule) => {
    if (typeof rule === 'string') return relPath === normalizePath(rule) || relPath.startsWith(`${normalizePath(rule).replace(/\/$/, '')}/`);
    if (rule instanceof RegExp) return rule.test(relPath);
    return false;
  });
}

const COMMON_ALLOWED = [
  /^test\//,
  /^docs\//,
  /^reports\//,
  /^scripts\/(audit|plan|reconcile|repair|migrate|debug|create|apply|rebuild)-/,
  /^scripts\/lib\//
];

const PROFILES = {
  ar: {
    title: 'AR access contract',
    dirs: ['src', 'public/js', 'public/mobile/js'],
    legacyAllow: [],
    allow: [
      ...COMMON_ALLOWED,
      'src/services/arLedgerRead.service.js',
      'src/services/arDebtReadModel.service.js',
      'src/services/arPosting.service.js',
      'src/domain/ar',
      'src/utils/assertArLedgerContract.util.js',
      /^src\/services\/accounting\/.*ArPostingService\.js$/,
      'src/services/accounting/manualDebtPostingService.js',
      /^src\/services\/accounting\/ar.*service\.js$/i,
      'src/services/accounting/arCustomerDebtReadModel.service.js',
      'src/services/DebtReadService.js',
      'src/services/arLedgerMigrationService.js',
      'src/services/accounting/arDebtRuntimeView.service.js',
      'src/services/mobile/mobileDebtQuery.service.js',
      'src/repositories/mobile/delivery.repository.js',
      'src/repositories/salesOrderDeletion.repository.js',
      'src/domain/reconciliation/ReconciliationService.js',
      'src/domain/settlement/DeliveryCashInTransitReportService.js'
    ],
    rules: [
      { code: 'DIRECT_AR_LEDGER_READ', severity: 'P0', pattern: /\bArLedger\.(find|aggregate|findOne|countDocuments)\s*\(/g, message: 'Runtime đọc arLedgers trực tiếp thay vì qua AR read service/read model.' },
      { code: 'RAW_AR_LEDGER_COLLECTION', severity: 'P1', pattern: /db\.collection\([\'\"]arLedgers[\'\"]\)|mongoose\.model\([\'\"]ArLedger[\'\"]\)/g, message: 'Runtime tham chiếu raw collection/model arLedgers.' },
      { code: 'SALES_ORDER_DEBT_CALC', severity: 'P0', pattern: /(totalAmount\s*-\s*paidAmount|debtAmount\s*:\s*[^\n;]*totalAmount[^\n;]*paidAmount)/g, message: 'Có dấu hiệu tính công nợ từ salesOrders/totalAmount-paidAmount.' },
      { code: 'AR_SALE_REGEX_FALLBACK', severity: 'P0', pattern: /\/\^AR-SALE-|code\s*:\s*\/\^AR-SALE-|startsWith\([\'\"]AR-SALE[\'\"]\)|includes\([\'\"]AR-SALE[\'\"]\)/g, message: 'Không được dùng pattern code AR-SALE để xác định canonical ledger.' }
    ]
  },
  inventory: {
    title: 'Inventory access contract',
    dirs: ['src', 'public/js', 'public/mobile/js'],
    allow: [
      ...COMMON_ALLOWED,
      'src/services/inventoryStock.service.js',
      'src/services/inventoryService.js',
      'src/services/mongoSyncService.js',
      'src/mobile/mobileContext.js',
      'src/domain/reconciliation/ReconciliationService.js',
      'src/utils/assertStockPostingContract.util.js'
    ],
    rules: [
      { code: 'RUNTIME_INVENTORY_SNAPSHOT', severity: 'P0', pattern: /\binventorySnapshots\b|\bInventorySnapshot\b/g, message: 'Runtime không được dùng inventorySnapshots làm SSoT.' },
      { code: 'RUNTIME_REPLACE_COLLECTION', severity: 'P1', pattern: /replaceCollection\s*\(/g, message: 'replaceCollection chỉ hợp lệ trong migration/sync boundary được whitelist.' },
      { code: 'DIRECT_INVENTORY_LEGACY_MODEL', severity: 'P1', pattern: /require\([\'\"].*models\/Inventory[\'\"]\)/g, message: 'Runtime đọc Inventory legacy model ngoài inventory read boundary.' }
    ]
  },
  fund: {
    title: 'Fund ledger access contract',
    dirs: ['src'],
    allow: [
      ...COMMON_ALLOWED,
      'src/repositories/fundLedgerRepository.js',
      'src/services/fundService.js',
      'src/services/fundSummary.service.js',
      'src/services/reports/FinanceReportService.js',
      'src/services/reports/DeliveryReportService.js',
      'src/services/dashboard/DashboardOverviewService.js',
      'src/domain/reconciliation/ReconciliationService.js',
      'src/domain/settlement/DeliveryCashInTransitReportService.js',
      'src/repositories/salesOrderDeletion.repository.js',
      'src/services/admin-correction/AdminDataCorrectionService.js',
      'src/utils/assertFundLedgerContract.util.js'
    ],
    rules: [
      { code: 'DIRECT_FUND_LEDGER_READ', severity: 'P1', pattern: /\bFundLedger\.(find|aggregate|findOne|countDocuments)\s*\(/g, message: 'Fund ledger runtime read phải nằm trong repository/service/report boundary rõ ràng.' },
      { code: 'RAW_FUND_LEDGER_COLLECTION', severity: 'P1', pattern: /db\.collection\([\'\"]fundLedgers[\'\"]\)|mongoose\.model\([\'\"]FundLedger[\'\"]\)/g, message: 'Runtime tham chiếu raw fundLedgers.' }
    ]
  },
  frontend: {
    title: 'Frontend core business calculation contract',
    dirs: ['public/js', 'public/mobile/js'],
    allow: [
      ...COMMON_ALLOWED,
      'public/js/app/debt/07a-debt-core.js',
    ],
    rules: [
      { code: 'FRONTEND_DEBT_FROM_ORDER_MATH', severity: 'P1', pattern: /(totalAmount\s*-\s*paidAmount|debtAmount\s*:\s*[^\n;]*totalAmount[^\n;]*paidAmount)/g, message: 'Frontend/mobile không được tính công nợ lõi từ totalAmount-paidAmount.' },
      { code: 'FRONTEND_FUND_BALANCE_MATH', severity: 'P1', pattern: /fundBalance\s*[:=]/g, message: 'Frontend không được tự tính fundBalance lõi.' },
      { code: 'FRONTEND_INVENTORY_SNAPSHOT', severity: 'P1', pattern: /inventorySnapshots/g, message: 'Frontend không được đọc inventorySnapshots làm tồn runtime.' }
    ]
  }
};

function classify(relPath, profile, rule) {
  if (matchesAny(relPath, profile.allow || [])) return 'allowed-boundary';
  if (matchesAny(relPath, profile.legacyAllow || [])) return 'P3-legacy-compatibility';
  return rule.severity;
}

function analyzeText(source, relPath = 'inline.js', profileName = 'ar') {
  const profile = PROFILES[profileName];
  if (!profile) throw new Error(`Unknown audit profile: ${profileName}`);
  const scannedSource = stripComments(source);
  const issues = [];
  for (const rule of profile.rules) {
    rule.pattern.lastIndex = 0;
    let match;
    while ((match = rule.pattern.exec(scannedSource))) {
      const severity = classify(relPath, profile, rule);
      if (severity === 'allowed-boundary') continue;
      issues.push({
        code: rule.code,
        severity,
        file: relPath,
        line: lineOf(scannedSource, match.index),
        snippet: scannedSource.slice(Math.max(0, match.index - 80), Math.min(scannedSource.length, match.index + 160)).replace(/\s+/g, ' ').trim(),
        message: rule.message
      });
    }
  }
  return issues;
}

function scanProfile(profileName = 'ar') {
  const profile = PROFILES[profileName];
  if (!profile) throw new Error(`Unknown audit profile: ${profileName}`);
  const files = profile.dirs.flatMap((dir) => walk(path.join(ROOT, dir)));
  const issues = files.flatMap((file) => analyzeText(fs.readFileSync(file, 'utf8'), rel(file), profileName));
  const summary = issues.reduce((acc, issue) => {
    acc[issue.severity] = (acc[issue.severity] || 0) + 1;
    return acc;
  }, {});
  return { profile: profileName, title: profile.title, generatedAt: new Date().toISOString(), issueCount: issues.length, summary, issues };
}

function scanAll() {
  const reports = Object.keys(PROFILES).map(scanProfile);
  const issues = reports.flatMap((report) => report.issues.map((issue) => ({ profile: report.profile, ...issue })));
  const summary = issues.reduce((acc, issue) => {
    acc[issue.severity] = (acc[issue.severity] || 0) + 1;
    return acc;
  }, {});
  return { generatedAt: new Date().toISOString(), issueCount: issues.length, summary, profiles: reports, issues };
}

function toMarkdown(report) {
  const lines = [];
  lines.push(`# ${report.title || 'Global Software Rules Audit'}`);
  lines.push('');
  lines.push(`- Generated at: ${report.generatedAt}`);
  lines.push(`- Issue count: ${report.issueCount}`);
  lines.push(`- P0: ${report.summary?.P0 || 0}`);
  lines.push(`- P1: ${report.summary?.P1 || 0}`);
  lines.push(`- P2: ${report.summary?.P2 || 0}`);
  lines.push(`- P3 legacy compatibility: ${report.summary?.['P3-legacy-compatibility'] || 0}`);
  lines.push('');
  lines.push('| Severity | Profile | Code | File | Line | Message |');
  lines.push('|---|---|---|---:|---:|---|');
  const issues = report.issues || [];
  for (const issue of issues) {
    lines.push(`| ${issue.severity} | ${issue.profile || report.profile || ''} | ${issue.code} | ${issue.file} | ${issue.line} | ${issue.message} |`);
  }
  return `${lines.join('\n')}\n`;
}

module.exports = { ROOT, PROFILES, analyzeText, scanProfile, scanAll, toMarkdown, stripComments };
