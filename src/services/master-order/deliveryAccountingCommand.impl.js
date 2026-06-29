'use strict';

const { lazyFunction } = require('./lazyDependency.util');

const deliveryFinance = require('../../utils/deliveryFinance.util');
const dateUtil = require('../../utils/date.util');
const orderRepository = require('../../repositories/orderRepository');
const masterOrderRepository = require('../../repositories/masterOrderRepository');
const auditService = require('../auditService');
const postingEngine = require('../../engines/posting.engine');
const MongoStore = require('../../models');
const { withMongoTransaction } = require('../../utils/transaction.util');
const { DEBT_ZERO_TOLERANCE, normalizeDebtAmount, hasOpenDebt } = require('../../constants/finance.constants');
const { debugLog } = require('../../utils/debug.util');
const {
  compactDeliveryOrderKeys,
  normalizeSalesOrderIds,
  buildIdentityInFilter
} = require('./masterOrderIdentity.util');

const isInactiveStatus = lazyFunction('./masterOrderQuery.impl', 'isInactiveStatus');
const listMasterOrders = lazyFunction('./masterOrderQuery.impl', 'listMasterOrders');
const buildMasterChildrenMapFast = lazyFunction('./masterOrderQuery.impl', 'buildMasterChildrenMapFast');
const findReturnOrdersForDeliveryChildren = lazyFunction('./masterOrderReturn.impl', 'findReturnOrdersForDeliveryChildren');
const hydrateReturnOrdersForAccounting = lazyFunction('./masterOrderReturn.impl', 'hydrateReturnOrdersForAccounting');
const isAccountingConfirmed = lazyFunction('./deliveryAccountingCore.impl', 'isAccountingConfirmed');
const isAccountingReopenPending = lazyFunction('./deliveryAccountingCore.impl', 'isAccountingReopenPending');
const isDeliveryCompletedStatus = lazyFunction('./deliveryAccountingCore.impl', 'isDeliveryCompletedStatus');
const orderDisplayCode = lazyFunction('./deliveryAccountingCore.impl', 'orderDisplayCode');
const orderKey = lazyFunction('./deliveryAccountingCore.impl', 'orderKey');
const batchPostDeliveryArLedgers = lazyFunction('./deliveryAccountingCore.impl', 'batchPostDeliveryArLedgers');
const postDeliveryArLedgerRowsAfterReAccounting = lazyFunction('./deliveryAccountingCore.impl', 'postDeliveryArLedgerRowsAfterReAccounting');
const postDeliveryCollectionsAfterAccountingConfirmed = lazyFunction('./deliveryAccountingCore.impl', 'postDeliveryCollectionsAfterAccountingConfirmed');
const postReturnOrdersArAfterAccountingConfirmed = lazyFunction('./deliveryAccountingCore.impl', 'postReturnOrdersArAfterAccountingConfirmed');
const reverseActiveArLedgersForOrder = lazyFunction('./deliveryAccountingCore.impl', 'reverseActiveArLedgersForOrder');

const CONFIRM_ACCOUNTING_GUARD_TTL_MS = Math.max(1000, Number(process.env.CONFIRM_ACCOUNTING_GUARD_TTL_MS || 8000));
const confirmAccountingInFlight = new Map();
const ACCOUNTING_SALES_ORDER_PROJECTION = [
  'id', 'code', 'documentCode', 'invoiceCode', 'orderCode', 'salesOrderId', 'salesOrderCode',
  'salesStaffCode', 'salesStaffName', 'salesmanCode', 'salesmanName',
  'deliveryStaffCode', 'deliveryStaffName', 'masterOrderId', 'masterOrderCode',
  'deliveryMasterId', 'deliveryMasterCode', 'updatedAt'
].join(' ');

