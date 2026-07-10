'use strict';

const deliveryFinance = require('../../utils/deliveryFinance.util');
const dateUtil = require('../../utils/date.util');
const returnOrderRepository = require('../../repositories/returnOrderRepository');
const returnOrderService = require('../returnOrderService');
const { makeId, normalizeText, toNumber } = require('../../utils/common.util');
const { DEBT_ZERO_TOLERANCE, normalizeDebtAmount, hasOpenDebt } = require('../../constants/finance.constants');
const { debugLog } = require('../../utils/debug.util');

async function findReturnOrdersForDeliveryChildren(children = [], options = {}) {
  const childRows = Array.isArray(children) ? children.filter(Boolean) : [];
  const orderIds = [...new Set(childRows.flatMap((order) => [
    order.id,
    order._id,
    order.orderId,
    order.salesOrderId,
    order.sourceOrderId,
    order.deliveryOrderId
  ]).map((value) => String(value || '').trim()).filter(Boolean))];

  const orderCodes = [...new Set(childRows.flatMap((order) => [
    order.code,
    order.orderCode,
    order.documentCode,
    order.salesOrderCode,
    order.sourceOrderCode,
    order.deliveryOrderCode
  ]).map((value) => String(value || '').trim()).filter(Boolean))];

  const masterIds = [...new Set(childRows.flatMap((order) => [
    order.masterOrderId,
    order.masterId
  ]).map((value) => String(value || '').trim()).filter(Boolean))];

  const masterCodes = [...new Set(childRows.flatMap((order) => [
    order.masterOrderCode,
    order.masterCode
  ]).map((value) => String(value || '').trim()).filter(Boolean))];

  const or = [];
  if (orderIds.length) {
    or.push(
      { orderId: { $in: orderIds } },
      { salesOrderId: { $in: orderIds } },
      { sourceOrderId: { $in: orderIds } },
      { deliveryOrderId: { $in: orderIds } }
    );
  }
  if (orderCodes.length) {
    or.push(
      { orderCode: { $in: orderCodes } },
      { salesOrderCode: { $in: orderCodes } },
      { sourceOrderCode: { $in: orderCodes } },
      { deliveryOrderCode: { $in: orderCodes } }
    );
  }
  if (masterIds.length) {
    or.push({ masterOrderId: { $in: masterIds } });
  }
  if (masterCodes.length) {
    or.push({ masterOrderCode: { $in: masterCodes } });
  }

  if (!or.length) return [];

  // ===== SCOPED FIX: AR_RETURN_QUERY_MATCH_RETURNORDERS_START =====
  // returnOrders của app giao hàng đang lưu orderId/orderCode/salesOrderCode và returnStatus='active',
  // accountingStatus vẫn có thể là 'pending'. Vì vậy tuyệt đối không lọc accountingStatus/status posted ở đây.
  const query = {
    $and: [
      { $or: or },
      {
        $or: [
          { returnStatus: { $exists: false } },
          { returnStatus: null },
          { returnStatus: '' },
          { returnStatus: { $nin: ['cancelled', 'canceled', 'void', 'deleted', 'inactive'] } }
        ]
      }
    ]
  };

  debugLog('DEBUG_AR_RETURN', '[AR_RETURN_DEBUG] RETURN_QUERY', JSON.stringify({
    orderIds,
    orderCodes,
    masterIds,
    masterCodes,
    query
  }, null, 2));

  const projection = {
    id: 1, code: 1, salesOrderId: 1, salesOrderCode: 1, orderId: 1, orderCode: 1,
    sourceOrderId: 1, sourceOrderCode: 1, deliveryOrderId: 1, deliveryOrderCode: 1,
    masterOrderId: 1, masterOrderCode: 1, masterReturnOrderId: 1, masterReturnOrderCode: 1,
    customerId: 1, customerCode: 1, customerName: 1, totalAmount: 1, totalReturnAmount: 1, returnAmount: 1, amount: 1, debtReduction: 1,
    items: 1, status: 1, returnStatus: 1, returnState: 1, accountingStatus: 1, returnMergeStatus: 1, warehouseReceiveStatus: 1,
    date: 1, documentDate: 1, deliveryDate: 1, receiveDate: 1, receivedAt: 1, postedAt: 1,
    // Closeout guard must validate the latest returnOrders inventory posting state from DB, not stale order/front-end payload.
    inventoryPosted: 1, stockPosted: 1, stockInStatus: 1, inventoryImpact: 1, stockTransactionId: 1, stockTransactionIds: 1,
    // ===== SCOPED FIX: AR_RETURN_ACCOUNTING_LINEAGE_PROJECTION_START =====
    // AR-RETURN phải giữ đủ snapshot nhân sự từ returnOrders để không bị mất NVBH/NVGH khi ghi arLedgers.
    salesStaffCode: 1, salesStaffName: 1, salesmanCode: 1, salesmanName: 1, nvbhCode: 1, nvbhName: 1,
    deliveryStaffCode: 1, deliveryStaffName: 1, deliveryCode: 1, deliveryName: 1, nvghCode: 1, nvghName: 1,
    staffCode: 1, staffName: 1
    // ===== SCOPED FIX: AR_RETURN_ACCOUNTING_LINEAGE_PROJECTION_END =====
  };

  let rows = await returnOrderRepository.findAll(query, { ...options, projection });

  // Fallback có kiểm soát: nếu query theo mã/id chưa bắt được, lấy theo ngày giao + NVGH rồi lọc lại ở JS.
  // Điều này xử lý trường hợp dữ liệu returnOrders cũ thiếu key nhưng vẫn thuộc đúng ngày/NVGH.
  if (!rows.length) {
    const deliveryDates = [...new Set(childRows.flatMap((order) => [
      order.deliveryDate,
      order.date,
      order.documentDate
    ]).map((value) => String(value || '').slice(0, 10)).filter(Boolean))];

    const deliveryStaffCodes = [...new Set(childRows.flatMap((order) => [
      order.deliveryStaffCode,
      order.deliveryCode,
      order.nvghCode
    ]).map((value) => String(value || '').trim()).filter(Boolean))];

    const fallbackAnd = [];
    if (deliveryDates.length) {
      fallbackAnd.push({
        $or: [
          { deliveryDate: { $in: deliveryDates } },
          { date: { $in: deliveryDates } },
          { documentDate: { $in: deliveryDates } }
        ]
      });
    }
    if (deliveryStaffCodes.length) {
      fallbackAnd.push({
        $or: [
          { deliveryStaffCode: { $in: deliveryStaffCodes } },
          { deliveryCode: { $in: deliveryStaffCodes } },
          { nvghCode: { $in: deliveryStaffCodes } }
        ]
      });
    }

    if (fallbackAnd.length) {
      const fallbackQuery = {
        $and: [
          ...fallbackAnd,
          {
            $or: [
              { returnStatus: { $exists: false } },
              { returnStatus: null },
              { returnStatus: '' },
              { returnStatus: { $nin: ['cancelled', 'canceled', 'void', 'deleted', 'inactive'] } }
            ]
          }
        ]
      };
      debugLog('DEBUG_AR_RETURN', '[AR_RETURN_DEBUG] RETURN_QUERY_FALLBACK', JSON.stringify({
        deliveryDates,
        deliveryStaffCodes,
        fallbackQuery
      }, null, 2));

      const fallbackRows = await returnOrderRepository.findAll(fallbackQuery, { ...options, projection, limit: 500 });
      const orderIdSet = new Set(orderIds);
      const orderCodeSet = new Set(orderCodes);
      rows = (fallbackRows || []).filter((row) => {
        const rowIds = [row.orderId, row.salesOrderId, row.sourceOrderId, row.deliveryOrderId].map((value) => String(value || '').trim()).filter(Boolean);
        const rowCodes = [row.orderCode, row.salesOrderCode, row.sourceOrderCode, row.deliveryOrderCode, row.code].map((value) => String(value || '').trim()).filter(Boolean);
        return rowIds.some((value) => orderIdSet.has(value)) || rowCodes.some((value) => orderCodeSet.has(value));
      });
    }
  }

  debugLog('DEBUG_AR_RETURN', '[AR_RETURN_DEBUG] RETURN_QUERY_RESULT', {
    count: rows.length,
    rows: rows.map((row) => ({
      id: row.id,
      code: row.code,
      orderId: row.orderId,
      orderCode: row.orderCode,
      salesOrderId: row.salesOrderId,
      salesOrderCode: row.salesOrderCode,
      amount: row.amount,
      debtReduction: row.debtReduction,
      totalAmount: row.totalAmount,
      returnStatus: row.returnStatus,
      accountingStatus: row.accountingStatus,
      inventoryPosted: row.inventoryPosted === true,
      stockPosted: row.stockPosted === true,
      stockInStatus: row.stockInStatus,
      inventoryImpactMode: row.inventoryImpact && typeof row.inventoryImpact === 'object' ? row.inventoryImpact.mode : ''
    }))
  });

  return rows;
  // ===== SCOPED FIX: AR_RETURN_QUERY_MATCH_RETURNORDERS_END =====
}

