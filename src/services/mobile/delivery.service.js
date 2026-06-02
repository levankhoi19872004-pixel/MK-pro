'use strict';

const dateUtil = require('../../utils/date.util');
const { withMongoTransaction } = require('../../utils/transaction.util');
const { createMobileDeliveryRepository } = require('../../repositories/mobile/delivery.repository');
const returnOrderService = require('../returnOrderService');
const returnOrderRepository = require('../../repositories/returnOrderRepository');
const { createStepTimer, getIdempotencyKey, readIdempotentResult, rememberIdempotentResult } = require('../../utils/mobilePerformance.util');

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

  function firstPositiveAmount(...values) {
    for (const value of values) {
      const n = toNumber(value);
      if (n > 0) return n;
    }
    return 0;
  }

  function deliveryDebtBase(order = {}) {
    // Công nợ gốc của đơn đang giao phải lấy theo giá trị đơn hàng.
    // Không ưu tiên debtBeforeCollection nếu trường đó đang bị lưu/cached = 0.
    return firstPositiveAmount(
      order.totalAmount,
      order.total,
      order.amount,
      order.grandTotal,
      order.payableAmount,
      order.orderAmount,
      order.debtBeforeCollection,
      order.debtAmount,
      order.debt
    );
  }

  function calculateDeliveryDebt(order = {}) {
    return Math.max(0, Math.round(
      deliveryDebtBase(order)
      - toNumber(order.cashCollected ?? order.cashAmount ?? 0)
      - toNumber(order.bankCollected ?? order.transferAmount ?? order.bankAmount ?? 0)
      - toNumber(order.rewardAmount ?? order.displayRewardAmount ?? 0)
      - toNumber(order.returnAmount ?? order.returnedAmount ?? 0)
    ));
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
    return toNumber(item.qtyReturn ?? item.returnQuantity ?? item.returnedQty ?? item.quantity ?? item.qty ?? 0);
  }

  function getReturnLinePrice(item = {}) {
    return toNumber(item.price ?? item.salePrice ?? item.unitPrice ?? item.finalPrice ?? item.giaBan ?? 0);
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
    order.debtBeforeCollection = deliveryDebtBase(order);
    order.debtAmount = calculateDeliveryDebt(order);
    order.debt = order.debtAmount;
    return { total, returnItems };
  }

  async function listDeliveryOrders({ query = {}, mobileUser }) {
    const data = await repo.getPrimaryDataSnapshot();
    // returnOrders là nguồn thật; luôn refresh từ Mongo trước khi build danh sách app.
    data.returnOrders = await returnOrderRepository.findAll();
    const targetDate = dateUtil.toDateOnly(query.date || dateUtil.todayVN());
    const q = normalizeText(query.q);
    const status = normalizeText(query.status);
    const includeCompleted = String(query.includeCompleted || '') === '1';
    const ledger = buildDebtLedgerRows(data);
    const debtByOrder = new Map(ledger.map((row) => [String(row.orderId), row]));

    let items = (data.salesOrders || [])
      .filter((order) => isOrderApprovedForDelivery(order))
      .filter((order) => getOrderDeliveryDate(data, order) === targetDate)
      .filter((order) => isOrderAssignedToDeliveryUser(order, getOrderDeliveryInfo(data, order), mobileUser))
      .map((order) => {
        const syncedReturn = syncOrderReturnAmountFromReturnOrders(data, order);
        const lockedReturnOrder = getLockedReturnOrderForSalesOrder(data, order);
        const row = buildDeliveryOrderRow(data, order, debtByOrder.get(String(order.id)), targetDate);
        row.returnAmount = toNumber(syncedReturn.total);
        row.returnedAmount = row.returnAmount;
        row.returnItems = syncedReturn.returnItems;
        row.deliveryReturnItems = syncedReturn.returnItems;
        row.items = mergeOrderItemsWithReturnItems(row, syncedReturn.returnItems);
        row.debtBeforeCollection = deliveryDebtBase(row);
        row.debtAmount = calculateDeliveryDebt(row);
        row.debt = row.debtAmount;
        return row;
      })
      .filter((order) => includeCompleted || isDeliveryOrderActive(order.deliveryStatus));

    if (q) {
      items = items.filter((order) => [order.code, order.customerCode, order.customerName, order.phone, order.address, order.routeName].some((value) => normalizeText(value).includes(q)));
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
      .slice(0, 100)
      .map((order) => ({
        id: order.id,
        code: order.code,
        deliveryDate: order.deliveryDate,
        deliveryStatus: order.deliveryStatus || 'pending',
        visualStatus: order.visualStatus || order.deliveryStatus || 'pending',
        routeName: order.routeName || '',
        customerName: order.customerName,
        customerCode: order.customerCode,
        phone: order.phone,
        address: order.address,
        salesmanName: order.salesmanName,
        salesmanCode: order.salesmanCode,
        deliveryStaffName: order.deliveryStaffName,
        deliveryStaffCode: order.deliveryStaffCode,
        amount: calculateDeliveryDebt(order),
        totalAmount: toNumber(order.totalAmount),
        paidAmount: toNumber(order.paidAmount),
        debtBeforeCollection: deliveryDebtBase(order),
        debtAmount: calculateDeliveryDebt(order),
        cashCollected: toNumber(order.cashCollected),
        bankCollected: toNumber(order.bankCollected),
        rewardAmount: toNumber(order.rewardAmount),
        returnAmount: toNumber(order.returnAmount),
        returnedAmount: toNumber(order.returnAmount),
        returnLocked: Boolean(lockedReturnOrder),
        returnLockMessage: lockedReturnOrder ? `Phiếu trả hàng đã gộp vào đơn tổng ${lockedReturnOrder.masterReturnOrderCode || lockedReturnOrder.masterReturnOrderId || ''}, không được sửa hàng trả.` : '',
        returnMergeStatus: lockedReturnOrder ? (lockedReturnOrder.returnMergeStatus || 'merged') : 'unmerged',
        masterReturnOrderId: lockedReturnOrder ? (lockedReturnOrder.masterReturnOrderId || '') : '',
        masterReturnOrderCode: lockedReturnOrder ? (lockedReturnOrder.masterReturnOrderCode || '') : '',
        warehouseReceiveStatus: lockedReturnOrder ? (lockedReturnOrder.warehouseReceiveStatus || '') : '',
        returnItems: Array.isArray(order.returnItems) ? order.returnItems : [],
        deliveryReturnItems: Array.isArray(order.deliveryReturnItems) ? order.deliveryReturnItems : [],
        status: order.status,
        items: order.items || []
      }));

    return {
      ok: true,
      date: targetDate,
      user: { id: mobileUser.id, code: mobileUser.code, name: mobileUser.name },
      formula: 'deliveryDate = ngày được chọn + deliveryStaff = nhân viên đang đăng nhập + deliveryStatus chưa hoàn tất/hủy',
      items
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
    const orderDueLimit = Math.max(0, deliveryDebtBase(order) - toNumber(order.returnAmount ?? order.returnedAmount ?? 0));
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
        const stableReturnId = `RO-MOBILE-${String(order.id || order.code || '').replace(/[^a-zA-Z0-9_-]/g, '')}`;
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
      order.debtBeforeCollection = deliveryDebtBase(order);
      order.debtAmount = calculateDeliveryDebt(order);
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
      order.debtBeforeCollection = deliveryDebtBase(order);
      order.debtAmount = calculateDeliveryDebt(order);
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
    const orderIdForKey = String(body.orderId || '').trim();
    const returnItemsKey = JSON.stringify((Array.isArray(body.items) ? body.items : []).map((item) => ({ productCode: item.productCode || item.code || item.productId || '', qtyReturn: item.qtyReturn ?? item.returnQuantity ?? item.quantity ?? item.qty ?? 0 })));
    const idemKey = getIdempotencyKey(body, ['delivery-return', mobileUser && (mobileUser.id || mobileUser.code), orderIdForKey, body.returnType, returnItemsKey]);
    const cachedResult = readIdempotentResult(idemKey);
    if (cachedResult) return cachedResult;
    const perf = createStepTimer('delivery.return');
    const data = await repo.getPrimaryDataSnapshot();
    perf('load_snapshot');
    const orderId = String(body.orderId || '').trim();
    const returnType = String(body.returnType || 'partial').trim() === 'full' ? 'full' : 'partial';
    const note = String(body.note || '').trim();
    const order = repo.findSalesOrder(data, orderId);
    perf('find_order');

    if (!order) return { statusCode: 404, body: { ok: false, message: 'Không tìm thấy đơn giao hàng' } };
    if (['returned', 'cancelled', 'void'].includes(String(order.status || '').toLowerCase())) {
      return { statusCode: 400, body: { ok: false, message: 'Đơn đã trả/hủy, không thể tạo thêm phiếu trả hàng' } };
    }
    const lockedReturnOrder = getLockedReturnOrderForSalesOrder(data, order);
    if (lockedReturnOrder) {
      return { statusCode: 400, body: { ok: false, message: `Phiếu trả hàng đã gộp vào đơn tổng ${lockedReturnOrder.masterReturnOrderCode || lockedReturnOrder.masterReturnOrderId || ''}, không được sửa hàng trả` } };
    }

    const items = buildReturnItemsFromRequest(order, body.items || [], returnType);

    // Cho phép app gửi danh sách SL trả = 0 để ghi đè/xóa phiếu trả tạm cũ.
    // Tiền hàng trả không lưu ở ô Thu tiền; nó lấy từ returnOrders.totalAmount/debtReduction.
    if (!items.length) {
      if (returnType === 'full') {
        return { statusCode: 400, body: { ok: false, message: 'Đơn không có hàng để trả' } };
      }
      const activeReturnOrder = getActiveReturnOrdersForSalesOrder(data, order)[0];
      const clearResult = await returnOrderService.upsertDeliveryReturnOrder({
        id: activeReturnOrder?.id || `RO-MOBILE-${String(order.id || order.code || '').replace(/[^a-zA-Z0-9_-]/g, '')}`,
        code: activeReturnOrder?.code || '',
        salesOrderId: order.id,
        salesOrderCode: order.code,
        orderId: order.id,
        orderCode: order.code,
        customerId: order.customerId || '',
        customerCode: order.customerCode || '',
        customerName: order.customerName || '',
        deliveryStaffCode: mobileUser.code || order.deliveryStaffCode || '',
        deliveryStaffName: mobileUser.name || order.deliveryStaffName || '',
        staffCode: mobileUser.code || '',
        staffName: mobileUser.name || '',
        date: dateUtil.todayVN(),
        items: [],
        note: note || 'NVGH sửa số lượng hàng trả về 0 trên app giao hàng',
        source: 'mobile_delivery',
        refType: 'mobileDeliveryReturnClear',
        returnType
      });
      if (clearResult.error) return { statusCode: clearResult.status || 400, body: { ok: false, message: clearResult.error } };
      order.returnAmount = 0;
      order.returnedAmount = 0;
      order.returnItems = [];
      order.deliveryReturnItems = [];
      order.debtBeforeCollection = deliveryDebtBase(order);
      order.debtAmount = calculateDeliveryDebt(order);
      order.debt = order.debtAmount;
      order.updatedAt = new Date().toISOString();
      await persistDeliverySnapshotSafely(data);
      const finalResult = { statusCode: 200, body: { ok: true, source: 'return-orders-main-route', message: 'Đã xóa/cập nhật hàng trả về 0', returnOrder: clearResult?.returnOrder || null, order } };
      return rememberIdempotentResult(idemKey, finalResult);
    }

    const date = dateUtil.todayVN();
    const customer = repo.findCustomer(data, order.customerId || order.customerCode) || { id: order.customerId, code: order.customerCode, name: order.customerName };

    // App giao hàng chỉ lập phiếu trả ở trạng thái chờ kho nhận.
    // Chỉ khi Đơn tổng trả hàng được kho xác nhận mới nhập tồn và giảm công nợ/doanh thu.
    const stableReturnId = `RO-MOBILE-${String(order.id || order.code || '').replace(/[^a-zA-Z0-9_-]/g, '')}`;
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
      items,
      staffCode: mobileUser.code || '',
      staffName: mobileUser.name || '',
      deliveryStaffCode: mobileUser.code || '',
      deliveryStaffName: mobileUser.name || '',
      note: note || (returnType === 'full' ? `App giao hàng trả cả đơn ${order.code}` : `App giao hàng trả một phần đơn ${order.code}`),
      source: 'mobile_delivery',
      accountingStatus: 'pending',
      accountingConfirmed: false,
      refType: returnType === 'full' ? 'mobileDeliveryFullReturn' : 'mobileDeliveryPartialReturn',
      returnType
    });

    if (result.error) return { statusCode: result.status || 400, body: { ok: false, message: result.error } };

    const returnOrder = result.returnOrder;
    order.returnAmount = toNumber(returnOrder.totalAmount || returnOrder.amount);
    order.returnedAmount = order.returnAmount;
    order.debtBeforeCollection = deliveryDebtBase(order);
    order.debtAmount = calculateDeliveryDebt(order);
    order.debt = order.debtAmount;
    if (returnType === 'partial') {
      order.deliveryStatus = 'partial_return';
      order.status = order.debtAmount <= 0 ? 'delivered' : 'partial_return';
    } else {
      order.deliveryStatus = 'returned';
      order.status = 'returned';
    }
    order.deliveryStaffName = mobileUser.name || order.deliveryStaffName || '';
    order.deliveryStaffCode = mobileUser.code || order.deliveryStaffCode || '';
    order.deliveryNote = note || order.deliveryNote || '';
    order.updatedAt = new Date().toISOString();

    writeMobileLog(data, mobileUser, 'returnOrders', {
      refType: 'returnOrder',
      refId: returnOrder.id,
      refCode: returnOrder.code,
      note: `${returnType === 'full' ? 'Trả cả đơn' : 'Trả một phần'} ${order.code}`
    });

    await persistDeliverySnapshotSafely(data);
    perf('persist_snapshot');
    const finalResult = { statusCode: 201, body: { ok: true, source: 'return-orders-main-route', message: returnType === 'full' ? 'Đã tạo phiếu trả cả đơn' : 'Đã tạo phiếu trả hàng một phần', returnOrder, order } };
    return rememberIdempotentResult(idemKey, finalResult);
  }

  async function submitCash({ body = {}, mobileUser }) {
    const idemKey = getIdempotencyKey(body, ['cash-submit', mobileUser && (mobileUser.id || mobileUser.code), body.amount]);
    const cachedResult = readIdempotentResult(idemKey);
    if (cachedResult) return cachedResult;
    const result = await withMongoTransaction(async () => {
    const perf = createStepTimer('delivery.cashSubmit');
    const data = await repo.getPrimaryDataSnapshot();
    perf('load_snapshot');
    const amount = toNumber(body.amount);
    const note = String(body.note || '').trim();

    if (amount <= 0) return { statusCode: 400, body: { ok: false, message: 'Số tiền nộp quỹ phải lớn hơn 0' } };

    const entry = {
      id: makeId('CB'),
      code: buildCashCode(data, 'in'),
      date: dateUtil.todayVN(),
      type: 'in',
      source: 'mobile_cash_submit',
      refType: 'cashSubmit',
      refId: '',
      refCode: '',
      customerId: '',
      customerCode: '',
      customerName: '',
      staffName: mobileUser.name || '',
      amount,
      note: note || `Nhân viên ${mobileUser.name || ''} nộp tiền về quỹ`,
      createdAt: new Date().toISOString()
    };

    repo.addCashbookEntry(data, entry);
    writeMobileLog(data, mobileUser, 'mobile_cash_submit', {
      refType: 'cashbook',
      refId: entry.id,
      refCode: entry.code,
      note: `Nộp quỹ ${entry.code}`
    });
    await persistDeliverySnapshotSafely(data);
    perf('persist_snapshot');
    return { statusCode: 201, body: { ok: true, source: 'mobile-delivery-route', message: 'Đã ghi nhận nộp tiền về quỹ', entry } };
    });
    return rememberIdempotentResult(idemKey, result);
  }

  return { listDeliveryOrders, confirmDelivery, createReturnFromDelivery, submitCash };
}

module.exports = { createMobileDeliveryService };
