'use strict';

const { lazyFunction } = require('./lazyDependency.util');

const deliveryFinance = require('../../utils/deliveryFinance.util');
const dateUtil = require('../../utils/date.util');
const returnOrderRepository = require('../../repositories/returnOrderRepository');
const customerRepository = require('../../repositories/customerRepository');
const postingEngine = require('../../engines/posting.engine');
const returnArPostingService = require('../accounting/returnArPostingService');
const ArPostingService = require('../../domain/posting/ArPostingService');
const paymentRepository = require('../../repositories/paymentRepository');
const { makeId, toNumber } = require('../../utils/common.util');
const { DEBT_ZERO_TOLERANCE, normalizeDebtAmount, hasOpenDebt } = require('../../constants/finance.constants');
const { debugLog } = require('../../utils/debug.util');
const {
  compactDeliveryOrderKeys,
  buildIdentityInFilter
} = require('./masterOrderIdentity.util');

const returnOrderTotalAmount = lazyFunction('./masterOrderReturn.impl', 'returnOrderTotalAmount');
const isActiveReturnOrder = lazyFunction('./masterOrderReturn.impl', 'isActiveReturnOrder');
const masterDeliveryOrderKeys = lazyFunction('./deliveryCommon.impl', 'masterDeliveryOrderKeys');

function isDeliveryCompletedStatus(status) {
  return ['delivered', 'success', 'completed', 'done'].includes(String(status || '').toLowerCase());
}

function isAccountingConfirmed(row = {}) {
  return Boolean(row.accountingConfirmed) || ['confirmed', 'locked', 'posted'].includes(String(row.accountingStatus || '').toLowerCase());
}

function orderDebtLifecycleStatus(debtAmount = 0, deliveryStatus = '', order = {}) {
  // V45: đơn giao xong vẫn chưa được đưa vào công nợ cho tới khi kế toán xác nhận.
  if (!isDeliveryCompletedStatus(deliveryStatus)) return 'not_posted';
  if (!isAccountingConfirmed(order)) return 'pending_accounting';
  return hasOpenDebt(debtAmount) ? 'ar_posted' : 'paid';
}

async function addDebtToCustomerIfNeeded(order = {}, options = {}) {
  const customerKey = order.customerCode || order.customerId || order.customerName;
  if (!customerKey) return null;
  const customer = await customerRepository.findByIdOrCode(customerKey);
  if (!customer) return null;
  const amount = Math.max(0, normalizeDebtAmount(order.debtAmount ?? order.debt ?? 0));
  // P0 debt SSoT: do not mutate Customer/SalesOrder debt cache during accounting
  // confirmation. This legacy hook is kept as a read-only compatibility snapshot;
  // official debt is calculated from arLedgers.
  return {
    customer,
    skippedCustomerDebtCacheWrite: true,
    readModelOnly: true,
    attemptedDelta: amount,
    source: 'arLedgers'
  };
}

function orderKey(order = {}) {
  return String(order.id || order._id || order.code || order.orderCode || '').trim();
}

function orderDisplayCode(order = {}) {
  return String(order.code || order.orderCode || order.id || order._id || '').trim();
}

function isAccountingReopenPending(order = {}) {
  const accountingStatus = String(order.accountingStatus || '').toLowerCase();
  return Boolean(
    order.accountingNeedsReconfirm
    || order.needReAccounting
    || order.reAccountingRequired
    || order.adminAdjustmentOpen
  ) || ['needs_repost', 'reopened', 'needs_reconfirm'].includes(accountingStatus);
}

