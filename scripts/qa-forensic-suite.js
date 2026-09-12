#!/usr/bin/env node
'use strict';

const path = require('node:path');
const {
  parseArgs,
  buildPlan,
  runStep,
  reportBase,
  writeReport
} = require('./lib/qaForensicSuite');

function icon(status) {
  return ({ PASS: '✓', FAIL: '✗', WARN: '!', SKIP: '-' })[status] || '?';
}

function main() {
  const options = parseArgs();
  const plan = buildPlan(options);
  const results = [];

  if (!options.jsonOnly) {
    console.log(`MK-Pro QA / Forensic Suite — profile=${options.profile}`);
    console.log(`Checks: ${plan.length}${options.withDb ? ' (DB read-only enabled)' : ''}`);
  }

  for (const step of plan) {
    if (!options.jsonOnly) process.stdout.write(`→ ${step.title} ... `);
    const result = runStep(step, options);
    results.push(result);
    if (!options.jsonOnly) console.log(`${icon(result.status)} ${result.status} (${result.durationMs} ms)`);
  }

  const report = reportBase(options, results);
  let paths = null;
  if (!options.noReport) paths = writeReport(report, options.outputDir);

  if (options.jsonOnly) {
    console.log(JSON.stringify({ ...report, reportFiles: paths }, null, 2));
  } else {
    console.log('');
    console.log(`Summary: PASS=${report.summary.PASS} FAIL=${report.summary.FAIL} WARN=${report.summary.WARN} SKIP=${report.summary.SKIP}`);
    console.log(`Release gate: ${report.summary.ok ? 'PASS' : 'FAIL'}`);
    if (paths) {
      console.log(`JSON: ${path.relative(process.cwd(), paths.jsonPath)}`);
      console.log(`Markdown: ${path.relative(process.cwd(), paths.mdPath)}`);
    }
  }

  process.exitCode = report.summary.ok ? 0 : 2;
}

try {
  main();
} catch (error) {
  console.error(`[qa-forensic-suite] ${error.stack || error.message}`);
  process.exit(1);
}