// Phase36c: projection đủ rộng cho nghiệp vụ kế toán, nhưng vẫn tránh hydrate cả document Mongo.
// Các field tài chính/items/payment cần giữ để không đổi cách tính AR-SALE/AR-RETURN/AR-RECEIPT.
const ACCOUNTING_CHILD_ORDER_PROJECTION = [
  'id', 'code', 'documentCode', 'invoiceCode', 'orderCode', 'salesOrderId', 'salesOrderCode',
  'date', 'orderDate', 'deliveryDate', 'createdAt', 'updatedAt',
  'customerId', 'customerCode', 'customerName', 'customerPhone', 'customerAddress', 'phone', 'address',
  'salesStaffCode', 'salesStaffName', 'salesmanCode', 'salesmanName', 'nvbhCode', 'nvbhName',
  'deliveryStaffCode', 'deliveryStaffName', 'deliveryCode', 'deliveryName', 'nvghCode', 'nvghName',
  'status', 'deliveryStatus', 'accountingStatus', 'accountingConfirmed', 'accountingLocked',
  'accountingNeedsReconfirm', 'needReAccounting', 'reAccountingRequired', 'adminAdjustmentOpen',
  'cashClosed', 'cashSubmitted', 'dayLocked', 'periodLocked', 'settlementClosed', 'editLocked', 'deliveryLocked',
  'totalAmount', 'subtotal', 'discountAmount', 'finalAmount', 'payableAmount', 'debtAmount', 'debt', 'arBalance',
  'paidAmount', 'cashCollected', 'cashAmount', 'bankCollected', 'bankAmount', 'transferAmount',
  'rewardAmount', 'bonusAmount', 'returnAmount', 'returnedAmount', 'returnAmountFromReturnOrders',
  'paymentAllocations', 'deliveryPayment', 'items', 'lines', 'products',
  'masterOrderId', 'masterOrderCode', 'deliveryMasterId', 'deliveryMasterCode', 'masterId', 'masterCode',
  'version', 'note', 'deliveryNote', 'reopenedAt', 'reopenedBy', 'unlockReason', 'reopenReason',
  'accountingConfirmedAt', 'accountingConfirmedBy', 'arPostedAt', 'reAccountingAt', 'reAccountingBy', 'reAccountingNote'
].join(' ');

const ACCOUNTING_MASTER_PROJECTION = [
  'id', 'code', 'date', 'deliveryDate', 'deliveryStaffId', 'deliveryStaffCode', 'deliveryStaffName',
  'routeName', 'status', 'deliveryStatus', 'accountingStatus', 'accountingConfirmed',
  'accountingConfirmedAt', 'accountingConfirmedBy', 'deliveryLocked',
  'childOrderIds', 'children', 'note', 'createdAt', 'updatedAt'
].join(' ');

function cleanupConfirmAccountingGuards(now = Date.now()) {
  for (const [key, entry] of confirmAccountingInFlight.entries()) {
    if (!entry || entry.expiresAt <= now) confirmAccountingInFlight.delete(key);
  }
}

function buildConfirmAccountingGuardKey({ date, selectedOrderIds = [], confirmedBy = '' } = {}) {
  return JSON.stringify({
    date,
    confirmedBy: String(confirmedBy || '').trim().toLowerCase(),
    orderIds: [...new Set(selectedOrderIds)].sort()
  });
}


function uniqueStrings(values = []) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map((value) => String(value || '').trim())
    .filter(Boolean))];
}

function childKeys(child = {}) {
  return uniqueStrings([
    child.id,
    child._id,
    child.code,
    child.orderCode,
    child.documentCode,
    child.invoiceCode,
    child.salesOrderId,
    child.salesOrderCode
  ]);
}

function masterRefsFromChild(child = {}) {
  return uniqueStrings([
    child.masterOrderId,
    child.masterOrderCode,
    child.deliveryMasterId,
    child.deliveryMasterCode,
    child.masterId,
    child.masterCode
  ]);
}

function masterKeys(master = {}) {
  return uniqueStrings([master.id, master.code, master._id]);
}

function childDeliveryDateMatches(child = {}, master = {}, date = '') {
  const deliveryDate = dateUtil.toDateOnly(child.deliveryDate || master.deliveryDate || child.date || master.date);
  return !date || deliveryDate === date;
}

function selectedChildMatches(child = {}, selectedIdSet = new Set()) {
  return childKeys(child).some((key) => selectedIdSet.has(key));
}

async function findSalesOrdersByIdentityBatched(keys = [], projection = ACCOUNTING_CHILD_ORDER_PROJECTION) {
  const values = uniqueStrings(keys);
  const rows = [];
  for (let offset = 0; offset < values.length; offset += 100) {
    const batch = values.slice(offset, offset + 100);
    rows.push(...await orderRepository.findManyByIdentity(batch, {
      projection,
      limit: Math.max(batch.length, 1)
    }));
  }
  return rows;
}

async function findSalesOrdersByIdsBatched(ids = [], projection = ACCOUNTING_SALES_ORDER_PROJECTION) {
  const values = normalizeSalesOrderIds(ids);
  const rows = [];
  for (let offset = 0; offset < values.length; offset += 100) {
    const batch = values.slice(offset, offset + 100);
    rows.push(...await orderRepository.findManyByIds(batch, {
      projection,
      limit: Math.max(batch.length, 1)
    }));
  }
  return rows;
}