function makeArBaseRow(order = {}, extra = {}) {
  const key = orderKey(order) || orderDisplayCode(order);
  const code = orderDisplayCode(order) || key;
  return {
    id: extra.id,
    code: extra.code || extra.id,
    date: dateUtil.toDateOnly(extra.date || order.deliveryDate || order.date || dateUtil.todayVN()),
    account: 'AR',
    type: extra.type,
    refType: extra.refType || 'MOBILE_DELIVERY_RE_ACCOUNTING',
    refId: String(extra.refId || key || '').trim(),
    refCode: String(extra.refCode || code || '').trim(),
    orderId: String(extra.orderId || key || '').trim(),
    orderCode: String(extra.orderCode || code || '').trim(),
    // Chuẩn hóa nguồn đơn gốc trên AR Ledger:
    // Công nợ luôn truy ngược được về SalesOrder đã khóa sau khi đẩy kế toán.
    salesOrderId: String(extra.salesOrderId || order.salesOrderId || order.id || key || '').trim(),
    salesOrderCode: String(extra.salesOrderCode || order.salesOrderCode || order.code || order.orderCode || code || '').trim(),
    masterOrderId: String(extra.masterOrderId || order.masterOrderId || '').trim(),
    masterOrderCode: String(extra.masterOrderCode || order.masterOrderCode || '').trim(),
    customerId: String(order.customerId || '').trim(),
    customerCode: String(order.customerCode || '').trim(),
    customerName: String(order.customerName || '').trim(),
    salesmanCode: String(order.salesmanCode || order.salesStaffCode || order.nvbhCode || '').trim(),
    salesmanName: String(order.salesmanName || order.salesStaffName || order.nvbhName || '').trim(),
    deliveryStaffCode: String(order.deliveryStaffCode || '').trim(),
    deliveryStaffName: String(order.deliveryStaffName || '').trim(),
    debit: toNumber(extra.debit),
    credit: toNumber(extra.credit),
    amount: toNumber(extra.amount ?? Math.max(toNumber(extra.debit), toNumber(extra.credit))),
    note: String(extra.note || '').trim(),
    status: extra.status || 'posted',
    source: extra.source || 'mobile_delivery_re_accounting',
    accountingConfirmed: true,
    accountingStatus: 'confirmed',
    accountingBatchId: extra.accountingBatchId || extra.batchId || '',
    reAccountingBatchId: extra.reAccountingBatchId || '',
    createdAt: dateUtil.nowIso(),
    updatedAt: dateUtil.nowIso()
  };
}

function arLedgerKeysForOrder(order = {}) {
  return [...new Set([order.id, order._id, order.code, order.orderId, order.orderCode, order.refId, order.refCode]
    .map((value) => String(value || '').trim()).filter(Boolean))];
}

async function findActiveArLedgersForOrder(order = {}, options = {}) {
  const keys = arLedgerKeysForOrder(order);
  if (!keys.length) return [];
  const rows = await paymentRepository.findAll({
    $or: [
      { orderId: { $in: keys } },
      { orderCode: { $in: keys } },
      { refId: { $in: keys } },
      { refCode: { $in: keys } }
    ]
  }, options);
  return (rows || []).filter((row) => {
    const status = String(row.status || '').toLowerCase();
    const type = String(row.type || '').toLowerCase();
    return !row.reversed
      && status !== 'reversed'
      && ['ar_sale','ar_return'].includes(type);
  });
}

