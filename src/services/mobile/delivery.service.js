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
const deliveryReconciliationService = require('../deliveryReconciliation.service');
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

  function activeLedgerBalanceByOrder(rows = []) {
    const balances = new Map();
    for (const row of Array.isArray(rows) ? rows : []) {
      const delta = toNumber(row.debit) - toNumber(row.credit);
      const keys = [row.orderId, row.salesOrderId, row.orderCode, row.salesOrderCode, row.refId, row.refCode]
        .map((value) => String(value || '').trim())
        .filter(Boolean);
      for (const key of keys) balances.set(key, toNumber(balances.get(key)) + delta);
    }
    return balances;
  }

  function masterOrderLookup(rows = []) {
    const map = new Map();
    for (const row of Array.isArray(rows) ? rows : []) {
      [row.id, row._id, row.code]
        .map((value) => String(value || '').trim())
        .filter(Boolean)
        .forEach((key) => map.set(key, row));
    }
    return map;
  }

  function scopedDeliveryRow(order = {}, masterMap = new Map(), debtByOrder = new Map()) {
    const masterKey = String(order.masterOrderId || order.masterOrderCode || '').trim();
    const master = masterMap.get(masterKey) || {};
    const orderKeys = [order.id, order._id, order.code, order.orderCode, order.salesOrderCode]
      .map((value) => String(value || '').trim())
      .filter(Boolean);
    const ledgerBalance = orderKeys.reduce((value, key) => debtByOrder.has(key) ? debtByOrder.get(key) : value, null);
    const fallbackDebt = toNumber(order.debtAmount ?? order.debt ?? order.arBalance ?? order.totalAmount);
    const debtAmount = ledgerBalance == null ? fallbackDebt : Math.max(0, Math.round(ledgerBalance));
    const deliveryStatus = String(order.deliveryStatus || order.status || 'pending').trim().toLowerCase();

    return {
      ...order,
      deliveryDate: order.deliveryDate || master.deliveryDate || order.orderDate || order.date || '',
      deliveryStaffCode: order.deliveryStaffCode || master.deliveryStaffCode || '',
      deliveryStaffName: order.deliveryStaffName || master.deliveryStaffName || '',
      routeName: order.routeName || master.routeName || '',
      masterOrderId: order.masterOrderId || master.id || '',
      masterOrderCode: order.masterOrderCode || master.code || '',
      arBalance: debtAmount,
      debtAmount,
      debt: debtAmount,
      deliveryStatus,
      visualStatus: deliveryStatus,
      isLate: false
    };
  }

  async function listDeliveryOrders({ query = {}, mobileUser }) {
    const totalStartedAt = Date.now();
    const targetDate = dateUtil.toDateOnly(query.date || dateUtil.todayVN());
    const q = normalizeText(query.q);
    const status = normalizeText(query.status);
    const includeCompleted = ['1', 'true'].includes(String(query.includeCompleted || '').toLowerCase());
    const actorCode = String(
      mobileUser.deliveryStaffCode || mobileUser.staffCode || mobileUser.code || ''
    ).trim();

    if (!actorCode) {
      return {
        ok: true,
        success: true,
        message: 'Chưa xác định được mã NVGH mobile',
        data: { items: [], orders: [], rows: [], total: 0, date: targetDate },
        compatibilityRoute: '/api/mobile/delivery/orders',
        canonicalRoute: '/api/delivery/orders',
        date: targetDate,
        user: {},
        items: [],
        orders: [],
        rows: [],
        total: 0,
        perf: { totalMs: Date.now() - totalStartedAt, rows: 0 }
      };
    }

    const masterStartedAt = Date.now();
    const masterOrders = await repo.findAssignedMasterOrders({
      deliveryDate: targetDate,
      deliveryStaffCode: actorCode,
      limit: 300
    });
    const masterQueryMs = Date.now() - masterStartedAt;

    const ordersStartedAt = Date.now();
    const sourceOrders = await repo.findDeliveryOrders({
      deliveryDate: targetDate,
      deliveryStaffCode: actorCode,
      masterOrders,
      includeCompleted,
      limit: 300
    });
    const orderQueryMs = Date.now() - ordersStartedAt;

    const relatedStartedAt = Date.now();
    const [returnOrders, arLedgers] = await Promise.all([
      findReturnOrdersForOrders(sourceOrders),
      repo.findArLedgersForOrders(sourceOrders)
    ]);
    const relatedQueryMs = Date.now() - relatedStartedAt;

    const data = { salesOrders: sourceOrders, masterOrders, returnOrders, arLedgers };
    const masterMap = masterOrderLookup(masterOrders);
    const debtByOrder = activeLedgerBalanceByOrder(arLedgers);

    let items = sourceOrders
      .map((order) => scopedDeliveryRow(order, masterMap, debtByOrder))
      .filter((order) => order.deliveryDate === targetDate)
      .filter((order) => order.deliveryStaffCode === actorCode)
      .map((order) => {
        const syncedReturn = syncOrderReturnAmountFromReturnOrders(data, order);
        const lockedReturnOrder = getLockedReturnOrderForSalesOrder(data, order);
        const row = {
          ...order,
          returnAmount: toNumber(syncedReturn.total),
          returnedAmount: toNumber(syncedReturn.total),
          returnItems: syncedReturn.returnItems,
          deliveryReturnItems: syncedReturn.returnItems,
          items: mergeOrderItemsWithReturnItems(order, syncedReturn.returnItems),
          returnLocked: Boolean(lockedReturnOrder),
          returnLockMessage: lockedReturnOrder
            ? `Phiếu trả hàng đã gộp vào đơn tổng ${lockedReturnOrder.masterReturnOrderCode || lockedReturnOrder.masterReturnOrderId || ''}, không được sửa hàng trả.`
            : '',
          returnMergeStatus: lockedReturnOrder ? (lockedReturnOrder.returnMergeStatus || 'merged') : 'unmerged',
          masterReturnOrderId: lockedReturnOrder ? (lockedReturnOrder.masterReturnOrderId || '') : '',
          masterReturnOrderCode: lockedReturnOrder ? (lockedReturnOrder.masterReturnOrderCode || '') : '',
          warehouseReceiveStatus: lockedReturnOrder ? (lockedReturnOrder.warehouseReceiveStatus || '') : ''
        };
        row.debtBeforeCollection = deliveryFinance.deliveryDebtBase(row);
        return deliveryFinance.buildCanonicalDeliveryOrder(row, {
          returnItems: syncedReturn.returnItems,
          returnAmountOverride: syncedReturn.total
        });
      });

    const deliveryStaffKeyword = normalizeText(
      query.deliveryStaffCode || query.deliveryStaffName || query.deliveryStaff || query.nvgh || query.deliveryStaffKeyword
    );
    const salesStaffKeyword = normalizeText(
      query.salesStaffCode || query.salesStaffName || query.salesStaff || query.nvbh || query.salesStaffKeyword
    );

    if (deliveryStaffKeyword) {
      items = items.filter((order) => [order.deliveryStaffCode, order.deliveryStaffName]
        .some((value) => normalizeText(value).includes(deliveryStaffKeyword)));
    }
    if (salesStaffKeyword) {
      items = items.filter((order) => [order.salesStaffCode, order.salesStaffName]
        .some((value) => normalizeText(value).includes(salesStaffKeyword)));
    }
    if (q) {
      items = items.filter((order) => [
        order.code, order.orderCode, order.salesOrderCode, order.customerCode,
        order.customerName, order.phone, order.address, order.routeName
      ].some((value) => normalizeText(value).includes(q)));
    }
    if (status) {
      items = items.filter((order) => {
        if (status === 'unpaid') return toNumber(order.debtAmount) > 0;
        if (status === 'late') return order.isLate;
        return normalizeText(order.deliveryStatus) === status || normalizeText(order.visualStatus) === status;
      });
    }

    items = items
      .sort((a, b) => String(a.routeName).localeCompare(String(b.routeName)) || String(a.createdAt).localeCompare(String(b.createdAt)))
      .slice(0, 100);

    return {
      ok: true,
      success: true,
      message: 'Đã tải đơn giao hàng mobile',
      data: { items, orders: items, rows: items, total: items.length, date: targetDate },
      compatibilityRoute: '/api/mobile/delivery/orders',
      canonicalRoute: '/api/delivery/orders',
      date: targetDate,
      user: { id: mobileUser.id, code: actorCode, name: mobileUser.name || mobileUser.fullName || '' },
      formula: 'deliveryDate = ngày được chọn + deliveryStaffCode = nhân viên đang đăng nhập',
      items,
      orders: items,
      rows: items,
      total: items.length,
      perf: {
        masterQueryMs,
        orderQueryMs,
        relatedQueryMs,
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
      return { statusCode: 400, body: { ok: false, success: false, message: 'Thiếu mã đơn giao hàng', error: 'MOBILE_DELIVERY_MISSING_ORDER' } };
    }
    if (!['success', 'failed'].includes(status)) {
      return { statusCode: 400, body: { ok: false, success: false, message: 'Trạng thái giao hàng không hợp lệ', error: 'MOBILE_DELIVERY_INVALID_STATUS' } };
    }
    if ([collection.cashAmount, collection.bankAmount, collection.rewardAmount].some((value) => value < 0)) {
      return { statusCode: 400, body: { ok: false, success: false, message: 'Tiền thu không được âm', error: 'MOBILE_DELIVERY_NEGATIVE_AMOUNT' } };
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
            compatibilityRoute: '/api/mobile/delivery/confirm',
            canonicalRoute: '/api/delivery/confirm',
            message: 'Đã cập nhật trạng thái giao hàng',
            data: {
              order: confirmed.order,
              allocation: paymentResult && paymentResult.allocation,
              returnOrder: returnResult && returnResult.returnOrder
            },
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
          message: (err && err.message) || 'Không cập nhật được giao hàng mobile',
          error: (err && err.code) || `MOBILE_DELIVERY_${Number(err && err.status) || 500}`
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
          success: true,
          source: 'returnOrders',
          compatibilityRoute: '/api/mobile/delivery/return',
          canonicalRoute: '/api/delivery/return',
          message: result.message || 'Đã lưu hàng trả vào returnOrders',
          data: {
            returnOrder: result.returnOrder || null,
            returns: result.returns || result.returnOrders || result.rows || [],
            returnOrders: result.returnOrders || result.returns || result.rows || [],
            rows: result.rows || result.returns || result.returnOrders || [],
            order: result.order || null
          },
          returnOrder: result.returnOrder || null,
          returns: result.returns || result.returnOrders || result.rows || [],
          returnOrders: result.returnOrders || result.returns || result.rows || [],
          rows: result.rows || result.returns || result.returnOrders || [],
          order: result.order || null
        }
      };
      return rememberIdempotentResult(idemKey, response);
    } catch (err) {
      const response = {
        statusCode: err.status || 500,
        body: {
          ok: false,
          success: false,
          message: err.message || 'Không tạo được phiếu trả hàng từ app giao hàng',
          error: err.code || `MOBILE_DELIVERY_${err.status || 500}`
        }
      };
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
        success: true,
        message: 'Đã tải hàng trả mobile',
        source: 'returnOrders',
        compatibilityRoute: '/api/mobile/delivery/returns',
        canonicalRoute: '/api/delivery/returns',
        data: {
          returns: result.rows || [],
          returnOrders: result.rows || [],
          rows: result.rows || [],
          total: (result.rows || []).length,
          summary: result.summary || {}
        },
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

  async function deliveryReconciliation({ query = {}, mobileUser = {} } = {}) {
    const actorCode = String(mobileUser.staffCode || mobileUser.code || '').trim();
    const actorName = String(mobileUser.fullName || mobileUser.name || '').trim();
    const scopedQuery = {
      ...(query || {}),
      deliveryStaffCode: actorCode,
      deliveryStaffName: actorName,
      staffCode: actorCode,
      staffName: actorName,
      enforceDeliveryOwnership: true
    };
    const report = await deliveryReconciliationService.buildDeliveryReconciliationReport(scopedQuery);
    return {
      statusCode: 200,
      body: {
        ok: true,
        success: true,
        message: 'Đã tải đối soát giao hàng mobile',
        compatibilityRoute: '/api/mobile/delivery/reconciliation',
        canonicalRoute: '/api/delivery/reconciliation',
        source: 'delivery-reconciliation-report',
        data: report,
        reconciliation: report.summary,
        summary: report.summary,
        orders: report.orders,
        returns: report.returns,
        collections: report.collections,
        fundLedgers: report.fundLedgers
      }
    };
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
        error: result.error ? (result.code || 'MOBILE_DELIVERY_CASH_SUBMIT_FAILED') : undefined,
        data: result.error ? undefined : result,
        compatibilityRoute: '/api/mobile/delivery/cash/submit',
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
    submitCash,
    deliveryReconciliation
  };
}

module.exports = { createMobileDeliveryService };