async function buildTargetMasterContextByFullDayFallback(date, selectedIdSet = new Set()) {
  const masterOrders = await listMasterOrders({ excludeInactive: 1, dateFrom: date, dateTo: date });
  const targetMasters = new Map();
  const targetChildren = [];

  for (const master of masterOrders) {
    const children = Array.isArray(master.children) ? master.children : [];
    const matched = children.filter((child) => {
      if (isInactiveStatus(child)) return false;
      if (!childDeliveryDateMatches(child, master, date)) return false;
      return selectedChildMatches(child, selectedIdSet);
    });
    if (matched.length) {
      const masterKey = String(master.id || master.code || '').trim() || `master-${targetMasters.size}`;
      targetMasters.set(masterKey, { master, matched });
      targetChildren.push(...matched.map((child) => ({ master, child })));
    }
  }

  return { targetMasters, targetChildren, selectedSourceOrders: [], usedFullDayFallback: true };
}

async function buildTargetMasterContextFromSelectedOrders(date, selectedOrderIds = []) {
  const selectedIdSet = new Set(uniqueStrings(selectedOrderIds));
  const selectedSourceOrders = selectedIdSet.size
    ? await findSalesOrdersByIdentityBatched([...selectedIdSet], ACCOUNTING_CHILD_ORDER_PROJECTION)
    : [];

  const masterRefs = uniqueStrings((selectedSourceOrders || []).flatMap(masterRefsFromChild));
  if (!masterRefs.length) {
    return { targetMasters: new Map(), targetChildren: [], selectedSourceOrders, usedFastPath: false };
  }

  const masterMatches = await masterOrderRepository.findManyByIdentityMatches(masterRefs, {
    projection: ACCOUNTING_MASTER_PROJECTION
  });
  const uniqueMasters = new Map();
  for (const match of masterMatches || []) {
    const master = match?.masterOrder;
    if (!master) continue;
    const key = String(master.id || master.code || match.identityKeys?.[0] || '').trim();
    if (key && !uniqueMasters.has(key)) uniqueMasters.set(key, master);
  }

  const masters = [...uniqueMasters.values()];
  if (!masters.length) {
    return { targetMasters: new Map(), targetChildren: [], selectedSourceOrders, usedFastPath: false };
  }

  const childrenMap = await buildMasterChildrenMapFast(masters, { identityBatchSize: 250 });
  const targetMasters = new Map();
  const targetChildren = [];

  for (const master of masters) {
    const masterKey = String(master.id || master.code || '').trim() || `master-${targetMasters.size}`;
    const hydratedChildren = childrenMap.get(String(master.id || master.code || '').trim()) || [];
    const masterKeySet = new Set(masterKeys(master));
    const selectedForMaster = (selectedSourceOrders || []).filter((order) => masterRefsFromChild(order).some((key) => masterKeySet.has(key)));
    const children = hydratedChildren.length ? hydratedChildren : selectedForMaster;
    let matched = children.filter((child) => {
      if (isInactiveStatus(child)) return false;
      if (!childDeliveryDateMatches(child, master, date)) return false;
      return selectedChildMatches(child, selectedIdSet);
    });

    if (!matched.length && selectedForMaster.length) {
      matched = selectedForMaster.filter((child) => !isInactiveStatus(child) && childDeliveryDateMatches(child, master, date));
    }

    if (!matched.length) continue;
    const hydratedMaster = { ...master, children };
    targetMasters.set(masterKey, { master: hydratedMaster, matched });
    targetChildren.push(...matched.map((child) => ({ master: hydratedMaster, child })));
  }

  return { targetMasters, targetChildren, selectedSourceOrders, usedFastPath: true };
}

