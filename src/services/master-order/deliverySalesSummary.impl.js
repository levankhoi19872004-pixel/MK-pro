'use strict';

const { lazyFunction } = require('./lazyDependency.util');

const dateUtil = require('../../utils/date.util');
const orderRepository = require('../../repositories/orderRepository');
const masterOrderRepository = require('../../repositories/masterOrderRepository');
const { makeId, normalizeText, toNumber } = require('../../utils/common.util');
const {
  compactDeliveryOrderKeys,
  normalizeSalesOrderIds,
  buildSalesOrderIdInQuery,
  normalizeMasterSalesOrderRefs,
  masterChildOrderRefs,
  buildIdentityInFilter
} = require('./masterOrderIdentity.util');

const isInactiveStatus = lazyFunction('./masterOrderQuery.impl', 'isInactiveStatus');
const deliveryGroupKey = lazyFunction('./deliveryCommon.impl', 'deliveryGroupKey');
const buildDeliverySummaryAccumulator = lazyFunction('./deliveryCommon.impl', 'buildDeliverySummaryAccumulator');
const addDeliveryRowToSummary = lazyFunction('./deliveryCommon.impl', 'addDeliveryRowToSummary');
const finalizeDeliverySummaryRow = lazyFunction('./deliveryCommon.impl', 'finalizeDeliverySummaryRow');

