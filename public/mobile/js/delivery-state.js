(function () {
  'use strict';

  var DELIVERY_TAB_CACHE_TTL_MS = 60 * 1000;
  var DELIVERY_REFRESH_THROTTLE_MS = 1200;
  var DELIVERY_DEBT_PAGE_LIMIT = 100;

  function createInitialState() {
    return {
      selectedKey: '',
      tab: 'orders',
      debts: [],
      debtSummary: {},
      selectedDebtIndex: -1,
      selectedDebtKey: '',
      debtSubtab: 'customers',
      debtSearch: '',
      debtSort: 'debt_desc',
      debtFormDirty: false,
      debtListScrollTop: 0,
      debtLoaded: false,
      debtCacheAt: 0,
      debtLoading: false,
      debtPromise: null,
      debtRequestSeq: 0,
      debtError: '',
      debtPage: 0,
      debtLimit: DELIVERY_DEBT_PAGE_LIMIT,
      debtHasMore: false,
      debtTotalRows: 0,
      debtTotalPages: 0,
      debtNextPage: 1,
      debtLoadingMore: false,
      reconciliationReport: null,
      reconciliationLoaded: false,
      reconciliationLoading: false,
      reconciliationError: '',
      reconciliationCacheAt: 0,
      reconciliationPromise: null,
      returnsLoading: false,
      returnsPromise: null,
      returnsCache: {},
      lastLoadAt: 0,
      loadPromise: null
    };
  }

  function isFresh(timestamp, ttlMs) {
    return !!timestamp && (Date.now() - Number(timestamp || 0)) < Number(ttlMs || DELIVERY_TAB_CACHE_TTL_MS);
  }

  window.DeliveryMobileState = {
    DELIVERY_TAB_CACHE_TTL_MS: DELIVERY_TAB_CACHE_TTL_MS,
    DELIVERY_REFRESH_THROTTLE_MS: DELIVERY_REFRESH_THROTTLE_MS,
    DELIVERY_DEBT_PAGE_LIMIT: DELIVERY_DEBT_PAGE_LIMIT,
    createInitialState: createInitialState,
    isFresh: isFresh
  };
})();
