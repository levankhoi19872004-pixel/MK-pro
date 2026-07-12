'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const api = require('../public/js/shared/scoped-bulk-selection.js');

const rows = [
  { id: 'A', selectable: true },
  { id: 'B', selectable: true },
  { id: 'C', selectable: false },
  { id: 'A', selectable: true },
  { id: '', selectable: true }
];
const options = (selectedKeys) => ({
  visibleRows: rows,
  selectedKeys,
  getKey: (row) => row.id,
  isSelectable: (row) => row.selectable
});

test('scoped helper derives empty, partial and all-selected captions', () => {
  let selected = new Set();
  let state = api.deriveScopeSelectionState(options(selected));
  assert.equal(state.buttonLabel, 'Chọn tất cả');
  assert.equal(state.allSelected, false);
  assert.equal(state.selectableCount, 2);

  selected.add('A');
  state = api.deriveScopeSelectionState(options(selected));
  assert.equal(state.buttonLabel, 'Chọn tất cả');
  assert.equal(state.partiallySelected, true);

  selected.add('B');
  state = api.deriveScopeSelectionState(options(selected));
  assert.equal(state.buttonLabel, 'Bỏ chọn tất cả');
  assert.equal(state.allSelected, true);
});

test('scoped helper ignores disabled, duplicate and missing keys', () => {
  const state = api.deriveScopeSelectionState(options(new Set()));
  assert.deepEqual(state.selectableKeys, ['A', 'B']);
  assert.equal(state.selectableCount, 2);
});

test('toggle only changes selectable keys in the current scope', () => {
  const selectedA = new Set(['OUTSIDE']);
  const selectedB = new Set(['STAFF-1']);
  api.toggleScopeSelection(options(selectedA));
  assert.deepEqual([...selectedA].sort(), ['A', 'B', 'OUTSIDE']);
  assert.deepEqual([...selectedB], ['STAFF-1']);

  api.toggleScopeSelection(options(selectedA));
  assert.deepEqual([...selectedA], ['OUTSIDE']);
  assert.deepEqual([...selectedB], ['STAFF-1']);
});

test('no selectable row disables toggle', () => {
  const state = api.deriveScopeSelectionState({
    visibleRows: [{ id: 'C' }],
    selectedKeys: new Set(),
    getKey: (row) => row.id,
    isSelectable: () => false
  });
  assert.equal(state.disabled, true);
  assert.equal(state.buttonLabel, 'Chọn tất cả');
});

test('reconcile prunes stale keys but never touches another selection set', () => {
  const selected = new Set(['A', 'STALE']);
  const other = new Set(['STAFF-1']);
  api.reconcileScopeSelection(options(selected));
  assert.deepEqual([...selected], ['A']);
  assert.deepEqual([...other], ['STAFF-1']);
});

test('button accessibility state follows the same summary', () => {
  const attrs = {};
  const button = {
    textContent: '',
    disabled: false,
    title: '',
    setAttribute(name, value) { attrs[name] = value; }
  };
  api.applyToggleButtonState(button, {
    allSelected: true,
    disabled: false,
    buttonLabel: 'Bỏ chọn tất cả'
  }, { entityLabel: 'đơn đang hiển thị' });
  assert.equal(button.textContent, 'Bỏ chọn tất cả');
  assert.equal(attrs['aria-pressed'], 'true');
  assert.equal(attrs['aria-disabled'], 'false');
  assert.equal(attrs['aria-label'], 'Bỏ chọn tất cả đơn đang hiển thị');
});