async function reverseActiveArLedgersForOrder(order = {}, user = {}, options = {}) {
  const oldRows = await findActiveArLedgersForOrder(order, options);
  const reverseBatchId = `REV-${orderKey(order) || orderDisplayCode(order)}-${Date.now()}`;
  const accountingBatchId = `ACC-${orderKey(order) || orderDisplayCode(order)}-${Date.now()}`;
  const reversedRows = [];
  for (const old of oldRows) {
    const debit = toNumber(old.debit);
    const credit = toNumber(old.credit);
    const amount = Math.max(debit, credit, toNumber(old.amount));
    if (amount <= 0) continue;
    const isReturn = String(old.type||'').toLowerCase()==='ar_return';
    const reversal = {
      ...old,
      id: `${isReturn?'AR-RETURN-REV':'AR-SALE-REV'}-${old.id || old.code || makeId('AR')}-${reverseBatchId}`,
      code: `${isReturn?'AR-RETURN-REV':'AR-SALE-REV'}-${old.code || old.id || makeId('AR')}`,
      type: isReturn ? 'ar_return_reversal' : 'ar_sale_reversal',
      refType: isReturn ? 'RETURN_ORDER' : 'SALES_ORDER',
      debit: credit,
      credit: debit,
      amount,
      status: 'posted',
      source: 'admin_delivery_re_accounting',
      note: `Đảo bút toán ${old.code || old.id || ''} do admin mở khóa điều chỉnh đơn giao ${orderDisplayCode(order)}`,
      reversedFromId: old.id || '',
      reversedFromCode: old.code || '',
      accountingBatchId: reverseBatchId,
      reAccountingBatchId: reverseBatchId,
      createdBy: user.id || user.code || user.name || 'admin',
      createdAt: dateUtil.nowIso(),
      updatedAt: dateUtil.nowIso()
    };
    await paymentRepository.upsert(reversal, options);
    await paymentRepository.upsert({
      ...old,
      reversed: true,
      status: 'reversed',
      reversedAt: dateUtil.nowIso(),
      reversedBy: user.id || user.code || user.name || 'admin',
      accountingBatchId: reverseBatchId,
      reAccountingBatchId: reverseBatchId,
      updatedAt: dateUtil.nowIso()
    }, options);
    reversedRows.push(reversal);
  }
  return { reverseBatchId, accountingBatchId, reversedRows, oldRows };
}

async function postDeliveryArLedgerRowsAfterReAccounting(order = {}, accountingBatchId = '', options = {}) {
  const key = orderKey(order) || orderDisplayCode(order);
  const code = orderDisplayCode(order) || key;
  const baseAmount = Math.max(0, normalizeDebtAmount(deliveryFinance.deliveryDebtBase(order)));
  const entry = makeArBaseRow(order, {
    id: `AR-SALE-${key}-${accountingBatchId}`,
    code: `AR-SALE-${code}`,
    type: 'ar_sale',
    refType: 'SALES_ORDER',
    debit: baseAmount,
    credit: 0,
    amount: baseAmount,
    postZero: true,
    note: `Ghi nhận lại AR-SALE đơn bán ${code} sau điều chỉnh admin`,
    accountingBatchId,
    reAccountingBatchId: accountingBatchId
  });
  await paymentRepository.upsert(entry, options);
  return [entry];
}

function compactAllocations(rows = []) {
  const map = new Map();
  for (const row of rows) {
    const amount = toNumber(row.amount ?? row.allocatedAmount ?? row.paymentAmount);
    if (amount <= 0) continue;
    const orderId = String(row.orderId || row.salesOrderId || '').trim();
    const orderCode = String(row.orderCode || row.salesOrderCode || '').trim();
    const key = `${orderId}::${orderCode}`;
    const prev = map.get(key) || { orderId, orderCode, amount: 0 };
    prev.amount += amount;
    map.set(key, prev);
  }
  return [...map.values()].filter((row) => row.amount > 0);
}

async function markAccountingReturnOrdersConfirmed(returnRows = [], options = {}) {
  const rows = Array.isArray(returnRows) ? returnRows : [];
  const now = dateUtil.nowIso();
  const confirmedRows = [];

  for (const row of rows) {
    const keys = [row.id, row.code, row.returnOrderId, row.returnOrderCode]
      .map((value) => String(value || '').trim())
      .filter(Boolean);
    if (!keys.length) continue;

    const current = await returnOrderRepository.findByIdOrCode(keys[0]);
    const confirmed = {
      ...(current || {}),
      ...row,
      accountingConfirmed: true,
      accountingStatus: 'confirmed',
      accountingConfirmedAt: row.accountingConfirmedAt || now,
      updatedAt: now
    };

    await returnOrderRepository.upsert(confirmed, options);
    confirmedRows.push(confirmed.code || confirmed.id || keys[0]);
  }

  return confirmedRows;
}

