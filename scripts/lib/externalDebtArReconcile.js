'use strict';

const LEDGER_TYPE = 'ar_external_debt';
const LEDGER_TYPE_CANONICAL = 'AR-EXTERNAL-DEBT';
const SOURCE_TYPE = 'externalDebt';
const ACTIVE_EXTERNAL_ORDER_STATUSES = new Set(['active', 'posted', 'confirmed', 'accounting_confirmed']);
const INACTIVE_LEDGER_STATUSES = new Set(['void', 'reversed', 'cancelled', 'canceled', 'deleted', 'removed']);

function clean(value = '') {
  return String(value ?? '').trim();
}

function lower(value = '') {
  return clean(value).toLowerCase();
}

function compact(value = '') {
  return lower(value).replace(/[^a-z0-9]+/g, '');
}

function money(value) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function dateOnly(value = '') {
  return clean(value).slice(0, 10);
}

function isExternalDebtLedger(row = {}) {
  return lower(row.type) === LEDGER_TYPE
    || clean(row.ledgerType) === LEDGER_TYPE_CANONICAL
    || clean(row.category) === LEDGER_TYPE_CANONICAL
    || /^AR-EXTERNAL-/i.test(clean(row.code || row.id))
    || lower(row.orderType) === 'external_debt';
}

function isInactiveLedger(row = {}) {
  const statuses = [row.status, row.accountingStatus, row.lifecycleStatus].map(lower).filter(Boolean);
  return row.isDeleted === true || row.reversed === true || Boolean(row.deletedAt)
    || statuses.some((status) => INACTIVE_LEDGER_STATUSES.has(status));
}

function isActiveExternalOrder(row = {}) {
  const status = lower(row.status || row.accountingStatus);
  if (!status) return true;
  return ACTIVE_EXTERNAL_ORDER_STATUSES.has(status);
}

function sourceTypeIsCanonical(row = {}) {
  const src = compact(row.sourceType);
  return src === 'externaldebt';
}

function sourceTypeIsLegacyExternal(row = {}) {
  const src = compact(row.sourceType);
  return src === 'externaldebt' || src === 'externaldebtorder';
}

function orderKey(row = {}) {
  return clean(row.id || row.code || row._id);
}

function ledgerSourceKey(row = {}) {
  return clean(row.sourceId || row.sourceCode || row.orderId || row.orderCode || row.refId || row.refCode);
}

