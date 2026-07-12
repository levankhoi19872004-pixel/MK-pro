(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ScopedBulkSelection = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function () {
  'use strict';

  function normalizeKey(value) {
    if (value === null || value === undefined) return '';
    return String(value).trim();
  }

  function ensureSet(selectedKeys) {
    return selectedKeys instanceof Set ? selectedKeys : new Set();
  }

  function collectSelectableKeys(options) {
    var rows = Array.isArray(options && options.visibleRows) ? options.visibleRows : [];
    var getKey = options && typeof options.getKey === 'function' ? options.getKey : function (row) { return row && row.id; };
    var isSelectable = options && typeof options.isSelectable === 'function' ? options.isSelectable : function () { return true; };
    var seen = new Set();
    var keys = [];
    rows.forEach(function (row, index) {
      if (!isSelectable(row, index)) return;
      var key = normalizeKey(getKey(row, index));
      if (!key || seen.has(key)) return;
      seen.add(key);
      keys.push(key);
    });
    return keys;
  }

  function deriveScopeSelectionState(options) {
    var selectedKeys = ensureSet(options && options.selectedKeys);
    var selectableKeys = collectSelectableKeys(options || {});
    var selectedSelectableCount = selectableKeys.reduce(function (count, key) {
      return count + (selectedKeys.has(key) ? 1 : 0);
    }, 0);
    var allSelected = selectableKeys.length > 0 && selectedSelectableCount === selectableKeys.length;
    return {
      selectableKeys: selectableKeys,
      selectableCount: selectableKeys.length,
      selectedSelectableCount: selectedSelectableCount,
      allSelected: allSelected,
      partiallySelected: selectedSelectableCount > 0 && !allSelected,
      buttonLabel: allSelected ? 'Bỏ chọn tất cả' : 'Chọn tất cả',
      disabled: selectableKeys.length === 0
    };
  }

  function toggleScopeSelection(options) {
    var selectedKeys = ensureSet(options && options.selectedKeys);
    var summary = deriveScopeSelectionState(Object.assign({}, options, { selectedKeys: selectedKeys }));
    if (summary.allSelected) summary.selectableKeys.forEach(function (key) { selectedKeys.delete(key); });
    else summary.selectableKeys.forEach(function (key) { selectedKeys.add(key); });
    return deriveScopeSelectionState(Object.assign({}, options, { selectedKeys: selectedKeys }));
  }

  function reconcileScopeSelection(options) {
    var selectedKeys = ensureSet(options && options.selectedKeys);
    var validKeys = new Set(collectSelectableKeys(options || {}));
    Array.from(selectedKeys).forEach(function (key) {
      if (!validKeys.has(normalizeKey(key))) selectedKeys.delete(key);
    });
    return deriveScopeSelectionState(Object.assign({}, options, { selectedKeys: selectedKeys }));
  }

  function applyToggleButtonState(button, summary, labels) {
    if (!button) return;
    var state = summary || { allSelected: false, disabled: true, buttonLabel: 'Chọn tất cả' };
    var entityLabel = labels && labels.entityLabel ? String(labels.entityLabel) : 'bản ghi đang hiển thị';
    var selectLabel = labels && labels.selectLabel ? String(labels.selectLabel) : ('Chọn tất cả ' + entityLabel);
    var clearLabel = labels && labels.clearLabel ? String(labels.clearLabel) : ('Bỏ chọn tất cả ' + entityLabel);
    var label = state.allSelected ? clearLabel : selectLabel;
    button.textContent = state.buttonLabel || (state.allSelected ? 'Bỏ chọn tất cả' : 'Chọn tất cả');
    button.disabled = state.disabled === true;
    button.setAttribute('aria-disabled', button.disabled ? 'true' : 'false');
    button.setAttribute('aria-pressed', state.allSelected ? 'true' : 'false');
    button.setAttribute('aria-label', label);
    button.title = label;
  }

  return {
    normalizeKey: normalizeKey,
    collectSelectableKeys: collectSelectableKeys,
    deriveScopeSelectionState: deriveScopeSelectionState,
    toggleScopeSelection: toggleScopeSelection,
    reconcileScopeSelection: reconcileScopeSelection,
    applyToggleButtonState: applyToggleButtonState
  };
});
