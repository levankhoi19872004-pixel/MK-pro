#!/usr/bin/env node
'use strict';

const { scanAll, toMarkdown } = require('./lib/globalRuleAuditCore');

if (require.main === module) {
  const args = new Set(process.argv.slice(2));
  const report = scanAll();
  if (args.has('--json')) console.log(JSON.stringify(report, null, 2));
  else console.log(toMarkdown({ ...report, title: 'Global Software Rules Audit' }));
  if (args.has('--strict') && report.issues.some((issue) => ['P0', 'P1'].includes(issue.severity))) process.exitCode = 1;
}

module.exports = { runAudit: scanAll };
