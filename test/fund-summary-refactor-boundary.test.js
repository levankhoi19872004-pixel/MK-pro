'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

const service = require('../src/services/fundSummary.service');
const fundLedgerRepository = require('../src/repositories/fundLedgerRepository');

test('fund summary facade is small and responsibilities have explicit boundaries', () => {
  const facade = read('src/services/fundSummary.service.js');
  const domain = read('src/services/fund-summary/FundSummaryDomain.js');
  const filters = read('src/services/fund-summary/FundSummaryFilters.js');
  const queryBuilder = read('src/services/fund-summary/FundSummaryQueryBuilder.js');
  const workbook = read('src/services/fund-summary/FundSummaryWorkbook.js');

  assert.ok(facade.split(/\r?\n/).length <= 220, 'fundSummary.service.js must remain an orchestration facade');
  assert.match(facade, /fundLedgerRepository\.aggregate/);
  assert.match(facade, /buildFundSummaryWorkbook/);

  assert.doesNotMatch(domain, /models\//);
  assert.doesNotMatch(domain, /repositories\//);
  assert.doesNotMatch(domain, /excelWriter/);
  assert.doesNotMatch(filters, /models\//);
  assert.doesNotMatch(filters, /repositories\//);
  assert.doesNotMatch(queryBuilder, /fundLedgerRepository/);
  assert.doesNotMatch(queryBuilder, /excelWriter/);
  assert.doesNotMatch(workbook, /models\//);
  assert.doesNotMatch(workbook, /fundLedgerRepository/);

  for (const method of [
    'getFundSummary',
    'getFundSummaryTransactions',
    'exportFundSummary',
    'resolveFundCounterparty',
    'classifyTransaction',
    'normalizeLedgerForSummary',
    'summarizeNormalizedTransactions',
    'normalizeFilters',
    'buildNormalizedVoucherPipeline',
    'personKeyOf',
    'normalizeRole'
  ]) assert.equal(typeof service[method], 'function', method);
});

test('fund summary query counts remain one aggregate for list/detail and two for export', async () => {
  const original = fundLedgerRepository.aggregate;
  const calls = [];
  fundLedgerRepository.aggregate = async (pipeline) => {
    calls.push(pipeline);
    if (pipeline.some((stage) => stage.$facet)) {
      return [{ rows: [], peopleCount: [], count: [], totals: [], transfers: [] }];
    }
    return [];
  };

  try {
    await service.getFundSummary({ fromDate: '2026-06-20', toDate: '2026-06-20' });
    assert.equal(calls.length, 1);

    calls.length = 0;
    await service.getFundSummaryTransactions('DELIVERY:CODE:GH01', {
      fromDate: '2026-06-20',
      toDate: '2026-06-20'
    });
    assert.equal(calls.length, 1);

    calls.length = 0;
    const result = await service.exportFundSummary({ fromDate: '2026-06-20', toDate: '2026-06-20' });
    assert.equal(calls.length, 2);
    assert.ok(Buffer.isBuffer(result.buffer));
  } finally {
    fundLedgerRepository.aggregate = original;
  }
});

test('fund summary domain remains read-only and does not write any ledger/model', () => {
  for (const file of [
    'src/services/fundSummary.service.js',
    'src/services/fund-summary/FundSummaryDomain.js',
    'src/services/fund-summary/FundSummaryFilters.js',
    'src/services/fund-summary/FundSummaryQueryBuilder.js',
    'src/services/fund-summary/FundSummaryWorkbook.js'
  ]) {
    const source = read(file);
    assert.doesNotMatch(source, /\.(create|insertMany|findOneAndUpdate|updateOne|updateMany|deleteOne|deleteMany)\s*\(/, file);
  }
});
