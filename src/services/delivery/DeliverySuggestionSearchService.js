'use strict';

const contract = require('./deliverySuggestionSearchContract');

const FEATURE_FLAG = 'PERF_SUGGESTIONS_SEARCH_V1';
const PROJECTION = [
  '_id', 'id', 'code', 'orderCode', 'salesOrderCode',
  'deliveryDate', 'deliveryDateKey', 'createdAt',
  'customerCode', 'customerName', 'customerPhone', 'phone', 'phoneNumber',
  'customerAddress', 'address', 'deliveryAddress',
  'salesStaffCode', 'salesStaffName', 'salesmanCode', 'salesmanName', 'nvbhCode', 'nvbhName', 'maNVBH',
  'deliveryStaffCode', 'deliveryStaffName', 'deliveryCode', 'deliveryName', 'nvghCode', 'nvghName', 'maNVGH',
  'deleted', 'isDeleted', 'deleteMode',
  'suggestOrderCodeNorm', 'suggestCustomerCodeNorm', 'suggestCustomerNameNorm',
  'suggestCustomerPhoneNorm', 'suggestCustomerAddressNorm',
  'suggestSalesStaffCodeNorm', 'suggestDeliveryStaffCodeNorm',
  'suggestSearchTextNorm', 'suggestSearchTokens', 'suggestSearchVersion'
].join(' ');

function enabled(options = {}) {
  if (typeof options.suggestionsSearchV1 === 'boolean') return options.suggestionsSearchV1;
  return ['1', 'true', 'yes', 'on'].includes(String(process.env[FEATURE_FLAG] || '').trim().toLowerCase());
}

function activeFilter() {
  return {
    deleted: { $ne: true },
    isDeleted: { $ne: true },
    deleteMode: { $nin: ['deleted', 'hard_deleted'] }
  };
}

function andFilter(parts = []) {
  const filtered = parts.filter((part) => part && Object.keys(part).length);
  if (!filtered.length) return {};
  if (filtered.length === 1) return filtered[0];
  return { $and: filtered };
}

function fastScopeFilter(scope = {}) {
  const parts = [activeFilter(), { suggestSearchVersion: contract.SEARCH_VERSION }];
  if (scope.deliveryDateKey) parts.push({ deliveryDateKey: scope.deliveryDateKey });
  if (scope.salesStaffCode) parts.push({ suggestSalesStaffCodeNorm: scope.salesStaffCode });
  if (scope.deliveryStaffCode) parts.push({ suggestDeliveryStaffCodeNorm: scope.deliveryStaffCode });
  if (scope.customerCode) parts.push({ suggestCustomerCodeNorm: scope.customerCode });
  return andFilter(parts);
}

function exactAliasRegex(value = '') {
  return new RegExp(`^${contract.escapeRegExp(String(value || '').trim())}$`, 'i');
}

function legacyScopeFilter(scope = {}) {
  const parts = [activeFilter()];
  if (scope.deliveryDateKey) {
    const [year, month, day] = scope.deliveryDateKey.split('-');
    const legacyDate = year && month && day ? `${day}/${month}/${year}` : '';
    parts.push({ $or: [
      { deliveryDateKey: scope.deliveryDateKey },
      { deliveryDate: scope.deliveryDateKey },
      { deliveryDate: new RegExp(`^${contract.escapeRegExp(scope.deliveryDateKey)}(?:T|\s|$)`) },
      ...(legacyDate ? [{ deliveryDate: legacyDate }, { date: legacyDate }, { documentDate: legacyDate }] : [])
    ] });
  }
  if (scope.salesStaffCode) {
    const rx = exactAliasRegex(scope.salesStaffCode);
    parts.push({ $or: [
      { salesStaffCode: rx }, { salesmanCode: rx }, { nvbhCode: rx }, { maNVBH: rx }
    ] });
  }
  if (scope.deliveryStaffCode) {
    const rx = exactAliasRegex(scope.deliveryStaffCode);
    parts.push({ $or: [
      { deliveryStaffCode: rx }, { deliveryCode: rx }, { nvghCode: rx }, { maNVGH: rx }
    ] });
  }
  if (scope.customerCode) {
    const rx = exactAliasRegex(scope.customerCode);
    parts.push({ customerCode: rx });
  }
  return andFilter(parts);
}

