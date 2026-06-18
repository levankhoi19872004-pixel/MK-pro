'use strict';

const { lazyFunction } = require('./lazyDependency.util');

const dateUtil = require('../../utils/date.util');
const queryGuard = require('../../utils/queryGuard.util');
const masterOrderRepository = require('../../repositories/masterOrderRepository');
const { makeId, normalizeText, toNumber } = require('../../utils/common.util');
const { DEBT_ZERO_TOLERANCE, normalizeDebtAmount, hasOpenDebt } = require('../../constants/finance.constants');
const { debugLog } = require('../../utils/debug.util');

const buildMasterChildrenMapFast = lazyFunction('./masterOrderQuery.impl', 'buildMasterChildrenMapFast');
const isInactiveStatus = lazyFunction('./masterOrderQuery.impl', 'isInactiveStatus');
const findReturnOrdersForDeliveryChildren = lazyFunction('./masterOrderReturn.impl', 'findReturnOrdersForDeliveryChildren');
const buildDeliveryAmount = lazyFunction('./masterOrderReturn.impl', 'buildDeliveryAmount');
const getLockedReturnOrderForSalesOrder = lazyFunction('./masterOrderReturn.impl', 'getLockedReturnOrderForSalesOrder');
const returnAmountForSalesOrder = lazyFunction('./masterOrderReturn.impl', 'returnAmountForSalesOrder');
const returnItemsForSalesOrder = lazyFunction('./masterOrderReturn.impl', 'returnItemsForSalesOrder');
const isAccountingConfirmed = lazyFunction('./deliveryAccountingCore.impl', 'isAccountingConfirmed');
const isAccountingReopenPending = lazyFunction('./deliveryAccountingCore.impl', 'isAccountingReopenPending');
const statusForDeliveryRow = lazyFunction('./deliveryCommon.impl', 'statusForDeliveryRow');

