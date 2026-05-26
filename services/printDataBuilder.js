function toNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function formatMoney(value) {
  return toNumber(value).toLocaleString('vi-VN');
}

function formatDate(value) {
  if (!value) return new Date().toLocaleDateString('vi-VN');
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value || '');
  return date.toLocaleDateString('vi-VN');
}

function normalizeItems(document) {
  const items = Array.isArray(document.items) ? document.items : [];
  return items.map((item, index) => {
    const qty = toNumber(item.qty ?? item.quantity ?? item.soLuong);
    const price = toNumber(item.price ?? item.unitPrice ?? item.salePrice ?? item.costPrice ?? item.donGia);
    const amount = toNumber(item.amount ?? item.total ?? qty * price);
    return {
      stt: index + 1,
      code: item.code || item.productCode || item.maHang || '',
      name: item.name || item.productName || item.tenHang || '',
      unit: item.unit || item.dvt || '',
      qty,
      price,
      amount,
      note: item.note || ''
    };
  });
}

function buildPrintData(document = {}, options = {}) {
  const items = normalizeItems(document);
  const totalQty = toNumber(document.totalQuantity || items.reduce((sum, item) => sum + item.qty, 0));
  const totalAmount = toNumber(document.totalAmount || items.reduce((sum, item) => sum + item.amount, 0));
  const paid = toNumber(document.paidAmount ?? document.paid ?? document.collectedAmount);
  const discount = toNumber(document.discount);
  const debt = toNumber(document.debtAmount ?? document.debt ?? Math.max(totalAmount - paid - discount, 0));

  return {
    company: {
      name: options.companyName || 'NHÀ PHÂN PHỐI MINH KHAI',
      address: options.companyAddress || '',
      phone: options.companyPhone || '',
      taxCode: options.taxCode || ''
    },
    document: {
      id: document.id || '',
      code: document.code || document.orderCode || document.refCode || document.id || '',
      date: formatDate(document.date || document.createdAt),
      rawDate: document.date || document.createdAt || '',
      type: document.type || '',
      note: document.note || ''
    },
    customer: {
      code: document.customerCode || document.customer?.code || '',
      name: document.customerName || document.customer?.name || document.supplier || '',
      address: document.customerAddress || document.customer?.address || '',
      phone: document.customerPhone || document.customer?.phone || ''
    },
    staff: {
      code: document.staffCode || document.salesCode || '',
      name: document.staffName || document.salesName || document.createdBy || ''
    },
    delivery: {
      code: document.deliveryCode || '',
      name: document.deliveryName || '',
      route: document.route || document.tuyen || ''
    },
    items,
    totals: { totalQty, totalAmount, discount, paid, debt },
    meta: {
      printedAt: new Date().toLocaleString('vi-VN'),
      printedBy: options.printedBy || ''
    },
    formatMoney
  };
}

module.exports = { buildPrintData, formatMoney, formatDate };
