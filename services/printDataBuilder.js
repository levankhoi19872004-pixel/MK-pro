function toNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function formatMoney(value) {
  return Math.round(toNumber(value)).toLocaleString('vi-VN');
}

function formatDate(value) {
  if (!value) return new Date().toLocaleDateString('vi-VN');
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value || '');
  return date.toLocaleDateString('vi-VN');
}

function formatDateTime(value) {
  if (!value) return new Date().toLocaleString('vi-VN');
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value || '');
  return date.toLocaleString('vi-VN');
}

const DIGITS = ['Không', 'Một', 'Hai', 'Ba', 'Bốn', 'Năm', 'Sáu', 'Bảy', 'Tám', 'Chín'];

function readTriple(number, full) {
  const hundred = Math.floor(number / 100);
  const ten = Math.floor((number % 100) / 10);
  const unit = number % 10;
  const parts = [];

  if (hundred > 0 || full) {
    parts.push(`${DIGITS[hundred]} Trăm`);
  }

  if (ten > 1) {
    parts.push(`${DIGITS[ten]} Mươi`);
    if (unit === 1) parts.push('Mốt');
    else if (unit === 5) parts.push('Lăm');
    else if (unit > 0) parts.push(DIGITS[unit]);
  } else if (ten === 1) {
    parts.push('Mười');
    if (unit === 5) parts.push('Lăm');
    else if (unit > 0) parts.push(DIGITS[unit]);
  } else if (unit > 0) {
    if (hundred > 0 || full) parts.push('Lẻ');
    parts.push(DIGITS[unit]);
  }

  return parts.join(' ');
}

function numberToVietnameseWords(value) {
  let number = Math.round(Math.abs(toNumber(value)));
  if (number === 0) return 'Không Đồng';

  const units = ['', 'Nghìn', 'Triệu', 'Tỷ', 'Nghìn Tỷ', 'Triệu Tỷ'];
  const groups = [];
  while (number > 0) {
    groups.push(number % 1000);
    number = Math.floor(number / 1000);
  }

  const words = [];
  for (let i = groups.length - 1; i >= 0; i -= 1) {
    const group = groups[i];
    if (group === 0) continue;
    const full = i < groups.length - 1 && group < 100;
    words.push(`${readTriple(group, full)} ${units[i]}`.trim());
  }

  return `${words.join(' ').replace(/\s+/g, ' ')} Đồng`;
}

function normalizeQuantityByPack(quantity, pack) {
  const qty = toNumber(quantity);
  const packSize = Math.max(1, toNumber(pack || 1));
  const cases = Math.floor(qty / packSize);
  const units = qty % packSize;
  return { cases, units, display: `${cases}/${units}` };
}

function pick(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== '') ?? '';
}

function getItemQuantity(item) {
  return toNumber(pick(item.qty, item.quantity, item.soLuong, item.totalQty, item.totalQuantity));
}

function getItemPack(item) {
  return toNumber(pick(item.pack, item.packing, item.packSize, item.quyCach, 1)) || 1;
}

function getItemPrice(item) {
  return toNumber(pick(item.price, item.unitPrice, item.salePrice, item.costPrice, item.donGia, item.giaBan));
}

function getItemDiscount(item) {
  return toNumber(pick(item.discount, item.discountAmount, item.ck, item.ckAmount, 0));
}

function getItemTax(item) {
  return toNumber(pick(item.tax, item.vat, item.taxAmount, item.vatAmount, 0));
}

function normalizeOneItem(item, index, sourceOrder = null) {
  const qty = getItemQuantity(item);
  const pack = getItemPack(item);
  const price = getItemPrice(item);
  const salePriceAfterDiscount = toNumber(pick(item.netPrice, item.priceAfterDiscount, item.finalPrice, price));
  const discount = getItemDiscount(item);
  const tax = getItemTax(item);
  const rawAmount = toNumber(pick(item.amount, item.total, item.totalAmount, qty * salePriceAfterDiscount));
  const amount = rawAmount || qty * salePriceAfterDiscount;
  const caseInfo = normalizeQuantityByPack(qty, pack);

  return {
    stt: index + 1,
    code: pick(item.code, item.productCode, item.sku, item.maHang),
    name: pick(item.name, item.productName, item.tenHang),
    unit: pick(item.unit, item.dvt, item.uom, 'Cái'),
    pack,
    qty,
    caseQty: toNumber(pick(item.caseQty, item.thung, caseInfo.cases)),
    unitQty: toNumber(pick(item.unitQty, item.le, caseInfo.units)),
    caseDisplay: pick(item.caseDisplay, item.qtyDisplay, caseInfo.display),
    price,
    priceAfterDiscount: salePriceAfterDiscount,
    discount,
    tax,
    amount,
    note: item.note || '',
    sourceOrderCode: sourceOrder ? pick(sourceOrder.code, sourceOrder.orderCode, sourceOrder.id) : ''
  };
}

function normalizeItems(document) {
  const directItems = Array.isArray(document.items) ? document.items : [];
  const orderLines = Array.isArray(document.lines) ? document.lines : [];
  const rows = directItems.length ? directItems : orderLines;

  if (rows.length) {
    return rows.map((item, index) => normalizeOneItem(item, index));
  }

  const children = Array.isArray(document.children) ? document.children : [];
  const childItems = [];
  children.forEach((child) => {
    const items = Array.isArray(child.items) ? child.items : [];
    items.forEach((item) => childItems.push({ item, child }));
  });

  return childItems.map((entry, index) => normalizeOneItem(entry.item, index, entry.child));
}