async function postDeliveryCollectionsAfterAccountingConfirmed(order = {}, options = {}) {
  const key = orderKey(order);
  const code = orderDisplayCode(order);
  if (!key && !code) return null;

  const currentOrderId = key;
  const currentOrderCode = code;
  const posted = [];

  const oldDebtAllocations = Array.isArray(order.debtCollectionAllocations) ? order.debtCollectionAllocations : [];
  const buildPaymentAllocations = (method, currentAmount) => compactAllocations([
    ...(toNumber(currentAmount) > 0 ? [{ orderId: currentOrderId, orderCode: currentOrderCode, amount: currentAmount }] : []),
    ...oldDebtAllocations
      .filter((row) => String(row.method || '').toLowerCase() === method)
      .map((row) => ({ orderId: row.orderId, orderCode: row.orderCode, amount: row.amount }))
  ]);

  const paymentRows = [
    { method: 'cash', label: 'tiền mặt', amount: toNumber(order.cashCollected ?? order.cashAmount ?? 0) },
    { method: 'transfer', label: 'chuyển khoản', amount: toNumber(order.bankCollected ?? order.bankAmount ?? order.transferAmount ?? 0) }
  ];

  for (const row of paymentRows) {
    const allocations = buildPaymentAllocations(row.method, row.amount);
    const total = allocations.reduce((sum, allocation) => sum + toNumber(allocation.amount), 0);
    if (total <= 0) continue;
    const entry = await postingEngine.postReceiptAR({
      id: `MOBILE-DELIVERY-${row.method.toUpperCase()}-${key || code}`,
      code: `MOBILE-DELIVERY-${row.method.toUpperCase()}-${code || key}`,
      date: order.deliveryDate || order.date || dateUtil.todayVN(),
      customerId: order.customerId || '',
      customerCode: order.customerCode || '',
      customerName: order.customerName || '',
      amount: total,
      method: row.method,
      source: 'mobile_delivery_accounting_confirmed',
      refType: 'MOBILE_DELIVERY_ACCOUNTING',
      refId: key || code,
      refCode: code || key,
      orderId: currentOrderId,
      orderCode: currentOrderCode,
      accountingConfirmed: true,
      accountingStatus: 'confirmed',
      masterOrderId: order.masterOrderId || order.deliveryMasterId || '',
      masterOrderCode: order.masterOrderCode || order.deliveryMasterCode || '',
      deliveryStaffCode: order.deliveryStaffCode || order.deliveryCode || order.nvghCode || '',
      deliveryStaffName: order.deliveryStaffName || order.deliveryName || order.nvghName || '',
      salesmanCode: order.salesmanCode || order.salesStaffCode || order.nvbhCode || '',
      salesmanName: order.salesmanName || order.salesStaffName || order.nvbhName || '',
      allocations,
      note: `Kế toán xác nhận thu ${row.label} từ app giao hàng ${code || key}`
    }, options);
    posted.push(entry);
  }


  // MOBILE_SALES_PENDING_COLLECTION_POST_START
  // App bán hàng chỉ lưu khoản thu tạm trên salesOrders. Chỉ sau khi kế toán xác nhận
  // mới sinh AR-RECEIPT để tránh journals/cashbooks trở thành nguồn dữ liệu song song.
  const pendingSalesCollectionAmount = toNumber(order.salesCollectionAmount || 0);
  if (order.salesCollectionPendingAccounting === true && pendingSalesCollectionAmount > 0) {
    const rawMethod = String(order.salesCollectionMethod || 'cash').toLowerCase();
    const method = ['transfer', 'bank', 'bank_transfer'].includes(rawMethod) ? 'transfer' : 'cash';
    const entry = await postingEngine.postReceiptAR({
      id: `MOBILE-SALES-COLLECTION-${method.toUpperCase()}-${key || code}`,
      code: `MOBILE-SALES-COLLECTION-${method.toUpperCase()}-${code || key}`,
      date: order.orderDate || order.date || dateUtil.todayVN(),
      customerId: order.customerId || '',
      customerCode: order.customerCode || '',
      customerName: order.customerName || '',
      amount: pendingSalesCollectionAmount,
      method,
      source: 'mobile_sales_accounting_confirmed',
      refType: 'MOBILE_SALES_ACCOUNTING',
      refId: key || code,
      refCode: code || key,
      orderId: currentOrderId,
      orderCode: currentOrderCode,
      accountingConfirmed: true,
      accountingStatus: 'confirmed',
      masterOrderId: order.masterOrderId || order.deliveryMasterId || '',
      masterOrderCode: order.masterOrderCode || order.deliveryMasterCode || '',
      salesmanCode: order.salesmanCode || order.salesStaffCode || order.salesCollectionStaffCode || '',
      salesmanName: order.salesmanName || order.salesStaffName || order.salesCollectionStaffName || '',
      salesStaffCode: order.salesStaffCode || order.salesmanCode || order.salesCollectionStaffCode || '',
      salesStaffName: order.salesStaffName || order.salesmanName || order.salesCollectionStaffName || '',
      allocations: [{ orderId: currentOrderId, orderCode: currentOrderCode, amount: pendingSalesCollectionAmount }],
      note: `Kế toán xác nhận khoản thu từ app bán hàng ${code || key}`
    }, options);
    posted.push(entry);
  }
  // MOBILE_SALES_PENDING_COLLECTION_POST_END

  // ===== SCOPED FIX: POST_AR_RETURN_VIA_RETURN_AR_SERVICE_START =====
  // AR-RETURN chỉ được ghi từ chứng từ gốc returnOrders và chỉ qua returnArPostingService.
  // deliveryAccountingCore chỉ enrich ngữ cảnh định danh; amount/idempotency/duplicate guard do service quyết định.
  const hydratedReturnRows = (Array.isArray(order.accountingReturnOrders) ? order.accountingReturnOrders : [])
    .filter(isActiveReturnOrder);

  debugLog('DEBUG_AR_RETURN', '[AR_RETURN_DEBUG] STEP-9B returnOrders before service post', {
    orderCode: currentOrderCode,
    count: hydratedReturnRows.length,
    rows: hydratedReturnRows.map((ro) => ({
      id: ro.id,
      code: ro.code,
      orderId: ro.orderId || ro.salesOrderId,
      orderCode: ro.orderCode || ro.salesOrderCode,
      sourceModel: ro.sourceModel || 'returnOrders',
      accountingStatus: ro.accountingStatus
    }))
  });

  const handledReturnRows = [];
  if (hydratedReturnRows.length) {
    for (const returnRow of hydratedReturnRows) {
      const enrichedReturnOrder = {
        ...returnRow,
        sourceModel: returnRow.sourceModel || 'returnOrders',
        sourceType: returnRow.sourceType || 'returnOrder',
        date: returnRow.deliveryDate || returnRow.documentDate || returnRow.date || order.deliveryDate || order.date || dateUtil.todayVN(),
        customerId: returnRow.customerId || order.customerId || '',
        customerCode: returnRow.customerCode || order.customerCode || '',
        customerName: returnRow.customerName || order.customerName || '',
        salesOrderId: returnRow.salesOrderId || returnRow.orderId || currentOrderId,
        salesOrderCode: returnRow.salesOrderCode || returnRow.orderCode || currentOrderCode,
        orderId: returnRow.orderId || returnRow.salesOrderId || currentOrderId,
        orderCode: returnRow.orderCode || returnRow.salesOrderCode || currentOrderCode,
        accountingConfirmed: true,
        accountingStatus: 'confirmed',
        accountingBatchId: options.accountingBatchId || returnRow.accountingBatchId || order.accountingBatchId || '',
        masterOrderId: returnRow.masterOrderId || order.masterOrderId || order.deliveryMasterId || '',
        masterOrderCode: returnRow.masterOrderCode || order.masterOrderCode || order.deliveryMasterCode || '',
        deliveryStaffCode: returnRow.deliveryStaffCode || order.deliveryStaffCode || order.deliveryCode || order.nvghCode || '',
        deliveryStaffName: returnRow.deliveryStaffName || order.deliveryStaffName || order.deliveryName || order.nvghName || '',
        salesmanCode: returnRow.salesmanCode || returnRow.salesStaffCode || returnRow.nvbhCode || order.salesmanCode || order.salesStaffCode || order.nvbhCode || '',
        salesmanName: returnRow.salesmanName || returnRow.salesStaffName || returnRow.nvbhName || order.salesmanName || order.salesStaffName || order.nvbhName || '',
        note: returnRow.note || `Kế toán xác nhận hàng trả từ returnOrders ${returnRow.code || code || key}`
      };
      const result = await returnArPostingService.postReturnOrderToAR(enrichedReturnOrder, {
        ...options,
        assumeConfirmed: true,
        returnResult: true,
        skipIfExists: true,
        forceRepostReturn: options.forceRepostReturn === true
      });
      if (result && result.entry) {
        posted.push(result.entry);
        handledReturnRows.push(returnRow);
      } else if (result && result.reason && result.reason !== 'zero_return_amount') {
        debugLog('DEBUG_AR_RETURN', '[AR_RETURN_DEBUG] returnArPostingService skipped AR-RETURN', {
          orderCode: currentOrderCode,
          returnOrder: returnRow.code || returnRow.id || '',
          reason: result.reason,
          warnings: result.warnings || []
        });
      }
    }
  } else {
    const returnAmount = toNumber(
      order.returnAmountFromReturnOrders
      ?? order.syncedReturnAmountFromReturnOrders
      ?? order.returnAmount
      ?? order.returnedAmount
      ?? 0
    );
    if (returnAmount > 0) {
      // Không sinh AR-RETURN nếu không có returnOrder thật. Reconcile sẽ báo salesOrder_returnAmount_without_returnOrder.
      debugLog('DEBUG_AR_RETURN', '[AR_RETURN_DEBUG] skip AR-RETURN because returnOrders SSoT is missing', {
        orderCode: currentOrderCode,
        returnAmount
      });
    }
  }

  const arReturnHandled = handledReturnRows.length > 0;
  if (arReturnHandled) {
    const confirmedReturnCodes = await markAccountingReturnOrdersConfirmed(handledReturnRows, options);
    debugLog('DEBUG_AR_RETURN', '[AR_RETURN_DEBUG] STEP-12 mark returnOrders confirmed', {
      orderCode: currentOrderCode,
      arReturnHandled,
      returnCodes: confirmedReturnCodes
    });
  }
  // ===== SCOPED FIX: POST_AR_RETURN_VIA_RETURN_AR_SERVICE_END =====

  return posted;
}

