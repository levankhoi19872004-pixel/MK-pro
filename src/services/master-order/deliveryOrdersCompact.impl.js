'use strict';

const { lazyFunction } = require('./lazyDependency.util');

const deliveryFinance = require('../../utils/deliveryFinance.util');
const { normalizeDeliveryMoney, readDeliveryMoney } = require('../../utils/deliveryMoney.util');
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
const isActiveReturnOrder = lazyFunction('./masterOrderReturn.impl', 'isActiveReturnOrder');
const returnOrderTotalAmount = lazyFunction('./masterOrderReturn.impl', 'returnOrderTotalAmount');
const buildMasterDeliveryArDebtMap = lazyFunction('./deliveryCommon.impl', 'buildMasterDeliveryArDebtMap');
const findMasterDeliveryArDebtRow = lazyFunction('./deliveryCommon.impl', 'findMasterDeliveryArDebtRow');

async function listDeliveryTodayOrdersCompact(query = {}) {
  const compactStartedAt = Date.now();
  const date = dateUtil.toDateOnly(query.date || dateUtil.todayVN());
  const limit = Math.min(Math.max(Number.parseInt(query.limit, 10) || 5000, 1), 5000);
  const q = normalizeText(query.q || '');
  const sales = normalizeText(query.salesStaffCode || query.salesStaff || query.salesman || '');
  const delivery = normalizeText(query.deliveryStaffCode || query.deliveryStaff || query.delivery || '');
  const route = normalizeText(query.route || query.routeName || '');
  const status = normalizeText(query.status || '');

  let masterQueryMs = 0;
  let salesQueryMs = 0;
  let returnQueryMs = 0;
  let buildRowsMs = 0;

  // Compact endpoint phải query nhẹ trực tiếp, không gọi listDeliveryToday().
  // listDeliveryToday() build đủ returnOrders/items/KPI/accounting nên gây chậm cho màn chỉ cần danh sách dòng đơn.
  const masterFilter = {
    $or: [{ date }, { deliveryDate: date }],
    status: { $nin: ['cancelled', 'canceled', 'void', 'deleted', 'removed', 'duplicate_cancelled'] }
  };

  const masterQueryStartedAt = Date.now();

  const masterOrders = await masterOrderRepository.findAll(masterFilter, {
    projection: {
      id: 1,
      code: 1,
      date: 1,
      deliveryDate: 1,
      deliveryStaffCode: 1,
      deliveryStaffName: 1,
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
      accountingConfirmed: 1,
      accountingStatus: 1,
      status: 1,
      createdAt: 1
    },
    sort: { deliveryDate: -1, createdAt: -1, code: -1 },
    limit
  });
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
      customerPhone: 1,
      customerAddress: 1,
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
      returnAmount: 1,
      returnedAmount: 1,
      returnAmountFromReturnOrders: 1,
      debtAmount: 1,
      remainingAmount: 1,
      collectedAmount: 1,
      accountingConfirmed: 1,
      accountingStatus: 1,
      needReAccounting: 1,
      reAccountingRequired: 1,
      adminAdjustmentOpen: 1,
      editLocked: 1,
      accountingLocked: 1,
      deliveryLocked: 1,
      arStatus: 1,
      lifecycleStatus: 1,
      arPostedAt: 1,
      accountingConfirmedAt: 1,
      accountingConfirmedBy: 1,
      isLate: 1,
      items: 1,
      deletedAt: 1
    },
    limit: Math.max(allRefs.length, limit)
  }) : [];
  salesQueryMs = Date.now() - salesQueryStartedAt;

  const childByKey = new Map();
  for (const child of children || []) {
    if (isInactiveStatus(child)) continue;
    for (const key of compactDeliveryOrderKeys(child)) childByKey.set(key, child);
  }

  // Query ReturnOrder đúng 1 lần và map theo các khóa chuẩn.
  const ReturnOrder = require('../../models/ReturnOrder');
  const returnQueryStartedAt = Date.now();
  const returnOrders = (salesOrderIds.length || salesOrderCodes.length)
    ? await ReturnOrder.find({
        $and: [
          {
            $or: [
              { salesOrderId: { $in: salesOrderIds } },
              { salesOrderCode: { $in: salesOrderCodes } },
              { orderId: { $in: salesOrderIds } },
              { orderCode: { $in: salesOrderCodes } }
            ]
          },
          {
            status: {
              $in: [
                'draft',
                'pending',
                'active',
                'has_return',
                'waiting_receive',
                'pending_warehouse_receive',
                'received',
                'warehouse_received',
                'merged',
                'delivered',
                'completed',
                'cleared'
              ]
            }
          },
          {
            $or: [
              { cancelledAt: { $exists: false } },
              { cancelledAt: null },
              { cancelledAt: '' }
            ]
          },
          {
            $or: [
              { deletedAt: { $exists: false } },
              { deletedAt: null },
              { deletedAt: '' }
            ]
          }
        ]
      }).lean()
    : [];
  returnQueryMs = Date.now() - returnQueryStartedAt;

  const buildRowsStartedAt = Date.now();
  const returnOrderMap = new Map();
  for (const ro of returnOrders || []) {
    const keys = [
      ro.salesOrderId,
      ro.salesOrderCode,
      ro.orderId,
      ro.orderCode
    ].filter(Boolean);
    for (const k of keys) {
      const key = String(k);
      const arr = returnOrderMap.get(key) || [];
      arr.push(ro);
      returnOrderMap.set(key, arr);
    }
  }

  const rows = [];
  const used = new Set();
  for (const master of masterOrders || []) {
    if (isInactiveStatus(master)) continue;
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

      // Bước 6: build rows nhẹ, không gọi các hàm tổng hợp nặng.
      // Chỉ lấy các field màn danh sách đang dùng và lookup returnOrders qua Map O(1).
      const returnKeys = compactDeliveryOrderKeys(child);
      const relatedReturnOrders = [];
      const seenReturnIds = new Set();
      for (const key of returnKeys) {
        for (const ro of returnOrderMap.get(key) || []) {
          const roKey = String(ro.id || ro.code || ro._id || `${key}-${relatedReturnOrders.length}`);
          if (seenReturnIds.has(roKey)) continue;
          seenReturnIds.add(roKey);
          relatedReturnOrders.push(ro);
        }
      }
      const activeReturnOrders = relatedReturnOrders.filter((ro) => isActiveReturnOrder(ro) && returnOrderTotalAmount(ro) > 0);
      const returnOrderCode = activeReturnOrders
        .map((ro) => ro.code || ro.returnOrderCode || ro.id || '')
        .find(Boolean) || '';
      const returnAmount = activeReturnOrders.reduce((sum, ro) => sum + returnOrderTotalAmount(ro), 0);
      const returnItemsRaw = activeReturnOrders.flatMap((ro) => Array.isArray(ro.items) ? ro.items : []);
      const returnByCode = new Map();
      for (const item of returnItemsRaw) {
        const code = String(item.productCode || item.code || item.productId || item.sku || '').trim();
        if (!code) continue;
        const qty = toNumber(item.returnQty ?? item.qtyReturn ?? item.returnQuantity ?? item.returnedQty ?? item.quantity ?? item.qty ?? 0);
        if (qty <= 0) continue;
        returnByCode.set(code, item);
      }
      const soldItems = Array.isArray(child.items) ? child.items : [];
      const mergedItems = soldItems.map((sold, index) => {
        const code = String(sold.productCode || sold.code || sold.productId || sold.sku || '').trim();
        const saved = returnByCode.get(code) || {};
        const price = toNumber(sold.price ?? sold.salePrice ?? sold.unitPrice ?? sold.finalPrice ?? saved.price ?? saved.salePrice ?? saved.unitPrice ?? 0);
        const soldQty = toNumber(sold.soldQty ?? sold.quantitySold ?? sold.orderQty ?? sold.totalQty ?? sold.qtySold ?? sold.quantity ?? sold.qty ?? 0);
        const returnQty = toNumber(saved.returnQty ?? saved.qtyReturn ?? saved.returnQuantity ?? saved.returnedQty ?? 0);
        return {
          ...sold,
          productCode: code || String(saved.productCode || saved.code || saved.productId || `SP${index + 1}`),
          productName: sold.productName || sold.name || saved.productName || saved.name || '',
          unit: sold.unit || sold.baseUnit || saved.unit || '',
          soldQty,
          quantitySold: soldQty,
          price,
          salePrice: price,
          unitPrice: price,
          returnQty,
          qtyReturn: returnQty,
          returnQuantity: returnQty,
          returnedQty: returnQty,
          amount: Math.round(returnQty * price),
          returnAmount: Math.round(returnQty * price)
        };
      });

      const totalAmount = toNumber(
        child.totalAmount ?? child.totalReceivable ?? child.receivableAmount ?? child.grandTotal ?? child.amount ?? 0
      );
      const deliveryMoney = readDeliveryMoney(child);
      const cashAmount = deliveryMoney.cashAmount;
      const bankAmount = deliveryMoney.bankAmount;
      const bonusAmount = deliveryMoney.rewardAmount;
      const debtAmount = Math.max(
        0,
        totalAmount - cashAmount - bankAmount - bonusAmount - returnAmount
      );

      const displayOrderCode = child.code || child.orderCode || child.salesOrderCode || child.invoiceCode || child.documentCode || child.id || '';
      let row = {
        id: child.id || '',
        code: displayOrderCode,
        orderCode: displayOrderCode,
        salesOrderId: child.id || '',
        salesOrderCode: displayOrderCode,
        displayOrderCode,
        customerCode: child.customerCode || '',
        customerName: child.customerName || '',
        salesStaffCode: child.salesStaffCode || child.salesmanCode || child.nvbhCode || master.salesStaffCode || master.salesmanCode || master.nvbhCode || '',
        salesStaffName: child.salesStaffName || child.salesmanName || child.nvbhName || master.salesStaffName || master.salesmanName || master.nvbhName || '',
        deliveryStaffCode: child.deliveryStaffCode || master.deliveryStaffCode || '',
        deliveryStaffName: child.deliveryStaffName || master.deliveryStaffName || '',
        deliveryDate,
        totalAmount,
        cashAmount,
        bankAmount,
        bonusAmount,
        rewardAmount: bonusAmount,
        returnAmount,
        returnAmountFromReturnOrders: returnAmount,
        returnAmountSource: 'returnOrders',
        debtAmount,
        remainingAmount: debtAmount,
        status: child.status || '',
        deliveryStatus: child.deliveryStatus || 'waiting',
        accountingConfirmed: Boolean(child.accountingConfirmed || child.accountingStatus === 'confirmed'),
        accountingStatus: child.accountingStatus || '',
        accountingLocked: Boolean(child.accountingLocked || child.accountingConfirmed || child.accountingStatus === 'confirmed'),
        editLocked: Boolean(child.editLocked || child.accountingLocked || child.accountingConfirmed || child.accountingStatus === 'confirmed'),
        deliveryLocked: Boolean(child.deliveryLocked || child.accountingLocked || child.accountingConfirmed || child.accountingStatus === 'confirmed'),
        needReAccounting: Boolean(child.accountingNeedsReconfirm || child.needReAccounting || child.reAccountingRequired || child.adminAdjustmentOpen || ['needs_repost', 'reopened', 'needs_reconfirm'].includes(String(child.accountingStatus || '').toLowerCase())),
        reAccountingRequired: Boolean(child.reAccountingRequired),
        adminAdjustmentOpen: Boolean(child.adminAdjustmentOpen),
        arStatus: child.arStatus || '',
        lifecycleStatus: child.lifecycleStatus || '',
        arPostedAt: child.arPostedAt || '',
        accountingConfirmedAt: child.accountingConfirmedAt || '',
        accountingConfirmedBy: child.accountingConfirmedBy || '',
        hasReturn: returnAmount > 0,
        items: mergedItems,
        orderItems: soldItems,
        returnItems: returnItemsRaw,
        deliveryReturnItems: mergedItems,
        returnOrderItems: mergedItems,
        returnOrderCode
      };

      row = deliveryFinance.buildCanonicalDeliveryOrder(row, {
        returnItems: mergedItems,
        returnAmountOverride: returnAmount
      });

      if (q && ![row.code, row.customerCode, row.customerName].some((value) => normalizeText(value).includes(q))) continue;
      if (sales && ![row.salesStaffCode, row.salesStaffName].some((value) => normalizeText(value).includes(sales))) continue;
      if (
        delivery &&
        ![
          row.deliveryStaffCode,
          row.deliveryStaffName,
          master.deliveryStaffCode,
          master.deliveryStaffName
        ]
          .filter(Boolean)
          .some((value) => normalizeText(value).includes(delivery))
      ) {
        continue;
      }
      if (route) {
        const rowRoute = child.routeName || child.deliveryRoute || master.routeName || '';
        if (!normalizeText(rowRoute).includes(route)) continue;
      }
      if (status) {
        const rawStatus = normalizeText(row.status);
        const rawDeliveryStatus = normalizeText(row.deliveryStatus);
        const isDeliveredGroup = ['delivered', 'done', 'completed', 'paid'].includes(rawStatus)
          || ['delivered', 'done', 'completed', 'paid'].includes(rawDeliveryStatus);
        const isNotDeliveredGroup = !isDeliveredGroup;
        if (status === 'delivered_group' && !isDeliveredGroup) continue;
        else if (status === 'not_delivered' && !isNotDeliveredGroup) continue;
        else if (status === 'returned' && !row.hasReturn) continue;
        else if (status === 'accounting_confirmed' && !(row.accountingConfirmed || row.editLocked || row.accountingLocked)) continue;
        else if (status === 'accounting_pending' && (row.accountingConfirmed || row.editLocked || row.accountingLocked)) continue;
        else if (!['delivered_group', 'not_delivered', 'returned', 'accounting_confirmed', 'accounting_pending'].includes(status) && rawStatus !== status && rawDeliveryStatus !== status) continue;
      }

      rows.push(row);
      if (rows.length >= limit) break;
    }
    if (rows.length >= limit) break;
  }

  const summary = rows.reduce((acc, row) => {
    acc.totalReceivable += toNumber(row.totalAmount);
    acc.cashAmount += toNumber(row.cashAmount);
    acc.bankAmount += toNumber(row.bankAmount);
    acc.bonusAmount += toNumber(row.bonusAmount);
    acc.returnAmount += toNumber(row.returnAmount);
    acc.debtAmount += toNumber(row.debtAmount);
    return acc;
  }, {
    totalReceivable: 0,
    cashAmount: 0,
    bankAmount: 0,
    bonusAmount: 0,
    returnAmount: 0,
    debtAmount: 0
  });

  buildRowsMs = Date.now() - buildRowsStartedAt;
  const ms = Date.now() - compactStartedAt;
  const totalMs = ms;
  const perf = {
    masterQueryMs,
    salesQueryMs,
    returnQueryMs,
    buildRowsMs,
    totalMs,
    compactMs: ms,
    masterCount: masterOrders.length,
    childRefCount: allRefs.length,
    childCount: children.length,
    returnOrderCount: returnOrders.length,
    compactRowCount: rows.length
  };

  return {
    ok: true,
    orders: rows,
    rows,
    summary,
    total: rows.length,
    ms,
    perf
  };
}

module.exports = {
  listDeliveryTodayOrdersCompact
};