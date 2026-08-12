#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const Planner = require('../src/services/accounting/HistoricalCorrectionRepairPlanner');

function text(value = '') { return String(value ?? '').trim(); }
function argValue(argv, name) {
  const direct = argv.find((value) => value.startsWith(`${name}=`));
  if (direct) return direct.slice(name.length + 1);
  const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] || '' : '';
}
function parseArgs(argv = process.argv.slice(2)) {
  return { orderCode: text(argValue(argv, '--order-code')), fixture: text(argValue(argv, '--fixture')), out: text(argValue(argv, '--output') || argValue(argv, '--out')) };
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
async function main() {
  const args = parseArgs();
  if (!args.fixture && !args.orderCode) throw Object.assign(new Error('--order-code is required unless --fixture is used'), { code: 'HISTORICAL_REPAIR_ORDER_CODE_REQUIRED' });
  const input = await loadInput(args);
  const plan = Planner.createRepairPlan(input);
  const defaultName = `historical-correction-repair-plan-${text(plan.orderCode || args.orderCode || 'fixture')}.json`;
  const out = path.resolve(args.out || defaultName);
  fs.writeFileSync(out, `${JSON.stringify(plan, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ readOnly: true, mutation: false, output: out, planHash: plan.planHash, proposedRepairCount: plan.proposedRepairCount }, null, 2)}\n`);
}
if (require.main === module) main().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
module.exports = { parseArgs, loadInput };