function makeBatchArRow(order = {}, extra = {}) {
  const key = orderKey(order) || orderDisplayCode(order);
  const code = orderDisplayCode(order) || key;
  const amount = Math.max(0, toNumber(extra.amount));
  return makeArBaseRow(order, {
    id: extra.id,
    code: extra.code || extra.id,
    date: extra.date || order.deliveryDate || order.date || dateUtil.todayVN(),
    type: extra.type,
    refType: extra.refType,
    refId: key,
    refCode: code,
    orderId: key,
    orderCode: code,
    debit: toNumber(extra.debit),
    credit: toNumber(extra.credit),
    amount,
    note: extra.note,
    source: extra.source || 'delivery_batch_post',
    createdBy: extra.createdBy || '',
    accountingBatchId: extra.accountingBatchId || extra.batchId || '',
    reAccountingBatchId: extra.reAccountingBatchId || ''
  });
}

function returnAmountForOrderFromMap(returnByOrderKey = new Map(), order = {}) {
  const keys = compactDeliveryOrderKeys(order);
  const used = new Set();
  let amount = 0;
  for (const key of keys) {
    const rows = returnByOrderKey.get(key) || [];
    for (const row of rows) {
      const rowKey = String(row.id || row.code || `${key}-${row.totalAmount || row.amount || ''}`).trim();
      if (used.has(rowKey)) continue;
      used.add(rowKey);
      if (!isActiveReturnOrder(row)) continue;
      const receiveStatus = String(row.warehouseReceiveStatus || row.receiveStatus || '').toLowerCase();
      if (['cancelled', 'canceled', 'cleared', 'void', 'deleted'].includes(receiveStatus)) continue;
      amount += returnOrderTotalAmount(row);
    }
  }
  return amount;
}