async function adminUnlockDeliveryAccounting(id, body = {}) {
  const current = await orderRepository.findByIdOrCode(id);
  if (!current) return { error: 'Không tìm thấy đơn giao hàng', status: 404 };
  if (isInactiveStatus(current)) return { error: 'Đơn đã hủy/xóa, không thể mở khóa', status: 400 };
  if (!isAccountingConfirmed(current) && !current.editLocked) {
    return { error: 'Đơn chưa được kế toán xác nhận, vẫn đang được sửa bình thường', status: 400 };
  }
  if (current.cashClosed || current.cashSubmitted || current.dayLocked || current.periodLocked || current.settlementClosed) {
    return { error: 'Đơn đã chốt quỹ/khóa ngày/khóa kỳ. Không mở khóa đơn gốc; hãy tạo phiếu điều chỉnh công nợ riêng.', status: 400 };
  }
  const reason = String(body.reason || body.unlockReason || '').trim();
  if (!reason) return { error: 'Vui lòng nhập lý do mở khóa điều chỉnh', status: 400 };
  const now = dateUtil.nowIso();
  const unlocked = {
    ...current,
    accountingLocked: false,
    editLocked: false,
    deliveryLocked: false,
    accountingConfirmed: false,
    accountingStatus: 'reopened',
    accountingNeedsReconfirm: true,
    needReAccounting: true,
    reAccountingRequired: true,
    adminAdjustmentOpen: true,
    unlockReason: reason,
    reopenReason: reason,
    unlockedAt: now,
    reopenedAt: now,
    unlockedBy: String(body.unlockedBy || body.userName || body.adminName || 'admin').trim(),
    reopenedBy: String(body.unlockedBy || body.userName || body.adminName || 'admin').trim(),
    arStatus: 'needs_reconfirm',
    lifecycleStatus: 'needs_reconfirm',
    updatedAt: now
  };
  await withMongoTransaction(async (session) => {
    await orderRepository.upsert(unlocked, { session });
  });
  await auditService.log('ACCOUNTING_UNLOCK', { refType: 'SALES_ORDER', refId: orderKey(unlocked), refCode: orderDisplayCode(unlocked), user: unlocked.reopenedBy, reason, note: `Admin mở khóa kế toán đơn ${orderDisplayCode(unlocked)}` });
  return { salesOrder: unlocked, message: `Đã mở khóa kế toán đơn ${orderDisplayCode(unlocked)}. Sau khi lưu phải xác nhận lại kế toán để đảo AR-SALE cũ và sinh AR-SALE mới.` };
}