async function listDeliveryToday(query = {}) {
  const perfStartedAt = Date.now();
  const perf = { startedAt: perfStartedAt };
  const mark = (name) => { perf[name] = Date.now() - perfStartedAt; };
  const date = dateUtil.toDateOnly(query.date || dateUtil.todayVN());
  const q = normalizeText(query.q);
  const salesman = normalizeText(query.salesman || query.salesStaff);
  const delivery = normalizeText(query.delivery || query.deliveryStaff);
  const route = normalizeText(query.route || query.routeName);
  const status = normalizeText(query.status);

  const page = queryGuard.getPagination({ page: query.page || 1, limit: query.limit || 50 }, { defaultLimit: 50, maxLimit: 5000 });
  const masterFilter = {
    $or: [{ date }, { deliveryDate: date }],
    status: { $nin: ['cancelled', 'canceled', 'void', 'deleted', 'removed', 'duplicate_cancelled'] }
  };
  const masterQueryStartedAt = Date.now();
  const masterOrders = await masterOrderRepository.findAll(masterFilter, {
    sort: { deliveryDate: -1, createdAt: -1, code: -1 },
    skip: page.skip,
    limit: page.limit
  });
  mark('masterQueryMs');
  const childrenMap = await buildMasterChildrenMapFast(masterOrders);
  mark('childrenQueryMs');
  const allChildren = Array.from(childrenMap.values()).flat();
  const returnLookupChildren = [];
  for (const master of masterOrders || []) {
    const masterKey = String(master.id || master.code || '');
    const children = childrenMap.get(masterKey) || [];
    for (const child of children) {
      returnLookupChildren.push({
        ...child,
        masterOrderId: master.id || '',
        masterOrderCode: master.code || ''
      });
    }
  }
  const tReturnStart = Date.now();
  const returnOrders = await findReturnOrdersForDeliveryChildren(returnLookupChildren.length ? returnLookupChildren : allChildren);
  mark('returnOrdersQueryMs');
  debugLog('DEBUG_DELIVERY', '[DELIVERY_TODAY_RETURN_ORDERS]', {
    returnMs: Date.now() - tReturnStart,
    orderCount: (returnLookupChildren.length ? returnLookupChildren : allChildren).length,
    returnCount: returnOrders.length
  });
  // Không dùng AR cache cho danh sách giao hàng; dùng công thức giao hàng bình thường.
  const arDebtMap = null;
  const rows = [];

  for (const master of masterOrders) {
    if (isInactiveStatus(master)) continue;
    const children = childrenMap.get(String(master.id || master.code || '')) || [];
    for (const child of children) {
      if (isInactiveStatus(child)) continue;
      const deliveryDate = dateUtil.toDateOnly(child.deliveryDate || master.deliveryDate || child.date || master.date);
      if (deliveryDate !== date) continue;

      child.masterOrderId = master.id || '';
      child.masterOrderCode = master.code || '';
      const syncedReturnAmount = returnAmountForSalesOrder(returnOrders, child);
      const syncedReturnItems = returnItemsForSalesOrder(returnOrders, child);
      const lockedReturnOrder = getLockedReturnOrderForSalesOrder(returnOrders, child);
      child.returnAmountFromReturnOrders = syncedReturnAmount;
      child.returnAmount = syncedReturnAmount;
      child.returnedAmount = syncedReturnAmount;
      child.returnItems = syncedReturnItems;
      child.deliveryReturnItems = syncedReturnItems;
      const amount = buildDeliveryAmount(child, syncedReturnAmount);

      const displayOrderCode = child.code || child.orderCode || child.salesOrderCode || child.invoiceCode || child.documentCode || child.id || '';
      const row = {
        id: child.id || child.code,
        code: displayOrderCode,
        orderCode: displayOrderCode,
        salesOrderId: child.id || '',
        salesOrderCode: displayOrderCode,
        displayOrderCode,
        masterOrderCode: master.code || master.id || '',
        customerCode: child.customerCode || '',
        customerName: child.customerName || '',
        customerPhone: child.customerPhone || '',
        customerAddress: child.customerAddress || '',
        salesmanCode: child.salesmanCode || child.salesStaffCode || child.nvbhCode || master.salesmanCode || master.salesStaffCode || master.nvbhCode || '',
        salesmanName: child.salesmanName || child.salesStaffName || child.nvbhName || master.salesmanName || master.salesStaffName || master.nvbhName || '',
        deliveryStaffCode: child.deliveryStaffCode || master.deliveryStaffCode || '',
        deliveryStaffName: child.deliveryStaffName || master.deliveryStaffName || '',
        routeName: child.routeName || child.deliveryRoute || master.routeName || '',
        deliveryDate,
        deliveryStatus: child.deliveryStatus || 'waiting',
        visualStatus: statusForDeliveryRow(child),
        totalAmount: amount.totalReceivable,
        totalReceivable: amount.totalReceivable,
        debtBeforeCollection: amount.totalReceivable,
        cashCollected: amount.cashAmount,
        cashAmount: amount.cashAmount,
        bankCollected: amount.bankAmount,
        bankAmount: amount.bankAmount,
        transferAmount: amount.bankAmount,
        returnAmount: amount.returnAmount,
        returnAmountSource: 'returnOrders',
        rewardAmount: amount.bonusAmount,
        bonusAmount: amount.bonusAmount,
        debt: amount.debtAmount,
        debtAmount: amount.debtAmount,
        remainingAmount: amount.debtAmount,
        collectedAmount: amount.collectedAmount,
        arBalance: amount.debtAmount,
        arDebtAmount: amount.debtAmount,
        debtSource: 'delivery_formula',
        arLedgerSynced: false,
        // Giữ riêng danh sách sản phẩm gốc để panel hàng trả luôn hiện đủ mã sản phẩm,
        // kể cả mã chưa có SL trả trong returnOrders.
        items: Array.isArray(child.items) ? child.items : [],
        orderItems: Array.isArray(child.items) ? child.items : [],
        soldItems: Array.isArray(child.items) ? child.items : [],
        returnItems: syncedReturnItems,
        deliveryReturnItems: syncedReturnItems,
        returnLocked: Boolean(lockedReturnOrder),
        returnLockMessage: lockedReturnOrder ? `Phiếu trả hàng đã gộp vào đơn tổng ${lockedReturnOrder.masterReturnOrderCode || lockedReturnOrder.masterReturnOrderId || ''}, không được sửa hàng trả.` : '',
        returnMergeStatus: lockedReturnOrder ? (lockedReturnOrder.returnMergeStatus || 'merged') : 'unmerged',
        masterReturnOrderId: lockedReturnOrder ? (lockedReturnOrder.masterReturnOrderId || '') : '',
        masterReturnOrderCode: lockedReturnOrder ? (lockedReturnOrder.masterReturnOrderCode || '') : '',
        warehouseReceiveStatus: lockedReturnOrder ? (lockedReturnOrder.warehouseReceiveStatus || '') : '',
        isLate: Boolean(child.isLate),
        needReAccounting: Boolean(child.needReAccounting || child.reAccountingRequired),
        adminAdjustmentOpen: Boolean(child.adminAdjustmentOpen),
        unlockReason: child.unlockReason || '',
        unlockedAt: child.unlockedAt || '',
        unlockedBy: child.unlockedBy || '',
        accountingConfirmed: !isAccountingReopenPending(child) && (isAccountingConfirmed(child) || isAccountingConfirmed(master)),
        accountingStatus: child.accountingStatus || master.accountingStatus || 'draft_delivery',
        accountingConfirmedAt: child.accountingConfirmedAt || master.accountingConfirmedAt || '',
        accountingConfirmedBy: child.accountingConfirmedBy || master.accountingConfirmedBy || '',
        editLocked: !isAccountingReopenPending(child) && (isAccountingConfirmed(child) || isAccountingConfirmed(master))
      };

      if (q && ![row.orderCode, row.masterOrderCode, row.customerCode, row.customerName, row.customerPhone, row.customerAddress].some((value) => normalizeText(value).includes(q))) continue;
      if (salesman && ![row.salesmanCode, row.salesmanName].some((value) => normalizeText(value).includes(salesman))) continue;
      if (delivery && ![row.deliveryStaffCode, row.deliveryStaffName].some((value) => normalizeText(value).includes(delivery))) continue;
      if (route && !normalizeText(row.routeName).includes(route)) continue;
      if (status) {
        const visual = normalizeText(row.visualStatus);
        const rawStatus = normalizeText(row.deliveryStatus);
        const isDeliveredGroup = ['delivered', 'done', 'completed', 'paid', 'unpaid'].includes(visual)
          || ['delivered', 'done', 'completed', 'paid'].includes(rawStatus);
        const isNotDeliveredGroup = !isDeliveredGroup;
        const hasReturn = toNumber(row.returnAmount) > 0 || (Array.isArray(row.returnItems) && row.returnItems.length > 0);
        const isAccountingConfirmedGroup = Boolean(row.accountingConfirmed);
        if (status === 'delivered_group' && !isDeliveredGroup) continue;
        else if (status === 'not_delivered' && !isNotDeliveredGroup) continue;
        else if (status === 'returned' && !hasReturn) continue;
        else if (status === 'accounting_confirmed' && !isAccountingConfirmedGroup) continue;
        else if (status === 'accounting_pending' && isAccountingConfirmedGroup) continue;
        else if (!['delivered_group', 'not_delivered', 'returned', 'accounting_confirmed', 'accounting_pending'].includes(status) && visual !== status && rawStatus !== status) continue;
      }
      rows.push(row);
    }
  }

  mark('buildRowsMs');
  const routeMap = new Map();
  for (const row of rows) {
    const key = row.routeName || 'Chưa có tuyến';
    if (!routeMap.has(key)) routeMap.set(key, {
      routeName: key,
      orderCount: 0,
      deliveryStaffCode: row.deliveryStaffCode,
      deliveryStaffName: row.deliveryStaffName
    });
    routeMap.get(key).orderCount += 1;
  }

  const accountingConfirmed = rows.length > 0 && rows.every((row) => row.accountingConfirmed || row.editLocked);
  const totalMs = Date.now() - perfStartedAt;
  perf.totalMs = totalMs;
  perf.masterCount = masterOrders.length;
  perf.childCount = allChildren.length;
  perf.returnOrderCount = returnOrders.length;
  perf.rowCount = rows.length;
  if (process.env.API_PERF_LOG !== '0') {
    debugLog('DEBUG_DELIVERY', '[DELIVERY_TODAY_PERF]', perf);
  }
  return {
    formula: 'Lấy đơn con đã gộp theo Ngày giao hàng trong đơn tổng/đơn con; không lấy theo ngày tạo đơn. Công nợ chỉ phát sinh sau khi kế toán xác nhận.',
    perf,
    ms: totalMs,
    accounting: {
      date,
      confirmed: accountingConfirmed,
      editable: !accountingConfirmed,
      message: accountingConfirmed ? 'Kế toán đã xác nhận. Đơn giao đã khóa chỉnh sửa và đã sinh AR-SALE.' : 'Chưa xác nhận kế toán. Đơn còn được chỉnh sửa và chưa sinh AR-SALE.'
    },
    orders: rows,
    routes: Array.from(routeMap.values()),
    kpi: {
      totalOrders: rows.length,
      delivering: rows.filter((row) => row.visualStatus === 'delivering').length,
      delivered: rows.filter((row) => row.visualStatus === 'delivered').length,
      unpaid: rows.filter((row) => hasOpenDebt(row.debt)).length,
      late: rows.filter((row) => row.isLate).length
    }
  };
}

module.exports = {
  listDeliveryToday
};