async function batchPostDeliveryArLedgers(postableChildren = [], confirmedBy = 'accountant', options = {}) {
  const children = (postableChildren || []).filter(Boolean);
  if (!children.length) return { ledgerRows: [], postedOrderKeys: new Set(), skippedPostedKeys: new Set() };

  const allKeys = [...new Set(children.flatMap(compactDeliveryOrderKeys))];
  if (!allKeys.length) return { ledgerRows: [], postedOrderKeys: new Set(), skippedPostedKeys: new Set() };

  const existingLedgers = await paymentRepository.findAll({
    status: { $ne: 'reversed' },
    reversed: { $ne: true },
    type: 'ar_sale',
    $or: [
      { orderId: { $in: allKeys } },
      { orderCode: { $in: allKeys } },
      { refId: { $in: allKeys } },
      { refCode: { $in: allKeys } }
    ]
  }, options);

  const existingRowsByOrderKey = new Map();
  for (const row of existingLedgers || []) {
    const rowKeys = masterDeliveryOrderKeys(row);
    for (const key of rowKeys) {
      if (!existingRowsByOrderKey.has(key)) existingRowsByOrderKey.set(key, []);
      existingRowsByOrderKey.get(key).push(row);
    }
  }

  const ledgerRows = [];
  const reversalRows = [];
  const rowsToMarkReversed = [];
  const postedOrderKeys = new Set();
  const skippedPostedKeys = new Set();

  for (const order of children) {
    if (!isDeliveryCompletedStatus(order.deliveryStatus || order.status)) continue;
    const keys = compactDeliveryOrderKeys(order);
    const existingForOrder = [];
    const usedExistingIds = new Set();
    for (const keyItem of keys) {
      for (const oldRow of existingRowsByOrderKey.get(keyItem) || []) {
        const oldId = String(oldRow.id || oldRow.code || oldRow._id || '').trim();
        if (oldId && usedExistingIds.has(oldId)) continue;
        if (oldId) usedExistingIds.add(oldId);
        existingForOrder.push(oldRow);
      }
    }

    const key = orderKey(order) || orderDisplayCode(order);
    const code = orderDisplayCode(order) || key;
    const baseAmount = Math.max(0, normalizeDebtAmount(deliveryFinance.deliveryDebtBase(order)));
    const idSeed = key || code || makeId('AR');
    const accountingBatchId = `ACC-${idSeed}-${Date.now()}`;
    const repostSuffix = existingForOrder.length ? `-${accountingBatchId}` : '';

    if (existingForOrder.length) {
      const reverseBatchId = `AUTO-REPOST-${idSeed}-${Date.now()}`;
      for (const oldRow of existingForOrder) {
        const oldDebit = toNumber(oldRow.debit);
        const oldCredit = toNumber(oldRow.credit);
        const oldAmount = Math.max(oldDebit, oldCredit, toNumber(oldRow.amount));
        if (oldAmount <= 0) continue;
        reversalRows.push({
          ...oldRow,
          id: `AR-SALE-REV-${oldRow.id || oldRow.code || makeId('AR')}-${reverseBatchId}`,
          code: `AR-SALE-REV-${oldRow.code || oldRow.id || makeId('AR')}-${reverseBatchId}`,
          type: 'ar_sale_reversal',
          refType: 'SALES_ORDER',
          debit: oldCredit,
          credit: oldDebit,
          amount: oldAmount,
          status: 'posted',
          source: 'delivery_accounting_confirm_repost',
          note: `Đảo AR-SALE cũ ${oldRow.code || oldRow.id || ''} trước khi xác nhận kế toán lại đơn ${code || key}`,
          reversedFromId: oldRow.id || '',
          reversedFromCode: oldRow.code || '',
          accountingBatchId: reverseBatchId,
          reAccountingBatchId: reverseBatchId,
          createdBy: confirmedBy,
          createdAt: dateUtil.nowIso(),
          updatedAt: dateUtil.nowIso()
        });
        if (oldRow.id || oldRow.code) {
          rowsToMarkReversed.push({
            ...oldRow,
            reversed: true,
            status: 'reversed',
            reversedAt: dateUtil.nowIso(),
            reversedBy: confirmedBy,
            accountingBatchId: reverseBatchId,
            reAccountingBatchId: reverseBatchId,
            updatedAt: dateUtil.nowIso()
          });
        }
      }
    }

    ledgerRows.push(makeBatchArRow(order, {
      id: `AR-SALE-${idSeed}${repostSuffix}`,
      code: `AR-SALE-${code || idSeed}`,
      type: 'ar_sale',
      refType: 'SALES_ORDER',
      debit: baseAmount,
      credit: 0,
      amount: baseAmount,
      note: `Kế toán xác nhận AR-SALE đơn bán ${code || key}`,
      createdBy: confirmedBy,
      accountingBatchId
    }));

    for (const keyItem of keys) postedOrderKeys.add(keyItem);
  }

  if (reversalRows.length) {
    await ArPostingService.postBatch(reversalRows, { session: options.session });
  }

  if (rowsToMarkReversed.length) {
    await ArPostingService.markReversed(rowsToMarkReversed, { name: confirmedBy }, { session: options.session });
  }

  if (ledgerRows.length) {
    await ArPostingService.postBatch(ledgerRows, { session: options.session });
  }

  return { ledgerRows, reversalRows, postedOrderKeys, skippedPostedKeys };
}

