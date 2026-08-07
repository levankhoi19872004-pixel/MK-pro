'use strict';

const contract = require('../../../src/services/delivery/deliverySuggestionSearchContract');

function scopeKey(row = {}) {
  const scope = contract.canonicalScope({
    deliveryDate: row.deliveryDateKey || row.deliveryDate,
    salesStaffCode: row.salesStaffCode || row.salesmanCode || row.nvbhCode,
    deliveryStaffCode: row.deliveryStaffCode || row.deliveryCode || row.nvghCode
  });
  return `${scope.deliveryDateKey}|${scope.salesStaffCode}|${scope.deliveryStaffCode}`;
}

class FakeSuggestionRepository {
  constructor(rows = []) {
    this.rows = rows.map((row) => ({ ...row }));
    this.scopeIndex = new Map();
    for (const row of this.rows) {
      const key = scopeKey(row);
      if (!this.scopeIndex.has(key)) this.scopeIndex.set(key, []);
      this.scopeIndex.get(key).push(row);
    }
    this.metrics = {
      fastCalls: 0,
      legacyCalls: 0,
      fastRowsInspected: 0,
      legacyRowsInspected: 0,
      fastRowsReturned: 0,
      legacyRowsReturned: 0
    };
  }

  bucket(scope = {}) {
    if (scope.deliveryDateKey && scope.salesStaffCode && scope.deliveryStaffCode) {
      return this.scopeIndex.get(`${scope.deliveryDateKey}|${scope.salesStaffCode}|${scope.deliveryStaffCode}`) || [];
    }
    return this.rows.filter((row) => contract.rowInScope(row, scope));
  }

  async findFastCandidates({ scope, keyword, candidateLimit }) {
    this.metrics.fastCalls += 1;
    const bucket = this.bucket(scope);
    const rows = [];
    for (const row of bucket) {
      this.metrics.fastRowsInspected += 1;
      if (Number(row.suggestSearchVersion || 0) !== contract.SEARCH_VERSION) continue;
      if (!contract.rowMatchesKeyword(row, keyword)) continue;
      rows.push({ ...row });
      if (rows.length >= candidateLimit) break;
    }
    this.metrics.fastRowsReturned += rows.length;
    return { rows, queries: 4, mode: 'normalized-fast-path' };
  }

  async findLegacyCandidates({ scope, keyword, candidateLimit }) {
    this.metrics.legacyCalls += 1;
    const bucket = this.bucket(scope);
    const rows = [];
    for (const row of bucket) {
      this.metrics.legacyRowsInspected += 1;
      if (!contract.rowMatchesKeyword(row, keyword)) continue;
      rows.push({ ...row });
      if (rows.length >= candidateLimit) break;
    }
    this.metrics.legacyRowsReturned += rows.length;
    return { rows, queries: 2, mode: 'legacy-bounded-fallback' };
  }
}

module.exports = { FakeSuggestionRepository };
