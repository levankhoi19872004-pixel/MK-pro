function getCollectorFromOrder(order) {
  return {
    collectedBy: order.collectedBy || order.salesName || order.staffName || order.deliveryStaffName || '',
    collectedByRole: order.collectedByRole || '',
    collectedByCode: order.collectedByCode || order.staffCode || order.deliveryStaffCode || ''
  };
}

function rebuildPaymentsFromOrders(data) {
  const payments = Array.isArray(data.payments) ? data.payments : [];
  const existed = new Set(
    payments.map(p => String(p.id || ''))
  );

  const newPayments = [...payments];

  (data.orders || []).forEach(order => {
    const cash = Number(order.cashPaid) || 0;
    const bank = Number(order.bankPaid) || 0;
    const collector = getCollectorFromOrder(order);

    if (cash > 0) {
      const id = `AUTO-CASH-${order.id}`;
      if (!existed.has(id)) {
        newPayments.push({
          id,
          orderId: order.id || '',
          customerCode: order.customerCode || '',
          customerName: order.customer || order.customerName || '',
          amount: cash,
          type: 'cash',
          method: 'Tiền mặt',
          date: order.date || new Date().toISOString().slice(0, 10),
          note: 'Tự tạo từ tiền mặt trên đơn',
          collectedBy: collector.collectedBy,
          collectedByRole: collector.collectedByRole,
          collectedByCode: collector.collectedByCode
        });
      }
    }

    if (bank > 0) {
      const id = `AUTO-BANK-${order.id}`;
      if (!existed.has(id)) {
        newPayments.push({
          id,
          orderId: order.id || '',
          customerCode: order.customerCode || '',
          customerName: order.customer || order.customerName || '',
          amount: bank,
          type: 'bank',
          method: 'Chuyển khoản',
          date: order.date || new Date().toISOString().slice(0, 10),
          note: 'Tự tạo từ chuyển khoản trên đơn',
          collectedBy: collector.collectedBy,
          collectedByRole: collector.collectedByRole,
          collectedByCode: collector.collectedByCode
        });
      }
    }
  });

  return newPayments;
}

function getCollectorFromRequest(req) {
  const user = req.user || {};

  return {
    collectedBy: user.name || '',
    collectedByRole: user.role || '',
    collectedByCode: user.staffCode || user.deliveryCode || ''
  };
}

module.exports = {
  getCollectorFromOrder,
  rebuildPaymentsFromOrders,
  getCollectorFromRequest
};