async function postDeliveryArIfAccountingConfirmed(order = {}, options = {}) {
  if (!isDeliveryCompletedStatus(order.deliveryStatus || order.status)) return null;
  if (!isAccountingConfirmed(order)) return null;

  // AR-SALE phải là phát sinh phải thu ban đầu của đơn đã giao.
  // Tiền mặt/chuyển khoản/hàng trả/trả thưởng chỉ được ghi credit sau khi kế toán xác nhận.
  const baseAmount = Math.max(0, normalizeDebtAmount(
    order.debtBeforeCollection
    ?? order.totalAmount
    ?? order.amount
    ?? order.grandTotal
    ?? order.payableAmount
    ?? order.debtAmount
    ?? order.debt
    ?? 0
  ));

  const saleEntry = await postingEngine.postSalesOrderAR({
    ...order,
    debtBeforeCollection: baseAmount,
    debtAmount: baseAmount,
    paidAmount: 0,
    arPostedAt: order.arPostedAt || dateUtil.nowIso()
  }, { ...options, postZero: true, skipIfExists: true });

  await postDeliveryCollectionsAfterAccountingConfirmed(order, options);

  // Trả thưởng/trợ giá là khoản cấn trừ công nợ riêng.
  // Không gộp vào phiếu thu để tránh sai sổ quỹ tiền mặt/ngân hàng.
  await postingEngine.postBonusAllowanceAR(order, options);
  return saleEntry;
}

module.exports = {
  isDeliveryCompletedStatus,
  isAccountingConfirmed,
  orderDebtLifecycleStatus,
  addDebtToCustomerIfNeeded,
  orderKey,
  orderDisplayCode,
  isAccountingReopenPending,
  makeArBaseRow,
  arLedgerKeysForOrder,
  findActiveArLedgersForOrder,
  reverseActiveArLedgersForOrder,
  postDeliveryArLedgerRowsAfterReAccounting,
  compactAllocations,
  markAccountingReturnOrdersConfirmed,
  postDeliveryCollectionsAfterAccountingConfirmed,
  makeBatchArRow,
  returnAmountForOrderFromMap,
  batchPostDeliveryArLedgers,
  postDeliveryArIfAccountingConfirmed
};