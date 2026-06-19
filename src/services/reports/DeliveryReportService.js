'use strict';

const mongoose = require('mongoose');
const MasterOrder = require('../../models/MasterOrder');
const SalesOrder = require('../../models/SalesOrder');
const FundLedger = require('../../models/FundLedger');
const SalesReportService = require('./SalesReportService');
const {
  activeDocumentFilter,
  businessDateStages,
  businessDate,
  dateRange,
  firstText,
  isAccountingConfirmed,
  isDelivered,
  orderIdentityValues,
  paginate,
  staffIdentity,
  text,
  toNumber
} = require('./ReportDomainUtils');

function masterIdentityValues(master = {}) {
  return [master._id, master.id, master.code, master.masterOrderCode].map(text).filter(Boolean);
}

function childRefs(master = {}) {
  return [
    ...(Array.isArray(master.childOrderIds) ? master.childOrderIds : []),
    ...(Array.isArray(master.orderIds) ? master.orderIds : []),
    ...(Array.isArray(master.childOrders) ? master.childOrders.map((row) => row?._id || row?.id || row?.code) : [])
  ].map(text).filter(Boolean);
}

async function loadMasters(query = {}) {
  const { dateFrom, dateTo } = dateRange(query);
  const masters = await MasterOrder.aggregate([
    { $match: activeDocumentFilter() },
    ...businessDateStages(dateFrom, dateTo, ['deliveryDate', 'date'], '_reportBusinessDate'),
    { $sort: { _reportBusinessDate: 1, createdAt: 1, _id: 1 } }
  ]).allowDiskUse(true).exec();
  return { masters, dateFrom, dateTo };
}

function objectIds(values = []) {
  return values.filter((value) => mongoose.Types.ObjectId.isValid(value)).map((value) => new mongoose.Types.ObjectId(value));
}

async function loadChildren(masters = []) {
  const masterKeys = Array.from(new Set(masters.flatMap(masterIdentityValues)));
  const refs = Array.from(new Set(masters.flatMap(childRefs)));
  const ids = objectIds(refs);
  const or = [
    { masterOrderId: { $in: masterKeys } },
    { masterOrderCode: { $in: masterKeys } },
    { id: { $in: refs } },
    { code: { $in: refs } },
    { orderCode: { $in: refs } },
    { salesOrderCode: { $in: refs } }
  ];
  if (ids.length) or.push({ _id: { $in: ids } });
  if (!masterKeys.length && !refs.length) return [];
  return SalesOrder.aggregate([
    { $match: activeDocumentFilter() },
    { $match: { $or: or } }
  ]).allowDiskUse(true).exec();
}

function mapChildrenToMasters(masters = [], children = []) {
  const keyToMaster = new Map();
  for (const master of masters) {
    const canonical = text(master._id || master.id || master.code);
    for (const key of [...masterIdentityValues(master), ...childRefs(master)]) keyToMaster.set(key, canonical);
  }
  const grouped = new Map(masters.map((master) => [text(master._id || master.id || master.code), []]));
  for (const child of children) {
    const candidates = [child.masterOrderId, child.masterOrderCode, ...orderIdentityValues(child)].map(text).filter(Boolean);
    const canonical = candidates.map((key) => keyToMaster.get(key)).find(Boolean);
    if (!canonical) continue;
    grouped.get(canonical)?.push(child);
  }
  return grouped;
}

async function loadCollections(masters = [], children = []) {
  const masterKeys = Array.from(new Set(masters.flatMap(masterIdentityValues)));
  const childKeys = Array.from(new Set(children.flatMap(orderIdentityValues)));
  const keys = Array.from(new Set([...masterKeys, ...childKeys]));
  if (!keys.length) return [];
  return FundLedger.find({
    status: { $nin: ['void', 'cancelled', 'canceled', 'deleted', 'duplicate_cancelled'] },
    direction: { $in: ['in', 'IN'] },
    $or: [
      { masterOrderId: { $in: masterKeys } },
      { masterOrderCode: { $in: masterKeys } },
      { sourceId: { $in: keys } }, { sourceCode: { $in: keys } },
      { refId: { $in: keys } }, { refCode: { $in: keys } },
      { referenceId: { $in: keys } }, { referenceCode: { $in: keys } }
    ]
  }).lean();
}

function collectionByMaster(masters = [], childrenByMaster = new Map(), ledgers = []) {
  const keyToMaster = new Map();
  for (const master of masters) {
    const canonical = text(master._id || master.id || master.code);
    const children = childrenByMaster.get(canonical) || [];
    for (const key of [...masterIdentityValues(master), ...children.flatMap(orderIdentityValues)]) keyToMaster.set(key, canonical);
  }
  const map = new Map();
  const seen = new Set();
  for (const ledger of ledgers) {
    const ledgerId = text(ledger._id || ledger.id || ledger.idempotencyKey);
    if (ledgerId && seen.has(ledgerId)) continue;
    if (ledgerId) seen.add(ledgerId);
    const keys = [
      ledger.masterOrderId, ledger.masterOrderCode, ledger.sourceId, ledger.sourceCode,
      ledger.refId, ledger.refCode, ledger.referenceId, ledger.referenceCode
    ].map(text).filter(Boolean);
    const canonical = keys.map((key) => keyToMaster.get(key)).find(Boolean);
    if (!canonical) continue;
    map.set(canonical, toNumber(map.get(canonical)) + Math.abs(toNumber(ledger.amount)));
  }
  return map;
}

