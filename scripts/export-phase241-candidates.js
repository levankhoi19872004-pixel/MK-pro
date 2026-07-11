'use strict';

const fs = require('node:fs');
const path = require('node:path');

const OUT_DIR = path.join(__dirname, '..', 'reports', 'performance');
const JSON_PATH = path.join(OUT_DIR, 'phase241-optimization-candidates.json');
const MD_PATH = path.join(OUT_DIR, 'phase241-optimization-candidates.md');

function toMarkdown(report) {
  const lines = [
    '# Phase241 Optimization Candidates',
    '',
    `- Generated at: ${report.generatedAt}`,
    `- Status: ${report.status}`,
    `- Evidence: ${report.evidenceStatus}`,
    '',
    '| Route | Module | Calls | p95 ms | Score | Risk |',
    '|---|---|---:|---:|---:|---|',
    ...(report.candidates || []).map((row) => `|${row.route}|${row.module || ''}|${row.countDelta || 0}|${row.p95Ms || 0}|${row.performanceImpactScore || 0}|${row.riskClass || 'UNKNOWN'}|`),
    '',
    ...(report.limitations || []).map((item) => `- ${item}`)
  ];
  return `${lines.join('\n')}\n`;
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const report = {
    ok: true,
    generatedAt: new Date().toISOString(),
    status: 'BLOCKED_NO_PRODUCTION_EVIDENCE',
    evidenceStatus: 'BLOCKED',
    candidates: [],
    limitations: [
      'No production or staging observation evidence is available in this workspace.',
      'Phase241 does not create fake ranking from local health endpoints.',
      'Run a passive production/staging observation session, then export evidence before Phase242 selection.'
    ]
  };
  fs.writeFileSync(JSON_PATH, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(MD_PATH, toMarkdown(report));
  console.log(JSON.stringify({ ok: true, json: JSON_PATH, markdown: MD_PATH }, null, 2));
}

main();
