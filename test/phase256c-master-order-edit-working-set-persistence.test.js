'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const sourcePath = path.join(__dirname, '..', 'public/js/app/06-master-delivery.js');
const source = fs.readFileSync(sourcePath, 'utf8');

function extractFunction(name) {
  const marker = `function ${name}`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `${name} must exist`);
  const bodyStart = source.indexOf('{', source.indexOf(')', start));
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`Cannot extract ${name}`);
}

function buildHarness() {
  const helperStart = source.indexOf('function ensureMasterOrderEditState');
  const helperEnd = source.indexOf('function masterOrderGroupedRows', helperStart);
  assert.notEqual(helperStart, -1, 'working-set helper block must exist');
  assert.notEqual(helperEnd, -1, 'working-set helper block end must exist');

  const script = `
    var window = {};
    var masterOrderChildRowsById = new Map();
    var unmergedOrdersCache = [];
    var unmergedOrderResultIds = [];
    var selectedUnmergedChildOrderIds = new Set();
    var selectedGroupedChildOrderIds = new Set();
    var selectedGroupedChildOrderCheckIds = new Set();
    var explicitlyRemovedGroupedChildOrderIds = new Set();
    var originalGroupedChildOrderIds = new Set();
    var selectedChildOrderIds = selectedUnmergedChildOrderIds;
    function masterOrderSetMessage() {}
    function renderMasterOrderGroupingLayers() {}
    ${extractFunction('salesOrderIdentity')}
    ${source.slice(helperStart, helperEnd)}
    ${extractFunction('masterOrderGroupedRows')}
    ${extractFunction('syncVisibleGroupedChildOrderIds')}
    ${extractFunction('moveSelectedUnmergedToGrouped')}
    ${extractFunction('removeSelectedGroupedChildOrders')}
    window.__selectGroupedForRemoval = (id) => selectedGroupedChildOrderCheckIds.add(id);
    window.__selectUnmergedCandidate = (id) => selectedUnmergedChildOrderIds.add(id);
    window.__moveSelectedUnmergedToGrouped = moveSelectedUnmergedToGrouped;
    window.__removeSelectedGroupedChildOrders = removeSelectedGroupedChildOrders;
    window.__state = () => ({
      groupedChildOrderIds: [...selectedGroupedChildOrderIds],
      unmergedOrderResultIds: [...unmergedOrderResultIds],
      selectedUnmergedChildOrderIds: [...selectedUnmergedChildOrderIds],
      selectedGroupedChildOrderCheckIds: [...selectedGroupedChildOrderCheckIds],
      explicitlyRemovedChildOrderIds: [...explicitlyRemovedGroupedChildOrderIds],
      originalGroupedChildOrderIds: [...originalGroupedChildOrderIds],
      groupedRows: masterOrderGroupedRows(),
      visibleCandidateRows: getVisibleUnmergedCandidateRows(),
      submitChildOrderIds: getGroupedChildOrderIdsForSubmit(),
      syncChildOrderIds: syncVisibleGroupedChildOrderIds()
    });
  `;
  const context = { Set, Map, assert };
  vm.createContext(context);
  vm.runInContext(script, context);
  return context.window;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test('edit working set survives candidate reloads and submit reads the full grouped set', () => {
  const window = buildHarness();
  const children = [
    { id: 'SO1', code: 'B0039412', totalAmount: 100 },
    { id: 'SO2', code: 'B0039414', totalAmount: 200 },
    { id: 'SO3', code: 'B0039413', totalAmount: 300 },
    { id: 'SO4', code: 'B0039415', totalAmount: 400 }
  ];

  window.MasterOrderEditWorkingSet.initializeMasterOrderEditWorkingSet(children);
  assert.deepEqual(plain(window.__state().groupedChildOrderIds), ['SO1', 'SO2', 'SO3', 'SO4']);

  window.MasterOrderEditWorkingSet.replaceUnmergedCandidateResults([
    { id: 'SO5', code: 'B0099999', totalAmount: 500 }
  ]);

  const state = window.__state();
  assert.deepEqual(plain(state.groupedChildOrderIds), ['SO1', 'SO2', 'SO3', 'SO4']);
  assert.deepEqual(plain(state.submitChildOrderIds), ['SO1', 'SO2', 'SO3', 'SO4']);
  assert.deepEqual(plain(state.visibleCandidateRows.map((row) => row.id)), ['SO5']);
  assert.deepEqual(plain(state.groupedRows.map((row) => row.code)), ['B0039412', 'B0039414', 'B0039413', 'B0039415']);
});

test('explicit removal intent is tracked and cleared when the child is added back', () => {
  const window = buildHarness();
  window.MasterOrderEditWorkingSet.initializeMasterOrderEditWorkingSet([
    { id: 'SO1', code: 'B0039412' },
    { id: 'SO2', code: 'B0039414' }
  ]);
  window.MasterOrderEditWorkingSet.replaceUnmergedCandidateResults([{ id: 'SO3', code: 'B0039413' }]);

  window.__selectGroupedForRemoval('SO1');
  window.__removeSelectedGroupedChildOrders();
  assert.deepEqual(plain(window.__state().groupedChildOrderIds), ['SO2']);
  assert.deepEqual(plain(window.__state().explicitlyRemovedChildOrderIds), ['SO1']);
  assert.deepEqual(plain(window.__state().visibleCandidateRows.map((row) => row.id)), ['SO3', 'SO1']);

  window.__selectUnmergedCandidate('SO1');
  window.__moveSelectedUnmergedToGrouped();
  assert.deepEqual(plain(window.__state().groupedChildOrderIds), ['SO2', 'SO1']);
  assert.deepEqual(plain(window.__state().explicitlyRemovedChildOrderIds), []);
});