function buildDeliveryAmount(order = {}, returnAmountFromReturnOrders = null) {
  const totalReceivable = Math.max(0, normalizeDebtAmount(Math.round(deliveryFinance.deliveryDebtBase(order))));
  const cashAmount = Math.max(0, normalizeDebtAmount(Math.round(toNumber(order.cashCollected ?? order.cashAmount ?? 0))));
  const bankAmount = Math.max(0, normalizeDebtAmount(Math.round(toNumber(order.bankCollected ?? order.transferAmount ?? order.bankAmount ?? 0))));
  const bonusAmount = Math.max(0, normalizeDebtAmount(Math.round(deliveryRewardAmount(order))));
  const returnAmount = Math.max(0, normalizeDebtAmount(Math.round(returnAmountFromReturnOrders == null ? deliveryFinance.deliveryReturnAmount(order) : toNumber(returnAmountFromReturnOrders))));
  const debtAmount = Math.max(0, normalizeDebtAmount(Math.round(totalReceivable - cashAmount - bankAmount - bonusAmount - returnAmount)));
  return {
    totalReceivable,
    cashAmount,
    bankAmount,
    bonusAmount,
    rewardAmount: bonusAmount,
    returnAmount,
    debtAmount,
    remainingAmount: debtAmount,
    collectedAmount: cashAmount + bankAmount + bonusAmount + returnAmount
  };
}

