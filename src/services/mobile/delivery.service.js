'use strict';

const deliveryFinance = require('../../utils/deliveryFinance.util');
const DeliverySettlementService = require('../../domain/settlement/DeliverySettlementService');

const dateUtil = require('../../utils/date.util');
const { withMongoTransaction } = require('../../utils/transaction.util');
const { createMobileDeliveryRepository } = require('../../repositories/mobile/delivery.repository');
const returnOrderService = require('../returnOrderService');
const returnOrderRepository = require('../../repositories/returnOrderRepository');
const { createStepTimer, getIdempotencyKey, readIdempotentResult, rememberIdempotentResult } = require('../../utils/mobilePerformance.util');
const { DeliveryEngine } = require('../../engines/delivery.engine');
const SalesOrder = require('../../models/SalesOrder');
const MasterOrder = require('../../models/MasterOrder');
const ReturnOrder = require('../../models/ReturnOrder');
const StockTransaction = require('../../models/StockTransaction');
const ArLedger = require('../../models/ArLedger');
const User = require('../../models/User');

function createMobileDeliveryService(ctx) {
  const repo = createMobileDeliveryRepository(ctx);
  async function persistDeliverySnapshotSafely(data = {}) {
    // returnOrders is managed by returnOrderService/returnOrderRepository only.
    // Never send returnOrders into primary-data snapshot persistence.
    const snapshot = data ? { ...data } : data;
    if (snapshot) delete snapshot.returnOrders;
    return (repo.persistDeliverySnapshotSafely ? repo.persistDeliverySnapshotSafely(snapshot) : repo.persistPrimaryDataSnapshot(snapshot));
  }

  const {
    normalizeText,
    toNumber,
    buildDebtLedgerRows,
    getOrderDeliveryDate,
    isOrderApprovedForDelivery,
    getOrderDeliveryInfo,
    isOrderAssignedToDeliveryUser,
    buildDeliveryOrderRow,
    isDeliveryOrderActive,
    createReceiptDocument,
    auditLog,
    writeMobileLog,
    buildReturnItemsFromRequest,
    createReturnOrderDocument,
    makeId,
    buildCashCode
  } = ctx;

  

  

  


  async function findReturnOrdersForOrders(orders = []) {
    const orderIds = [...new Set((orders || []).flatMap((order) => [order.id, order._id, order.salesOrderId, order.orderId]).map((v) => String(v || '').trim()).filter(Boolean))];
    const orderCodes = [...new Set((orders || []).flatMap((order) => [order.code, order.orderCode, order.salesOrderCode]).map((v) => String(v || '').trim()).filter(Boolean))];
    const or = [];
    if (orderIds.length) {
      or.push({ salesOrderId: { $in: orderIds } });
      or.push({ orderId: { $in: orderIds } });
      or.push({ sourceOrderId: { $in: orderIds } });
      or.push({ deliveryOrderId: { $in: orderIds } });
    }
    if (orderCodes.length) {
      or.push({ salesOrderCode: { $in: orderCodes } });
      or.push({ orderCode: { $in: orderCodes } });
      or.push({ sourceOrderCode: { $in: orderCodes } });
      or.push({ deliveryOrderCode: { $in: orderCodes } });
    }
    if (!or.length) return [];
    return returnOrderRepository.findAll({ $or: or }, {
      projection: {
        id: 1, code: 1, salesOrderId: 1, salesOrderCode: 1, orderId: 1, orderCode: 1,
        sourceOrderId: 1, sourceOrderCode: 1, deliveryOrderId: 1, deliveryOrderCode: 1,
        masterReturnOrderId: 1, masterReturnOrderCode: 1, returnMergeStatus: 1, warehouseReceiveStatus: 1,
        status: 1, items: 1, totalAmount: 1, amount: 1, debtReduction: 1
      }
    });
  }

  function getActiveReturnOrdersForSalesOrder(data = {}, order = {}) {
    const orderId = String(order.id || '').trim();
    const orderCode = String(order.code || '').trim();
    return (Array.isArray(data.returnOrders) ? data.returnOrders : []).filter((row) => {
      const status = String(row.status || '').toLowerCase();
      if (['cancelled', 'canceled', 'void', 'deleted'].includes(status)) return false;
      const rowOrderId = String(row.salesOrderId || row.orderId || '').trim();
      const rowOrderCode = String(row.salesOrderCode || row.orderCode || '').trim();
      return (orderId && rowOrderId === orderId) || (orderCode && rowOrderCode === orderCode);
    });
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

  function getLockedReturnOrderForSalesOrder(data = {}, order = {}) {
    return getActiveReturnOrdersForSalesOrder(data, order).find(isReturnOrderLocked) || null;
  }

  function normalizeReturnLineCode(item = {}) {
    return String(item.productCode || item.code || item.productId || item.sku || '').trim();
  }

  function getReturnLineQty(item = {}) {
    return toNumber(item.qtyReturn ?? item.returnQty ?? item.returnQuantity ?? item.returnedQty ?? item.quantity ?? item.qty ?? 0);
  }

  function getReturnLinePrice(item = {}) {
    // DELIVERY_LOCKED_PRICE_READ_START
    // App giao hàng chỉ đọc giá đã khóa trên đơn; không tính lại khuyến mại.
    return toNumber(item.unitPrice ?? item.price ?? item.salePrice ?? item.finalPrice ?? item.giaBan ?? 0);
    // DELIVERY_LOCKED_PRICE_READ_END
  }

  function getReturnOrderItemsForSalesOrder(data = {}, order = {}) {
    const merged = new Map();
    for (const returnOrder of getActiveReturnOrdersForSalesOrder(data, order)) {
      for (const item of (Array.isArray(returnOrder.items) ? returnOrder.items : [])) {
        const code = normalizeReturnLineCode(item);
        if (!code) continue;
        const prev = merged.get(code) || {
          productCode: code,
          productName: item.productName || item.name || '',
          qtyReturn: 0,
          returnQuantity: 0,
          returnedQty: 0,
          quantity: 0,
          price: getReturnLinePrice(item),
          salePrice: getReturnLinePrice(item),
          unitPrice: getReturnLinePrice(item),
          amount: 0
        };
        const qty = getReturnLineQty(item);
        const price = getReturnLinePrice(item) || prev.price || prev.salePrice || 0;
        prev.productName = prev.productName || item.productName || item.name || '';
        prev.qtyReturn += qty;
        prev.returnQuantity = prev.qtyReturn;
        prev.returnedQty = prev.qtyReturn;
        prev.quantity = prev.qtyReturn;
        prev.price = price;
        prev.salePrice = price;
        prev.unitPrice = price;
        prev.amount += Math.round(qty * price);
        merged.set(code, prev);
      }
    }
    return Array.from(merged.values());
  }

  function mergeOrderItemsWithReturnItems(order = {}, returnItems = []) {
    const returnByCode = new Map(returnItems.map((item) => [normalizeReturnLineCode(item), item]));
    return (Array.isArray(order.items) ? order.items : []).map((item) => {
      const code = normalizeReturnLineCode(item);
      const returned = returnByCode.get(code);
      const qtyReturn = returned ? getReturnLineQty(returned) : 0;
      const price = returned ? getReturnLinePrice(returned) : 0;
      return {
        ...item,
        qtyReturn,
        returnQuantity: qtyReturn,
        returnedQty: qtyReturn,
        returnAmount: Math.round(qtyReturn * (price || toNumber(item.price ?? item.salePrice ?? item.unitPrice ?? 0)))
      };
    });
  }

  function syncOrderReturnAmountFromReturnOrders(data = {}, order = {}) {
    const returnItems = getReturnOrderItemsForSalesOrder(data, order);
    const total = returnItems.reduce((sum, item) => sum + toNumber(item.amount ?? getReturnLineQty(item) * getReturnLinePrice(item)), 0);
    order.returnItems = returnItems;
    order.deliveryReturnItems = returnItems;
    order.returnAmount = total;
    order.returnedAmount = total;
    order.items = mergeOrderItemsWithReturnItems(order, returnItems);
    order.debtBeforeCollection = deliveryFinance.deliveryDebtBase(order);
    order.debtAmount = deliveryFinance.calculateDeliveryDebt(order);
    order.debt = order.debtAmount;
    return { total, returnItems };
  }

  async function listDeliveryOrders({ query = {}, mobileUser }) {
    const totalStartedAt = Date.now();

    const snapshotStartedAt = Date.now();
    const data = await repo.getPrimaryDataSnapshot();
    const snapshotMs = Date.now() - snapshotStartedAt;
    const targetDate = dateUtil.toDateOnly(query.date || dateUtil.todayVN());
    const q = normalizeText(query.q);
    const status = normalizeText(query.status);
    const includeCompleted = String(query.includeCompleted || '') === '1';
    const ledgerStartedAt = Date.now();
    const ledger = buildDebtLedgerRows(data);
    const ledgerMs = Date.now() - ledgerStartedAt;
    const debtByOrder = new Map(ledger.map((row) => [String(row.orderId), row]));

    const sourceOrdersStartedAt = Date.now();
    let sourceOrders = (data.salesOrders || [])
      .filter((order) => isOrderApprovedForDelivery(order))
      .filter((order) => getOrderDeliveryDate(data, order) === targetDate)
      .filter((order) => isOrderAssignedToDeliveryUser(order, getOrderDeliveryInfo(data, order), mobileUser));
    const sourceOrdersMs = Date.now() - sourceOrdersStartedAt;

    // V45 speed fix: chỉ refresh returnOrders liên quan đến các đơn app đang hiển thị.
    // Không load toàn bộ returnOrders từ Mongo.
    const returnStartedAt = Date.now();
    data.returnOrders = await findReturnOrdersForOrders(sourceOrders);
    const returnQueryMs = Date.now() - returnStartedAt;

    const buildRowsStartedAt = Date.now();
    let items = sourceOrders
      .map((order) => {
        const syncedReturn = syncOrderReturnAmountFromReturnOrders(data, order);
        const lockedReturnOrder = getLockedReturnOrderForSalesOrder(data, order);
        const row = buildDeliveryOrderRow(data, order, debtByOrder.get(String(order.id)), targetDate);
        row.returnAmount = toNumber(syncedReturn.total);
        row.returnedAmount = row.returnAmount;
        row.returnItems = syncedReturn.returnItems;
        row.deliveryReturnItems = syncedReturn.returnItems;
        row.items = mergeOrderItemsWithReturnItems(row, syncedReturn.returnItems);
        row.debtBeforeCollection = deliveryFinance.deliveryDebtBase(row);
        row.debtAmount = deliveryFinance.calculateDeliveryDebt(row);
        row.debt = row.debtAmount;
        row.returnLocked = Boolean(lockedReturnOrder);
        row.returnLockMessage = lockedReturnOrder ? `Phiếu trả hàng đã gộp vào đơn tổng ${lockedReturnOrder.masterReturnOrderCode || lockedReturnOrder.masterReturnOrderId || ''}, không được sửa hàng trả.` : '';
        row.returnMergeStatus = lockedReturnOrder ? (lockedReturnOrder.returnMergeStatus || 'merged') : 'unmerged';
        row.masterReturnOrderId = lockedReturnOrder ? (lockedReturnOrder.masterReturnOrderId || '') : '';
        row.masterReturnOrderCode = lockedReturnOrder ? (lockedReturnOrder.masterReturnOrderCode || '') : '';
        row.warehouseReceiveStatus = lockedReturnOrder ? (lockedReturnOrder.warehouseReceiveStatus || '') : '';
        return deliveryFinance.buildCanonicalDeliveryOrder(row, { returnItems: syncedReturn.returnItems, returnAmountOverride: syncedReturn.total });
      })
      .filter((order) => includeCompleted || isDeliveryOrderActive(order.deliveryStatus));
    const buildRowsMs = Date.now() - buildRowsStartedAt;

    const deliveryStaffKeyword = normalizeText(
      query.deliveryStaffCode || query.deliveryStaffName || query.deliveryStaff || query.nvgh || query.deliveryStaffKeyword
    );
    const salesStaffKeyword = normalizeText(
      query.salesStaffCode || query.salesStaffName || query.salesStaff || query.nvbh || query.salesStaffKeyword
    );

    if (deliveryStaffKeyword) {
      items = items.filter((order) => [
        order.deliveryStaffCode,
        order.deliveryStaffName,
        order.shipperCode,
        order.shipperName,
        order.staffDeliveryCode,
        order.staffDeliveryName
      ].some((value) => normalizeText(value).includes(deliveryStaffKeyword)));
    }

    if (salesStaffKeyword) {
      items = items.filter((order) => [
        order.salesStaffCode,
        order.salesStaffName,
        order.staffCode,
        order.staffName,
        order.saleCode,
        order.saleName
      ].some((value) => normalizeText(value).includes(salesStaffKeyword)));
    }

    if (q) {
      items = items.filter((order) => [
        order.code,
        order.orderCode,
        order.salesOrderCode,
        order.customerCode,
        order.customerName,
        order.phone,
        order.address,
        order.routeName
      ].some((value) => normalizeText(value).includes(q)));
    }
    if (status) {
      items = items.filter((order) => {
        if (status === 'unpaid') return toNumber(order.debtAmount) > 0;
        if (status === 'late') return order.isLate;
        return normalizeText(order.deliveryStatus) === status || normalizeText(order.visualStatus) === status;
      });
    }

    const sortStartedAt = Date.now();
    items = items
      .sort((a, b) => String(a.routeName).localeCompare(String(b.routeName)) || String(a.createdAt).localeCompare(String(b.createdAt)))
      .slice(0, 100)
      .map((order) => deliveryFinance.buildCanonicalDeliveryOrder(order, {
        returnItems: Array.isArray(order.deliveryReturnItems) ? order.deliveryReturnItems : (Array.isArray(order.returnItems) ? order.returnItems : []),
        returnAmountOverride: order.amounts && order.amounts.returnAmount != null ? order.amounts.returnAmount : order.returnAmount
      }));
    const sortMs = Date.now() - sortStartedAt;

    return {
      ok: true,
      date: targetDate,
      user: { id: mobileUser.id, code: mobileUser.code, name: mobileUser.name },
      formula: 'deliveryDate = ngày được chọn + deliveryStaff = nhân viên đang đăng nhập + deliveryStatus chưa hoàn tất/hủy',
      items,
      perf: {
        snapshotMs,
        ledgerMs,
        sourceOrdersMs,
        returnQueryMs,
        buildRowsMs,
        sortMs,
        totalMs: Date.now() - totalStartedAt,
        sourceOrders: sourceOrders.length,
        rows: items.length
      }
    };
  }

  async function confirmDelivery({ body = {}, mobileUser }) {
    const orderIdForKey = String(body.orderId || '').trim();
    const confirmAmountsKey = JSON.stringify({ cashAmount: body.cashAmount, bankAmount: body.bankAmount, rewardAmount: body.rewardAmount, collectAmount: body.collectAmount, debtOrderIds: body.debtOrderIds || [] });
    const idemKey = getIdempotencyKey(body, ['delivery-confirm', mobileUser && (mobileUser.id || mobileUser.code), orderIdForKey, body.status, confirmAmountsKey]);
    const cachedResult = readIdempotentResult(idemKey);
    if (cachedResult) return cachedResult;
    const perf = createStepTimer('delivery.confirm');
    const result = await withMongoTransaction(async () => {
    perf('start');
    const data = await repo.getPrimaryDataSnapshot();
    perf('load_snapshot');
    const orderId = String(body.orderId || '').trim();
    const status = String(body.status || '').trim();
    const hasSplitAmounts = body.cashAmount !== undefined || body.bankAmount !== undefined || body.rewardAmount !== undefined;
    const legacyCollectAmount = toNumber(body.collectAmount);
    const cashAmount = hasSplitAmounts ? toNumber(body.cashAmount) : 0;
    const bankAmount = hasSplitAmounts ? toNumber(body.bankAmount) : 0;
    const rewardAmount = hasSplitAmounts ? toNumber(body.rewardAmount) : 0;
    const collectAmount = hasSplitAmounts ? cashAmount + bankAmount + rewardAmount : legacyCollectAmount;
    const collectionMethodRaw = String(body.collectionMethod || body.paymentMethod || 'cash').trim().toLowerCase();
    const collectionMethod = ['cash', 'transfer'].includes(collectionMethodRaw) ? collectionMethodRaw : 'cash';
    const note = String(body.note || '').trim();
    const order = repo.findSalesOrder(data, orderId);
    perf('find_order');

    if (!order) return { statusCode: 404, body: { ok: false, message: 'Không tìm thấy đơn giao hàng' } };
    syncOrderReturnAmountFromReturnOrders(data, order);
    perf('sync_return_amount');
    if (!['success', 'failed'].includes(status)) return { statusCode: 400, body: { ok: false, message: 'Trạng thái giao hàng không hợp lệ' } };
    if (collectAmount < 0 || cashAmount < 0 || bankAmount < 0 || rewardAmount < 0) return { statusCode: 400, body: { ok: false, message: 'Tiền thu không được âm' } };
    const orderDueLimit = Math.max(0, deliveryFinance.deliveryDebtBase(order) - toNumber(order.returnAmount ?? order.returnedAmount ?? 0));
    if (status === 'success' && collectAmount > orderDueLimit) return { statusCode: 400, body: { ok: false, message: 'Tiền thu không được lớn hơn giá trị phải thu của đơn' } };

    order.deliveryStatus = status === 'success' ? 'delivered' : 'failed';
    order.deliveryStaffName = mobileUser.name || '';
    order.deliveryStaffCode = mobileUser.code || '';
    order.deliveryNote = note;
    order.deliveredAt = new Date().toISOString();
    if (status === 'success') order.status = 'delivered';
    if (status === 'failed') order.status = 'delivery_failed';

    if (status === 'failed') {
      const lockedReturnOrder = getLockedReturnOrderForSalesOrder(data, order);
      if (lockedReturnOrder) {
        return { statusCode: 400, body: { ok: false, message: `Phiếu trả hàng đã gộp vào đơn tổng ${lockedReturnOrder.masterReturnOrderCode || lockedReturnOrder.masterReturnOrderId || ''}, không được sửa hàng trả` } };
      }
      const fullItems = buildReturnItemsFromRequest(order, [], 'full');
      if (fullItems.length) {
        const date = dateUtil.todayVN();
        const customer = repo.findCustomer(data, order.customerId || order.customerCode) || { id: order.customerId, code: order.customerCode, name: order.customerName };
        const stableReturnId = `RO-${String(order.code || order.orderCode || order.salesOrderCode || order.id || '').replace(/^RO[-_]?/i, '').replace(/[^a-zA-Z0-9_-]/g, '')}`;
        const result = await returnOrderService.upsertDeliveryReturnOrder({
          id: stableReturnId,
          salesOrderId: order.id,
          salesOrderCode: order.code,
          orderId: order.id,
          orderCode: order.code,
          customerId: customer.id || order.customerId || '',
          customerCode: customer.code || order.customerCode || '',
          customerName: customer.name || order.customerName || '',
          date,
          items: fullItems,
          staffCode: mobileUser.code || '',
          staffName: mobileUser.name || '',
          deliveryStaffCode: mobileUser.code || '',
          deliveryStaffName: mobileUser.name || '',
          note: note || `Không giao được - trả toàn bộ đơn ${order.code}`,
          source: 'mobile_delivery',
          accountingStatus: 'pending',
          accountingConfirmed: false,
          refType: 'mobileDeliveryFullReturn',
          returnType: 'full'
        });
        if (result.error) return { statusCode: result.status || 400, body: { ok: false, message: result.error } };
        order.returnAmount = toNumber(result.returnOrder.totalAmount || result.returnOrder.amount);
        order.returnedAmount = order.returnAmount;
      }
      order.debtBeforeCollection = deliveryFinance.deliveryDebtBase(order);
      order.debtAmount = deliveryFinance.calculateDeliveryDebt(order);
      order.debt = order.debtAmount;
    }

    if (status === 'success' && collectAmount > 0) {
      // V45 chuẩn kế toán: app giao hàng chỉ lưu số tiền NVGH đã thu vào đơn giao.
      // Không sinh phiếu thu thật ở đây, vì phiếu thu/AR Ledger chỉ được tạo sau khi kế toán xác nhận.
      auditLog(data, 'mobile_delivery_collection_pending_accounting', 'order', {
        orderId: order.id,
        orderCode: order.code,
        cashAmount,
        bankAmount,
        legacyCollectAmount,
        collectionMethod
      }, null, null, 'App giao hàng lưu tiền thu tạm, chờ kế toán xác nhận', mobileUser.name || '');

      if (hasSplitAmounts) {
        // App gửi số đang hiển thị trong ô nhập là số tuyệt đối, không phải số cộng thêm.
        // Vì vậy khi sửa 200000 xuống 100000 phải ghi đè về 100000, không được cộng dồn hoặc giữ số cũ.
        order.cashCollected = cashAmount;
        order.cashAmount = cashAmount;
        order.bankCollected = bankAmount;
        order.bankAmount = bankAmount;
        order.transferAmount = bankAmount;
        order.rewardAmount = rewardAmount;
        order.displayRewardAmount = rewardAmount;
        order.paidAmount = cashAmount + bankAmount;
        order.collectedAmount = cashAmount + bankAmount;
      } else if (collectionMethod === 'transfer') {
        order.bankCollected = legacyCollectAmount;
        order.bankAmount = legacyCollectAmount;
        order.transferAmount = legacyCollectAmount;
        order.paidAmount = toNumber(order.cashCollected) + legacyCollectAmount;
        order.collectedAmount = order.paidAmount;
      } else {
        order.cashCollected = legacyCollectAmount;
        order.cashAmount = legacyCollectAmount;
        order.paidAmount = legacyCollectAmount + toNumber(order.bankCollected);
        order.collectedAmount = order.paidAmount;
      }
      order.debtBeforeCollection = deliveryFinance.deliveryDebtBase(order);
      order.debtAmount = deliveryFinance.calculateDeliveryDebt(order);
      order.debt = order.debtAmount;
    }

    writeMobileLog(data, mobileUser, 'mobile_confirm_delivery', {
      refType: 'salesOrder',
      refId: order.id,
      refCode: order.code,
      note: `${status === 'success' ? 'Giao thành công' : 'Giao thất bại'} ${order.code}`
    });

    await persistDeliverySnapshotSafely(data);
    perf('persist_snapshot');
    return { statusCode: 200, body: { ok: true, source: 'mobile-delivery-route', message: 'Đã cập nhật trạng thái giao hàng', order } };
    });
    perf('done');
    return rememberIdempotentResult(idemKey, result);
  }

  async function createReturnFromDelivery({ body = {}, mobileUser }) {
    const orderIdForKey = String(body.orderId || body.salesOrderId || body.orderCode || body.salesOrderCode || '').trim();
    const returnItemsKey = JSON.stringify((Array.isArray(body.items) ? body.items : []).map((item) => ({
      productCode: item.productCode || item.code || item.productId || '',
      returnQty: item.returnQty ?? item.qtyReturn ?? item.returnQuantity ?? item.quantity ?? item.qty ?? 0
    })));
    const idemKey = getIdempotencyKey(body, ['delivery-return-canonical', mobileUser && (mobileUser.id || mobileUser.code), orderIdForKey, body.returnType, returnItemsKey]);
    const cachedResult = readIdempotentResult(idemKey);
    if (cachedResult) return cachedResult;

    const engine = new DeliveryEngine({ SalesOrder, MasterOrder, ReturnOrder, StockTransaction, ArLedger, User });
    try {
      const result = await engine.saveReturn({
        ...body,
        orderId: body.orderId || body.salesOrderId || body.orderCode || body.salesOrderCode,
        salesOrderId: body.salesOrderId || body.orderId,
        salesOrderCode: body.salesOrderCode || body.orderCode,
        deliveryStaffCode: body.deliveryStaffCode || (mobileUser && mobileUser.code),
        deliveryStaffName: body.deliveryStaffName || (mobileUser && mobileUser.name),
        staffCode: (mobileUser && mobileUser.code) || body.staffCode,
        staffName: (mobileUser && mobileUser.name) || body.staffName,
        source: 'mobile_delivery_canonical'
      });
      const response = {
        statusCode: 200,
        body: {
          ok: true,
          source: 'returnOrders',
          message: result.message || 'Đã lưu hàng trả vào returnOrders',
          returnOrder: result.returnOrder || null,
          returns: result.returns || result.returnOrders || result.rows || [],
          returnOrders: result.returnOrders || result.returns || result.rows || [],
          rows: result.rows || result.returns || result.returnOrders || [],
          order: result.order || null
        }
      };
      return rememberIdempotentResult(idemKey, response);
    } catch (err) {
      const response = { statusCode: err.status || 500, body: { ok: false, message: err.message || 'Không tạo được phiếu trả hàng từ app giao hàng' } };
      return rememberIdempotentResult(idemKey, response);
    }
  }


  async function listDeliveryReturns({ query = {} }) {
    const engine = new DeliveryEngine({ SalesOrder, MasterOrder, ReturnOrder, StockTransaction, ArLedger, User });
    const result = await engine.listReturns(query || {});
    return {
      statusCode: 200,
      body: {
        ok: true,
        source: 'returnOrders',
        returns: result.rows || [],
        returnOrders: result.rows || [],
        rows: result.rows || [],
        total: (result.rows || []).length,
        summary: result.summary || {}
      }
    };
  }

  async function submitDeliveryPayment(args = {}) {
    const body = { ...(args.body || {}), status: (args.body && args.body.status) || 'success' };
    return confirmDelivery({ ...args, body });
  }

  async function submitCash({ body = {}, mobileUser } = {}) {
    const deliveryStaffCode = mobileUser?.staffCode || mobileUser?.code || body.deliveryStaffCode || body.staffCode;
    const deliveryStaffName = mobileUser?.fullName || mobileUser?.name || body.deliveryStaffName || body.staffName;
    const result = await DeliverySettlementService.submitCashToFund(
      body.id || body.code || body.submissionId || body.submissionCode,
      {
        ...body,
        deliveryStaffCode,
        deliveryStaffName,
        staffCode: deliveryStaffCode,
        staffName: deliveryStaffName,
        deliveryDate: body.deliveryDate || body.date || dateUtil.todayVN(),
        submittedCashAmount: body.submittedCashAmount ?? body.amount ?? body.cashAmount,
        confirmedBy: mobileUser?.code || mobileUser?.name || body.confirmedBy
      }
    );

    return {
      statusCode: result.error ? (result.status || 400) : 200,
      body: {
        ok: !result.error,
        success: !result.error,
        message: result.error || result.message || 'Đã nộp quỹ',
        ...result
      }
    };
  }

  return {
    listDeliveryOrders,
    listDeliveryReturns,
    confirmDelivery,
    createReturnFromDelivery,
    submitDeliveryPayment,
    submitCash
  };
}

module.exports = { createMobileDeliveryService };
