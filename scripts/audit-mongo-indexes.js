'use strict';

require('dotenv').config();

const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const { buildManagedIndexPlan } = require('../src/services/mongoIndexService');
const {
  analyzeIndexes,
  mergeIndexStats,
  summarizeAnalysis
} = require('../src/services/mongoIndexAuditService');
const {
  EMPTY_RETIRED_COLLECTIONS,
  RETIRED_INDEX_NAMES
} = require('./lib/mongoIndexCleanupPolicy');

function parseArgs(argv = process.argv.slice(2)) {
  const valueOf = (prefix, fallback = '') => {
    const arg = argv.find((item) => item.startsWith(`${prefix}=`));
    return arg ? arg.slice(prefix.length + 1) : fallback;
  };
  const collections = valueOf('--collections')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return {
    write: argv.includes('--write'),
    dropUnused: argv.includes('--drop-unused'),
    json: argv.includes('--json'),
    collections,
    minObservationHours: Math.max(1, Number(valueOf('--min-observation-hours', '168')) || 168)
  };
}

function formatKey(key = {}) {
  return Object.entries(key).map(([field, direction]) => `${field}:${direction}`).join(',');
}

function formatHours(value) {
  if (value === null || value === undefined) return '-';
  return Number(value).toFixed(1);
}

function statusOf(row, options) {
  if (row.dropDefault) return options.write ? 'DROP' : 'WOULD_DROP';
  if (row.dropUnusedEligible) {
    if (options.dropUnused) return options.write ? 'DROP_UNUSED' : 'WOULD_DROP_UNUSED';
    return 'UNUSED_CANDIDATE';
  }
  return 'KEEP';
}

async function readIndexStats(collection) {
  try {
    return await collection.aggregate([{ $indexStats: {} }]).toArray();
  } catch (err) {
    console.warn(`[WARN] ${collection.collectionName}: không đọc được $indexStats (${err.message})`);
    return [];
  }
}

async function listCollectionNames(db) {
  const rows = await db.listCollections({}, { nameOnly: true }).toArray();
  return rows
    .map((row) => row.name)
    .filter((name) => name && !name.startsWith('system.'))
    .sort();
}

async function inspectCollection(db, collectionName, managedDefinitions, options) {
  const collection = db.collection(collectionName);
  let existingIndexes;
  try {
    existingIndexes = await collection.indexes();
  } catch (err) {
    if (err.codeName === 'NamespaceNotFound' || /ns does not exist/i.test(err.message)) return null;
    throw err;
  }

  const [rawStats, documentCount] = await Promise.all([
    readIndexStats(collection),
    collection.estimatedDocumentCount().catch(() => null)
  ]);

  const analysis = analyzeIndexes({
    collectionName,
    existingIndexes,
    managedDefinitions,
    indexStats: mergeIndexStats(rawStats),
    retiredNames: RETIRED_INDEX_NAMES[collectionName] || [],
    emptyRetiredCollection: EMPTY_RETIRED_COLLECTIONS.includes(collectionName),
    documentCount,
    minObservationHours: options.minObservationHours
  });

  const dropped = [];
  if (options.write) {
    for (const row of analysis) {
      const shouldDrop = row.dropDefault || (options.dropUnused && row.dropUnusedEligible);
      if (!shouldDrop) continue;
      try {
        await collection.dropIndex(row.name);
        dropped.push(row.name);
      } catch (err) {
        if (err.codeName !== 'IndexNotFound') throw err;
      }
    }
  }

  return {
    collection: collectionName,
    documentCount,
    managedCount: managedDefinitions.length,
    analysis,
    summary: summarizeAnalysis(analysis),
    dropped
  };
}

async function main() {
  const options = parseArgs();
  await connectDB();
  const db = mongoose.connection.db;

  const managedPlans = buildManagedIndexPlan();
  const managedByCollection = new Map(
    managedPlans.map((plan) => [plan.collectionName, plan.definitions])
  );

  const allCollectionNames = await listCollectionNames(db);
  const wanted = options.collections.length
    ? allCollectionNames.filter((name) => options.collections.includes(name))
    : allCollectionNames;

  const reports = [];
  for (const collectionName of wanted) {
    const report = await inspectCollection(
      db,
      collectionName,
      managedByCollection.get(collectionName) || [],
      options
    );
    if (report) reports.push(report);
  }

  if (options.json) {
    console.log(JSON.stringify({ options, reports }, null, 2));
  } else {
    console.log(`\nMongo index audit: mode=${options.write ? 'WRITE' : 'DRY-RUN'}, dropUnused=${options.dropUnused}, observation>=${options.minObservationHours}h`);
    for (const report of reports) {
      const actionable = report.analysis.filter((row) => row.dropDefault || row.dropUnusedEligible);
      if (!actionable.length && report.summary.total <= report.managedCount + 1) continue;
      console.log(`\n[${report.collection}] docs=${report.documentCount ?? '?'} indexes=${report.summary.total} managed=${report.managedCount}`);
      for (const row of report.analysis) {
        const status = statusOf(row, options);
        if (status === 'KEEP' && ['managed', 'primary_key'].includes(row.reason)) continue;
        console.log(
          `  ${status.padEnd(20)} ${String(row.name).padEnd(58)} reason=${row.reason.padEnd(30)} ops=${String(row.ops ?? '-').padEnd(8)} hours=${formatHours(row.observationHours).padEnd(8)} key=${formatKey(row.key)}`
        );
      }
      if (report.dropped.length) console.log(`  Đã xóa: ${report.dropped.join(', ')}`);
    }
  }

  const totals = reports.reduce((acc, report) => {
    acc.collections += 1;
    acc.indexes += report.summary.total;
    acc.defaultDrop += report.summary.defaultDrop;
    acc.unusedCandidates += report.summary.unusedCandidates;
    acc.dropped += report.dropped.length;
    return acc;
  }, { collections: 0, indexes: 0, defaultDrop: 0, unusedCandidates: 0, dropped: 0 });

  console.log(`\nSUMMARY collections=${totals.collections} indexes=${totals.indexes} safeCandidates=${totals.defaultDrop} unusedCandidates=${totals.unusedCandidates} dropped=${totals.dropped}`);
  if (!options.write) {
    console.log('Dry-run: dùng --write để xóa index retired/duplicate/covered-prefix. Chỉ thêm --drop-unused sau khi $indexStats đã quan sát tối thiểu đủ thời gian.');
  }
}

main()
  .then(async () => {
    await mongoose.disconnect();
  })
  .catch(async (err) => {
    console.error('Mongo index audit failed:', err.message);
    try { await mongoose.disconnect(); } catch {}
    process.exitCode = 1;
  });