function deliveryRewardAmount(order = {}) {
  return toNumber(order.rewardAmount ?? order.displayRewardAmount ?? order.bonusReturnAmount ?? 0);
}

function isActiveReturnOrder(row = {}) {
  const status = String(row.status || row.returnStatus || '').toLowerCase();
  const returnStatus = String(row.returnStatus || '').toLowerCase();
  const accountingStatus = String(row.accountingStatus || '').toLowerCase();
  const warehouseStatus = String(row.warehouseReceiveStatus || '').toLowerCase();
  const inactiveStatuses = ['cancelled', 'canceled', 'void', 'deleted', 'removed', 'cleared', 'duplicate_cancelled'];
  // returnOrders thực tế đang dùng returnStatus='active' và accountingStatus='pending'.
  // Không được loại pending vì đó là chứng từ gốc chưa số hóa AR-RETURN.
  return !inactiveStatuses.includes(status)
    && !inactiveStatuses.includes(returnStatus)
    && !inactiveStatuses.includes(accountingStatus)
    && !inactiveStatuses.includes(warehouseStatus)
    && !row.deletedAt;
}

function firstPositiveNumber(values = []) {
  for (const value of values) {
    const amount = toNumber(value);
    if (amount > 0) return amount;
  }
  return 0;
}

function returnOrderTotalAmount(row = {}) {
  // ===== SCOPED FIX: RETURN_ORDER_AMOUNT_FIRST_POSITIVE_START =====
  // returnOrders thực tế có thể lưu totalAmount=0 nhưng amount/debtReduction > 0.
  // Không được dùng toán tử ?? theo thứ tự totalAmount trước, vì 0 là giá trị non-null
  // và sẽ làm AR-RETURN bị hiểu là không có tiền để post.
  const explicit = firstPositiveNumber([
    row.debtReduction,
    row.amount,
    row.totalReturnAmount,
    row.totalAmount,
    row.returnAmount,
    row.returnedAmount,
    row.totalValue
  ]);
  if (explicit > 0) return explicit;
  // ===== SCOPED FIX: RETURN_ORDER_AMOUNT_FIRST_POSITIVE_END =====
  return (Array.isArray(row.items) ? row.items : []).reduce((sum, item) => {
    const qty = toNumber(item.returnQty ?? item.qtyReturn ?? item.returnQuantity ?? item.returnedQty ?? item.quantity ?? item.qty ?? 0);
    const price = toNumber(item.price ?? item.salePrice ?? item.unitPrice ?? item.finalPrice ?? item.giaBan ?? 0);
    const amount = firstPositiveNumber([item.returnAmount, item.amount, item.totalAmount]);
    return sum + (amount > 0 ? amount : Math.round(qty * price));
  }, 0);
}

