#!/usr/bin/env node
'use strict';

const path = require('path');
const {
  auditFiles,
  collectCandidateFiles
} = require('./lib/filterKpiScopeAuditCore');

function main() {
  const root = process.cwd();
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const files = args.filter((arg) => arg && !arg.startsWith('--'));
  const targets = files.length ? files.map((file) => path.resolve(root, file)) : collectCandidateFiles(root);
  const findings = auditFiles(targets);
  const summary = findings.reduce((acc, item) => {
    acc[item.severity] = (acc[item.severity] || 0) + 1;
    return acc;
  }, {});
  const result = {
    ok: true,
    scannedFiles: targets.length,
    findingCount: findings.length,
    summary,
    findings
  };
  if (json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  console.log(`Filter/KPI scope audit: ${targets.length} files scanned, ${findings.length} candidates`);
  for (const finding of findings) {
    console.log(`[${finding.severity}] ${finding.id} ${path.relative(root, finding.file)}:${finding.line}`);
  }
}

if (require.main === module) main();