function groupBy(rows = [], keyFn) {
  const map = new Map();
  for (const row of rows || []) {
    const key = clean(keyFn(row));
    if (!key) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return map;
}

function pickLedger(row = {}) {
  return {
    _id: clean(row._id),
    id: clean(row.id),
    code: clean(row.code),
    type: clean(row.type),
    ledgerType: clean(row.ledgerType),
    status: clean(row.status),
    sourceType: clean(row.sourceType),
    sourceId: clean(row.sourceId),
    sourceCode: clean(row.sourceCode),
    customerCode: clean(row.customerCode),
    amount: row.amount,
    debit: row.debit,
    date: clean(row.date),
    idempotencyKey: clean(row.idempotencyKey)
  };
}

function pickOrder(row = {}) {
  return {
    _id: clean(row._id),
    id: clean(row.id),
    code: clean(row.code),
    status: clean(row.status),
    customerCode: clean(row.customerCode),
    totalAmount: row.totalAmount,
    documentDate: clean(row.documentDate),
    arLedgerId: clean(row.arLedgerId),
    arLedgerCode: clean(row.arLedgerCode)
  };
}

function addCase(cases, severity, issue, key, examples = [], extra = {}) {
  cases.push({ severity, issue, key: clean(key), count: examples.length || 1, examples, ...extra });
}

function summarizeExternalDebtAr({ externalDebtOrders = [], arLedgers = [], hasExternalDebtCollection = true } = {}) {
  const orders = (externalDebtOrders || []).filter(isActiveExternalOrder);
  const ledgers = (arLedgers || []).filter(isExternalDebtLedger);
  const activeLedgers = ledgers.filter((row) => !isInactiveLedger(row));
  const cases = [];

  if (!hasExternalDebtCollection) {
    addCase(cases, 'P1', 'external_debt_collection_not_available', 'externalDebtOrders', [], {
      limitation: 'Không tìm thấy collection/model externalDebtOrders nên script chỉ audit được arLedgers, không đoán source.'
    });
  }

  const orderById = new Map();
  const orderByCode = new Map();
  for (const order of orders) {
    if (clean(order.id)) orderById.set(clean(order.id), order);
    if (clean(order.code)) orderByCode.set(clean(order.code), order);
  }

  const ledgersByOrder = new Map();
  for (const ledger of activeLedgers) {
    const keys = [ledger.sourceId, ledger.sourceCode, ledger.orderId, ledger.orderCode, ledger.refId, ledger.refCode].map(clean).filter(Boolean);
    for (const key of keys) {
      if (!ledgersByOrder.has(key)) ledgersByOrder.set(key, []);
      ledgersByOrder.get(key).push(ledger);
    }
  }

  for (const order of orders) {
    const keys = [order.id, order.code].map(clean).filter(Boolean);
    const matched = [];
    const seen = new Set();
    for (const key of keys) {
      for (const ledger of ledgersByOrder.get(key) || []) {
        const ledgerKey = clean(ledger._id || ledger.id || ledger.code);
        if (seen.has(ledgerKey)) continue;
        seen.add(ledgerKey);
        matched.push(ledger);
      }
    }

    if (!matched.length) {
      addCase(cases, 'P0', 'confirmed_external_debt_missing_ar', orderKey(order), [pickOrder(order)]);
      continue;
    }

    if (matched.length > 1) {
      addCase(cases, 'P0', 'duplicate_external_debt_ledger_for_source', orderKey(order), matched.map(pickLedger));
    }

    for (const ledger of matched) {
      const mismatches = [];
      if (money(ledger.amount ?? ledger.debit) !== money(order.totalAmount)) mismatches.push('amount');
      if (clean(ledger.customerCode) !== clean(order.customerCode)) mismatches.push('customerCode');
      if (dateOnly(ledger.date) !== dateOnly(order.documentDate)) mismatches.push('date');
      if (mismatches.length) {
        addCase(cases, 'P0', 'external_debt_ar_mismatch', orderKey(order), [pickOrder(order), pickLedger(ledger)], { mismatches });
      }
    }
  }

  const duplicateIdempotency = groupBy(activeLedgers, (row) => row.idempotencyKey);
  const duplicateSourceId = groupBy(activeLedgers, (row) => row.sourceId ? `${compact(row.sourceType)}:${row.sourceId}` : '');
  const duplicateSourceCode = groupBy(activeLedgers, (row) => row.sourceCode ? `${compact(row.sourceType)}:${row.sourceCode}` : '');

  for (const [key, rows] of duplicateIdempotency.entries()) {
    if (rows.length > 1) addCase(cases, 'P0', 'duplicate_external_debt_idempotencyKey', key, rows.map(pickLedger));
  }
  for (const [key, rows] of duplicateSourceId.entries()) {
    if (rows.length > 1) addCase(cases, 'P0', 'duplicate_external_debt_sourceId', key, rows.map(pickLedger));
  }
  for (const [key, rows] of duplicateSourceCode.entries()) {
    if (rows.length > 1) addCase(cases, 'P0', 'duplicate_external_debt_sourceCode', key, rows.map(pickLedger));
  }

  for (const ledger of activeLedgers) {
    if (!clean(ledger.idempotencyKey)) addCase(cases, 'P0', 'external_debt_ledger_missing_idempotencyKey', clean(ledger.code || ledger.id), [pickLedger(ledger)]);
    if (!clean(ledger.sourceId) && !clean(ledger.sourceCode)) addCase(cases, 'P0', 'external_debt_ledger_missing_source', clean(ledger.code || ledger.id), [pickLedger(ledger)]);
    if (!sourceTypeIsLegacyExternal(ledger)) addCase(cases, 'P0', 'external_debt_ledger_invalid_sourceType', clean(ledger.code || ledger.id), [pickLedger(ledger)]);
    else if (!sourceTypeIsCanonical(ledger)) addCase(cases, 'P1', 'external_debt_ledger_legacy_sourceType', clean(ledger.code || ledger.id), [pickLedger(ledger)]);

    const sourceKey = ledgerSourceKey(ledger);
    if (hasExternalDebtCollection && sourceKey && !orderById.has(sourceKey) && !orderByCode.has(sourceKey)) {
      addCase(cases, 'P0', 'orphan_external_debt_ledger_source_not_found', sourceKey, [pickLedger(ledger)]);
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    canonical: {
      ledgerType: LEDGER_TYPE,
      sourceType: SOURCE_TYPE,
      rule: '1 externalDebtOrder confirmed = 1 active AR external debt ledger'
    },
    totals: {
      externalDebtOrders: orders.length,
      arExternalDebtLedgers: ledgers.length,
      activeArExternalDebtLedgers: activeLedgers.length,
      p0Cases: cases.filter((row) => row.severity === 'P0').length,
      p1Cases: cases.filter((row) => row.severity !== 'P0').length
    },
    cases
  };
}

module.exports = {
  LEDGER_TYPE,
  LEDGER_TYPE_CANONICAL,
  SOURCE_TYPE,
  isExternalDebtLedger,
  summarizeExternalDebtAr
};