function uniqueClean(values = []) {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
}

function masterChildCountForReturnFallback(order = {}) {
  const explicit = toNumber(order.__masterChildCount ?? order.masterChildCount ?? order.masterChildrenCount ?? 0);
  if (explicit > 0) return explicit;
  if (Array.isArray(order.masterChildren)) return order.masterChildren.length;
  if (Array.isArray(order.children)) return order.children.length;
  return 0;
}

function directReturnMatchReason(row = {}, order = {}) {
  const salesOrderIds = uniqueClean([order.id, order._id, order.salesOrderId]);
  const salesOrderCodes = uniqueClean([order.code, order.salesOrderCode]);
  const fallbackOrderIds = uniqueClean([order.orderId, order.sourceOrderId, order.deliveryOrderId]);
  const fallbackOrderCodes = uniqueClean([order.orderCode, order.sourceOrderCode, order.deliveryOrderCode, order.documentCode, order.invoiceCode]);

  if (uniqueClean([row.salesOrderId]).some((value) => salesOrderIds.includes(value))) return 'salesOrderId';
  if (uniqueClean([row.salesOrderCode]).some((value) => salesOrderCodes.includes(value))) return 'salesOrderCode';
  if (uniqueClean([row.orderId, row.sourceOrderId, row.deliveryOrderId]).some((value) => [...salesOrderIds, ...fallbackOrderIds].includes(value))) return 'orderId';
  if (uniqueClean([row.orderCode, row.sourceOrderCode, row.deliveryOrderCode]).some((value) => [...salesOrderCodes, ...fallbackOrderCodes].includes(value))) return 'orderCode';
  return '';
}

function masterReturnMatch(row = {}, order = {}) {
  const masterIds = uniqueClean([order.masterOrderId, order.masterId, order.deliveryMasterId]);
  const masterCodes = uniqueClean([order.masterOrderCode, order.masterCode, order.deliveryMasterCode]);
  const rowMasterIds = uniqueClean([row.masterOrderId, row.masterDeliveryOrderId, row.masterId]);
  const rowMasterCodes = uniqueClean([row.masterOrderCode, row.masterDeliveryOrderCode, row.masterCode]);
  return rowMasterIds.some((value) => masterIds.includes(value)) || rowMasterCodes.some((value) => masterCodes.includes(value));
}

function returnOrdersForSalesOrder(returnOrders = [], order = {}) {
  const activeRows = (returnOrders || []).filter(isActiveReturnOrder);
  const directRows = activeRows.filter((row) => directReturnMatchReason(row, order));
  if (directRows.length) return directRows;

  const masterRows = activeRows.filter((row) => masterReturnMatch(row, order));
  if (!masterRows.length) return [];

  const childCount = masterChildCountForReturnFallback(order);
  if (childCount === 1) return masterRows;

  debugLog('DEBUG_AR_RETURN', '[AR_RETURN_DEBUG] returnOrders_skipped_ambiguous_master', {
    orderId: order.id || order.orderId || order.salesOrderId || '',
    orderCode: order.code || order.orderCode || order.salesOrderCode || '',
    masterOrderId: order.masterOrderId || order.masterId || '',
    masterOrderCode: order.masterOrderCode || order.masterCode || '',
    masterChildCount: childCount,
    skippedReturnOrders: masterRows.map((row) => ({ id: row.id, code: row.code, masterOrderId: row.masterOrderId, masterOrderCode: row.masterOrderCode }))
  });
  return [];
}

