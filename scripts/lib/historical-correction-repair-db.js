'use strict';

const { resolveCanonicalArOrderIdentity } = require('../../src/domain/ar/arOrderIdentity');
const arLedgerReadService = require('../../src/services/arLedgerRead.service');

function text(value = '') { return String(value ?? '').trim(); }
function unique(values = []) { return [...new Set((values || []).map(text).filter(Boolean))]; }
function applySession(query, session) { return session && query && typeof query.session === 'function' ? query.session(session) : query; }
async function execLean(query) {
  if (query && typeof query.lean === 'function') query = query.lean();
  return query;
}
function getModels() {
  return {
    SalesOrder: require('../../src/models/SalesOrder'),
    DeliveryCloseoutCorrection: require('../../src/models/DeliveryCloseoutCorrection'),
    DeliveryCloseoutVersion: require('../../src/models/DeliveryCloseoutVersion'),
    ArLedger: require('../../src/models/ArLedger')
  };
}

async function findOrder(orderCode, options = {}) {
  const { SalesOrder } = options.models || getModels();
  const key = text(orderCode);
  if (!key) throw Object.assign(new Error('--order-code is required'), { code: 'HISTORICAL_REPAIR_ORDER_CODE_REQUIRED' });
  let query = SalesOrder.findOne({
    $or: [
      { code: key }, { orderCode: key }, { salesOrderCode: key },
      { id: key }, { orderId: key }, { salesOrderId: key }
    ]
  });
  query = applySession(query, options.session);
  return execLean(query);
}

async function loadEvidenceFromDb({ orderCode, session, models } = {}) {
  const modelSet = models || getModels();
  const order = await findOrder(orderCode, { session, models: modelSet });
  if (!order) throw Object.assign(new Error(`Order not found: ${orderCode}`), { code: 'HISTORICAL_REPAIR_ORDER_NOT_FOUND' });
  const identity = resolveCanonicalArOrderIdentity({ order });
  const orderKeys = unique([identity.orderId, identity.orderCode, identity.salesOrderId, identity.salesOrderCode, ...(identity.lookupKeys || [])]);
  const orderOr = [
    { orderId: { $in: orderKeys } }, { orderCode: { $in: orderKeys } },
    { salesOrderId: { $in: orderKeys } }, { salesOrderCode: { $in: orderKeys } }
  ];

  let correctionQuery = modelSet.DeliveryCloseoutCorrection.find({ $or: orderOr })
    .sort({ newCloseoutVersion: 1, createdAt: 1, _id: 1 });
  correctionQuery = applySession(correctionQuery, session);
  const corrections = await execLean(correctionQuery) || [];

  let versionQuery = modelSet.DeliveryCloseoutVersion.find({ $or: orderOr })
    .sort({ closeoutVersion: 1, createdAt: 1, _id: 1 });
  versionQuery = applySession(versionQuery, session);
  const versions = await execLean(versionQuery) || [];

  const correctionKeys = unique((corrections || []).flatMap((row) => [row.id, row._id, row.code, row.correctionId, row.correctionCode]));
  const ledgerOr = [
    ...orderOr,
    { sourceId: { $in: orderKeys } }, { sourceCode: { $in: orderKeys } },
    { correctionId: { $in: correctionKeys } }, { correctionCode: { $in: correctionKeys } },
    { refId: { $in: correctionKeys } }, { refCode: { $in: correctionKeys } }
  ];
  let ledgerQuery = modelSet.ArLedger.find({ account: /^AR$/i, $or: ledgerOr })
    .sort({ createdAt: 1, date: 1, _id: 1 }).limit(5000);
  ledgerQuery = applySession(ledgerQuery, session);
  const arLedgers = await execLean(ledgerQuery) || [];

  const inspection = await arLedgerReadService.inspectActiveDebtReadModelLedgersByOrderKeys(
    identity.lookupKeys || orderKeys,
    { customerCode: text(order.customerCode), status: 'all' },
    { session }
  );
  const currentArBeforeObserved = arLedgerReadService._internal.sumCanonicalBalanceRows(inspection.canonicalLedgers || []);
  const earliestCorrectionAt = (corrections || []).map((row) => text(row.createdAt)).filter(Boolean).sort()[0] || '';
  const subsequentEvents = earliestCorrectionAt
    ? (arLedgers || []).filter((row) => text(row.createdAt || row.date) > earliestCorrectionAt)
    : [];

  return {
    order,
    corrections,
    versions,
    arLedgers,
    currentArBeforeObserved,
    subsequentEvents,
    identity,
    inspection
  };
}

module.exports = { text, unique, getModels, findOrder, loadEvidenceFromDb };
