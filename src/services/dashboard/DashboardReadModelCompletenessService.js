'use strict';

const crypto = require('node:crypto');

function text(value) {
  return String(value || '').trim();
}

function latestTimestamp(docs = []) {
  return docs.reduce((latest, doc) => {
    const candidate = text(doc?.updatedAt || doc?.generatedAt);
    return candidate && candidate > latest ? candidate : latest;
  }, '');
}

function sourceVersionForDocs(docs = []) {
  const canonical = docs
    .map((doc) => ({
      date: text(doc?.date),
      version: text(doc?.sourceVersion || doc?.updatedAt || doc?.generatedAt || 'unknown')
    }))
    .sort((left, right) => left.date.localeCompare(right.date));
  return crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

function inspectCompleteness({ expectedDates = [], docs = [] } = {}) {
  const expected = Array.from(new Set(expectedDates.map(text).filter(Boolean))).sort();
  const byDate = new Map();
  const duplicateDates = [];
  const invalidDates = [];

  for (const doc of docs || []) {
    const date = text(doc?.date);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      invalidDates.push(date || '(empty)');
      continue;
    }
    if (byDate.has(date)) duplicateDates.push(date);
    byDate.set(date, doc);
  }

  const missingDates = expected.filter((date) => !byDate.has(date));
  const unexpectedDates = Array.from(byDate.keys()).filter((date) => !expected.includes(date)).sort();
  const complete = expected.length > 0
    && missingDates.length === 0
    && duplicateDates.length === 0
    && invalidDates.length === 0;
  const orderedDocs = expected.map((date) => byDate.get(date)).filter(Boolean);

  return {
    complete,
    expectedDates: expected,
    missingDates,
    duplicateDates: Array.from(new Set(duplicateDates)).sort(),
    invalidDates: Array.from(new Set(invalidDates)).sort(),
    unexpectedDates,
    docs: orderedDocs,
    generatedAt: latestTimestamp(orderedDocs),
    sourceVersion: sourceVersionForDocs(orderedDocs),
    source: complete ? 'dashboardDailyStats' : 'dashboardDailyStats-incomplete'
  };
}

function chooseReadStrategy({
  completeness,
  allowPartialLiveFill = false,
  parityGuaranteed = false,
  maxPartialDates = 1
} = {}) {
  if (completeness?.complete) {
    return { strategy: 'read-model-complete', canUseReadModel: true, canMixSources: false };
  }
  const missingCount = completeness?.missingDates?.length || 0;
  if (allowPartialLiveFill && parityGuaranteed && missingCount > 0 && missingCount <= maxPartialDates) {
    return {
      strategy: 'partial-live-fill',
      canUseReadModel: true,
      canMixSources: true,
      missingDates: completeness.missingDates.slice()
    };
  }
  return {
    strategy: 'fallback-live-query',
    canUseReadModel: false,
    canMixSources: false,
    missingDates: completeness?.missingDates?.slice() || []
  };
}

function buildReadModelMeta(completeness = {}) {
  return {
    source: 'dashboardDailyStats',
    generatedAt: text(completeness.generatedAt),
    sourceTimestamp: text(completeness.generatedAt),
    sourceVersion: text(completeness.sourceVersion),
    expectedDates: completeness.expectedDates || [],
    missingDates: [],
    complete: true
  };
}

function buildFallbackMeta(completeness = {}, reason = 'dashboardDailyStats_missing_or_incomplete') {
  return {
    source: 'fallback-live-query',
    generatedAt: new Date().toISOString(),
    sourceTimestamp: text(completeness.generatedAt),
    sourceVersion: text(completeness.sourceVersion),
    expectedDates: completeness.expectedDates || [],
    missingDates: completeness.missingDates || [],
    duplicateDates: completeness.duplicateDates || [],
    invalidDates: completeness.invalidDates || [],
    complete: false,
    reason
  };
}

module.exports = {
  inspectCompleteness,
  chooseReadStrategy,
  buildReadModelMeta,
  buildFallbackMeta,
  sourceVersionForDocs,
  latestTimestamp
};
