'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..');
const postingEnginePath = path.join(repoRoot, 'src', 'engines', 'posting.engine.js');
const source = fs.readFileSync(postingEnginePath, 'utf8');

const exportedSymbols = [
  'postDocument',
  'postSalesOrderAR',
  'hasExistingSalesOrderAR',
  'reverseSalesOrderAR',
  'postReturnOrderAR',
  'reverseReturnOrderAR',
  'postReceiptAR',
  'reverseReceiptAR',
  'postBonusAllowanceAR',
  'returnOrderArAmount',
  'hasExistingReturnOrderAR'
];

function hasLocalDefinition(name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:async\\s+)?function\\s+${escaped}\\s*\\(`).test(source)
    || new RegExp(`(?:const|let|var)\\s+${escaped}\\s*=`).test(source);
}

test('posting.engine exports only locally defined runtime symbols', () => {
  assert.match(source, /module\.exports\s*=\s*\{/);

  for (const name of exportedSymbols) {
    assert.match(source, new RegExp(`\\b${name}\\b`), `${name} must appear in posting.engine.js exports/source`);
    assert.ok(hasLocalDefinition(name), `${name} is exported but has no local function/const definition`);
  }
});

test('postSalesOrderAR and reverseSalesOrderAR are restored for runtime require compatibility', () => {
  assert.ok(hasLocalDefinition('postSalesOrderAR'), 'postSalesOrderAR must be defined before module.exports');
  assert.ok(hasLocalDefinition('reverseSalesOrderAR'), 'reverseSalesOrderAR must be defined before module.exports');
  assert.match(source, /module\.exports[\s\S]*postSalesOrderAR/);
  assert.match(source, /module\.exports[\s\S]*reverseSalesOrderAR/);
});

test('posting.engine evaluates without ReferenceError when dependencies are present', () => {
  const vm = require('vm');
  const sandboxModule = { exports: {} };
  const sandbox = {
    module: sandboxModule,
    exports: sandboxModule.exports,
    require: (id) => {
      if (id.includes('date.util')) return { todayVN: () => '2026-01-01', nowIso: () => '2026-01-01T00:00:00.000Z', toDateOnly: (v) => String(v || '2026-01-01').slice(0, 10) };
      if (id.includes('paymentRepository')) return { findAll: async () => [], upsert: async (entry) => entry, deleteOne: async () => ({ deletedCount: 1 }) };
      if (id.includes('common.util')) return { makeId: (prefix) => `${prefix}-TEST`, toNumber: (v) => Number(v || 0) || 0 };
      if (id.includes('debug.util')) return { debugLog: () => {} };
      if (id.includes('returnArPostingService')) return {
        hasActiveArReturnForReturnOrder: async () => false,
        postReturnOrderToAR: async () => null,
        _internal: { returnOrderAmountAnalysis: (returnOrder) => ({ amount: Number(returnOrder.debtReduction || returnOrder.amount || 0) || 0 }) }
      };
      if (id.includes('staffIdentity')) return {
        pickSalesStaffCode: () => '',
        pickSalesStaffName: () => '',
        pickDeliveryStaffCode: () => '',
        pickDeliveryStaffName: () => ''
      };
      throw new Error(`Unexpected require in posting.engine static runtime test: ${id}`);
    }
  };

  vm.runInNewContext(source, sandbox, { filename: postingEnginePath });
  assert.strictEqual(typeof sandboxModule.exports.postSalesOrderAR, 'function');
  assert.strictEqual(typeof sandboxModule.exports.reverseSalesOrderAR, 'function');
});