async function executeFind(Model, filter, limit, session) {
  let query = Model.find(filter);
  if (query && typeof query.select === 'function') query = query.select(PROJECTION);
  if (query && typeof query.sort === 'function') query = query.sort({ createdAt: -1, _id: -1 });
  if (query && typeof query.limit === 'function') query = query.limit(limit);
  if (query && typeof query.lean === 'function') query = query.lean();
  if (session && query && typeof query.session === 'function') query = query.session(session);
  return Promise.resolve(query);
}

function mergeUnique(target = [], rows = [], candidateLimit = contract.MAX_CANDIDATE_LIMIT) {
  const seen = new Set(target.map((row) => String(row._id || row.id || row.orderCode || row.code || '')));
  for (const row of rows || []) {
    const key = String(row._id || row.id || row.orderCode || row.code || '');
    if (!key || seen.has(key)) continue;
    target.push(row);
    seen.add(key);
    if (target.length >= candidateLimit) break;
  }
  return target;
}

function createMongoRepository(SalesOrder) {
  if (!SalesOrder || typeof SalesOrder.find !== 'function') throw new Error('SalesOrder model is required for suggestion search.');
  return {
    async findFastCandidates({ scope, keyword, candidateLimit, session }) {
      const base = fastScopeFilter(scope);
      const rows = [];
      const remaining = () => Math.max(0, candidateLimit - rows.length);
      const run = async (searchPart) => {
        if (!remaining()) return;
        mergeUnique(rows, await executeFind(SalesOrder, andFilter([base, searchPart]), remaining(), session), candidateLimit);
      };
      await run({ $or: [
        { suggestOrderCodeNorm: keyword.code },
        { suggestCustomerCodeNorm: keyword.code }
      ] });
      const codePrefix = new RegExp(`^${contract.escapeRegExp(keyword.code)}`);
      await run({ $or: [
        { suggestOrderCodeNorm: codePrefix },
        { suggestCustomerCodeNorm: codePrefix },
        ...(keyword.phone ? [{ suggestCustomerPhoneNorm: new RegExp(`^${contract.escapeRegExp(keyword.phone)}`) }] : [])
      ] });
      await run({ suggestCustomerNameNorm: new RegExp(`^${contract.escapeRegExp(keyword.normalized)}`) });
      if (keyword.tokens.length) await run({ suggestSearchTokens: { $all: keyword.tokens } });
      return { rows, queries: 4, mode: 'normalized-fast-path' };
    },

    async findLegacyCandidates({ scope, keyword, candidateLimit, session }) {
      const base = legacyScopeFilter(scope);
      const rawPrefix = new RegExp(`^${contract.escapeRegExp(keyword.raw)}`, 'i');
      const prefixRows = await executeFind(SalesOrder, andFilter([base, { $or: [
        { id: rawPrefix }, { code: rawPrefix }, { orderCode: rawPrefix }, { salesOrderCode: rawPrefix },
        { customerCode: rawPrefix }, { customerName: rawPrefix },
        { customerPhone: rawPrefix }, { phone: rawPrefix }, { phoneNumber: rawPrefix },
        { customerAddress: rawPrefix }, { address: rawPrefix }, { deliveryAddress: rawPrefix }
      ] }]), candidateLimit, session);
      const rows = mergeUnique([], prefixRows, candidateLimit);
      if (rows.length < candidateLimit) {
        const scopedRecent = await executeFind(SalesOrder, base, candidateLimit, session);
        mergeUnique(rows, scopedRecent, candidateLimit);
      }
      return { rows, queries: 2, mode: 'legacy-bounded-fallback' };
    }
  };
}

function orderCode(row = {}) {
  return String(row.orderCode || row.code || row.salesOrderCode || row.id || row._id || '').trim();
}