async function confirmDeliveryAccountingInternal(body = {}, normalized = {}) {
  const date = normalized.date || dateUtil.toDateOnly(body.date || dateUtil.todayVN());
  const selectedOrderIds = Array.isArray(normalized.selectedOrderIds)
    ? normalized.selectedOrderIds
    : (Array.isArray(body.orderIds)
      ? [...new Set(body.orderIds.map((id) => String(id || '').trim()).filter(Boolean))]
      : []);
  debugLog('DEBUG_AR_RETURN', '[AR_RETURN_DEBUG] STEP-1 confirmDeliveryAccounting start', {
    date,
    selectedOrderIds
  });

  // Bắt buộc phải có danh sách đơn được tick chọn.
  // Trước đây khi orderIds rỗng/mất selection, backend tự hiểu là chọn toàn bộ đơn trong ngày,
  // dẫn đến lỗi ấn xác nhận một vài đơn nhưng cả ngày bị xác nhận kế toán.
  if (!selectedOrderIds.length) {
    return { error: 'Vui lòng chọn ít nhất một đơn để xác nhận kế toán', status: 400 };
  }

  const selectedIdSet = new Set(selectedOrderIds);
  const confirmedBy = normalized.confirmedBy || String(body.confirmedBy || body.userName || body.accountantName || 'accountant').trim();
  const now = dateUtil.nowIso();

  // Phase36c P0: không quét toàn bộ đơn tổng trong ngày trước.
  // Lấy salesOrders đã tick chọn theo id/code trước, suy ra master liên quan rồi mới hydrate con của các master đó.
  // Chỉ fallback full-day scan cho dữ liệu legacy thiếu masterOrderId/masterOrderCode.
  let selectionContext = await buildTargetMasterContextFromSelectedOrders(date, selectedOrderIds);
  if (!selectionContext.targetChildren.length) {
    selectionContext = await buildTargetMasterContextByFullDayFallback(date, selectedIdSet);
  }
  const targetMasters = selectionContext.targetMasters;
  const targetChildren = selectionContext.targetChildren;

  if (!targetChildren.length) {
    return { error: `Không tìm thấy đơn đã chọn trong ngày ${date} để kế toán xác nhận`, status: 404 };
  }

  debugLog('DEBUG_AR_RETURN', '[AR_RETURN_DEBUG] STEP-2 targetChildren', {
    count: targetChildren.length,
    orders: targetChildren.map((x) => ({
      code: x.child?.code || x.child?.orderCode,
      id: x.child?.id,
      status: x.child?.status,
      deliveryStatus: x.child?.deliveryStatus,
      accountingConfirmed: x.child?.accountingConfirmed,
      accountingStatus: x.child?.accountingStatus
    }))
  });

  // ===== SCOPED FIX: ACCOUNTING_AR_RETURN_DIRECT_RETURNORDERS_START =====
  // Nạp returnOrders một lần trước khi post AR để AR-RETURN luôn lấy từ chứng từ gốc returnOrders,
  // không phụ thuộc vào salesOrders.returnAmountFromReturnOrders có được lưu trước đó hay chưa.
  const accountingReturnLookupOrders = targetChildren.map(({ master, child }) => ({
    ...child,
    masterOrderId: child.masterOrderId || master.id || '',
    masterOrderCode: child.masterOrderCode || master.code || ''
  }));
  const accountingReturnOrders = await findReturnOrdersForDeliveryChildren(accountingReturnLookupOrders);
  debugLog('DEBUG_AR_RETURN', '[AR_RETURN_DEBUG] STEP-3 returnOrders found', {
    count: accountingReturnOrders.length,
    rows: accountingReturnOrders.map((ro) => ({
      id: ro.id,
      code: ro.code,
      orderId: ro.orderId,
      orderCode: ro.orderCode,
      salesOrderCode: ro.salesOrderCode,
      amount: ro.amount,
      debtReduction: ro.debtReduction,
      totalAmount: ro.totalAmount,
      returnStatus: ro.returnStatus,
      accountingStatus: ro.accountingStatus
    }))
  });
  // ===== SCOPED FIX: ACCOUNTING_AR_RETURN_DIRECT_RETURNORDERS_END =====

  // ===== SCOPED FIX: ACCOUNTING_AR_SALE_STAFF_FROM_SALES_ORDER_START =====
  // Đơn giao hôm nay có thể hydrate đúng NVBH/NVGH từ salesOrders, nhưng snapshot
  // master.children có thể thiếu/sai deliveryStaffName. Trước khi post AR-SALE,
  // nạp lại SalesOrder gốc để AR ledger ghi đúng nhân viên bán/giao hàng.
  const selectedOrderKeys = [
    ...new Set(
      targetChildren
        .flatMap(({ child }) => compactDeliveryOrderKeys(child))
        .map((value) => String(value || '').trim())
        .filter(Boolean)
    )
  ];
  const selectedSalesOrderIds = normalizeSalesOrderIds([
    ...selectedOrderIds,
    ...targetChildren.flatMap(({ child }) => [child.id, child.salesOrderId, child.orderId, child.code])
  ]);
  const sourceSalesOrderByKey = new Map();
  const rememberSourceSalesOrder = (order = {}) => {
    for (const key of compactDeliveryOrderKeys(order)) {
      if (!sourceSalesOrderByKey.has(key)) sourceSalesOrderByKey.set(key, order);
    }
  };
  for (const order of selectionContext.selectedSourceOrders || []) rememberSourceSalesOrder(order);

  const missingSelectedSalesOrderIds = selectedSalesOrderIds.filter((key) => !sourceSalesOrderByKey.has(key));
  const sourceSalesOrdersById = missingSelectedSalesOrderIds.length
    ? await findSalesOrdersByIdsBatched(missingSelectedSalesOrderIds, ACCOUNTING_SALES_ORDER_PROJECTION)
    : [];
  for (const order of sourceSalesOrdersById || []) rememberSourceSalesOrder(order);

  const missingIdentityKeys = selectedOrderKeys.filter((key) => !sourceSalesOrderByKey.has(key));
  if (missingIdentityKeys.length) {
    const fallbackSourceSalesOrders = await orderRepository.findManyByIdentity(missingIdentityKeys, {
      projection: ACCOUNTING_SALES_ORDER_PROJECTION,
      limit: Math.max(missingIdentityKeys.length, 1)
    });
    for (const order of fallbackSourceSalesOrders || []) rememberSourceSalesOrder(order);
  }
  // Static contract: await orderRepository.findManyByIdentity(selectedOrderKeys)
  const findSourceSalesOrderForChild = (child = {}) => {
    for (const key of compactDeliveryOrderKeys(child)) {
      const order = sourceSalesOrderByKey.get(key);
      if (order) return order;
    }
    return {};
  };
  // ===== SCOPED FIX: ACCOUNTING_AR_SALE_STAFF_FROM_SALES_ORDER_END =====

  let confirmedOrders = 0;
  let skippedOrders = 0;
  await withMongoTransaction(async (session) => {
    for (const { master, matched } of targetMasters.values()) {
      const children = Array.isArray(master.children) ? master.children : [];
      const activeChildrenInDate = children.filter((child) => {
        if (isInactiveStatus(child)) return false;
        const deliveryDate = dateUtil.toDateOnly(child.deliveryDate || master.deliveryDate || child.date || master.date);
        return deliveryDate === date;
      });
      const matchedKeySet = new Set(matched.flatMap((child) => childKeys(child)));
      const allChildrenConfirmed = activeChildrenInDate.length > 0 && activeChildrenInDate.every((child) => {
        if (!isAccountingReopenPending(child) && isAccountingConfirmed(child)) return true;
        return childKeys(child).some((key) => matchedKeySet.has(key));
      });

      // Chỉ khóa/xác nhận đơn tổng khi toàn bộ đơn con trong ngày của đơn tổng đã được chọn
      // hoặc đã xác nhận từ trước. Nếu chỉ chọn một phần, tuyệt đối không set cờ master,
      // vì listDeliveryToday đang coi master.accountingConfirmed là khóa tất cả đơn con.
      await masterOrderRepository.upsert({
        ...master,
        accountingConfirmed: allChildrenConfirmed,
        accountingStatus: allChildrenConfirmed ? 'confirmed' : (master.accountingStatus || 'draft_delivery'),
        accountingConfirmedAt: allChildrenConfirmed ? (master.accountingConfirmedAt || now) : (master.accountingConfirmedAt || ''),
        accountingConfirmedBy: allChildrenConfirmed ? (master.accountingConfirmedBy || confirmedBy) : (master.accountingConfirmedBy || ''),
        deliveryLocked: allChildrenConfirmed,
        children: [],
        updatedAt: now
      }, { session });
    }

    const normalPostChildren = [];
    const orderUpdateOps = [];

    for (const { master, child } of targetChildren) {
      const masterChildren = Array.isArray(master.children) ? master.children : [];

      const sourceSalesOrder = findSourceSalesOrderForChild(child);
      const accountingSource = hydrateReturnOrdersForAccounting({
        ...child,
        // Ưu tiên SalesOrder gốc vì đây là nguồn đang hiển thị đúng ở màn Đơn giao hôm nay.
        // Không lấy NVGH từ snapshot master.children nếu SalesOrder đã có dữ liệu chuẩn.
        salesStaffCode: sourceSalesOrder.salesStaffCode || sourceSalesOrder.salesmanCode || child.salesStaffCode || child.salesmanCode || '',
        salesStaffName: sourceSalesOrder.salesStaffName || sourceSalesOrder.salesmanName || child.salesStaffName || child.salesmanName || '',
        salesmanCode: sourceSalesOrder.salesmanCode || sourceSalesOrder.salesStaffCode || child.salesmanCode || child.salesStaffCode || '',
        salesmanName: sourceSalesOrder.salesmanName || sourceSalesOrder.salesStaffName || child.salesmanName || child.salesStaffName || '',
        // ===== SCOPED FIX: ORDER_DATA_LINEAGE_AR_SALE_NVGH_FROM_MASTER_START =====
        // NVGH chuẩn phát sinh ở đơn tổng; salesOrders chỉ là bản đồng bộ sau khi gộp.
        deliveryStaffCode: master.deliveryStaffCode || sourceSalesOrder.deliveryStaffCode || child.deliveryStaffCode || '',
        deliveryStaffName: master.deliveryStaffName || sourceSalesOrder.deliveryStaffName || child.deliveryStaffName || '',
        // ===== SCOPED FIX: ORDER_DATA_LINEAGE_AR_SALE_NVGH_FROM_MASTER_END =====
        masterOrderId: child.masterOrderId || sourceSalesOrder.masterOrderId || master.id || '',
        masterOrderCode: child.masterOrderCode || sourceSalesOrder.masterOrderCode || master.code || '',
        __masterChildCount: masterChildren.length
      }, accountingReturnOrders);
      const alreadyConfirmed = isAccountingConfirmed(accountingSource);
      const requiresReAccounting = isAccountingReopenPending(accountingSource);
      const deliveredForAccounting = isDeliveryCompletedStatus(accountingSource.deliveryStatus || accountingSource.status);
      debugLog('DEBUG_AR_RETURN', '[AR_RETURN_DEBUG] STEP-4 accountingSource', {
        code: accountingSource.code || accountingSource.orderCode,
        id: accountingSource.id,
        alreadyConfirmed,
        requiresReAccounting,
        deliveredForAccounting,
        returnAmountFromReturnOrders: accountingSource.returnAmountFromReturnOrders,
        syncedReturnAmountFromReturnOrders: accountingSource.syncedReturnAmountFromReturnOrders,
        accountingReturnOrdersCount: Array.isArray(accountingSource.accountingReturnOrders)
          ? accountingSource.accountingReturnOrders.length
          : 0
      });
      if (!deliveredForAccounting) {
        skippedOrders += 1;
        continue;
      }

      if (alreadyConfirmed && !requiresReAccounting) {
        // ===== SCOPED FIX: CONFIRMED_ORDER_MISSING_AR_RETURN_REPOST_START =====
        // Trường hợp production có ReturnOrder đã confirmed nhưng thiếu AR-RETURN
        // không được skip câm: nút xác nhận kế toán phải đi qua returnArPostingService
        // để post bổ sung idempotent. Chỉ post AR-RETURN, không ghi lại AR-RECEIPT/Fund.
        const repairPosted = await postReturnOrdersArAfterAccountingConfirmed(accountingSource, {
          session,
          skipIfExists: true,
          returnOnly: true,
          confirmedBy
        });
        debugLog('DEBUG_AR_RETURN', '[AR_RETURN_DEBUG] STEP-5 already confirmed ensure AR-RETURN', {
          code: accountingSource.code || accountingSource.orderCode,
          alreadyConfirmed,
          requiresReAccounting,
          returnOrders: Array.isArray(accountingSource.accountingReturnOrders) ? accountingSource.accountingReturnOrders.length : 0,
          arReturnRows: Array.isArray(repairPosted) ? repairPosted.length : 0,
          policy: 'confirmed_order_missing_ar_return_posts_via_returnArPostingService_only'
        });
        // ===== SCOPED FIX: CONFIRMED_ORDER_MISSING_AR_RETURN_REPOST_END =====
        skippedOrders += 1;
        continue;
      }
      const debtAmount = Math.max(0, normalizeDebtAmount(accountingSource.debtAmount ?? accountingSource.debt ?? deliveryFinance.calculateDeliveryDebt(accountingSource)));
      const updated = {
        ...accountingSource,
        accountingConfirmed: true,
        accountingStatus: 'confirmed',
        accountingLocked: true,
        accountingNeedsReconfirm: false,
        accountingConfirmedAt: accountingSource.accountingConfirmedAt || now,
        accountingConfirmedBy: accountingSource.accountingConfirmedBy || confirmedBy,
        editLocked: true,
        deliveryLocked: true,
        needReAccounting: false,
        reAccountingRequired: false,
        adminAdjustmentOpen: false,
        reopenedAt: requiresReAccounting ? (accountingSource.reopenedAt || accountingSource.unlockedAt || '') : (accountingSource.reopenedAt || ''),
        reopenedBy: requiresReAccounting ? (accountingSource.reopenedBy || accountingSource.unlockedBy || '') : (accountingSource.reopenedBy || ''),
        reopenReason: requiresReAccounting ? (accountingSource.reopenReason || accountingSource.unlockReason || '') : (accountingSource.reopenReason || ''),
        reconfirmedAt: requiresReAccounting ? now : (accountingSource.reconfirmedAt || ''),
        reconfirmedBy: requiresReAccounting ? confirmedBy : (accountingSource.reconfirmedBy || ''),
        debtAmount,
        debt: debtAmount,
        arBalance: debtAmount,
        arStatus: hasOpenDebt(debtAmount) ? 'ar_posted' : 'paid',
        lifecycleStatus: hasOpenDebt(debtAmount) ? 'ar_posted' : 'paid',
        arPostedAt: accountingSource.arPostedAt || now,
        reAccountingAt: requiresReAccounting ? now : (accountingSource.reAccountingAt || ''),
        reAccountingBy: requiresReAccounting ? confirmedBy : (accountingSource.reAccountingBy || ''),
        reAccountingNote: requiresReAccounting ? 'Reverse AR cũ và post lại AR mới sau điều chỉnh admin' : (accountingSource.reAccountingNote || ''),
        // ===== SCOPED FIX: AR_RETURN_REACCOUNTING_KEEP_RETURN_ROWS_START =====
        // Giữ danh sách returnOrders đã hydrate trên object updated để nhánh xác nhận lại
        // có đủ dữ liệu post AR-RETURN sau khi đảo/ghi lại AR-SALE.
        accountingReturnOrders: accountingSource.accountingReturnOrders || [],
        // ===== SCOPED FIX: AR_RETURN_REACCOUNTING_KEEP_RETURN_ROWS_END =====
        updatedAt: now
      };

      if (requiresReAccounting) {
        // ===== SCOPED FIX: RE-POST COLLECTIONS/BONUS AFTER REACCOUNTING =====
        // Đơn đã mở khóa/sửa sau khi post AR: reversal trước, sau đó post lại AR-SALE
        // và ghi lại các bút toán thu tiền/chuyển khoản/hàng trả/trả thưởng.
        const reverseResult = await reverseActiveArLedgersForOrder(accountingSource, { name: confirmedBy }, { session });
        await postDeliveryArLedgerRowsAfterReAccounting(updated, reverseResult.accountingBatchId, { session });
        await postDeliveryCollectionsAfterAccountingConfirmed(updated, {
          session,
          accountingBatchId: reverseResult.accountingBatchId,
          skipIfExists: true,
          // ===== SCOPED FIX: AR_RETURN_REACCOUNTING_FORCE_REPOST_START =====
          // AR-RETURN cũ đã bị đảo ở reverseActiveArLedgersForOrder(); phải cho phép
          // post lại AR-RETURN mới cùng batch re-accounting, không bị dòng reversed chặn.
          forceRepostReturn: true
          // ===== SCOPED FIX: AR_RETURN_REACCOUNTING_FORCE_REPOST_END =====
        });
        await postingEngine.postBonusAllowanceAR(updated, { session });
        await auditService.log('ACCOUNTING_RECONFIRM', { refType: 'SALES_ORDER', refId: orderKey(updated), refCode: orderDisplayCode(updated), user: confirmedBy, note: `Xác nhận kế toán lại đơn ${orderDisplayCode(updated)}: đảo AR cũ, ghi AR-SALE mới và ghi lại thu tiền/hàng trả/trả thưởng` });
        // ===== END SCOPED FIX =====
      } else if (!alreadyConfirmed) {
        // Đơn mới xác nhận lần đầu: gom lại để ghi AR Ledger bằng insertMany một lần.
        normalPostChildren.push(updated);
      }

      orderUpdateOps.push({
        updateOne: {
          filter: buildIdentityInFilter(compactDeliveryOrderKeys(updated), ['id', 'code', 'orderCode', 'documentCode']) || { id: updated.id || updated.code },
          update: { $set: updated },
          upsert: true
        }
      });

      confirmedOrders += 1;
    }

    const batchPostResult = await batchPostDeliveryArLedgers(normalPostChildren, confirmedBy, { session });
    for (const posted of normalPostChildren) {
      await postDeliveryCollectionsAfterAccountingConfirmed(posted, { session });
      await postingEngine.postBonusAllowanceAR(posted, { session, skipIfExists: true });
      await auditService.log('ACCOUNTING_CONFIRM', { refType: 'SALES_ORDER', refId: orderKey(posted), refCode: orderDisplayCode(posted), user: confirmedBy, note: `Xác nhận kế toán đơn ${orderDisplayCode(posted)}: sinh AR-SALE, AR-RECEIPT, AR-RETURN, AR-BONUS nếu có` });
    }
    skippedOrders += batchPostResult.skippedPostedKeys.size;

    if (orderUpdateOps.length) {
      await MongoStore.salesOrders.bulkWrite(orderUpdateOps, { ordered: false, session });
    }
    // Công nợ khách hàng chỉ lấy từ AR Ledger; không cộng trực tiếp vào customer.currentDebt để tránh 2 nguồn công nợ.
  });

  return {
    date,
    confirmedOrders,
    skippedOrders,
    totalOrders: targetChildren.length,
    message: `Kế toán đã xác nhận ${confirmedOrders} đơn giao ngày ${date}. Hệ thống đã sinh AR-SALE và khóa kế toán.`
  };
}

