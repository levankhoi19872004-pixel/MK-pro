#!/usr/bin/env node
'use strict';

try { require('dotenv').config(); } catch (_) {}

const mongoose = require('mongoose');
const FundBalanceReadService = require('../src/services/accounting/FundBalanceReadService');
const fundLedgerRepository = require('../src/repositories/fundLedgerRepository');

function valueOf(name, fallback = '') {
  const direct = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (direct) return direct.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] || '') : fallback;
}

function safeError(error = {}) {
  return {
    name: error.name || '',
    code: error.code,
    codeName: error.codeName || '',
    message: String(error.message || '').replace(/mongodb(\+srv)?:\/\/[^\s]+/gi, 'mongodb://***')
  };
}

async function runOperation(operation, pipeline, options = {}) {
  const startedAt = Date.now();
  try {
    const rows = await fundLedgerRepository.aggregate(pipeline, options);
    return {
      operation,
      ok: true,
      durationMs: Date.now() - startedAt,
      pipelineStageCount: pipeline.length,
      outputCount: Array.isArray(rows) ? rows.length : null
    };
  } catch (error) {
    return {
      operation,
      ok: false,
      durationMs: Date.now() - startedAt,
      pipelineStageCount: pipeline.length,
      error: safeError(error)
    };
  }
}

async function main() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGO_URI is required for benchmark-fund-ledger-read');

  const query = {
    dateFrom: valueOf('--date-from', valueOf('--dateFrom', '')),
    dateTo: valueOf('--date-to', valueOf('--dateTo', '')),
    q: valueOf('--q', ''),
    direction: valueOf('--direction', ''),
    sourceType: valueOf('--source-type', valueOf('--sourceType', '')),
    fundType: valueOf('--fund-type', valueOf('--fundType', '')),
    limit: valueOf('--limit', '200'),
    page: valueOf('--page', '1')
  };

  await mongoose.connect(uri, {
    autoIndex: false,
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 60000,
    maxPoolSize: 2,
    family: 4,
    retryWrites: false
  });

  try {
    const filters = FundBalanceReadService.normalizeQuery(query);
    const summaryPipeline = FundBalanceReadService.buildSummaryPipeline(filters);
    const rowsPipeline = FundBalanceReadService.buildRowsPipeline(filters);
    const requestStartedAt = Date.now();
    const [summary, rows] = await Promise.all([
      runOperation('summary', summaryPipeline),
      runOperation('rows', rowsPipeline)
    ]);
    const serviceStartedAt = Date.now();
    let service = null;
    try {
      const response = await FundBalanceReadService.listFundLedgers(query);
      service = {
        ok: true,
        durationMs: Date.now() - serviceStartedAt,
        rowCount: response.rows.length,
        totalRows: response.pagination.totalRows,
        filteredRowsTotalIn: response.summary.filteredRowsTotalIn,
        filteredRowsTotalOut: response.summary.filteredRowsTotalOut,
        scopeType: response.scope.type
      };
    } catch (error) {
      service = { ok: false, durationMs: Date.now() - serviceStartedAt, error: safeError(error), cause: safeError(error.cause || {}) };
    }

    console.log(JSON.stringify({
      generatedAt: new Date().toISOString(),
      database: mongoose.connection.name,
      filters: {
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        fundType: filters.fundType,
        account: filters.account,
        direction: filters.direction,
        sourceType: filters.sourceType,
        hasSearchQuery: Boolean(filters.q)
      },
      totalRequestDurationMs: Date.now() - requestStartedAt,
      summary,
      rows,
      service
    }, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}

main().catch(async (error) => {
  console.error(JSON.stringify({ ok: false, error: safeError(error) }, null, 2));
  try { await mongoose.disconnect(); } catch (_) {}
  process.exitCode = 1;
});
