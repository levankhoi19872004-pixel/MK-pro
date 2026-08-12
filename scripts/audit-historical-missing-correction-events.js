#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const Timeline = require('../src/services/accounting/HistoricalCorrectionTimelineService');
const Detector = require('../src/services/accounting/HistoricalCorrectionMissingEventDetector');
const Planner = require('../src/services/accounting/HistoricalCorrectionRepairPlanner');

function text(value = '') { return String(value ?? '').trim(); }
function argValue(argv, name) {
  const direct = argv.find((value) => value.startsWith(`${name}=`));
  if (direct) return direct.slice(name.length + 1);
  const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] || '' : '';
}
function parseArgs(argv = process.argv.slice(2)) {
  return {
    orderCode: text(argValue(argv, '--order-code')),
    fixture: text(argValue(argv, '--fixture')),
    out: text(argValue(argv, '--out')),
    json: argv.includes('--json') || !argv.includes('--csv'),
    limit: Math.max(1, Math.min(500, Number(argValue(argv, '--limit')) || 100))
  };
}
async function loadInput(args) {
  if (args.fixture) return JSON.parse(fs.readFileSync(path.resolve(args.fixture), 'utf8'));
  try { require('dotenv').config(); } catch (_) {}
  const connectDB = require('../src/config/db');
  const mongoose = require('mongoose');
  const { loadEvidenceFromDb } = require('./lib/historical-correction-repair-db');
  await connectDB();
  try { return await loadEvidenceFromDb({ orderCode: args.orderCode }); }
  finally { await mongoose.connection.close().catch(() => {}); }
}
function auditInput(input = {}) {
  const transitions = Timeline.reconstructHistoricalTransitions(input);
  const findings = transitions.map((transition) => {
    const detection = Detector.detectMissingCanonicalEvent(transition, input.arLedgers || []);
    return {
      orderCode: transition.orderCode,
      customerCode: transition.customerCode,
      correctionId: transition.correctionId,
      correctionCode: transition.correctionCode,
      sourceOriginalVersion: transition.sourceOriginalVersion,
      fromVersion: transition.fromVersion,
      predecessorVersionId: transition.predecessorVersionId,
      toVersion: transition.toVersion,
      correctedVersionId: transition.correctedVersionId,
      lineageResolutionMethod: transition.lineageResolutionMethod,
      lineageHash: transition.lineageHash,
      correctionOwnedDebtDelta: transition.correctionOwnedDebtDelta,
      returnDeltaObserved: transition.returnDeltaObserved,
      eventIdentity: transition.eventIdentity,
      timelineClassification: transition.classification,
      detectorClassification: detection.classification,
      safeToPlan: detection.safeToApply === true,
      evidenceRefs: transition.evidenceRefs,
      evidenceHash: transition.evidenceHash
    };
  });
  const plan = Planner.createRepairPlan(input);
  return {
    readOnly: true,
    dryRun: true,
    mutation: false,
    policy: 'R1P4A_HISTORICAL_EVENT_DELTA_LINEAGE_RECONSTRUCTION',
    usesTargetMinusCurrentAr: false,
    orderCode: text(input.order?.orderCode || input.order?.code),
    currentArBeforeObserved: Timeline.money(input.currentArBeforeObserved),
    transitionCount: transitions.length,
    proposedRepairCount: plan.proposedRepairCount,
    planHash: plan.planHash,
    findings
  };
}
function toCsv(result = {}) {
  const cols = ['orderCode','customerCode','correctionId','correctionCode','sourceOriginalVersion','fromVersion','predecessorVersionId','toVersion','correctedVersionId','lineageResolutionMethod','lineageHash','correctionOwnedDebtDelta','returnDeltaObserved','eventIdentity','timelineClassification','detectorClassification','safeToPlan','evidenceHash'];
  const esc = (v) => `"${String(v ?? '').replaceAll('"','""')}"`;
  return [cols.join(','), ...(result.findings || []).map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n') + '\n';
}
async function main() {
  const args = parseArgs();
  if (!args.fixture && !args.orderCode) throw Object.assign(new Error('--order-code is required unless --fixture is used'), { code: 'HISTORICAL_REPAIR_ORDER_CODE_REQUIRED' });
  const input = await loadInput(args);
  const result = auditInput(input);
  if (args.out) fs.writeFileSync(path.resolve(args.out), args.json ? `${JSON.stringify(result, null, 2)}\n` : toCsv(result));
  if (!args.out || args.json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
if (require.main === module) main().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
module.exports = { parseArgs, auditInput, toCsv, loadInput };