function returnAmountForSalesOrder(returnOrders = [], order = {}) {
  return returnOrdersForSalesOrder(returnOrders, order)
    .reduce((sum, row) => sum + returnOrderTotalAmount(row), 0);
}

function directReturnOrdersForSalesOrder(returnOrders = [], order = {}) {
  return (returnOrders || [])
    .filter(isActiveReturnOrder)
    .filter((row) => directReturnMatchReason(row, order));
}

function enrichAccountingReturnRows(rows = [], order = {}) {
  return (rows || []).map((row) => ({
    ...row,

    customerId: row.customerId || order.customerId || '',
    customerCode: row.customerCode || order.customerCode || '',
    customerName: row.customerName || order.customerName || '',

    salesOrderId: row.salesOrderId || row.orderId || row.sourceOrderId || order.id || order.orderId || order.salesOrderId || '',
    salesOrderCode: row.salesOrderCode || row.orderCode || row.sourceOrderCode || order.code || order.orderCode || order.salesOrderCode || '',
    orderId: row.orderId || row.salesOrderId || row.sourceOrderId || order.id || order.orderId || order.salesOrderId || '',
    orderCode: row.orderCode || row.salesOrderCode || row.sourceOrderCode || order.code || order.orderCode || order.salesOrderCode || '',

    salesmanCode: row.salesmanCode || row.salesStaffCode || row.nvbhCode || order.salesmanCode || order.salesStaffCode || order.nvbhCode || '',
    salesmanName: row.salesmanName || row.salesStaffName || row.nvbhName || order.salesmanName || order.salesStaffName || order.nvbhName || '',
    salesStaffCode: row.salesStaffCode || row.salesmanCode || row.nvbhCode || order.salesStaffCode || order.salesmanCode || order.nvbhCode || '',
    salesStaffName: row.salesStaffName || row.salesmanName || row.nvbhName || order.salesStaffName || order.salesmanName || order.nvbhName || '',

    deliveryStaffCode: row.deliveryStaffCode || row.deliveryCode || row.nvghCode || order.deliveryStaffCode || order.deliveryCode || order.nvghCode || '',
    deliveryStaffName: row.deliveryStaffName || row.deliveryName || row.nvghName || order.deliveryStaffName || order.deliveryName || order.nvghName || '',

    masterOrderId: row.masterOrderId || order.masterOrderId || order.deliveryMasterId || '',
    masterOrderCode: row.masterOrderCode || order.masterOrderCode || order.deliveryMasterCode || ''
  }));
}

function hydrateReturnOrdersForAccounting(order = {}, returnOrders = []) {
  const directRows = enrichAccountingReturnRows(directReturnOrdersForSalesOrder(returnOrders, order), order);
  const directAmount = directRows.reduce((sum, row) => sum + returnOrderTotalAmount(row), 0);
  const directItems = directRows.flatMap((row) => Array.isArray(row.items) ? row.items : []);

  if (directAmount > 0 || directItems.length > 0) {
    return {
      ...order,
      returnAmountFromReturnOrders: directAmount,
      syncedReturnAmountFromReturnOrders: directAmount,
      returnAmount: directAmount,
      returnedAmount: directAmount,
      returnItems: directItems,
      deliveryReturnItems: directItems,
      accountingReturnOrders: directRows,
      returnAmountSource: 'returnOrders_direct_salesOrder'
    };
  }

  const matchedRows = enrichAccountingReturnRows(returnOrdersForSalesOrder(returnOrders, order), order);
  const fallbackAmount = matchedRows.reduce((sum, row) => sum + returnOrderTotalAmount(row), 0);
  if (fallbackAmount > 0) {
    const fallbackItems = matchedRows.flatMap((row) => Array.isArray(row.items) ? row.items : []);
    return {
      ...order,
      returnAmountFromReturnOrders: fallbackAmount,
      syncedReturnAmountFromReturnOrders: fallbackAmount,
      returnAmount: fallbackAmount,
      returnedAmount: fallbackAmount,
      returnItems: fallbackItems,
      deliveryReturnItems: fallbackItems,
      accountingReturnOrders: matchedRows,
      returnAmountSource: 'returnOrders_fallback_single_child_master'
    };
  }

  const hasAmbiguousMasterRows = (returnOrders || []).filter(isActiveReturnOrder).some((row) => masterReturnMatch(row, order));
  if (hasAmbiguousMasterRows && masterChildCountForReturnFallback(order) !== 1) {
    return {
      ...order,
      returnAmountFromReturnOrders: 0,
      syncedReturnAmountFromReturnOrders: 0,
      accountingReturnOrders: [],
      returnAmountSource: 'returnOrders_skipped_ambiguous_master'
    };
  }

  return order;
}

