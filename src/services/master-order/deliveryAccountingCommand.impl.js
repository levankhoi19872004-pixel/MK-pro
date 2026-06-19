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
  buildSalesOrderIdInQuery,
  normalizeMasterSalesOrderRefs,
  masterChildOrderRefs,
  buildIdentityInFilter
} = require('./masterOrderIdentity.util');

const isInactiveStatus = lazyFunction('./masterOrderQuery.impl', 'isInactiveStatus');
const listMasterOrders = lazyFunction('./masterOrderQuery.impl', 'listMasterOrders');
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
const repairMissingArReturnIfNeeded = lazyFunction('./deliveryAccountingCore.impl', 'repairMissingArReturnIfNeeded');
const reverseActiveArLedgersForOrder = lazyFunction('./deliveryAccountingCore.impl', 'reverseActiveArLedgersForOrder');

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

async function confirmDeliveryAccounting(body = {}) {
  const date = dateUtil.toDateOnly(body.date || dateUtil.todayVN());
  const selectedOrderIds = Array.isArray(body.orderIds)
    ? body.orderIds.map((id) => String(id || '').trim()).filter(Boolean)
    : [];
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
  const confirmedBy = String(body.confirmedBy || body.userName || body.accountantName || 'accountant').trim();
  const now = dateUtil.nowIso();
  const masterOrders = await listMasterOrders({ excludeInactive: 1, dateFrom: date, dateTo: date });
  const targetMasters = new Map();
  const targetChildren = [];

  const childKeys = (child = {}) => [
    child.id,
    child._id,
    child.code,
    child.orderCode,
    child.documentCode
  ].map((v) => String(v || '').trim()).filter(Boolean);

  for (const master of masterOrders) {
    const children = Array.isArray(master.children) ? master.children : [];
    const matched = children.filter((child) => {
      if (isInactiveStatus(child)) return false;
      const deliveryDate = dateUtil.toDateOnly(child.deliveryDate || master.deliveryDate || child.date || master.date);
      if (deliveryDate !== date) return false;
      return childKeys(child).some((key) => selectedIdSet.has(key));
    });
    if (matched.length) {
      const masterKey = String(master.id || master.code || '').trim() || `master-${targetMasters.size}`;
      targetMasters.set(masterKey, { master, matched });
      targetChildren.push(...matched.map((child) => ({ master, child })));
    }
  }

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
  const sourceSalesOrders = selectedOrderKeys.length
    ? await orderRepository.findManyByIdentity(selectedOrderKeys)
    : [];
  const sourceSalesOrderByKey = new Map();
  for (const order of sourceSalesOrders || []) {
    for (const key of compactDeliveryOrderKeys(order)) {
      if (!sourceSalesOrderByKey.has(key)) sourceSalesOrderByKey.set(key, order);
    }
  }
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
        debugLog('DEBUG_AR_RETURN', '[AR_RETURN_DEBUG] STEP-5 already confirmed repair branch', {
          code: accountingSource.code || accountingSource.orderCode,
          alreadyConfirmed,
          requiresReAccounting
        });
        // ===== SCOPED FIX: REPAIR_MISSING_AR_RETURN_FOR_CONFIRMED_ORDER_START =====
        // Đơn đã xác nhận kế toán thì không post lại AR-SALE. Nhưng nếu returnOrders đã có
        // mà AR-RETURN còn thiếu từ bản cũ, repair đúng bút toán AR-RETURN rồi mới skip.
        const repairResult = await repairMissingArReturnIfNeeded(accountingSource, accountingReturnOrders, { session });
        debugLog('DEBUG_AR_RETURN', '[AR_RETURN_DEBUG] STEP-6 repair result', {
          code: accountingSource.code || accountingSource.orderCode,
          repairResult
        });
        if (repairResult.repaired) {
          await auditService.log('ACCOUNTING_REPAIR_AR_RETURN', {
            refType: 'SALES_ORDER',
            refId: orderKey(accountingSource),
            refCode: orderDisplayCode(accountingSource),
            user: confirmedBy,
            note: `Repair AR-RETURN thiếu cho đơn đã xác nhận ${orderDisplayCode(accountingSource)} từ returnOrders`
          });
        }
        // ===== SCOPED FIX: REPAIR_MISSING_AR_RETURN_FOR_CONFIRMED_ORDER_END =====
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

module.exports = {
  adminUnlockDeliveryAccounting,
  confirmDeliveryAccounting
};