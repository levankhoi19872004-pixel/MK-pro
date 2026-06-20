/*
 * Clearable Search Inputs
 * - Chỉ gắn nút xóa cho selector đã được khảo sát.
 * - Không suy đoán từ input[type="text"], không tác động ngày/giờ/số/tiền/ghi chú.
 * - Mỗi lần xóa chỉ kích hoạt đúng một luồng tìm kiếm hiện hữu.
 */
(function initClearableSearchInputsModule() {
  'use strict';

  const FIELD_RULES = [
    // Danh mục và đơn hàng web: tìm bằng nút/Enter.
    { selector: '#searchInput', action: 'click', trigger: '#applyProductFiltersButton', group: 'catalog' },
    { selector: '#customerSearchInput', action: 'click', trigger: '#applyCustomerFiltersButton', group: 'catalog' },
    { selector: '#salesOrderSearchInput', action: 'input', group: 'orders' },
    { selector: '#salesOrderStaffFilter', action: 'input', group: 'orders', autocomplete: true },
    { selector: '#stockSearchInput', action: 'click', trigger: '#stockApplyFiltersButton', group: 'inventory' },
    { selector: '#dmsInventorySearch', action: 'click', trigger: '#dmsInventoryApplyButton', group: 'inventory' },
    { selector: '#masterOrderSearch', action: 'click', trigger: '#applyMasterOrderFiltersButton', group: 'master-orders' },

    // Autocomplete dùng để chọn dữ liệu trong form. Xóa text phải xóa cả ID/code ẩn.
    { selector: '#customerStaffSearch', action: 'input', group: 'autocomplete', autocomplete: true },
    { selector: '#importProductSearch', action: 'input', group: 'autocomplete', autocomplete: true },
    { selector: '#salesCustomerSearch', action: 'input', group: 'autocomplete', autocomplete: true },
    { selector: '#salesStaffSearch', action: 'input', group: 'autocomplete', autocomplete: true },
    { selector: '#salesProductSearch', action: 'input', group: 'autocomplete', autocomplete: true },
    { selector: '#masterOrderForm [name="deliveryStaffCode"]', action: 'input', group: 'autocomplete', autocomplete: true },
    { selector: '#masterOrderForm [name="deliveryStaffName"]', action: 'input', group: 'autocomplete', autocomplete: true },
    { selector: '#externalDebtCustomerSearch', action: 'input', group: 'autocomplete', autocomplete: true },
    { selector: '#externalDebtSalesStaffSearch', action: 'input', group: 'autocomplete', autocomplete: true },
    { selector: '#externalDebtDeliveryStaffSearch', action: 'input', group: 'autocomplete', autocomplete: true },

    // Popup gộp đơn: realtime debounce hiện hữu; dispatch input một lần để hủy timer cũ.
    { selector: '#unmergedOrderSearch', action: 'input', group: 'master-orders' },
    { selector: '#unmergedSalesStaffFilter', action: 'input', group: 'master-orders', autocomplete: true },
    { selector: '#masterReturnDeliveryStaff', action: 'input', group: 'master-returns', autocomplete: true },
    { selector: '#unmergedReturnOrderSearchInput', action: 'input', group: 'master-returns' },

    // Công nợ, trả hàng và quỹ.
    { selector: '#debtSearchInput', action: 'click', trigger: '#applyDebtFiltersButton', group: 'debt', autocomplete: true },
    { selector: '#debtSalesmanFilter', action: 'click', trigger: '#applyDebtFiltersButton', group: 'debt', autocomplete: true },
    { selector: '#debtDeliveryFilter', action: 'click', trigger: '#applyDebtFiltersButton', group: 'debt', autocomplete: true },
    { selector: '#receiptSearchInput', action: 'input', group: 'debt' },
    { selector: '#cashbookSearchInput', action: 'input', group: 'debt' },
    { selector: '#debtCollectionSearchInput', action: 'click', trigger: '#applyDebtCollectionFiltersButton', group: 'debt' },
    { selector: '#returnOrderSearchInput', action: 'click', trigger: '#applyReturnOrderFiltersButton', group: 'returns' },
    { selector: '#fundSearchInput', action: 'click', trigger: '#applyFundFiltersButton', group: 'fund' },
    { selector: '#fundSummaryPersonSearch', action: 'click', trigger: '#applyFundSummaryFiltersButton', group: 'fund' },
    { selector: '#deliveryCashSubmissionStaffCode', action: 'input', group: 'fund' },

    // Báo cáo và quản trị.
    { selector: '#reportCatalogSearch', action: 'click', trigger: '#applyReportCatalogFiltersButton', group: 'reports' },
    { selector: '#reportSearchInput', action: 'click', trigger: '#applyReportFiltersButton', group: 'reports' },
    { selector: '#userSearchInput', action: 'input', group: 'admin' },
    { selector: '#promotionSearchAllInput', action: 'input', group: 'admin' },
    { selector: '#importShortageReportSearch', action: 'click', trigger: '#reloadImportShortageReportsButton', group: 'admin' },

    // Web giao hàng được render động và toolbar thay control sau khi khởi tạo.
    { selector: '#deliveryCoreSearch', action: 'input', group: 'delivery' },
    { selector: '#deliveryCoreDeliveryStaff', action: 'click', trigger: '#deliveryCoreApply', group: 'delivery', autocomplete: true },
    { selector: '#deliveryCoreSalesStaff', action: 'click', trigger: '#deliveryCoreApply', group: 'delivery', autocomplete: true },

    // App bán hàng mobile.
    { selector: '#customerSearch', action: 'input', group: 'mobile-sales' },
    { selector: '#productSearch', action: 'input', group: 'mobile-sales', autocomplete: true },
    { selector: '#debtCustomerSearch', action: 'input', group: 'mobile-sales' },

    // App giao hàng mobile được render động.
    { selector: '#mSearch', action: 'input', group: 'mobile-delivery' },
    { selector: '#mDebtCustomerSearch', action: 'input', group: 'mobile-delivery' }
  ];

  const INVALID_TYPES = new Set(['date', 'datetime-local', 'time', 'month', 'week', 'number', 'password', 'hidden', 'file', 'checkbox', 'radio']);
  const DATASET_KEYS = ['selectedId', 'id', 'code', 'name', 'type', 'label', 'selectedLabel', 'targetHidden'];
  const managedInputs = new Set();
  const stateByInput = new WeakMap();
  let valueSyncTimer = null;

  function inputForAutocompleteConfig(config) {
    if (!config) return null;
    if (config.inputId) return document.getElementById(config.inputId);
    if (config.inputSelector) return document.querySelector(config.inputSelector);
    return null;
  }

  function targetForRule(rule) {
    if (!rule) return null;
    if (rule.targetId) return document.getElementById(rule.targetId);
    if (rule.targetSelector) return document.querySelector(rule.targetSelector);
    return null;
  }

  function matchingAutocompleteConfigs(input) {
    return (window.SEARCH_FIELD_CONFIGS || []).filter((config) => inputForAutocompleteConfig(config) === input);
  }

  function clearElementSelectionState(element) {
    if (!element) return;
    DATASET_KEYS.forEach((key) => {
      if (element.dataset && Object.prototype.hasOwnProperty.call(element.dataset, key)) delete element.dataset[key];
    });
  }

  function clearAutocompleteState(input) {
    if (!input) return;

    if (window.SearchAutocomplete && typeof window.SearchAutocomplete.clear === 'function') {
      window.SearchAutocomplete.clear(input);
    } else if (window.SearchAutocomplete && typeof window.SearchAutocomplete.cancel === 'function') {
      window.SearchAutocomplete.cancel(input);
    }

    matchingAutocompleteConfigs(input).forEach((config) => {
      (config.fill || []).forEach((fillRule) => {
        const target = targetForRule(fillRule);
        if (!target || target === input) return;
        if ('value' in target) target.value = '';
        clearElementSelectionState(target);
      });
      if (config.boxId) hideSuggestionBox(document.getElementById(config.boxId));
    });

    const hiddenTargetId = input.dataset ? input.dataset.targetHidden : '';
    if (hiddenTargetId) {
      const hiddenTarget = document.getElementById(hiddenTargetId);
      if (hiddenTarget && 'value' in hiddenTarget) hiddenTarget.value = '';
      clearElementSelectionState(hiddenTarget);
    }

    clearElementSelectionState(input);

    if (input.id === 'salesProductSearch') window.__selectedSalesProduct = null;
    if (input.id === 'importProductSearch') window.__selectedImportProduct = null;

    const host = input.closest('.autocomplete, .autocomplete-host, .delivery-v46-filter-suggest, .debt-list-toolbar');
    if (host) host.querySelectorAll('.suggestions, .suggestion-box, .delivery-v46-suggest-box').forEach(hideSuggestionBox);
    if (input.nextElementSibling) hideSuggestionBox(input.nextElementSibling);
  }

  function hideSuggestionBox(box) {
    if (!box || !box.classList) return;
    const looksLikeSuggestionBox = box.classList.contains('suggestions') ||
      box.classList.contains('suggestion-box') ||
      box.classList.contains('delivery-v46-suggest-box');
    if (!looksLikeSuggestionBox) return;
    box.hidden = true;
    box.style.display = 'none';
    box.classList.remove('show', 'has-many');
    box.innerHTML = '';
  }

  function syncControl(input) {
    const state = stateByInput.get(input);
    if (!state) return;
    const hasValue = String(input.value || '').length > 0;
    state.button.hidden = !hasValue || input.readOnly;
    state.button.disabled = Boolean(input.disabled || input.readOnly);
    state.wrapper.classList.toggle('has-value', hasValue);
    state.wrapper.classList.toggle('is-disabled', Boolean(input.disabled));
    state.wrapper.classList.toggle('is-readonly', Boolean(input.readOnly));
  }

  function syncAll() {
    if (document.hidden) return;
    managedInputs.forEach((input) => {
      if (!input.isConnected) {
        managedInputs.delete(input);
        return;
      }
      syncControl(input);
    });
  }

  function dispatchInput(input, suppressAutocomplete) {
    if (suppressAutocomplete && input.dataset) input.dataset.clearableSuppressAutocomplete = '1';
    try {
      input.dispatchEvent(new Event('input', { bubbles: true }));
    } finally {
      if (input.dataset) delete input.dataset.clearableSuppressAutocomplete;
    }
  }

  function executeRuleAction(input, rule) {
    if (!rule) return;
    if (rule.action === 'input') {
      dispatchInput(input, Boolean(rule.autocomplete));
      return;
    }
    if (rule.action === 'click') {
      const trigger = rule.trigger ? document.querySelector(rule.trigger) : null;
      if (trigger && !trigger.disabled) trigger.click();
    }
  }

  function clearInput(input, rule) {
    if (!input || input.disabled || input.readOnly) return;

    if (rule.autocomplete || matchingAutocompleteConfigs(input).length) clearAutocompleteState(input);
    input.value = '';
    clearElementSelectionState(input);
    syncControl(input);
    executeRuleAction(input, rule);
    syncControl(input);

    try {
      input.focus({ preventScroll: true });
    } catch (_) {
      input.focus();
    }
  }

  function createButton(input, rule) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'search-clear-button';
    button.setAttribute('aria-label', 'Xóa nội dung tìm kiếm');
    button.setAttribute('title', 'Xóa tìm kiếm');
    button.textContent = '×';
    button.hidden = true;
    button.dataset.clearFor = input.id || rule.selector;

    button.addEventListener('pointerdown', (event) => {
      // Không để input blur trước khi xử lý autocomplete, nhưng vẫn giữ nút focus được bằng bàn phím.
      if (event.pointerType !== 'keyboard') event.preventDefault();
    });
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      clearInput(input, rule);
    });
    return button;
  }

  function wrapInput(input, rule) {
    if (!input || stateByInput.has(input)) return;
    const type = String(input.getAttribute('type') || 'text').toLowerCase();
    if (INVALID_TYPES.has(type)) return;

    const existingWrapper = input.closest('.clearable-search-control');
    if (existingWrapper) {
      const existingButton = existingWrapper.querySelector(':scope > .search-clear-button');
      if (existingButton) {
        stateByInput.set(input, { wrapper: existingWrapper, button: existingButton, rule });
        managedInputs.add(input);
        syncControl(input);
      }
      return;
    }

    const wrapper = document.createElement('span');
    wrapper.className = 'clearable-search-control';
    wrapper.dataset.clearableSearch = 'true';
    wrapper.dataset.searchGroup = rule.group || '';

    input.parentNode.insertBefore(wrapper, input);
    wrapper.appendChild(input);
    input.classList.add('clearable-search-input');
    input.setAttribute('data-clearable-search', 'true');
    // Inline !important thắng các selector legacy có ID + !important mà không đổi chiều cao/width.
    input.style.setProperty('padding-right', 'var(--clearable-search-padding, 38px)', 'important');

    const button = createButton(input, rule);
    wrapper.appendChild(button);

    stateByInput.set(input, { wrapper, button, rule });
    managedInputs.add(input);
    syncControl(input);
  }

  function initialize(root) {
    const scope = root && root.querySelectorAll ? root : document;
    FIELD_RULES.forEach((rule) => {
      if (scope.matches && scope.matches(rule.selector)) wrapInput(scope, rule);
      scope.querySelectorAll(rule.selector).forEach((input) => wrapInput(input, rule));
    });
  }

  function observeRoot(root) {
    if (!root || root.dataset.clearableSearchObserved === '1') return;
    root.dataset.clearableSearchObserved = '1';
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node && node.nodeType === Node.ELEMENT_NODE) initialize(node);
        });
      });
    });
    observer.observe(root, { childList: true, subtree: true });
  }

  function bindGlobalSyncEvents() {
    document.addEventListener('input', (event) => {
      if (stateByInput.has(event.target)) syncControl(event.target);
    }, true);
    document.addEventListener('change', (event) => {
      if (stateByInput.has(event.target)) syncControl(event.target);
    }, true);
    document.addEventListener('focusin', (event) => {
      if (stateByInput.has(event.target)) syncControl(event.target);
    }, true);
    document.addEventListener('reset', (event) => {
      window.setTimeout(() => {
        const form = event.target;
        if (!form || !form.querySelectorAll) return;
        form.querySelectorAll('[data-clearable-search="true"]').forEach(syncControl);
      }, 0);
    }, true);
    window.addEventListener('pageshow', syncAll);
    document.addEventListener('visibilitychange', syncAll);
  }

  function startBoundedValueSync() {
    if (valueSyncTimer) return;
    // Đồng bộ các giá trị được gán trực tiếp bằng JS/autocomplete/state restore mà không phát event.
    valueSyncTimer = window.setInterval(syncAll, 300);
  }

  function boot() {
    initialize(document);
    ['.app', '.sales-app-page', '#mobileDeliveryRoot'].forEach((selector) => {
      document.querySelectorAll(selector).forEach(observeRoot);
    });
    bindGlobalSyncEvents();
    startBoundedValueSync();
  }

  window.ClearableSearchInputs = {
    rules: FIELD_RULES.slice(),
    initialize,
    sync: syncControl,
    syncAll,
    clear(input) {
      const state = stateByInput.get(input);
      if (state) clearInput(input, state.rule);
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