function isReturnOrderLocked(row = {}) {
  const mergeStatus = String(row.returnMergeStatus || '').toLowerCase();
  const warehouseStatus = String(row.warehouseReceiveStatus || '').toLowerCase();
  const status = String(row.status || '').toLowerCase();
  return mergeStatus === 'merged'
    || Boolean(row.masterReturnOrderId || row.masterReturnOrderCode)
    || ['received', 'posted', 'completed'].includes(warehouseStatus)
    || ['received', 'posted', 'completed'].includes(status);
}

function getLockedReturnOrderForSalesOrder(returnOrders = [], order = {}) {
  return returnOrdersForSalesOrder(returnOrders, order).find(isReturnOrderLocked) || null;
}

function returnItemsSignature(items = []) {
  return normalizeDeliveryReturnItems(items, { items: [] })
    .map((item) => `${String(item.productCode || '').trim()}:${toNumber(item.quantity)}`)
    .sort()
    .join('|');
}

function hasReturnItemsChanged(nextItems = [], currentItems = []) {
  return returnItemsSignature(nextItems) !== returnItemsSignature(currentItems);
}

function returnItemsForSalesOrder(returnOrders = [], order = {}) {
  const merged = new Map();
  for (const returnOrder of returnOrdersForSalesOrder(returnOrders, order)) {
    for (const item of (Array.isArray(returnOrder.items) ? returnOrder.items : [])) {
      const productCode = String(item.productCode || item.code || item.productId || '').trim();
      if (!productCode) continue;
      const quantity = toNumber(item.qtyReturn ?? item.returnQuantity ?? item.returnedQty ?? item.quantity ?? item.qty ?? 0);
      const price = toNumber(item.price ?? item.salePrice ?? item.unitPrice ?? 0);
      const current = merged.get(productCode) || {
        productId: item.productId || productCode,
        productCode,
        productName: item.productName || item.name || '',
        quantity: 0,
        qty: 0,
        qtyReturn: 0,
        returnQuantity: 0,
        returnedQty: 0,
        price,
        salePrice: price,
        unitPrice: price,
        amount: 0
      };
      current.productName = current.productName || item.productName || item.name || '';
      current.quantity += quantity;
      current.qty = current.quantity;
      current.qtyReturn = current.quantity;
      current.returnQuantity = current.quantity;
      current.returnedQty = current.quantity;
      current.price = price || current.price || 0;
      current.salePrice = current.price;
      current.unitPrice = current.price;
      current.amount += Math.round(quantity * current.price);
      merged.set(productCode, current);
    }
  }
  return Array.from(merged.values());
}

function normalizeDeliveryReturnItems(rawItems = [], salesOrder = {}) {
  const sourceItems = new Map((Array.isArray(salesOrder.items) ? salesOrder.items : []).map((item) => [
    String(item.productCode || item.code || item.productId || '').trim(),
    item
  ]));
  return (Array.isArray(rawItems) ? rawItems : [])
    .map((raw) => {
      const productCode = String(raw.productCode || raw.code || raw.productId || '').trim();
      const original = sourceItems.get(productCode) || {};
      const quantity = toNumber(raw.qtyReturn ?? raw.returnQuantity ?? raw.quantity ?? raw.qty);
      const price = toNumber(raw.price ?? raw.salePrice ?? raw.unitPrice ?? original.price ?? original.salePrice ?? original.unitPrice ?? 0);
      return {
        ...original,
        ...raw,
        productId: raw.productId || original.productId || productCode,
        productCode: productCode || original.productCode || original.code || '',
        productName: raw.productName || raw.name || original.productName || original.name || '',
        quantity,
        qty: quantity,
        qtyReturn: quantity,
        returnQuantity: quantity,
        price,
        salePrice: price,
        unitPrice: price,
        amount: Math.round(toNumber(raw.amount ?? quantity * price))
      };
    })
    .filter((item) => item.quantity > 0 && (item.productCode || item.productName));
}