async function deliveryReport(query = {}) {
  const [{ masters, dateFrom, dateTo }, productMap] = await Promise.all([
    loadMasters(query),
    SalesReportService.loadProductMap()
  ]);
  const children = await loadChildren(masters);
  const childrenByMaster = mapChildrenToMasters(masters, children);
  const ledgers = await loadCollections(masters, children);
  const collectedByMaster = collectionByMaster(masters, childrenByMaster, ledgers);
  const needle = text(query.q || query.search || query.keyword).toLowerCase();

  let rows = masters.map((master) => {
    const canonical = text(master._id || master.id || master.code);
    const allChildren = childrenByMaster.get(canonical) || [];
    const deliveredChildren = allChildren.filter(isDelivered);
    const staff = staffIdentity(master, 'delivery');
    const resolvedStaff = staff.code || staff.name ? staff : staffIdentity(deliveredChildren[0] || {}, 'delivery');
    const valued = deliveredChildren.map((order) => ({ order, valuation: SalesReportService.valueOrder(order, productMap) }));
    const totalAmount = valued.reduce((sum, item) => sum + item.valuation.actualAmount, 0);
    const accountingConfirmedAmount = valued
      .filter((item) => isAccountingConfirmed(item.order))
      .reduce((sum, item) => sum + item.valuation.actualAmount, 0);
    return {
      id: text(master.id || master._id),
      code: firstText(master, ['code', 'masterOrderCode', 'id']),
      deliveryDate: master._reportBusinessDate || businessDate(master, ['deliveryDate', 'date']),
      deliveryStaffCode: resolvedStaff.code,
      deliveryStaffName: resolvedStaff.name,
      orderCount: deliveredChildren.length,
      assignedOrderCount: allChildren.length,
      totalAmount,
      accountingConfirmedAmount,
      collectedAmount: toNumber(collectedByMaster.get(canonical)),
      status: firstText(master, ['status', 'deliveryStatus']),
      snapshotOrderCount: toNumber(master.orderCount || master.childOrderCount),
      snapshotTotalAmount: toNumber(master.totalAmount || master.amount),
      dataQuality: {
        missingChildren: allChildren.length === 0,
        snapshotOrderCountDifference: toNumber(master.orderCount || master.childOrderCount) - deliveredChildren.length,
        snapshotAmountDifference: toNumber(master.totalAmount || master.amount) - totalAmount
      }
    };
  });
  if (needle) {
    rows = rows.filter((row) => [row.code, row.deliveryStaffCode, row.deliveryStaffName, row.status]
      .some((value) => text(value).toLowerCase().includes(needle)));
  }
  rows.sort((a, b) => b.deliveryDate.localeCompare(a.deliveryDate) || b.code.localeCompare(a.code));

  const byStaffMap = new Map();
  for (const row of rows) {
    const key = row.deliveryStaffCode || row.deliveryStaffName || 'UNKNOWN';
    if (!byStaffMap.has(key)) {
      byStaffMap.set(key, {
        deliveryStaffCode: row.deliveryStaffCode,
        deliveryStaffName: row.deliveryStaffName,
        tripCount: 0,
        orderCount: 0,
        totalAmount: 0,
        accountingConfirmedAmount: 0,
        collectedAmount: 0
      });
    }
    const target = byStaffMap.get(key);
    target.tripCount += 1;
    target.orderCount += row.orderCount;
    target.totalAmount += row.totalAmount;
    target.accountingConfirmedAmount += row.accountingConfirmedAmount;
    target.collectedAmount += row.collectedAmount;
  }
  const byStaff = Array.from(byStaffMap.values()).sort((a, b) => b.totalAmount - a.totalAmount);
  const summary = rows.reduce((acc, row) => {
    acc.tripCount += 1;
    acc.orderCount += row.orderCount;
    acc.assignedOrderCount += row.assignedOrderCount;
    acc.totalAmount += row.totalAmount;
    acc.accountingConfirmedAmount += row.accountingConfirmedAmount;
    acc.collectedAmount += row.collectedAmount;
    if (row.dataQuality.missingChildren) acc.missingChildTripCount += 1;
    if (row.dataQuality.snapshotOrderCountDifference !== 0 || row.dataQuality.snapshotAmountDifference !== 0) acc.snapshotMismatchCount += 1;
    return acc;
  }, {
    tripCount: 0,
    orderCount: 0,
    assignedOrderCount: 0,
    totalAmount: 0,
    accountingConfirmedAmount: 0,
    collectedAmount: 0,
    missingChildTripCount: 0,
    snapshotMismatchCount: 0
  });
  const paged = paginate(rows, query, { defaultLimit: 50, maxLimit: 200 });
  return {
    source: 'mongo_master_orders_recomputed_from_children',
    masterSource: 'master_orders',
    childSource: 'orders',
    collectionSource: 'fundLedgers',
    dateFrom,
    dateTo,
    delivery: paged.rows,
    items: paged.rows,
    meta: paged.meta,
    byStaff,
    summary
  };
}

module.exports = {
  loadMasters,
  loadChildren,
  deliveryReport
};
