#!/usr/bin/env node
'use strict';
const { scanProfile, toMarkdown, analyzeText } = require('./lib/globalRuleAuditCore');
if (require.main === module) {
  const args = new Set(process.argv.slice(2));
  const report = scanProfile('ar');
  if (args.has('--json')) console.log(JSON.stringify(report, null, 2));
  else console.log(toMarkdown(report));
  if (args.has('--strict') && report.issues.some((issue) => ['P0', 'P1'].includes(issue.severity))) process.exitCode = 1;
}
module.exports = { runAudit: () => scanProfile('ar'), analyzeText: (source, relPath = 'inline.js') => analyzeText(source, relPath, 'ar') };
