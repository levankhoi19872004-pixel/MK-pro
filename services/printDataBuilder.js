const { calculateCartonUnit } = require('../src/utils/common.util');
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
  const result = calculateCartonUnit(quantity, pack);
  return { cases: result.cartons, units: result.units, display: result.display };
}

function pick(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== '') ?? '';
}

function getItemQuantity(item) {
  return toNumber(pick(item.qty, item.quantity, item.soLuong, item.totalQty, item.totalQuantity));
}

function getItemPack(item) {
  // Quy cách phải lấy từ dữ liệu Mongo/snapshot số học, không parse từ tên sản phẩm hoặc chuỗi packing.
  return toNumber(pick(
    item.packingQty,
    item.conversionRate,
    item.unitsPerCase,
    item.qtyPerCase,
    item.packSize,
    item.product?.conversionRate,
    item.productSnapshot?.conversionRate,
    1
  )) || 1;
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
  const warehouseCode = pick(item.warehouseCode, item.khoCode, item.warehouse, 'KHO_HC');
  const warehouseName = pick(item.warehouseName, item.khoName, warehouseCode === 'KHO_PC' ? 'KHO PC' : 'KHO HC');
  const qty = getItemQuantity(item);
  const pack = getItemPack(item);
  const price = getItemPrice(item);
  const salePriceAfterDiscount = toNumber(pick(item.netPrice, item.priceAfterDiscount, item.finalPrice, price));
  const discount = getItemDiscount(item);
  const tax = getItemTax(item);
  const lineType = String(pick(item.lineType, item.type, item.kind, item.itemType, item.isPromo ? 'PROMO' : 'SALE') || 'SALE').toUpperCase();
  const isPromo = lineType === 'PROMO' || lineType === 'PROMOTION' || lineType === 'KM' || item.isPromo === true;
  const normalizedLineType = isPromo ? 'PROMO' : 'SALE';
  const lineTypeName = isPromo ? 'Xuất khuyến mại' : 'Hàng bán';
  const rawAmount = toNumber(pick(item.amount, item.total, item.totalAmount, isPromo ? 0 : qty * salePriceAfterDiscount));
  const amount = isPromo ? 0 : (rawAmount || qty * salePriceAfterDiscount);
  const caseInfo = normalizeQuantityByPack(qty, pack);

  return {
    stt: index + 1,
    code: pick(item.code, item.productCode, item.sku, item.maHang),
    name: pick(item.name, item.productName, item.tenHang),
    unit: pick(item.unit, item.dvt, item.uom, 'Cái'),
    pack,
    qty,
    caseQty: caseInfo.cases,
    unitQty: caseInfo.units,
    caseDisplay: caseInfo.display,
    price,
    priceBeforeVat: toNumber(pick(item.priceBeforeVat, item.listPriceBeforeVat, item.beforeVatPrice, price)),
    listPriceBeforeVat: toNumber(pick(item.listPriceBeforeVat, item.priceBeforeVat, item.beforeVatPrice, price)),
    priceAfterVatBeforeDiscount: toNumber(pick(item.priceAfterVatBeforeDiscount, item.listPriceAfterVat, item.afterVatBeforeDiscountPrice, item.grossPrice, price ? price * 1.08 : 0)),
    listPriceAfterVat: toNumber(pick(item.listPriceAfterVat, item.priceAfterVatBeforeDiscount, item.afterVatBeforeDiscountPrice, item.grossPrice, price ? price * 1.08 : 0)),
    priceAfterDiscount: salePriceAfterDiscount,
    priceAfterVatAfterDiscount: toNumber(pick(item.priceAfterVatAfterDiscount, item.netPrice, item.priceAfterDiscount, item.finalPrice, salePriceAfterDiscount)),
    gsvAmount: toNumber(pick(item.gsvAmount, item.gsv, item.grossSalesValue)),
    nivAmount: toNumber(pick(item.nivAmount, item.niv, item.netInvoiceValue)),
    discount,
    tax,
    amount,
    lineType: normalizedLineType,
    isPromo,
    lineTypeName,
    note: item.note || '',
    sourceOrderCode: sourceOrder ? pick(sourceOrder.code, sourceOrder.orderCode, sourceOrder.id) : '',
    warehouseCode,
    warehouseName,
    sourceOrderCodes: Array.isArray(item.sourceOrderCodes) ? item.sourceOrderCodes : []
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


function normalizeDisplayRewards(document) {
  const rows = Array.isArray(document.displayRewards) ? document.displayRewards
    : Array.isArray(document.rewardRows) ? document.rewardRows
      : Array.isArray(document.displayRewardRows) ? document.displayRewardRows
        : Array.isArray(document.deductions) ? document.deductions
          : Array.isArray(document.offsetRows) ? document.offsetRows
            : [];

  return rows.map((row, index) => ({
    stt: index + 1,
    code: pick(row.code, row.rewardCode, row.displayCode, row.cttbCode, row.maCTTrungBay, row.maCT),
    name: pick(row.name, row.title, row.description, row.programName, row.noiDung, row.content),
    month: pick(row.month, row.displayMonth, row.thangTrungBay),
    goodsAmount: toNumber(pick(row.goodsAmount, row.goodsRewardAmount, row.hangHoa, row.chiTraHangHoa)),
    quantityText: pick(row.quantityText, row.caseUnitText, row.cartonUnitText, row.soLuongThungLe),
    offsetAmount: toNumber(pick(row.offsetAmount, row.cashAmount, row.debtOffsetAmount, row.canTruNo, row.amount))
  }));
}


function buildWarehouseGroups(items = []) {
  const map = new Map();
  for (const item of items) {
    const code = String(item.warehouseCode || 'KHO_HC').trim() || 'KHO_HC';
    const name = String(item.warehouseName || (code === 'KHO_PC' ? 'KHO PC' : 'KHO HC')).trim();
    if (!map.has(code)) {
      map.set(code, {
        code,
        name,
        items: [],
        saleItems: [],
        promoItems: [],
        totalQty: 0,
        saleQty: 0,
        promoQty: 0,
        totalAmount: 0
      });
    }
    const group = map.get(code);
    const lineType = item.isPromo || item.lineType === 'PROMO' ? 'PROMO' : 'SALE';
    const mergeKey = [
      code,
      lineType,
      item.code,
      item.unit,
      item.pack,
      lineType === 'PROMO' ? 0 : item.price
    ].join('|');

    let merged = group.items.find((row) => row.__mergeKey === mergeKey);
    if (!merged) {
      merged = {
        ...item,
        __mergeKey: mergeKey,
        qty: 0,
        amount: 0,
        sourceOrderCodes: []
      };
      group.items.push(merged);
      if (lineType === 'PROMO') group.promoItems.push(merged);
      else group.saleItems.push(merged);
    }

    merged.qty += toNumber(item.qty);
    merged.amount += toNumber(item.amount);
    merged.caseQty = normalizeQuantityByPack(merged.qty, merged.pack).cases;
    merged.unitQty = normalizeQuantityByPack(merged.qty, merged.pack).units;
    merged.caseDisplay = normalizeQuantityByPack(merged.qty, merged.pack).display;
    if (item.sourceOrderCode && !merged.sourceOrderCodes.includes(item.sourceOrderCode)) merged.sourceOrderCodes.push(item.sourceOrderCode);
    for (const sourceCode of item.sourceOrderCodes || []) {
      if (sourceCode && !merged.sourceOrderCodes.includes(sourceCode)) merged.sourceOrderCodes.push(sourceCode);
    }

    group.totalQty += toNumber(item.qty);
    if (lineType === 'PROMO') group.promoQty += toNumber(item.qty);
    else group.saleQty += toNumber(item.qty);
    group.totalAmount += toNumber(item.amount);
  }
  const preferred = ['KHO_HC', 'KHO_PC'];
  return Array.from(map.values()).sort((a, b) => {
    const ai = preferred.indexOf(a.code);
    const bi = preferred.indexOf(b.code);
    if (ai !== -1 || bi !== -1) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    return a.name.localeCompare(b.name, 'vi');
  });
}

function buildPrintData(document = {}, options = {}) {
  const items = normalizeItems(document);
  const promotions = normalizePromotions(document);
  const displayRewards = normalizeDisplayRewards(document);
  const warehouseGroups = buildWarehouseGroups(items);

  const totalQty = toNumber(pick(document.totalQuantity, document.totalQty, items.reduce((sum, item) => sum + item.qty, 0)));
  const goodsAmount = toNumber(pick(document.goodsAmount, document.subTotal, document.subtotal, items.reduce((sum, item) => sum + item.qty * item.price, 0)));
  const discount = toNumber(pick(document.discount, document.discountAmount, document.totalDiscount, promotions.reduce((sum, item) => sum + (item.afterTax || item.beforeTax), 0)));
  const tax = toNumber(pick(document.tax, document.vat, document.taxAmount, items.reduce((sum, item) => sum + item.tax, 0)));
  const totalAmount = toNumber(pick(document.totalAmount, document.grandTotal, items.reduce((sum, item) => sum + item.amount, 0)));
  const paid = toNumber(pick(document.paidAmount, document.paid, document.collectedAmount, document.cashReceived));
  const payable = toNumber(pick(document.payableAmount, document.mustPay, totalAmount - discount));
  const debt = toNumber(pick(document.debtAmount, document.debt, Math.max(payable - paid, 0)));
  const promotionValue = toNumber(pick(document.promotionValue, document.totalPromotionValue, document.totalPromotionAmount, promotions.reduce((sum, item) => sum + (item.afterTax || item.beforeTax || 0), 0)));
  const displayRewardTotal = toNumber(pick(document.displayRewardTotal, document.totalDisplayReward, document.rewardAmount, document.offsetAmount, displayRewards.reduce((sum, item) => sum + item.offsetAmount, 0)));

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
      invoiceCode: pick(document.invoiceCode, document.invoiceNo, document.soHoaDon, document.documentCode, document.code),
      customerOrderCode: pick(document.customerOrderCode, document.soDonHang, document.orderCode, document.documentCode, document.code),
      date: formatDate(pick(document.date, document.createdAt)),
      dateTime: formatDateTime(pick(document.date, document.createdAt)),
      rawDate: pick(document.date, document.createdAt),
      type: pick(document.type, document.invoiceType, document.orderType, document.orderSourceName, ''),
      note: document.note || '',
      terms: pick(document.terms, document.paymentTerms, 'đáo hạn trong 7 ngày'),
      page: options.page || '1 / 1',
      vehicleNo: pick(document.vehicleNo, document.truckNo, document.soXeTai),
      printMode: document.printMode || '',
      masterOrderCodes: Array.isArray(document.masterOrderCodes) ? document.masterOrderCodes : [],
      selectedMasterOrderCount: document.selectedMasterOrderCount || 0
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
      name: pick(document.staffName, document.salesStaffName, document.salesName, document.createdBy),
      phone: pick(document.staffPhone, document.salesStaffPhone, document.salesPhone)
    },
    delivery: {
      code: pick(document.deliveryCode, document.deliveryStaffCode),
      name: pick(document.deliveryName, document.deliveryStaffName),
      phone: pick(document.deliveryPhone, document.deliveryStaffPhone),
      route: pick(document.route, document.routeName, document.tuyen)
    },
    items,
    promotions,
    displayRewards,
    warehouseGroups,
    totals: {
      totalQty,
      goodsAmount,
      totalAmount,
      discount,
      tax,
      paid,
      payable,
      debt,
      orderCount: toNumber(pick(document.orderCount, document.totalOrders, Array.isArray(document.children) ? document.children.length : 0)),
      promotionValue,
      displayRewardTotal,
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