async function listDeliveryTodaySalesSummary(deliveryStaffCode, query = {}) {
  const summaryStartedAt = Date.now();
  const date = dateUtil.toDateOnly(query.date || dateUtil.todayVN());
  const limit = Math.min(Math.max(Number.parseInt(query.limit, 10) || 5000, 1), 5000);
  const deliveryKey = String(deliveryStaffCode || query.deliveryStaffCode || query.deliveryStaff || query.delivery || '').trim();
  const delivery = normalizeText(deliveryKey);
  const q = normalizeText(query.q || '');
  const sales = normalizeText(query.salesStaffCode || query.salesStaff || query.salesman || '');
  const route = normalizeText(query.route || query.routeName || '');
  const status = normalizeText(query.status || '');

  let masterQueryMs = 0;
  let salesQueryMs = 0;
  let buildSummaryMs = 0;

  // Sales summary fast không được gọi listDeliveryToday().
  // Luồng nhẹ: masterOrders theo date + NVGH -> child order ids -> SalesOrder 1 lần -> group theo NVBH.
  // Không query returnOrders/items/AR Ledger/accounting/full rows.
  const masterFilter = {
    $or: [{ date }, { deliveryDate: date }],
    status: { $nin: ['cancelled', 'canceled', 'void', 'deleted', 'removed', 'duplicate_cancelled'] }
  };

  if (delivery) {
    masterFilter.$and = [{
      $or: [
        { deliveryStaffCode: deliveryKey },
        { deliveryStaffName: deliveryKey },
        { deliveryCode: deliveryKey },
        { driverCode: deliveryKey },
        { driverName: deliveryKey }
      ]
    }];
  }

  const masterQueryStartedAt = Date.now();
  let masterOrders = await masterOrderRepository.findAll(masterFilter, {
    projection: {
      id: 1,
      code: 1,
      date: 1,
      deliveryDate: 1,
      deliveryStaffCode: 1,
      deliveryStaffName: 1,
      deliveryCode: 1,
      driverCode: 1,
      driverName: 1,
      salesStaffCode: 1,
      salesStaffName: 1,
      routeName: 1,
      children: 1,
      childOrders: 1,
      orderIds: 1,
      childOrderIds: 1,
      salesOrderIds: 1,
      salesOrders: 1,
      orderCodes: 1,
      salesOrderCodes: 1,
      status: 1,
      createdAt: 1
    },
    sort: { deliveryDate: -1, createdAt: -1, code: -1 },
    limit
  });

  if (delivery && !(masterOrders || []).length) {
    const fallbackFilter = {
      $or: [{ date }, { deliveryDate: date }],
      status: { $nin: ['cancelled', 'canceled', 'void', 'deleted', 'removed', 'duplicate_cancelled'] }
    };
    masterOrders = await masterOrderRepository.findAll(fallbackFilter, {
      projection: {
        id: 1,
        code: 1,
        date: 1,
        deliveryDate: 1,
        deliveryStaffCode: 1,
        deliveryStaffName: 1,
        deliveryCode: 1,
        driverCode: 1,
        driverName: 1,
        salesStaffCode: 1,
        salesStaffName: 1,
        routeName: 1,
        children: 1,
        childOrders: 1,
        orderIds: 1,
        childOrderIds: 1,
        salesOrderIds: 1,
        salesOrders: 1,
        orderCodes: 1,
        salesOrderCodes: 1,
        status: 1,
        createdAt: 1
      },
      sort: { deliveryDate: -1, createdAt: -1, code: -1 },
      limit
    });
  }
  masterQueryMs = Date.now() - masterQueryStartedAt;

  const normalizedMasterRefs = (masterOrders || []).map(normalizeMasterSalesOrderRefs);
  const salesOrderIds = normalizeSalesOrderIds(normalizedMasterRefs.flatMap((item) => item.salesOrderIds));
  const salesOrderCodes = [...new Set(normalizedMasterRefs.flatMap((item) => item.salesOrderCodes))];
  const allRefs = [...new Set(salesOrderIds)];

  // Key chuẩn của SalesOrder là id. Không query lồng $or theo code/orderCode nữa để tránh chậm.
  const childFilter = salesOrderIds.length ? buildSalesOrderIdInQuery(salesOrderIds) : null;

  const salesQueryStartedAt = Date.now();
  const children = childFilter ? await orderRepository.findAll(childFilter, {
    projection: {
      id: 1,
      code: 1,
      orderCode: 1,
      documentCode: 1,
      invoiceCode: 1,
      salesOrderCode: 1,
      customerCode: 1,
      customerName: 1,
      salesStaffCode: 1,
      salesStaffName: 1,
      staffCode: 1,
      staffName: 1,
      salesmanCode: 1,
      salesmanName: 1,
      deliveryStaffCode: 1,
      deliveryStaffName: 1,
      routeName: 1,
      deliveryRoute: 1,
      deliveryDate: 1,
      date: 1,
      deliveryStatus: 1,
      status: 1,
      totalAmount: 1,
      totalReceivable: 1,
      receivableAmount: 1,
      grandTotal: 1,
      amount: 1,
      cashCollected: 1,
      cashAmount: 1,
      bankCollected: 1,
      bankAmount: 1,
      transferAmount: 1,
      rewardAmount: 1,
      displayRewardAmount: 1,
      bonusAmount: 1,
      bonusReturnAmount: 1,
      debtAmount: 1,
      remainingAmount: 1,
      collectedAmount: 1,
      deletedAt: 1
    },
    limit: Math.max(allRefs.length, limit)
  }) : [];
  salesQueryMs = Date.now() - salesQueryStartedAt;

  const buildSummaryStartedAt = Date.now();
  const childByKey = new Map();
  for (const child of children || []) {
    if (isInactiveStatus(child)) continue;
    for (const key of compactDeliveryOrderKeys(child)) childByKey.set(key, child);
  }

  const map = new Map();
  const used = new Set();
  for (const master of masterOrders || []) {
    if (isInactiveStatus(master)) continue;

    const masterDeliveryCode = master.deliveryStaffCode || master.deliveryCode || master.driverCode || '';
    const masterDeliveryName = master.deliveryStaffName || master.driverName || '';
    if (delivery && ![masterDeliveryCode, masterDeliveryName].some((value) => normalizeText(value).includes(delivery) || String(value || '').trim() === deliveryKey)) {
      continue;
    }

    for (const ref of masterChildOrderRefs(master)) {
      const child = childByKey.get(ref);
      if (!child || isInactiveStatus(child)) continue;

      const uniqueKey = String(child.id || child.code || child.orderCode || ref);
      const masterKey = String(master.id || master.code || '');
      const usedKey = `${masterKey}::${uniqueKey}`;
      if (used.has(usedKey)) continue;
      used.add(usedKey);

      const deliveryDate = dateUtil.toDateOnly(child.deliveryDate || master.deliveryDate || child.date || master.date);
      if (deliveryDate !== date) continue;

      const row = {
        code: child.code || child.orderCode || child.documentCode || child.salesOrderCode || child.id || '',
        customerCode: child.customerCode || '',
        customerName: child.customerName || '',
        salesStaffCode: child.salesStaffCode || child.salesmanCode || child.nvbhCode || master.salesStaffCode || master.salesmanCode || master.nvbhCode || '',
        salesStaffName: child.salesStaffName || child.salesmanName || child.nvbhName || master.salesStaffName || master.salesmanName || master.nvbhName || '',
        deliveryStaffCode: child.deliveryStaffCode || masterDeliveryCode || '',
        deliveryStaffName: child.deliveryStaffName || masterDeliveryName || child.deliveryStaffCode || masterDeliveryCode || 'Chưa có NVGH',
        routeName: child.routeName || child.deliveryRoute || master.routeName || '',
        status: child.status || '',
        deliveryStatus: child.deliveryStatus || 'waiting',
        totalReceivable: toNumber(child.totalAmount ?? child.totalReceivable ?? child.receivableAmount ?? child.grandTotal ?? child.amount ?? 0),
        cashAmount: toNumber(child.cashAmount ?? child.cashCollected ?? 0),
        bankAmount: toNumber(child.bankAmount ?? child.bankCollected ?? child.transferAmount ?? 0),
        bonusAmount: toNumber(child.bonusAmount ?? child.rewardAmount ?? child.displayRewardAmount ?? child.bonusReturnAmount ?? 0)
      };
      row.salesmanCode = row.salesStaffCode;
      row.salesmanName = row.salesStaffName;
      row.totalAmount = row.totalReceivable;
      row.collectedAmount = row.cashAmount + row.bankAmount + row.bonusAmount;
      row.debtAmount = row.remainingAmount = Math.max(0, toNumber(child.debtAmount ?? child.remainingAmount ?? (row.totalReceivable - row.collectedAmount)));

      if (q && ![row.code, row.customerCode, row.customerName].some((value) => normalizeText(value).includes(q))) continue;
      if (sales && ![row.salesStaffCode, row.salesStaffName].some((value) => normalizeText(value).includes(sales))) continue;
      if (route && !normalizeText(row.routeName).includes(route)) continue;
      if (status) {
        const rawStatus = normalizeText(row.status);
        const rawDeliveryStatus = normalizeText(row.deliveryStatus);
        const isDeliveredGroup = ['delivered', 'done', 'completed', 'paid'].includes(rawStatus)
          || ['delivered', 'done', 'completed', 'paid'].includes(rawDeliveryStatus);
        const isNotDeliveredGroup = !isDeliveredGroup;
        if (status === 'delivered_group' && !isDeliveredGroup) continue;
        else if (status === 'not_delivered' && !isNotDeliveredGroup) continue;
        else if (!['delivered_group', 'not_delivered', 'accounting_confirmed', 'accounting_pending'].includes(status) && rawStatus !== status && rawDeliveryStatus !== status) continue;
      }

      const key = deliveryGroupKey(row.salesStaffCode || row.salesStaffName, 'NO_SALES');
      if (!map.has(key)) {
        map.set(key, {
          deliveryStaffCode: row.deliveryStaffCode || deliveryKey,
          deliveryStaffName: row.deliveryStaffName || row.deliveryStaffCode || 'Chưa có NVGH',
          salesStaffCode: row.salesStaffCode || '',
          salesStaffName: row.salesStaffName || row.salesStaffCode || 'Chưa có NVBH',
          ...buildDeliverySummaryAccumulator(row)
        });
      }
      addDeliveryRowToSummary(map.get(key), row);
    }
  }

  const rows = Array.from(map.values()).map(finalizeDeliverySummaryRow)
    .sort((a, b) => b.totalReceivable - a.totalReceivable || String(a.salesStaffName).localeCompare(String(b.salesStaffName), 'vi'));

  buildSummaryMs = Date.now() - buildSummaryStartedAt;
  const totalMs = Date.now() - summaryStartedAt;

  return {
    ok: true,
    date,
    deliveryStaffCode: deliveryKey,
    formula: 'Sales summary fast: masterOrders theo date + deliveryStaffCode -> SalesOrder 1 lần -> group theo nhân viên bán hàng; không gọi listDeliveryToday().',
    summary: rows,
    rows,
    total: rows.length,
    ms: totalMs,
    perf: {
      masterQueryMs,
      salesQueryMs,
      returnQueryMs: 0,
      buildSummaryMs,
      totalMs,
      masterCount: (masterOrders || []).length,
      childRefCount: allRefs.length,
      childCount: (children || []).length,
      summaryRowCount: rows.length
    }
  };
}

module.exports = {
  listDeliveryTodaySalesSummary
};