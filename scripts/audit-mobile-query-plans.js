'use strict';

/**
 * Read-only query plan audit for the mobile sales hot paths.
 *
 * Default mode only reports the managed index coverage and never connects to MongoDB.
 * Set MOBILE_QUERY_PLAN_AUDIT_DB=1 together with MONGO_URI to execute explain('executionStats').
 * This script never creates, drops, or modifies an index or document.
 */

require('dotenv').config();

const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const Customer = require('../src/models/Customer');
const Product = require('../src/models/Product');
const SalesOrder = require('../src/models/SalesOrder');
const ArLedger = require('../src/models/ArLedger');
const { INDEX_DEFINITIONS } = require('../src/services/mongoIndexService');

function keyText(key = {}) {
  return Object.entries(key).map(([field, direction]) => `${field}:${direction}`).join(', ');
}

function managedIndexes(collectionKey) {
  return (INDEX_DEFINITIONS[collectionKey] || []).map(([key, options]) => ({
    name: options?.name || keyText(key),
    key
  }));
}

const auditCases = [
  {
    name: 'mobile customers by NVBH',
    collectionKey: 'customers',
    indexes: managedIndexes('customers'),
    explain: () => Customer.find({
      isActive: { $ne: false },
      salesStaffCode: process.env.MOBILE_AUDIT_SALES_STAFF_CODE || '__AUDIT__'
    }).select('code customerCode name phone address').sort({ code: 1, _id: 1 }).limit(40).lean()
  },
  {
    name: 'mobile product page',
    collectionKey: 'products',
    indexes: managedIndexes('products'),
    explain: () => Product.find({ isActive: { $ne: false } })
      .select('code productCode name baseUnit conversionRate salePrice')
      .sort({ code: 1, _id: 1 })
      .limit(50)
      .lean()
  },
  {
    name: 'mobile orders by NVBH and day',
    collectionKey: 'salesOrders',
    indexes: managedIndexes('salesOrders'),
    explain: () => SalesOrder.find({
      salesStaffCode: process.env.MOBILE_AUDIT_SALES_STAFF_CODE || '__AUDIT__',
      orderDate: process.env.MOBILE_AUDIT_ORDER_DATE || '2099-01-01',
      status: { $nin: ['cancelled', 'canceled', 'deleted', 'void', 'reversed'] }
    }).select('id code customerCode totalAmount status orderDate').sort({ createdAt: -1, _id: -1 }).limit(30).lean()
  },
  {
    name: 'mobile debt seed by NVBH',
    collectionKey: 'arLedgers',
    indexes: managedIndexes('arLedgers'),
    explain: () => ArLedger.find({
      type: { $in: ['ar_sale', 'ar_external_debt'] },
      salesStaffCode: process.env.MOBILE_AUDIT_SALES_STAFF_CODE || '__AUDIT__',
      status: { $nin: ['void', 'cancelled', 'canceled', 'deleted', 'reversed'] }
    }).select('orderId orderCode customerCode date').sort({ date: -1 }).limit(100).lean()
  }
];

function staticReport() {
  return auditCases.map((entry) => ({
    query: entry.name,
    collection: entry.collectionKey,
    managedIndexes: entry.indexes.map((row) => `${row.name} (${keyText(row.key)})`)
  }));
}

function collectPlanStages(plan = {}, stages = []) {
  if (!plan || typeof plan !== 'object') return stages;
  if (plan.stage) stages.push({ stage: plan.stage, indexName: plan.indexName || '' });
  for (const value of Object.values(plan)) {
    if (value && typeof value === 'object') collectPlanStages(value, stages);
  }
  return stages;
}

function summarizeExplain(explain = {}) {
  const stats = explain.executionStats || {};
  const planner = explain.queryPlanner || {};
  const winningPlan = planner.winningPlan || {};
  const inputStage = winningPlan.inputStage || winningPlan;
  const stages = collectPlanStages(winningPlan);
  const returned = Number(stats.nReturned || 0);
  const examinedDocs = Number(stats.totalDocsExamined || 0);
  return {
    namespace: planner.namespace || '',
    winningStage: winningPlan.stage || inputStage.stage || '',
    indexName: inputStage.indexName || winningPlan.indexName || '',
    returned,
    examinedDocs,
    examinedRatio: returned > 0 ? Number((examinedDocs / returned).toFixed(2)) : examinedDocs,
    examinedKeys: Number(stats.totalKeysExamined || 0),
    executionTimeMs: Number(stats.executionTimeMillis || 0),
    collectionScan: stages.some((row) => row.stage === 'COLLSCAN'),
    stages
  };
}


function auditViolations(results = [], env = process.env) {
  const maxRatio = Math.max(1, Number(env.MOBILE_QUERY_PLAN_MAX_DOCS_RATIO || 20));
  const maxExecutionMs = Math.max(1, Number(env.MOBILE_QUERY_PLAN_MAX_EXECUTION_MS || 500));
  const violations = [];
  for (const row of results) {
    if (row.collectionScan) violations.push({ query: row.query, code: 'COLLSCAN', message: 'Winning plan có COLLSCAN' });
    if (row.examinedRatio > maxRatio) violations.push({ query: row.query, code: 'DOCS_EXAMINED_RATIO', value: row.examinedRatio, limit: maxRatio });
    if (row.executionTimeMs > maxExecutionMs) violations.push({ query: row.query, code: 'EXECUTION_TIME', value: row.executionTimeMs, limit: maxExecutionMs });
  }
  return { maxRatio, maxExecutionMs, violations };
}

async function main() {
  const staticRows = staticReport();
  console.log(JSON.stringify({ mode: 'static-index-coverage', readOnly: true, queries: staticRows }, null, 2));

  if (process.env.MOBILE_QUERY_PLAN_AUDIT_DB !== '1') {
    console.log('[mobile-query-plan-audit] DB explain skipped. Set MOBILE_QUERY_PLAN_AUDIT_DB=1 to run read-only explain.');
    return;
  }
  if (!process.env.MONGO_URI) throw new Error('Thiếu MONGO_URI cho MOBILE_QUERY_PLAN_AUDIT_DB=1');

  await connectDB();
  const results = [];
  for (const entry of auditCases) {
    const explain = await entry.explain().explain('executionStats');
    results.push({ query: entry.name, collection: entry.collectionKey, ...summarizeExplain(explain) });
  }
  const audit = auditViolations(results);
  console.log(JSON.stringify({ mode: 'mongo-execution-stats', readOnly: true, results, audit }, null, 2));
  if (process.env.MOBILE_QUERY_PLAN_ENFORCE === '1' && audit.violations.length) {
    const error = new Error(`Mobile query plan audit có ${audit.violations.length} vi phạm`);
    error.code = 'MOBILE_QUERY_PLAN_AUDIT_FAILED';
    throw error;
  }
}

if (require.main === module) main()
  .catch((error) => {
    console.error('[mobile-query-plan-audit]', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState) await mongoose.disconnect();
  });

module.exports = { staticReport, summarizeExplain, auditViolations, collectPlanStages };