function buildErpDeliveryReturnKey(order = {}) {
  return `returnOrders:${order.id || order.code || ''}`;
}

async function findErpDeliveryReturnOrders(order = {}) {
  const key = buildErpDeliveryReturnKey(order);
  const ids = [order.id, order._id, order.salesOrderId, order.orderId].map((v) => String(v || '').trim()).filter(Boolean);
  const codes = [order.code, order.orderCode, order.salesOrderCode].map((v) => String(v || '').trim()).filter(Boolean);
  const or = [{ erpDeliveryReturnKey: key }];
  if (ids.length) {
    or.push({ salesOrderId: { $in: [...new Set(ids)] } });
    or.push({ orderId: { $in: [...new Set(ids)] } });
  }
  if (codes.length) {
    or.push({ salesOrderCode: { $in: [...new Set(codes)] } });
    or.push({ orderCode: { $in: [...new Set(codes)] } });
  }
  const rows = await returnOrderRepository.findAll({ $or: or }, { limit: 50 });
  return rows.filter((row) => isActiveReturnOrder(row));
}

async function findErpDeliveryReturnOrder(order = {}) {
  const rows = await findErpDeliveryReturnOrders(order);
  // Ưu tiên phiếu chưa gộp còn hiệu lực; các bản THH cũ sinh trùng sẽ được hủy ở bước sync.
  return rows.find((row) => !['cancelled', 'canceled', 'void', 'deleted'].includes(String(row.status || '').toLowerCase()) && !(row.masterReturnOrderId || row.masterReturnOrderCode))
    || rows.find((row) => !['cancelled', 'canceled', 'void', 'deleted'].includes(String(row.status || '').toLowerCase()))
    || rows[0]
    || null;
}

async function cancelDuplicateErpReturnOrders(order = {}, keep = null, options = {}) {
  const rows = await findErpDeliveryReturnOrders(order);
  const keepId = String(keep?.id || '').trim();
  const keepCode = String(keep?.code || '').trim();
  for (const row of rows) {
    const isKeep = (keepId && String(row.id || '').trim() === keepId) || (keepCode && String(row.code || '').trim() === keepCode);
    const status = String(row.status || '').toLowerCase();
    if (isKeep || ['cancelled', 'canceled', 'void', 'deleted'].includes(status)) continue;
    // Chỉ hủy bản trùng chưa gộp. Không đụng chứng từ đã đưa vào đơn tổng/kho kiểm nhận.
    if ((row.returnMergeStatus || 'unmerged') === 'merged' || row.masterReturnOrderId || row.masterReturnOrderCode) continue;
    await returnOrderRepository.upsert({
      ...row,
      status: 'cancelled',
      cancelledAt: dateUtil.nowIso(),
      cancelReason: `Hủy phiếu trả trùng của đơn giao ${order.code || order.id || ''}`,
      updatedAt: dateUtil.nowIso()
    }, options);
  }
}

