#!/usr/bin/env node
'use strict';

const DeliveryMoneyContract = require('../src/services/delivery/financial/deliveryMoneyContract');

const DEFAULT_LIMIT = 50000;
const SAMPLE_LIMIT = 25;

function text(value = '') {
  return String(value ?? '').trim();
}

function hasMoney(source = {}, field = '') {
  return Object.prototype.hasOwnProperty.call(source || {}, field)
    && source[field] !== undefined
    && source[field] !== null
    && String(source[field]).trim() !== '';
}

function classifyLegacyCloseout(order = {}) {
  const closeout = order.deliveryCloseout && typeof order.deliveryCloseout === 'object'
    ? order.deliveryCloseout
    : {};
  const diagnostics = [];
  const resolved = DeliveryMoneyContract.resolveRewardOffsetComponents(closeout, {
    diagnostics,
    sourceName: 'salesOrders.deliveryCloseout'
  });

  let auditClass = 'unaffected_single_component';
  if (resolved.classification === 'safe_duplicate_alias' || resolved.classification === 'legacy_offset_includes_reward') {
    auditClass = 'safe_duplicate_alias';
  } else if (resolved.classification === 'independent_reward_offset') {
    auditClass = 'independent_reward_offset';
  } else if (resolved.classification === 'ambiguous') {
    auditClass = 'ambiguous';
  }

  return {
    auditClass,
    subtype: resolved.classification,
    orderId: text(order.id || order._id),
    orderCode: text(order.code || order.orderCode || order.salesOrderCode),
    customerCode: text(order.customerCode),
    closeoutVersion: Number(closeout.version || closeout.closeoutVersion || 0) || 0,
    rewardOffsetContractVersion: Number(closeout.rewardOffsetContractVersion || 0) || 0,
    rewardOffsetSemantics: text(closeout.rewardOffsetSemantics),
    rawRewardAmount: resolved.rawRewardAmount,
    rawOffsetAmount: resolved.rawOffsetAmount,
    normalizedRewardAmount: resolved.rewardAmount,
    normalizedIndependentOffsetAmount: resolved.offsetAmount,
    handledRewardOffsetAmount: resolved.handledRewardOffsetAmount,
    evidence: resolved.evidence,
    ambiguous: resolved.ambiguous === true,
    diagnostics
  };
}

function summarize(rows = []) {
  const counts = {
    scanned: rows.length,
    safe_duplicate_alias: 0,
    ambiguous: 0,
    independent_reward_offset: 0,
    unaffected_single_component: 0
  };
  const samples = {
    safe_duplicate_alias: [],
    ambiguous: [],
    independent_reward_offset: []
  };
  for (const row of rows) {
    if (Object.prototype.hasOwnProperty.call(counts, row.auditClass)) counts[row.auditClass] += 1;
    if (samples[row.auditClass] && samples[row.auditClass].length < SAMPLE_LIMIT) samples[row.auditClass].push(row);
  }
  return { counts, samples };
}

function buildMongoFilter() {
  return {
    deliveryCloseout: { $exists: true },
    $or: [
      ...DeliveryMoneyContract.REWARD_FIELDS.map((field) => ({ [`deliveryCloseout.${field}`]: { $exists: true } })),
      ...DeliveryMoneyContract.OFFSET_FIELDS.map((field) => ({ [`deliveryCloseout.${field}`]: { $exists: true } }))
    ]
  };
}

async function main() {
  try { require('dotenv').config(); } catch (_) {}
  const mongoose = require('mongoose');
  const connectDB = require('../src/config/db');
  const SalesOrder = require('../src/models/SalesOrder');

  const args = new Set(process.argv.slice(2));
  const json = args.has('--json');
  const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
  const limit = limitArg ? Math.max(1, Number(limitArg.split('=')[1]) || DEFAULT_LIMIT) : DEFAULT_LIMIT;

  await connectDB();
  try {
    const orders = await SalesOrder.find(buildMongoFilter())
      .select('_id id code orderCode salesOrderCode customerCode deliveryCloseout')
      .limit(limit)
      .lean();
    const classified = orders.map(classifyLegacyCloseout);
    const result = {
      audit: 'REWARD_OFFSET_LEGACY_DRY_RUN',
      mode: 'READ_ONLY_NO_MUTATION',
      limit,
      ...summarize(classified),
      safety: {
        writesExecuted: 0,
        autoFixAmbiguous: false,
        migrationExecuted: false,
        note: 'Script chỉ đọc SalesOrder và phân loại; không update/save/delete/bulkWrite.'
      }
    };
    if (json) console.log(JSON.stringify(result, null, 2));
    else {
      console.log('Reward/Offset legacy audit — DRY RUN ONLY');
      console.log('='.repeat(64));
      for (const [key, value] of Object.entries(result.counts)) console.log(`${key.padEnd(30)} ${value}`);
      if (result.counts.ambiguous > 0) {
        console.log('\nAMBIGUOUS samples (không auto-fix):');
        for (const row of result.samples.ambiguous) {
          console.log(`- ${row.orderCode || row.orderId}: reward=${row.rawRewardAmount}, offset=${row.rawOffsetAmount}, evidence=${row.evidence}`);
        }
      }
    }
  } finally {
    await mongoose.connection.close();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[audit-reward-offset-legacy] failed:', err);
    process.exit(1);
  });
}

module.exports = { classifyLegacyCloseout, summarize, buildMongoFilter };
