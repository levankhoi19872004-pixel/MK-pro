'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const source = fs.readFileSync('public/mobile/js/delivery-mobile-view.source.js', 'utf8');
const stateModule = fs.readFileSync('public/mobile/js/delivery-state.js', 'utf8');
const combinedSource = source + '\n' + stateModule;
const benchmarkMd = fs.readFileSync('MOBILE_DELIVERY_PERFORMANCE_BENCHMARK.md', 'utf8');
const benchmarkCsv = fs.readFileSync('MOBILE_DELIVERY_PERFORMANCE_BENCHMARK.csv', 'utf8');

function functionBody(name) {
  const start = source.search(new RegExp(`\\bfunction ${name}\\s*\\(`));
  assert.notEqual(start, -1, `${name} should exist`);
  let depth = 0;
  let bodyStart = -1;
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '{') {
      depth += 1;
      if (bodyStart < 0) bodyStart = i + 1;
    } else if (ch === '}') {
      depth -= 1;
      if (bodyStart >= 0 && depth === 0) return source.slice(bodyStart, i);
    }
  }
  throw new Error(`Cannot read function body for ${name}`);
}

test('delivery mobile initial load only loads orders and does not preload all returns/debts', () => {
  const loadBody = functionBody('load');
  assert.match(loadBody, /DeliveryCore\.loadOrders\(filters\(\)/);
  assert.doesNotMatch(loadBody, /DeliveryCore\.loadReturns\(filters\(\)/);
  assert.match(loadBody, /Lazy-load tab phụ/);
  assert.match(loadBody, /state\.tab === 'returns'/);
  assert.match(loadBody, /state\.tab === 'debt'/);
});

test('selecting an order no longer fires direct returnOrders request', () => {
  const selectBody = functionBody('select');
  assert.match(selectBody, /state\.tab = 'products'/);
  assert.doesNotMatch(selectBody, /loadSelectedReturnsDirect/);
});

test('returns and debt tabs use cache and in-flight guards', () => {
  assert.match(combinedSource, /DELIVERY_TAB_CACHE_TTL_MS = 60 \* 1000/);
  assert.match(combinedSource, /returnsCache:\s*\{\}/);
  assert.match(combinedSource, /returnsLoading:\s*false/);
  assert.match(combinedSource, /returnsPromise:\s*null/);
  assert.match(source, /selectedReturnsAreFresh\(order\)/);
  assert.match(source, /state\.returnsLoading && state\.returnsPromise/);

  assert.match(combinedSource, /debtCacheAt:\s*0/);
  assert.match(combinedSource, /debtPromise:\s*null/);
  assert.match(combinedSource, /debtRequestSeq:\s*0/);
  assert.match(source, /state\.debtPromise && !\(force && !append\)/);
});

test('refresh is throttled without throttling debounced search/filter loads', () => {
  assert.match(combinedSource, /DELIVERY_REFRESH_THROTTLE_MS = 1200/);
  assert.match(source, /mReload'\), 'click', function \(\) \{ load\(\{ force: true, refreshActiveTab: true \}\); \}/);
  assert.match(source, /debounce\(function \(\) \{ load\(\{ force: true \}\); \}, 250\)/);
  assert.match(source, /options\.refreshActiveTab && deliveryMobileState\.isFresh\(state\.lastLoadAt, DELIVERY_REFRESH_THROTTLE_MS\)/);
});

test('benchmark documents expected request count improvements', () => {
  assert.match(benchmarkMd, /Mở app.*1 request/i);
  assert.match(benchmarkMd, /Hàng trả.*lazy-load/i);
  assert.match(benchmarkMd, /Công nợ.*lazy-load/i);
  assert.match(benchmarkCsv, /open_app_before,2/);
  assert.match(benchmarkCsv, /open_app_after,1/);
  assert.match(benchmarkCsv, /switch_returns_after,0,1/);
  assert.match(benchmarkCsv, /switch_debt_after,0,1/);
});
