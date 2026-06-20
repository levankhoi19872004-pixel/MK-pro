const DEFAULT_FEATURE_STATE = Object.freeze({
  rows: [],
  page: 1,
  hasMore: false,
  loading: false,
  loaded: false,
  requestSeq: 0,
  summary: {}
});

function cloneFeatureState(overrides = {}) {
  return {
    ...DEFAULT_FEATURE_STATE,
    rows: [],
    summary: {},
    ...overrides
  };
}

export class OrderDraftStore {
  constructor(options = {}) {
    this.storage = options.storage || window.localStorage;
    this.storagePrefix = options.storagePrefix || 'mkpro_mobile_sales_draft_v1';
    this.ownerKey = String(options.ownerKey || 'sales');
    this.customer = null;
    this.product = null;
    this.cart = [];
    this.editingOrderId = '';
  }

  get storageKey() {
    return `${this.storagePrefix}:${this.ownerKey}`;
  }

  isDirty(paidAmount = 0) {
    return Boolean(this.cart.length || this.editingOrderId || Number(paidAmount || 0) > 0);
  }

  snapshot(paidAmount = '') {
    return {
      selectedCustomer: this.customer,
      cart: Array.isArray(this.cart) ? this.cart : [],
      editingOrderId: this.editingOrderId || '',
      paidAmount: String(paidAmount || ''),
      savedAt: new Date().toISOString()
    };
  }

  persist(paidAmount = '') {
    try {
      if (!this.isDirty(paidAmount)) {
        this.clearPersistence();
        return false;
      }
      this.storage.setItem(this.storageKey, JSON.stringify(this.snapshot(paidAmount)));
      return true;
    } catch {
      return false;
    }
  }

  restore() {
    try {
      const raw = this.storage.getItem(this.storageKey);
      if (!raw) return null;
      const saved = JSON.parse(raw);
      this.customer = saved?.selectedCustomer || null;
      this.cart = Array.isArray(saved?.cart) ? saved.cart : [];
      this.editingOrderId = String(saved?.editingOrderId || '');
      return {
        customer: this.customer,
        cart: this.cart,
        editingOrderId: this.editingOrderId,
        paidAmount: String(saved?.paidAmount || ''),
        savedAt: saved?.savedAt || ''
      };
    } catch {
      this.clearPersistence();
      return null;
    }
  }

  clear(options = {}) {
    if (options.keepCustomer !== true) this.customer = null;
    this.product = null;
    this.cart = [];
    this.editingOrderId = '';
    if (options.clearPersistence !== false) this.clearPersistence();
  }

  clearPersistence() {
    try {
      this.storage.removeItem(this.storageKey);
    } catch {
      // Storage is best-effort on restricted/mobile browser modes.
    }
  }
}

export function createMobileSalesState(options = {}) {
  const draft = options.draftStore || new OrderDraftStore(options);
  return {
    draft,
    customer: cloneFeatureState({ query: '' }),
    product: {
      toolsInitialized: false,
      groupOptionsLoaded: false
    },
    orders: cloneFeatureState({ loadedKey: '' }),
    debt: cloneFeatureState({
      subtab: 'customers',
      selectedCustomerKey: '',
      formDirty: false,
      listScrollTop: 0
    }),
    sync: {
      pendingOrders: []
    },
    ui: {
      activeTabId: 'customersTab'
    }
  };
}

export function resetPagedState(feature, options = {}) {
  feature.rows = [];
  feature.page = 1;
  feature.hasMore = false;
  feature.loading = false;
  feature.loaded = false;
  feature.summary = {};
  feature.requestSeq += 1;
  if ('query' in feature) feature.query = options.query || '';
  if ('loadedKey' in feature) feature.loadedKey = '';
  return feature;
}