async function syncErpDeliveryReturnOrder(updatedOrder = {}, returnItems = [], options = {}) {
  const items = normalizeDeliveryReturnItems(returnItems, updatedOrder);
  const totalAmount = Math.round(items.reduce((sum, item) => sum + toNumber(item.amount), 0));
  const existing = await findErpDeliveryReturnOrder(updatedOrder);

  // Nếu người dùng xóa hết hàng trả trước khi gộp, clear trực tiếp phiếu tạm cũ.
  // Không tạo bản cancel mới và không để RO-DRAFT waiting_receive còn tiền.
  if (!items.length || totalAmount <= 0) {
    if (existing && (existing.returnMergeStatus || 'unmerged') !== 'merged' && !existing.masterReturnOrderId && !existing.masterReturnOrderCode) {
      await returnOrderRepository.upsert({
        ...existing,
        status: 'cleared',
        returnStatus: 'cleared',
        warehouseReceiveStatus: 'cleared',
        accountingStatus: 'cleared',
        clearedAt: dateUtil.nowIso(),
        cancelledAt: '',
        cancelReason: '',
        totalQuantity: 0,
        totalReturnAmount: 0,
        totalAmount: 0,
        amount: 0,
        debtReduction: 0,
        items: [],
        note: 'ERP delivery return items cleared',
        updatedAt: dateUtil.nowIso()
      }, options);
    }
    return null;
  }

  const stableReturnId = `RO-ERP-${String(updatedOrder.id || updatedOrder.code || updatedOrder.orderCode || '').replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const payload = {
    id: stableReturnId,
    erpDeliveryReturnKey: buildErpDeliveryReturnKey(updatedOrder),
    salesOrderId: updatedOrder.id || '',
    salesOrderCode: updatedOrder.code || updatedOrder.orderCode || '',
    orderId: updatedOrder.id || '',
    orderCode: updatedOrder.code || updatedOrder.orderCode || '',
    customerId: updatedOrder.customerId || '',
    customerCode: updatedOrder.customerCode || '',
    customerName: updatedOrder.customerName || '',
    date: dateUtil.toDateOnly(updatedOrder.deliveryDate || updatedOrder.date || dateUtil.todayVN()),
    documentDate: dateUtil.toDateOnly(updatedOrder.deliveryDate || updatedOrder.date || dateUtil.todayVN()),
    items,
    totalQuantity: items.reduce((sum, item) => sum + toNumber(item.quantity), 0),
    totalAmount,
    amount: totalAmount,
    debtReduction: totalAmount,
    status: 'waiting_receive',
    returnMergeStatus: 'unmerged',
    warehouseReceiveStatus: 'waiting_receive',
    source: 'returnOrders',
    refType: 'erpDeliveryReturn',
    deliveryStaffCode: updatedOrder.deliveryStaffCode || '',
    deliveryStaffName: updatedOrder.deliveryStaffName || '',
    staffCode: updatedOrder.deliveryStaffCode || '',
    staffName: updatedOrder.deliveryStaffName || '',
    routeName: updatedOrder.routeName || updatedOrder.deliveryRoute || '',
    note: updatedOrder.deliveryNote || `ERP đơn giao trả hàng ${updatedOrder.code || updatedOrder.id || ''}`
  };

  if (existing) {
    if (isReturnOrderLocked(existing)) {
      throw new Error('Phiếu trả hàng đã gộp đơn tổng/kho đang xử lý, không được sửa hàng trả từ màn giao hàng');
    }
    const result = await returnOrderService.createPendingReturnOrder({
      ...payload,
      id: existing.id,
      code: existing.code,
      createdAt: existing.createdAt || dateUtil.nowIso(),
      note: payload.note || `ERP cập nhật phiếu trả từ đơn giao ${updatedOrder.code || updatedOrder.id || ''}`
    });
    if (result.error) throw new Error(result.error);
    await cancelDuplicateErpReturnOrders(updatedOrder, result.returnOrder, options);
    return result.returnOrder;
  }

  const result = await returnOrderService.createPendingReturnOrder({
    ...payload,
    note: payload.note || `ERP tạo phiếu trả từ đơn giao ${updatedOrder.code || updatedOrder.id || ''}`
  });
  if (result.error) throw new Error(result.error);
  await cancelDuplicateErpReturnOrders(updatedOrder, result.returnOrder, options);
  return result.returnOrder;
}

module.exports = {
  findReturnOrdersForDeliveryChildren,
  buildDeliveryAmount,
  deliveryRewardAmount,
  isActiveReturnOrder,
  firstPositiveNumber,
  returnOrderTotalAmount,
  uniqueClean,
  masterChildCountForReturnFallback,
  directReturnMatchReason,
  masterReturnMatch,
  returnOrdersForSalesOrder,
  returnAmountForSalesOrder,
  directReturnOrdersForSalesOrder,
  enrichAccountingReturnRows,
  hydrateReturnOrdersForAccounting,
  isReturnOrderLocked,
  getLockedReturnOrderForSalesOrder,
  returnItemsSignature,
  hasReturnItemsChanged,
  returnItemsForSalesOrder,
  normalizeDeliveryReturnItems,
  buildErpDeliveryReturnKey,
  findErpDeliveryReturnOrders,
  findErpDeliveryReturnOrder,
  cancelDuplicateErpReturnOrders,
  syncErpDeliveryReturnOrder
};
