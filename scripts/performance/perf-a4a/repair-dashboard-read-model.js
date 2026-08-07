'use strict';

require('dotenv').config();

const mongoose = require('mongoose');
const connectDB = require('../../../src/config/db');
const DashboardDailyStatsService = require('../../../src/services/dashboard/DashboardDailyStatsService');
const { rebuildDate } = require('../../rebuild-dashboard-daily-stats');
const dateUtil = require('../../../src/utils/date.util');

function argValue(name) {
  const prefix = `--${name}=`;
  const arg = process.argv.find((value) => value.startsWith(prefix));
  return arg ? arg.slice(prefix.length).trim() : '';
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function resolveRange() {
  const period = argValue('period');
  const from = argValue('from');
  const to = argValue('to');
  if (period) {
    if (!/^\d{4}-\d{2}$/.test(period)) throw new Error('--period phải có dạng YYYY-MM');
    const [year, month] = period.split('-').map(Number);
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return { dateFrom: `${period}-01`, dateTo: `${period}-${String(lastDay).padStart(2, '0')}` };
  }
  if (!from || !to) throw new Error('Dùng --period=YYYY-MM hoặc --from=YYYY-MM-DD --to=YYYY-MM-DD');
  return { dateFrom: from, dateTo: to };
}

async function main() {
  const apply = hasFlag('apply');
  const confirmed = hasFlag('confirm-repair');
  if (apply && !confirmed) throw new Error('Apply yêu cầu cả --apply và --confirm-repair');
  const range = resolveRange();
  await connectDB();
  const before = await DashboardDailyStatsService.inspectRangeCompleteness({
    ...range,
    today: dateUtil.todayVN()
  });
  const report = {
    mode: apply ? 'apply' : 'dry-run',
    range,
    expectedDateCount: before.expectedDates.length,
    missingDates: before.missingDates,
    duplicateDates: before.duplicateDates,
    invalidDates: before.invalidDates,
    writesPlanned: apply ? before.missingDates.length : 0,
    writesApplied: 0
  };

  if (apply) {
    if (before.duplicateDates.length || before.invalidDates.length) {
      throw new Error('Không repair khi còn duplicate/invalid date; cần audit thủ công trước');
    }
    for (const date of before.missingDates) {
      await rebuildDate(date);
      report.writesApplied += 1;
    }
    const after = await DashboardDailyStatsService.inspectRangeCompleteness({
      ...range,
      today: dateUtil.todayVN()
    });
    report.after = {
      complete: after.complete,
      missingDates: after.missingDates,
      sourceVersion: after.sourceVersion,
      generatedAt: after.generatedAt
    };
    if (!after.complete) throw new Error('Repair xong nhưng read model vẫn chưa complete');
  }
  console.log(JSON.stringify(report, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(JSON.stringify({ ok: false, error: error.message }));
    process.exitCode = 1;
  }).finally(async () => {
    if (mongoose.connection.readyState) await mongoose.disconnect();
  });
}

module.exports = { argValue, hasFlag, resolveRange, main };
