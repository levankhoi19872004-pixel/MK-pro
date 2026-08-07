'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const DELIVERY_UI = path.join(ROOT, 'public/js/app/new/91-delivery-today-new.js');
const DELIVERY_CORE = path.join(ROOT, 'public/js/delivery/delivery-core.js');
const SALES_UX = path.join(ROOT, 'public/mobile/js/sales-ux.js');

function read(file) { return fs.readFileSync(file, 'utf8'); }

function extractFunction(source, name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `${name} must exist`);
  const bodyStart = source.indexOf('{', start);
  assert.notEqual(bodyStart, -1, `${name} body must exist`);
  let depth = 0;
  let quote = '';
  let escape = false;
  for (let i = bodyStart; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) {
      if (escape) escape = false;
      else if (ch === '\\') escape = true;
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`Unable to extract ${name}`);
}

function loadCanonicalDisplayResolver() {
  const source = read(DELIVERY_UI);
  const fnSource = extractFunction(source, 'canonicalRewardOffsetAmount');
  const sandbox = {
    parseVietnameseMoney(value) {
      if (value == null || value === '') return 0;
      const n = Number(value);
      return Number.isFinite(n) ? Math.round(n) : 0;
    },
    hasMoneyInputValue(value) {
      return value != null && String(value).trim() !== '';
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(`${fnSource}; this.resolve = canonicalRewardOffsetAmount;`, sandbox);
  return sandbox.resolve;
}

test('A3-001 RED->GREEN: legacy mirror 185k displays canonical 185k, not 370k', () => {
  const resolve = loadCanonicalDisplayResolver();
  assert.equal(resolve({ rewardAmount: 185000, offsetAmount: 185000, handledRewardOffsetAmount: 185000 }), 185000);
});

test('A3-002 B0041218-equivalent: 880k mirror displays 880k, not 1.76m', () => {
  const resolve = loadCanonicalDisplayResolver();
  assert.equal(resolve({ rewardAmount: 880000, offsetAmount: 880000, handledRewardOffsetAmount: 880000 }), 880000);
});

test('A3-003 independent reward + offset trusts backend canonical total', () => {
  const resolve = loadCanonicalDisplayResolver();
  assert.equal(resolve({ rewardAmount: 100000, offsetAmount: 50000, handledRewardOffsetAmount: 150000 }), 150000);
});

test('A3-004 explicit canonical zero remains zero and never falls back to raw aliases', () => {
  const resolve = loadCanonicalDisplayResolver();
  assert.equal(resolve({ rewardAmount: 185000, offsetAmount: 185000, handledRewardOffsetAmount: 0 }), 0);
});

test('A3-005 missing canonical display amount fails safe instead of interpreting raw aliases', () => {
  const resolve = loadCanonicalDisplayResolver();
  assert.equal(resolve({ rewardAmount: 185000, offsetAmount: 185000 }), 0);
});

test('A3-006 delivery tracking UI has no direct raw reward+offset arithmetic', () => {
  const source = read(DELIVERY_UI);
  assert.doesNotMatch(source, /num\([^\n]*rewardAmount[^\n]*\)\s*\+\s*num\([^\n]*offsetAmount/);
  assert.doesNotMatch(source, /parseVietnameseMoney\([^\n]*rewardAmount[^\n]*\)\s*\+\s*parseVietnameseMoney\([^\n]*offsetAmount/);
  assert.doesNotMatch(source, /rewardAmount\s*\+\s*offsetAmount|offsetAmount\s*\+\s*rewardAmount/);
});

test('A3-007 group, row, KPI, closeout and adjustment display all use canonical resolver', () => {
  const source = read(DELIVERY_UI);
  const uses = source.match(/canonicalRewardOffsetAmount\(/g) || [];
  assert.ok(uses.length >= 9, `expected canonical resolver across display/payload paths, got ${uses.length}`);
  assert.match(source, /deliveryTodayNewReward:\s*money\(canonicalRewardOffsetAmount\(summary\)\)/);
  assert.match(source, /rewardAmount:\s*canonicalRewardOffsetAmount\(row\)/);
  assert.match(source, /function paymentBaseline\(row\)[\s\S]*rewardAmount:\s*canonicalRewardOffsetAmount\(row\)/);
});

test('A3-008 frontend does not implement its own debt-zero tolerance for this fix', () => {
  const source = read(DELIVERY_UI);
  assert.doesNotMatch(source, /Math\.abs\([^)]*(debt|finalDebt)[^)]*\)\s*<=?\s*1000/i);
  assert.doesNotMatch(source, /(debt|finalDebt)[^\n]{0,80}[<>]=?\s*1000/i);
});

test('A3-009 shared delivery core consumes canonical handled reward-offset amount', () => {
  const source = read(DELIVERY_CORE);
  assert.match(source, /handledRewardOffsetAmount/);
  assert.doesNotMatch(source, /cash\s*\+\s*bank\s*\+\s*reward\s*\+\s*offset/);
  assert.doesNotMatch(source, /cash\s*\+\s*bank\s*\+\s*reward\s*\+\s*offset\s*\+\s*returnAmount/);
});


test('A3-011 KPI visible-row total equals sum of canonical normalized rows', () => {
  const source = read(DELIVERY_UI);
  const fnSource = extractFunction(source, 'summarizeVisibleRows');
  const resolveSource = extractFunction(source, 'canonicalRewardOffsetAmount');
  const sandbox = {
    parseVietnameseMoney(value) {
      if (value == null || value === '') return 0;
      const n = Number(value);
      return Number.isFinite(n) ? Math.round(n) : 0;
    },
    hasMoneyInputValue(value) { return value != null && String(value).trim() !== ''; }
  };
  sandbox.num = sandbox.parseVietnameseMoney;
  vm.createContext(sandbox);
  vm.runInContext(`${resolveSource}; ${fnSource}; this.summarize = summarizeVisibleRows;`, sandbox);
  const rows = [
    { originalAmount: 688113, cashAmount: 503000, bankAmount: 0, rewardAmount: 185000, offsetAmount: 185000, handledRewardOffsetAmount: 185000, returnedAmount: 0, finalDebtAmount: 0 },
    { originalAmount: 5213244, cashAmount: 4333000, bankAmount: 0, rewardAmount: 880000, offsetAmount: 880000, handledRewardOffsetAmount: 880000, returnedAmount: 0, finalDebtAmount: 0 }
  ];
  const summary = sandbox.summarize(rows);
  assert.equal(summary.handledRewardOffsetAmount, 1065000);
  assert.equal(summary.finalDebtAmount, 0);
});

test('A3-010 mobile sales UI uses canonical handled/bonus amount and no equality heuristic', () => {
  const source = read(SALES_UX);
  assert.match(source, /handledRewardOffsetAmount/);
  assert.doesNotMatch(source, /reward\s*>\s*0\s*&&\s*offset\s*>\s*0\s*&&\s*reward\s*===\s*offset/);
  assert.doesNotMatch(source, /return\s+reward\s*\+\s*offset/);
});


test('A3-012 all shipped frontend JS contains no raw reward-plus-offset arithmetic', () => {
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith('.js')) files.push(full);
    }
  };
  walk(path.join(ROOT, 'public'));
  const offenders = [];
  for (const file of files) {
    const source = read(file);
    if (/rewardAmount\s*\+\s*offsetAmount|offsetAmount\s*\+\s*rewardAmount|\breward\s*\+\s*offset\b|\boffset\s*\+\s*reward\b/.test(source)) {
      offenders.push(path.relative(ROOT, file));
    }
  }
  assert.deepEqual(offenders, []);
});