function normalizePromotions(document) {
  const promotions = Array.isArray(document.promotions) ? document.promotions
    : Array.isArray(document.promotionRows) ? document.promotionRows
      : Array.isArray(document.discounts) ? document.discounts
        : [];

  return promotions.map((promo, index) => ({
    stt: index + 1,
    code: pick(promo.code, promo.promotionCode, promo.ctkmCode, promo.maCTKM),
    name: pick(promo.name, promo.title, promo.description, promo.promotionName, promo.tenCTKM),
    basisAmount: toNumber(pick(promo.basisAmount, promo.baseAmount, promo.giaTriHangHoa, promo.amount)),
    percent: toNumber(pick(promo.percent, promo.discountPercent, promo.tyLe, promo.rate)),
    beforeTax: toNumber(pick(promo.beforeTax, promo.amountBeforeTax, promo.tienCKTruocThue)),
    afterTax: toNumber(pick(promo.afterTax, promo.amountAfterTax, promo.tienCKSauThue, promo.discountAmount)),
    type: pick(promo.type, promo.kind, promo.loai)
  }));
}

function buildPrintData(document = {}, options = {}) {
  const items = normalizeItems(document);
  const promotions = normalizePromotions(document);

  const totalQty = toNumber(pick(document.totalQuantity, document.totalQty, items.reduce((sum, item) => sum + item.qty, 0)));
  const goodsAmount = toNumber(pick(document.goodsAmount, document.subTotal, document.subtotal, items.reduce((sum, item) => sum + item.qty * item.price, 0)));
  const discount = toNumber(pick(document.discount, document.discountAmount, document.totalDiscount, promotions.reduce((sum, item) => sum + (item.afterTax || item.beforeTax), 0)));
  const tax = toNumber(pick(document.tax, document.vat, document.taxAmount, items.reduce((sum, item) => sum + item.tax, 0)));
  const totalAmount = toNumber(pick(document.totalAmount, document.grandTotal, items.reduce((sum, item) => sum + item.amount, 0)));
  const paid = toNumber(pick(document.paidAmount, document.paid, document.collectedAmount, document.cashReceived));
  const payable = toNumber(pick(document.payableAmount, document.mustPay, totalAmount - discount));
  const debt = toNumber(pick(document.debtAmount, document.debt, Math.max(payable - paid, 0)));
  const promotionValue = toNumber(pick(document.promotionValue, document.totalPromotionValue, promotions.reduce((sum, item) => sum + item.basisAmount, 0)));

  return {
    company: {
      name: options.companyName || process.env.PRINT_COMPANY_NAME || 'NHÀ PHÂN PHỐI MINH KHAI',
      address: options.companyAddress || process.env.PRINT_COMPANY_ADDRESS || 'Cầu Cánh Sẻ, Quang Bình, Kiến Xương, Thái Bình',
      phone: options.companyPhone || process.env.PRINT_COMPANY_PHONE || '',
      taxCode: options.taxCode || process.env.PRINT_COMPANY_TAX || ''
    },
    document: {
      id: document.id || document._id || '',
      code: pick(document.code, document.orderCode, document.refCode, document.id, document._id),
      invoiceCode: pick(document.invoiceCode, document.invoiceNo, document.soHoaDon),
      customerOrderCode: pick(document.customerOrderCode, document.soDonHang),
      date: formatDate(pick(document.date, document.createdAt)),
      dateTime: formatDateTime(pick(document.date, document.createdAt)),
      rawDate: pick(document.date, document.createdAt),
      type: document.type || '',
      note: document.note || '',
      terms: pick(document.terms, document.paymentTerms, 'đáo hạn trong 7 ngày'),
      page: options.page || '1 / 1',
      vehicleNo: pick(document.vehicleNo, document.truckNo, document.soXeTai)
    },
    customer: {
      code: pick(document.customerCode, document.customer?.code, document.customerId),
      name: pick(document.customerName, document.customer?.name, document.supplier, document.supplierName),
      address: pick(document.customerAddress, document.customer?.address, document.address),
      phone: pick(document.customerPhone, document.customer?.phone, document.phone),
      taxCode: pick(document.customerTaxCode, document.customer?.taxCode, document.mst)
    },
    staff: {
      code: pick(document.staffCode, document.salesStaffCode, document.salesCode, document.salesStaffId),
      name: pick(document.staffName, document.salesStaffName, document.salesName, document.createdBy)
    },
    delivery: {
      code: pick(document.deliveryCode, document.deliveryStaffCode),
      name: pick(document.deliveryName, document.deliveryStaffName),
      phone: pick(document.deliveryPhone, document.deliveryStaffPhone),
      route: pick(document.route, document.routeName, document.tuyen)
    },
    items,
    promotions,
    totals: {
      totalQty,
      goodsAmount,
      totalAmount,
      discount,
      tax,
      paid,
      payable,
      debt,
      promotionValue,
      totalAmountText: document.totalAmountText || numberToVietnameseWords(payable || totalAmount)
    },
    meta: {
      printedAt: new Date().toLocaleString('vi-VN'),
      printedBy: options.printedBy || '',
      copyLabel: options.copyLabel || 'Liên 1'
    },
    formatMoney
  };
}

module.exports = { buildPrintData, formatMoney, formatDate, formatDateTime, numberToVietnameseWords };
