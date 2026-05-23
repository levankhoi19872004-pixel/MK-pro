function rebuildMasterOrders(orders, masterOrders) {
  orders = Array.isArray(orders) ? orders : [];
  masterOrders = Array.isArray(masterOrders) ? masterOrders : [];

  return masterOrders.map(master => {
    const childOrders = orders.filter(
      o => String(o.masterId || '') === String(master.id || '')
    );

    const itemMap = {};
    let total = 0;

    childOrders.forEach(order => {
      (order.items || []).forEach(item => {
        const sku = item.sku || item.code || item.productCode || '';
        if (!sku) return;

        if (!itemMap[sku]) {
          itemMap[sku] = { ...item, qty: Number(item.qty) || 0 };
        } else {
          itemMap[sku].qty += Number(item.qty) || 0;
        }
      });

      total += Number(order.total) || 0;
    });

    return {
      ...master,
      items: Object.values(itemMap),
      total
    };
  });
}

function getOrderPaid(order) {
  return (Number(order.cashPaid) || 0) + (Number(order.bankPaid) || 0);
}

function getDebtStatus(total, paid, dueDate) {
  const debt = total - paid;

  if (debt < 0) return 'Thu thừa';
  if (debt === 0) return 'Đã thanh toán';

  if (dueDate) {
    const d = new Date(dueDate);
    if (!Number.isNaN(d.getTime())) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      d.setHours(0, 0, 0, 0);

      if (d.getTime() < today.getTime()) {
        return 'Quá hạn';
      }
    }
  }

  return 'Còn nợ';
}

function rebuildDebts(data) {
  const orders = Array.isArray(data.orders) ? data.orders : [];
  const masterOrders = Array.isArray(data.masterOrders) ? data.masterOrders : [];

  const debts = [];

  orders.forEach(order => {
    let deliveryStaff = order.deliveryStaffName || '';

    if (order.masterId) {
      const master = masterOrders.find(
        m => String(m.id) === String(order.masterId)
      );

      if (master && master.deliveryStaffName) {
        deliveryStaff = master.deliveryStaffName;
      }
    }

    const total = Number(order.total) || 0;
    const cash = Number(order.cashPaid) || 0;
    const bank = Number(order.bankPaid) || 0;
    const paid = cash + bank;
    const debt = total - paid;
    const dueDate = order.dueDate || order.paymentDueDate || '';

    debts.push({
      deliveryStaff,
      masterId: order.masterId || '',
      orderId: order.id || '',
      customerCode: order.customerCode || '',
      customerName: order.customer || order.customerName || '',
      total,
      cash,
      bank,
      paid,
      debt,
      dueDate,
      status: getDebtStatus(total, paid, dueDate),
      paymentStatus: getDebtStatus(total, paid, dueDate),
      date: order.date || ''
    });
  });

  return debts;
}

module.exports = {
  rebuildMasterOrders,
  getOrderPaid,
  getDebtStatus,
  rebuildDebts
};
