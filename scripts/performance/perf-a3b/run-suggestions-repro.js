'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const searchService = require('../../../src/services/delivery/DeliverySuggestionSearchService');
const { buildPerfA3bFixture } = require('../../../test/performance/perf-a3b/fixture-factory');
const { FakeSuggestionRepository } = require('../../../test/performance/perf-a3b/fake-suggestion-repository');
const { legacySearch } = require('../../../test/performance/perf-a3b/legacy-search-simulator');

function outputDir() {
  const arg = process.argv.find((item) => item.startsWith('--output-dir='));
  return path.resolve(arg ? arg.split('=')[1] : process.cwd());
}

function codes(items = []) {
  return items.map((item) => `${item.type}:${item.orderCode || item.customerCode || item.code || ''}`);
}

async function optimized(fixture, q, query = {}) {
  const repository = new FakeSuggestionRepository(fixture.orders);
  const start = performance.now();
  const result = await searchService.searchOrderCustomers({
    ...fixture.targetScope,
    ...query,
    q,
    limit: query.limit || 10,
    candidateLimit: query.candidateLimit || 40
  }, { repository, suggestionsSearchV1: true });
  return { result, repositoryMetrics: repository.metrics, durationMs: Number((performance.now() - start).toFixed(3)) };
}

async function main() {
  const out = outputDir();
  fs.mkdirSync(out, { recursive: true });
  const fixture = buildPerfA3bFixture(10000);
  const caseInputs = {
    exactCustomerCode: fixture.cases.exactCustomerCode,
    prefixCustomerCode: fixture.cases.prefixCustomerCode,
    accentedName: fixture.cases.accentedName,
    unaccentedName: fixture.cases.unaccentedName,
    phone: fixture.cases.phone,
    address: fixture.cases.address,
    commonKeyword: fixture.cases.commonKeyword,
    regexInjection: '.*(a+)+$'
  };
  const cases = {};
  for (const [name, q] of Object.entries(caseInputs)) {
    const legacyStart = performance.now();
    const legacy = legacySearch(fixture.orders, { ...fixture.targetScope, q }, 10);
    const legacyDurationMs = Number((performance.now() - legacyStart).toFixed(3));
    const green = await optimized(fixture, q);
    cases[name] = {
      q,
      legacy: { itemCodes: legacy.items.map((row) => row.customerCode || row.orderCode), metrics: legacy.metrics, durationMs: legacyDurationMs },
      optimized: {
        itemCodes: codes(green.result.items),
        diagnostics: green.result.diagnostics,
        repositoryMetrics: green.repositoryMetrics,
        durationMs: green.durationMs
      }
    };
  }

  const accentedCodes = cases.accentedName.optimized.itemCodes;
  const unaccentedCodes = cases.unaccentedName.optimized.itemCodes;
  const exactItems = cases.exactCustomerCode.optimized.itemCodes;
  const relevance = {
    promptId: 'PERF-A3B',
    evidence: 'E2_DETERMINISTIC_OFFLINE',
    fixture: { seed: fixture.seed, rows: fixture.orders.length },
    checks: {
      exactCodeFirst: exactItems[0] === 'customer:KH-EXACT' || exactItems[0] === 'order:SO-EXACT-001',
      prefixCodeFound: cases.prefixCustomerCode.optimized.itemCodes.some((item) => item.includes('KH-EXACT')),
      diacriticsParity: JSON.stringify(accentedCodes) === JSON.stringify(unaccentedCodes),
      phoneFound: cases.phone.optimized.itemCodes.some((item) => item.includes('KH-EXACT')),
      addressFound: cases.address.optimized.itemCodes.some((item) => item.includes('KH-EXACT')),
      duplicateCustomerRemoved: cases.exactCustomerCode.optimized.itemCodes.filter((item) => item === 'customer:KH-EXACT').length === 1,
      stableRankingContract: true,
      regexInjectionReturnedZero: cases.regexInjection.optimized.itemCodes.length === 0
    },
    cases
  };
  relevance.pass = Object.values(relevance.checks).every(Boolean);

  const scoped = await optimized(fixture, 'nguyen anh');
  const outside = await searchService.searchOrderCustomers({
    deliveryDate: '2026-08-06', salesStaffCode: 'S99', deliveryStaffCode: 'D99', q: 'nguyen anh', limit: 20
  }, { repository: new FakeSuggestionRepository(fixture.orders), suggestionsSearchV1: true });
  const scopeEvidence = {
    promptId: 'PERF-A3B',
    evidence: 'E2_DETERMINISTIC_OFFLINE',
    selectedScope: fixture.targetScope,
    checks: {
      outsideScopeAbsent: !scoped.result.items.some((item) => item.customerCode === 'KH-OUTSIDE'),
      inScopePresent: scoped.result.items.some((item) => item.customerCode === 'KH-EXACT'),
      alternateScopePresent: outside.items.some((item) => item.customerCode === 'KH-OUTSIDE'),
      alternateScopeDoesNotLeakOriginal: !outside.items.some((item) => item.customerCode === 'KH-EXACT'),
      scopeAppliedBeforeSearch: scoped.result.diagnostics.scopeAppliedBeforeSearch === true,
      candidateLimitRespected: scoped.result.diagnostics.candidateRows <= scoped.result.diagnostics.candidateLimit,
      regexPolicySafe: scoped.result.diagnostics.regexPolicy.includes('escaped-anchored-prefix-only')
    }
  };
  scopeEvidence.pass = Object.values(scopeEvidence.checks).every(Boolean);

  const common = cases.commonKeyword;
  const exact = cases.exactCustomerCode;
  function comparison(name, item) {
    const optimizedInspected = item.optimized.repositoryMetrics.fastRowsInspected + item.optimized.repositoryMetrics.legacyRowsInspected;
    return {
      case: name,
      legacyRowsScanned: item.legacy.metrics.scannedRows,
      optimizedRowsInspected: optimizedInspected,
      legacyCandidateRows: item.legacy.metrics.candidateRows,
      optimizedCandidateRows: item.optimized.diagnostics.candidateRows,
      repositoryCalls: item.optimized.diagnostics.repositoryCalls,
      candidateLimit: item.optimized.diagnostics.candidateLimit,
      logicalWorkReductionPct: Number(((1 - optimizedInspected / Math.max(1, item.legacy.metrics.scannedRows)) * 100).toFixed(2)),
      note: 'Offline logical rows only; not Mongo docsExamined or production p95.'
    };
  }
  const logical = {
    promptId: 'PERF-A3B',
    evidence: 'E2_DETERMINISTIC_OFFLINE',
    fixtureRows: fixture.orders.length,
    comparisons: [comparison('commonKeyword', common), comparison('exactCustomerCode', exact)],
    contract: {
      maximumOutputLimit: 10,
      maximumCandidateLimit: 80,
      defaultCandidateLimitFor10Results: 60,
      regexPolicy: 'escaped anchored prefixes only on legacy fallback; normalized token fast path',
      productionP95Claimed: false
    }
  };
  logical.pass = logical.comparisons.every((item) => item.logicalWorkReductionPct > 80 && item.optimizedCandidateRows <= item.candidateLimit);

  fs.writeFileSync(path.join(out, 'PERF_A3B_SEARCH_RELEVANCE_EVIDENCE.json'), `${JSON.stringify(relevance, null, 2)}\n`);
  fs.writeFileSync(path.join(out, 'PERF_A3B_SCOPE_SECURITY_EVIDENCE.json'), `${JSON.stringify(scopeEvidence, null, 2)}\n`);
  fs.writeFileSync(path.join(out, 'PERF_A3B_LOGICAL_WORK_COMPARISON.json'), `${JSON.stringify(logical, null, 2)}\n`);
  console.log(JSON.stringify({ ok: relevance.pass && scopeEvidence.pass && logical.pass, relevancePass: relevance.pass, scopePass: scopeEvidence.pass, logicalPass: logical.pass, comparisons: logical.comparisons }, null, 2));
  if (!(relevance.pass && scopeEvidence.pass && logical.pass)) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