function toItems(candidates = [], keyword = {}, scope = {}, limit = 10) {
  const orders = new Map();
  const customers = new Map();
  let scopeRejected = 0;
  let keywordRejected = 0;
  for (const row of candidates || []) {
    if (!contract.rowInScope(row, scope)) {
      scopeRejected += 1;
      continue;
    }
    if (!contract.rowMatchesKeyword(row, keyword)) {
      keywordRejected += 1;
      continue;
    }
    const code = orderCode(row);
    const customerCode = String(row.customerCode || '').trim();
    const customerName = String(row.customerName || '').trim();
    const phone = String(row.customerPhone || row.phone || row.phoneNumber || '').trim();
    const address = String(row.customerAddress || row.address || row.deliveryAddress || '').trim();
    const deliveryDate = String(row.deliveryDateKey || row.deliveryDate || '').slice(0, 10);
    const orderKey = contract.normalizeCode(code || row._id);
    if (orderKey && !orders.has(orderKey)) {
      const item = {
        type: 'order', code, orderCode: code, customerCode, customerName, phone, address, deliveryDate,
        label: [code, customerName || customerCode].filter(Boolean).join(' - '),
        subLabel: [customerCode, phone ? `SĐT: ${phone}` : '', deliveryDate ? `Ngày giao ${deliveryDate}` : ''].filter(Boolean).join(' · ')
      };
      item._rank = contract.rankSuggestion(item, keyword);
      orders.set(orderKey, item);
    }
    const customerKey = contract.normalizeCode(customerCode) || `${contract.normalizeSearchText(customerName)}|${contract.normalizePhone(phone)}`;
    if (customerKey && !customers.has(customerKey)) {
      const item = {
        type: 'customer', code: customerCode, customerCode, name: customerName, customerName, phone, address,
        label: [customerCode, customerName].filter(Boolean).join(' - '),
        subLabel: [phone ? `SĐT: ${phone}` : '', address].filter(Boolean).join(' · ')
      };
      item._rank = contract.rankSuggestion(item, keyword);
      customers.set(customerKey, item);
    }
  }
  const all = [...orders.values(), ...customers.values()].sort(contract.stableSuggestionCompare);
  const duplicateRemoved = Math.max(0, (candidates || []).length * 2 - orders.size - customers.size);
  return {
    items: all.slice(0, limit).map(({ _rank, ...item }) => item),
    metrics: { scopeRejected, keywordRejected, duplicateRemoved, rankedRows: all.length }
  };
}

async function searchOrderCustomers(query = {}, options = {}) {
  const limit = contract.parseOutputLimit(query.limit);
  const candidateLimit = contract.parseCandidateLimit(query.candidateLimit, limit);
  const keyword = contract.normalizeKeyword(query.q || query.search || query.keyword);
  const scope = contract.canonicalScope(query);
  if (!keyword.sufficient) {
    return {
      items: [],
      diagnostics: {
        source: 'delivery-suggestions-normalized-guarded-empty', endpoint: '/api/new/delivery-today/suggestions',
        featureFlag: FEATURE_FLAG, featureFlagEnabled: enabled(options), reason: 'MIN_QUERY_LENGTH',
        minQueryLength: keyword.minLength, limit, candidateLimit, scope
      }
    };
  }
  const repository = options.repository || createMongoRepository(options.SalesOrder);
  const fast = await repository.findFastCandidates({ scope, keyword, candidateLimit, session: options.session });
  let candidates = mergeUnique([], fast.rows, candidateLimit);
  let legacy = { rows: [], queries: 0, mode: 'not-used' };
  const legacyFallback = candidates.length < limit && options.legacyFallback !== false;
  if (legacyFallback) {
    legacy = await repository.findLegacyCandidates({ scope, keyword, candidateLimit, session: options.session });
    candidates = mergeUnique(candidates, legacy.rows, candidateLimit);
  }
  const built = toItems(candidates, keyword, scope, limit);
  return {
    items: built.items,
    diagnostics: {
      source: 'delivery-today-suggestions-normalized-search-v1',
      endpoint: '/api/new/delivery-today/suggestions',
      featureFlag: FEATURE_FLAG,
      featureFlagEnabled: true,
      readerMode: 'normalized-fast-path',
      limit,
      candidateLimit,
      candidateRows: candidates.length,
      fastCandidateRows: (fast.rows || []).length,
      legacyCandidateRows: (legacy.rows || []).length,
      repositoryCalls: Number(fast.queries || 0) + Number(legacy.queries || 0),
      legacyFallback,
      legacyFallbackMode: legacy.mode,
      scope,
      scopeAppliedBeforeSearch: true,
      postFilterScopeRejected: built.metrics.scopeRejected,
      duplicateRemoved: built.metrics.duplicateRemoved,
      ranking: ['exact-code', 'prefix-code', 'phone-prefix', 'name-prefix', 'bounded-token-match'],
      regexPolicy: 'escaped-anchored-prefix-only; no user-controlled substring regex',
      telemetry: {
        event: legacyFallback ? 'delivery_suggestions_legacy_fallback' : 'delivery_suggestions_normalized_fast_path',
        fallback: legacyFallback,
        fastCandidateRows: (fast.rows || []).length,
        legacyCandidateRows: (legacy.rows || []).length
      }
    }
  };
}

module.exports = {
  FEATURE_FLAG,
  enabled,
  searchOrderCustomers,
  createMongoRepository,
  fastScopeFilter,
  legacyScopeFilter,
  toItems
};