async function confirmDeliveryAccounting(body = {}) {
  const date = dateUtil.toDateOnly(body.date || dateUtil.todayVN());
  const selectedOrderIds = Array.isArray(body.orderIds)
    ? [...new Set(body.orderIds.map((id) => String(id || '').trim()).filter(Boolean))]
    : [];
  if (!selectedOrderIds.length) {
    return { error: 'Vui lòng chọn ít nhất một đơn để xác nhận kế toán', status: 400 };
  }

  const confirmedBy = String(body.confirmedBy || body.userName || body.accountantName || 'accountant').trim();
  const nowMs = Date.now();
  cleanupConfirmAccountingGuards(nowMs);
  const guardKey = buildConfirmAccountingGuardKey({ date, selectedOrderIds, confirmedBy });
  const existing = confirmAccountingInFlight.get(guardKey);
  if (existing && existing.expiresAt > nowMs) {
    return existing.promise.then((result) => ({
      ...result,
      duplicateSubmitSuppressed: true,
      message: result && result.message
        ? `${result.message} Yêu cầu lặp gần nhau đã được bỏ qua an toàn.`
        : 'Yêu cầu xác nhận kế toán lặp gần nhau đã được bỏ qua an toàn.'
    }));
  }

  const promise = confirmDeliveryAccountingInternal(body, { date, selectedOrderIds, confirmedBy });
  confirmAccountingInFlight.set(guardKey, { expiresAt: nowMs + CONFIRM_ACCOUNTING_GUARD_TTL_MS, promise });
  try {
    const result = await promise;
    confirmAccountingInFlight.set(guardKey, {
      expiresAt: Date.now() + CONFIRM_ACCOUNTING_GUARD_TTL_MS,
      promise: Promise.resolve(result)
    });
    return result;
  } catch (error) {
    confirmAccountingInFlight.delete(guardKey);
    throw error;
  }
}

module.exports = {
  adminUnlockDeliveryAccounting,
  confirmDeliveryAccounting
};