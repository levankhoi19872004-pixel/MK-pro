'use strict';

const { withMongoTransaction } = require('../../utils/transaction.util');
const { createMobileDeliveryRepository } = require('../../repositories/mobile/delivery.repository');
const returnOrderService = require('../returnOrderService');

function createMobileDeliveryService(ctx) {
  const repo = createMobileDeliveryRepository(ctx);
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

  function deliveryDebtBase(order = {}) {
    return toNumber(order.debtBeforeCollection ?? order.totalAmount ?? order.amount ?? order.debtAmount ?? 0);
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

  function syncOrderReturnAmountFromReturnOrders(data = {}, order = {}) {
    const total = getActiveReturnOrdersForSalesOrder(data, order)
      .reduce((sum, row) => sum + toNumber(row.totalAmount ?? row.amount ?? row.debtReduction ?? 0), 0);
    order.returnAmount = total;
    order.returnedAmount = total;
    order.debtBeforeCollection = deliveryDebtBase(order);
    order.debtAmount = calculateDeliveryDebt(order);
    order.debt = order.debtAmount;
    return total;
  }

  async function listDeliveryOrders({ query = {}, mobileUser }) {
    const data = await repo.getPrimaryDataSnapshot();
    const targetDate = String(query.date || new Date().toISOString().slice(0, 10)).slice(0, 10);
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
        syncOrderReturnAmountFromReturnOrders(data, order);
        const row = buildDeliveryOrderRow(data, order, debtByOrder.get(String(order.id)), targetDate);
        row.returnAmount = toNumber(order.returnAmount || 0);
        row.returnedAmount = row.returnAmount;
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
    return withMongoTransaction(async () => {
    const data = await repo.getPrimaryDataSnapshot();
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

    if (!order) return { statusCode: 404, body: { ok: false, message: 'Không tìm thấy đơn giao hàng' } };
    syncOrderReturnAmountFromReturnOrders(data, order);
    if (!['success', 'failed'].includes(status)) return { statusCode: 400, body: { ok: false, message: 'Trạng thái giao hàng không hợp lệ' } };
    if (collectAmount < 0 || cashAmount < 0 || bankAmount < 0 || rewardAmount < 0) return { statusCode: 400, body: { ok: false, message: 'Tiền thu không được âm' } };
    const currentDebt = calculateDeliveryDebt(order);
    if (status === 'success' && collectAmount > currentDebt) return { statusCode: 400, body: { ok: false, message: 'Tiền thu không được lớn hơn công nợ còn lại của đơn' } };

    order.deliveryStatus = status === 'success' ? 'delivered' : 'failed';
    order.deliveryStaffName = mobileUser.name || '';
    order.deliveryStaffCode = mobileUser.code || '';
    order.deliveryNote = note;
    order.deliveredAt = new Date().toISOString();
    if (status === 'success') order.status = 'delivered';
    if (status === 'failed') order.status = 'delivery_failed';

    if (status === 'failed') {
      const fullItems = buildReturnItemsFromRequest(order, [], 'full');
      if (fullItems.length) {
        const date = new Date().toISOString().slice(0, 10);
        const customer = repo.findCustomer(data, order.customerId || order.customerCode) || { id: order.customerId, code: order.customerCode, name: order.customerName };
        const stableReturnId = `RO-MOBILE-${String(order.id || order.code || '').replace(/[^a-zA-Z0-9_-]/g, '')}`;
        const result = await returnOrderService.createPendingReturnOrder({
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
          source: 'mobile_delivery_return',
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
      const date = new Date().toISOString().slice(0, 10);
      const customer = repo.findCustomer(data, order.customerId || order.customerCode) || { id: order.customerId, code: order.customerCode, name: order.customerName };
      const receiptLines = hasSplitAmounts
        ? [
            { amount: cashAmount, method: 'cash', note: note || `App giao hàng thu tiền mặt đơn ${order.code}` },
            { amount: bankAmount, method: 'transfer', note: note || `App giao hàng thu chuyển khoản đơn ${order.code}` }
          ].filter(line => line.amount > 0)
        : [{ amount: legacyCollectAmount, method: collectionMethod, note: note || (collectionMethod === 'transfer' ? `App giao hàng thu chuyển khoản đơn ${order.code}` : `App giao hàng thu tiền mặt đơn ${order.code}`) }];

      for (const line of receiptLines) {
        const receipt = createReceiptDocument(data, {
          customer,
          amount: line.amount,
          date,
          method: line.method,
          staffName: mobileUser.name || '',
          note: line.note,
          refType: 'mobileDelivery',
          refId: order.id,
          refCode: order.code
        });
        auditLog(data, 'mobile_delivery_receipt', 'receipt', receipt, null, receipt, 'App giao hàng sinh phiếu thu thật', mobileUser.name || '');
      }

      order.paidAmount = toNumber(order.paidAmount) + cashAmount + bankAmount + (hasSplitAmounts ? 0 : legacyCollectAmount);
      if (hasSplitAmounts) {
        order.cashCollected = toNumber(order.cashCollected) + cashAmount;
        order.bankCollected = toNumber(order.bankCollected) + bankAmount;
        order.rewardAmount = toNumber(order.rewardAmount) + rewardAmount;
      } else if (collectionMethod === 'transfer') order.bankCollected = toNumber(order.bankCollected) + legacyCollectAmount;
      else order.cashCollected = toNumber(order.cashCollected) + legacyCollectAmount;
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

    await repo.persistPrimaryDataSnapshot(data);
    return { statusCode: 200, body: { ok: true, source: 'mobile-delivery-route', message: 'Đã cập nhật trạng thái giao hàng', order } };
    });
  }

  async function createReturnFromDelivery({ body = {}, mobileUser }) {
    const data = await repo.getPrimaryDataSnapshot();
    const orderId = String(body.orderId || '').trim();
    const returnType = String(body.returnType || 'partial').trim() === 'full' ? 'full' : 'partial';
    const note = String(body.note || '').trim();
    const order = repo.findSalesOrder(data, orderId);

    if (!order) return { statusCode: 404, body: { ok: false, message: 'Không tìm thấy đơn giao hàng' } };
    if (['returned', 'cancelled', 'void'].includes(String(order.status || '').toLowerCase())) {
      return { statusCode: 400, body: { ok: false, message: 'Đơn đã trả/hủy, không thể tạo thêm phiếu trả hàng' } };
    }

    const items = buildReturnItemsFromRequest(order, body.items || [], returnType);
    if (!items.length) return { statusCode: 400, body: { ok: false, message: returnType === 'full' ? 'Đơn không có hàng để trả' : 'Chưa chọn sản phẩm/số lượng trả' } };

    const date = new Date().toISOString().slice(0, 10);
    const customer = repo.findCustomer(data, order.customerId || order.customerCode) || { id: order.customerId, code: order.customerCode, name: order.customerName };

    // App giao hàng chỉ lập phiếu trả ở trạng thái chờ kho nhận.
    // Chỉ khi Đơn tổng trả hàng được kho xác nhận mới nhập tồn và giảm công nợ/doanh thu.
    const stableReturnId = `RO-MOBILE-${String(order.id || order.code || '').replace(/[^a-zA-Z0-9_-]/g, '')}`;
    const result = await returnOrderService.createPendingReturnOrder({
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
      source: 'mobile_delivery_return',
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

    writeMobileLog(data, mobileUser, 'mobile_delivery_return', {
      refType: 'returnOrder',
      refId: returnOrder.id,
      refCode: returnOrder.code,
      note: `${returnType === 'full' ? 'Trả cả đơn' : 'Trả một phần'} ${order.code}`
    });

    await repo.persistPrimaryDataSnapshot(data);
    return { statusCode: 201, body: { ok: true, source: 'return-orders-main-route', message: returnType === 'full' ? 'Đã tạo phiếu trả cả đơn' : 'Đã tạo phiếu trả hàng một phần', returnOrder, order } };
  }

  async function submitCash({ body = {}, mobileUser }) {
    return withMongoTransaction(async () => {
    const data = await repo.getPrimaryDataSnapshot();
    const amount = toNumber(body.amount);
    const note = String(body.note || '').trim();

    if (amount <= 0) return { statusCode: 400, body: { ok: false, message: 'Số tiền nộp quỹ phải lớn hơn 0' } };

    const entry = {
      id: makeId('CB'),
      code: buildCashCode(data, 'in'),
      date: new Date().toISOString().slice(0, 10),
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
    await repo.persistPrimaryDataSnapshot(data);
    return { statusCode: 201, body: { ok: true, source: 'mobile-delivery-route', message: 'Đã ghi nhận nộp tiền về quỹ', entry } };
    });
  }

  return { listDeliveryOrders, confirmDelivery, createReturnFromDelivery, submitCash };
}

module.exports = { createMobileDeliveryService };
