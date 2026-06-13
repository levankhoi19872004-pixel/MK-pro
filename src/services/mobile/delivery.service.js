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
const { beginRequest, completeRequest } = require('../requestIdempotency.service');
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
    writeMobileLogDirect,
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

  function mobileDeliveryActorPayload(mobileUser = {}) {
    const actorCode = String(mobileUser.staffCode || mobileUser.code || '').trim();
    const actorName = String(mobileUser.fullName || mobileUser.name || '').trim();
    return {
      actorDeliveryStaffCode: actorCode,
      actorStaffCode: actorCode,
      enforceDeliveryOwnership: true,
      deliveryStaffCode: actorCode,
      deliveryStaffName: actorName,
      staffCode: actorCode,
      staffName: actorName
    };
  }

  function normalizeMobileCollection(body = {}) {
    const hasSplitAmounts = body.cashAmount !== undefined
      || body.bankAmount !== undefined
      || body.rewardAmount !== undefined;
    const legacyAmount = toNumber(body.collectAmount);
    const method = String(body.collectionMethod || body.paymentMethod || 'cash').trim().toLowerCase();

    if (hasSplitAmounts) {
      return {
        supplied: true,
        cashAmount: toNumber(body.cashAmount),
        bankAmount: toNumber(body.bankAmount),
        rewardAmount: toNumber(body.rewardAmount)
      };
    }

    if (body.collectAmount !== undefined) {
      return {
        supplied: true,
        cashAmount: method === 'transfer' ? 0 : legacyAmount,
        bankAmount: method === 'transfer' ? legacyAmount : 0,
        rewardAmount: 0
      };
    }

    return { supplied: false, cashAmount: 0, bankAmount: 0, rewardAmount: 0 };
  }

  async function confirmDelivery({ body = {}, mobileUser = {} }) {
    const orderId = String(body.orderId || body.salesOrderId || body.orderCode || body.salesOrderCode || '').trim();
    const status = String(body.status || '').trim().toLowerCase();
    const collection = normalizeMobileCollection(body);
    const confirmAmountsKey = JSON.stringify({
      cashAmount: collection.cashAmount,
      bankAmount: collection.bankAmount,
      rewardAmount: collection.rewardAmount,
      debtOrderIds: body.debtOrderIds || []
    });
    const idemKey = getIdempotencyKey(body, [
      'delivery-confirm-canonical',
      mobileUser && (mobileUser.id || mobileUser.code),
      orderId,
      status,
      confirmAmountsKey
    ]);
    const cachedResult = readIdempotentResult(idemKey);
    if (cachedResult) return cachedResult;

    if (!orderId) {
      return { statusCode: 400, body: { ok: false, message: 'Thiếu mã đơn giao hàng' } };
    }
    if (!['success', 'failed'].includes(status)) {
      return { statusCode: 400, body: { ok: false, message: 'Trạng thái giao hàng không hợp lệ' } };
    }
    if ([collection.cashAmount, collection.bankAmount, collection.rewardAmount].some((value) => value < 0)) {
      return { statusCode: 400, body: { ok: false, message: 'Tiền thu không được âm' } };
    }

    const engine = new DeliveryEngine({ SalesOrder, MasterOrder, ReturnOrder, StockTransaction, ArLedger, User });
    const actor = mobileDeliveryActorPayload(mobileUser);
    const perf = createStepTimer('delivery.confirm.canonical');

    try {
      const result = await withMongoTransaction(async (session) => {
        perf('start');
        const persistentRequest = await beginRequest({
          scope: 'mobile.delivery.confirm',
          actorCode: actor.actorDeliveryStaffCode,
          requestKey: idemKey
        }, { session });
        if (persistentRequest.replay) return persistentRequest.response;
        perf('idempotency_begin');
        const current = await engine.getCanonicalOrderByKey(orderId, { session });
        perf('load_order');
        if (!current) {
          const err = new Error('Không tìm thấy đơn giao hàng');
          err.status = 404;
          throw err;
        }

        let paymentResult = null;
        let returnResult = null;

        if (status === 'success' && collection.supplied) {
          paymentResult = await engine.savePayment({
            ...body,
            ...actor,
            orderId,
            salesOrderId: current.salesOrderId,
            cashAmount: collection.cashAmount,
            bankAmount: collection.bankAmount,
            rewardAmount: collection.rewardAmount,
            date: body.date || dateUtil.todayVN()
          }, { session });
          perf('save_payment');
        }

        if (status === 'failed') {
          const fullItems = buildReturnItemsFromRequest(current, [], 'full');
          returnResult = await engine.saveReturn({
            ...body,
            ...actor,
            orderId,
            salesOrderId: current.salesOrderId,
            salesOrderCode: current.salesOrderCode,
            returnType: 'full',
            items: fullItems,
            note: String(body.note || `Không giao được - trả toàn bộ đơn ${current.salesOrderCode || current.orderCode || orderId}`).trim(),
            source: 'mobile_delivery_canonical'
          }, { session });
          perf('save_full_return');
        }

        const confirmed = await engine.confirm({
          ...body,
          ...actor,
          orderId,
          salesOrderId: current.salesOrderId,
          deliveryStatus: status === 'success' ? 'delivered' : 'failed',
          status: status === 'success' ? 'delivered' : 'failed'
        }, { session });
        perf('confirm_order');

        await writeMobileLogDirect(mobileUser, 'mobile_confirm_delivery', {
          refType: 'salesOrder',
          refId: current.salesOrderId || current.orderId || orderId,
          refCode: current.salesOrderCode || current.orderCode || orderId,
          detail: {
            status,
            cashAmount: collection.cashAmount,
            bankAmount: collection.bankAmount,
            rewardAmount: collection.rewardAmount
          },
          note: `${status === 'success' ? 'Giao thành công' : 'Giao thất bại'} ${current.salesOrderCode || current.orderCode || orderId}`
        }, { session });
        perf('write_log');

        const response = {
          statusCode: 200,
          body: {
            ok: true,
            success: true,
            source: 'delivery-engine',
            message: 'Đã cập nhật trạng thái giao hàng',
            order: confirmed.order,
            allocation: paymentResult && paymentResult.allocation,
            returnOrder: returnResult && returnResult.returnOrder
          }
        };
        await completeRequest(persistentRequest.key, response, { session });
        perf('idempotency_complete');
        return response;
      });

      perf('done');
      return rememberIdempotentResult(idemKey, result);
    } catch (err) {
      const response = {
        statusCode: Number(err && err.status) || 500,
        body: {
          ok: false,
          success: false,
          code: err && err.code,
          message: (err && err.message) || 'Không cập nhật được giao hàng mobile'
        }
      };
      return rememberIdempotentResult(idemKey, response);
    }
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
    const actor = mobileDeliveryActorPayload(mobileUser || {});
    try {
      const result = await withMongoTransaction((session) => engine.saveReturn({
        ...body,
        ...actor,
        orderId: body.orderId || body.salesOrderId || body.orderCode || body.salesOrderCode,
        salesOrderId: body.salesOrderId || body.orderId,
        salesOrderCode: body.salesOrderCode || body.orderCode,
        source: 'mobile_delivery_canonical'
      }, { session }));
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


  async function listDeliveryReturns({ query = {}, mobileUser = {} }) {
    const engine = new DeliveryEngine({ SalesOrder, MasterOrder, ReturnOrder, StockTransaction, ArLedger, User });
    const actorCode = String(mobileUser.staffCode || mobileUser.code || '').trim();
    const scopedQuery = { ...(query || {}), deliveryStaffCode: actorCode };
    const result = await engine.listReturns(scopedQuery);
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
