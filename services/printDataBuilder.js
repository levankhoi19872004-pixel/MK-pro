const { calculateCartonUnit } = require('../src/utils/common.util');
function toNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;

  const text = String(value).trim();
  let normalized = text;

  // Hỗ trợ định dạng tiền Việt: 34.028, 1.100.000, 12,11
  // Đồng thời không phá số thập phân dạng kỹ thuật: 12.11, 2.5
  if (text.includes(',')) {
    normalized = text.replace(/\./g, '').replace(',', '.');
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(text)) {
    normalized = text.replace(/\./g, '');
  }

  const number = Number(normalized);
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

function getCatalogSalePrice(item) {
  // Cột 4 của mẫu DMS/V46: giá bán sau thuế, trước khuyến mại.
  // Ưu tiên giá bán trong danh mục sản phẩm đã được enrich từ Mongo.
  return toNumber(pick(
    item.catalogSalePrice,
    item.product?.salePrice,
    item.productSnapshot?.salePrice,
    item.salePrice,
    item.giaBan,
    item.price,
    item.unitPrice,
    0
  ));
}

function getItemPrice(item) {
  return getCatalogSalePrice(item);
}

function getDiscountPercent(item) {
  return toNumber(pick(
    item.discountPercent,
    item.promotionDiscountPercent,
    item.ckPercent,
    item.percent,
    item.rate,
    item.promotion?.discountPercent,
    0
  ));
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

  // Chuẩn cột mẫu đơn DMS/V46:
  // Cột 1: CS/SU = cột 2 / quy cách.
  // Cột 2: số lượng lẻ thực tế.
  // Cột 3: giá trước thuế = cột 4 / 1.08.
  // Cột 4: giá bán sau thuế, trước KM = products.salePrice.
  // Cột 5: giá sau thuế, sau KM/CK = cột 4 - cột 4 * %CK, hoặc giá bán thẳng người tạo đơn nhập.
  const priceAfterTaxBeforePromotion = getCatalogSalePrice(item);
  const priceBeforeTax = Math.round(priceAfterTaxBeforePromotion / 1.08);
  const discountPercent = getDiscountPercent(item);
  const directNetPrice = toNumber(pick(
    item.priceAfterPromotion,
    item.priceAfterVatAfterDiscount,
    item.netPrice,
    item.priceAfterDiscount,
    item.finalPrice,
    item.orderPrice,
    item.manualPrice,
    0
  ));
  const priceAfterPromotion = discountPercent > 0
    ? Math.floor(priceAfterTaxBeforePromotion * (1 - discountPercent / 100))
    : (directNetPrice || priceAfterTaxBeforePromotion);

  const discount = getItemDiscount(item);
  const lineType = String(pick(item.lineType, item.type, item.kind, item.itemType, item.isPromo ? 'PROMO' : 'SALE') || 'SALE').toUpperCase();
  const isPromo = lineType === 'PROMO' || lineType === 'PROMOTION' || lineType === 'KM' || item.isPromo === true;
  const normalizedLineType = isPromo ? 'PROMO' : 'SALE';
  const lineTypeName = isPromo ? 'Xuất khuyến mại' : 'Hàng bán';
  const tax = isPromo ? 0 : Math.round((priceAfterPromotion - (priceAfterPromotion / 1.08)) * qty);
  const amount = isPromo ? 0 : Math.round(priceAfterPromotion * qty);
  const caseInfo = normalizeQuantityByPack(qty, pack);

  return {
    stt: index + 1,
    code: pick(item.code, item.productCode, item.sku, item.maHang),
    productCode: pick(item.productCode, item.code, item.sku, item.maHang),
    name: pick(item.name, item.productName, item.tenHang, item.productSnapshot?.name, item.product?.name),
    productName: pick(item.productName, item.name, item.tenHang, item.productSnapshot?.name, item.product?.name),
    unit: pick(item.unit, item.dvt, item.uom, item.productSnapshot?.unit, item.product?.unit, 'Cái'),
    pack,
    conversionRate: pack,
    qty,
    quantity: qty,
    cartonQty: caseInfo.cases,
    caseQty: caseInfo.cases,
    unitQty: caseInfo.units,
    caseDisplay: `${caseInfo.cases}/${caseInfo.units}`,
    price: priceAfterTaxBeforePromotion,
    salePrice: priceAfterTaxBeforePromotion,
    priceBeforeTax,
    priceBeforeVat: priceBeforeTax,
    listPriceBeforeVat: priceBeforeTax,
    priceAfterTaxBeforePromotion,
    priceAfterVatBeforeDiscount: priceAfterTaxBeforePromotion,
    listPriceAfterVat: priceAfterTaxBeforePromotion,
    discountPercent,
    priceAfterPromotion,
    priceAfterDiscount: priceAfterPromotion,
    priceAfterVatAfterDiscount: priceAfterPromotion,
    gsvAmount: Math.round(qty * priceAfterTaxBeforePromotion),
    nivAmount: amount,
    discount,
    tax,
    vatAmount: tax,
    amount,
    lineAmount: amount,
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

  return promotions.map((promo, index) => {
    const code = pick(promo.code, promo.promotionCode, promo.ctkmCode, promo.maCTKM);
    const description = pick(promo.description, promo.name, promo.title, promo.promotionName, promo.tenCTKM);
    const qualifiedAmount = toNumber(pick(promo.qualifiedAmount, promo.basisAmount, promo.baseAmount, promo.giaTriHangHoa, promo.amount));
    const discountPercent = toNumber(pick(promo.discountPercent, promo.percent, promo.tyLe, promo.rate));
    const discountBeforeTax = toNumber(pick(promo.discountBeforeTax, promo.beforeTax, promo.amountBeforeTax, promo.tienCKTruocThue));
    const discountAfterTax = toNumber(pick(promo.discountAfterTax, promo.afterTax, promo.amountAfterTax, promo.tienCKSauThue, promo.discountAmount));
    return {
      stt: index + 1,
      code,
      promotionCode: code,
      name: description,
      description,
      basisAmount: qualifiedAmount,
      qualifiedAmount,
      percent: discountPercent,
      discountPercent,
      beforeTax: discountBeforeTax,
      discountBeforeTax,
      afterTax: discountAfterTax,
      discountAfterTax,
      type: pick(promo.type, promo.kind, promo.loai)
    };
  });
}


function normalizeDisplayRewards(document) {
  const rows = Array.isArray(document.offsets) ? document.offsets
    : Array.isArray(document.displayRewards) ? document.displayRewards
    : Array.isArray(document.rewardRows) ? document.rewardRows
      : Array.isArray(document.displayRewardRows) ? document.displayRewardRows
        : Array.isArray(document.deductions) ? document.deductions
          : Array.isArray(document.offsetRows) ? document.offsetRows
            : [];

  return rows.map((row, index) => {
    const code = pick(row.programCode, row.code, row.rewardCode, row.displayCode, row.cttbCode, row.maCTTrungBay, row.maCT);
    const description = pick(row.description, row.name, row.title, row.programName, row.noiDung, row.content);
    const month = pick(row.month, row.displayMonth, row.thangTrungBay);
    const offsetAmount = toNumber(pick(row.offsetAmount, row.cashAmount, row.debtOffsetAmount, row.canTruNo, row.amount));
    return {
      stt: index + 1,
      code,
      programCode: code,
      name: description,
      description,
      month,
      goodsAmount: toNumber(pick(row.goodsAmount, row.goodsRewardAmount, row.hangHoa, row.chiTraHangHoa)),
      quantityText: pick(row.quantityText, row.caseUnitText, row.cartonUnitText, row.soLuongThungLe),
      offsetAmount
    };
  });
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


function parseCsSu(csSu) {
  const [cartonQty, unitQty] = String(csSu || '0/0').split('/');
  return {
    cartonQty: toNumber(cartonQty),
    csSuUnitQty: toNumber(unitQty)
  };
}

function buildDeliveryInvoicePayload(raw = {}) {
  const normalizeItem = (item, index) => {
    const csSu = parseCsSu(item.csSu || item.quantityCsSu || item.caseDisplay);
    const quantity = toNumber(pick(item.quantity, item.qty, item.totalQty, item.csSuUnitQty, item.unitQty));
    const priceAfterTaxBeforePromotion = toNumber(pick(
      item.priceAfterTaxBeforePromotion,
      item.priceAfterVatBeforeDiscount,
      item.salePrice,
      item.price,
      item.unitPrice
    ));
    const priceBeforeTax = toNumber(pick(
      item.priceBeforeTax,
      item.priceBeforeTaxBeforePromotion,
      item.priceBeforeVat,
      Math.round(priceAfterTaxBeforePromotion / 1.08)
    ));
    const discountPercent = toNumber(item.discountPercent);
    const priceAfterPromotion = toNumber(pick(
      item.priceAfterPromotion,
      item.priceAfterTaxAfterPromotion,
      item.priceAfterVatAfterDiscount,
      discountPercent > 0
        ? Math.floor(priceAfterTaxBeforePromotion * (1 - discountPercent / 100))
        : priceAfterTaxBeforePromotion
    ));
    const vatAmount = toNumber(pick(
      item.vatAmount,
      item.tax,
      item.taxAmount,
      Math.round((priceAfterPromotion - priceAfterPromotion / 1.08) * quantity)
    ));
    const lineAmount = toNumber(pick(
      item.lineAmount,
      item.amount,
      Math.round(quantity * priceAfterPromotion)
    ));

    return {
      lineNo: item.lineNo || item.stt || index + 1,
      productCode: String(pick(item.productCode, item.code, item.sku, item.maHang)).trim(),
      productName: String(pick(item.productName, item.name, item.tenHang)).trim(),
      quantityCsSu: item.csSu || item.quantityCsSu || item.caseDisplay || `${csSu.cartonQty}/${csSu.csSuUnitQty}`,
      cartonQty: toNumber(pick(item.cartonQty, item.caseQty, csSu.cartonQty)),
      unitQty: toNumber(pick(item.unitQty, csSu.csSuUnitQty)),
      csSuUnitQty: toNumber(pick(item.csSuUnitQty, item.unitQty, csSu.csSuUnitQty)),
      quantity,
      priceBeforeTax,
      priceBeforeTaxBeforePromotion: priceBeforeTax,
      priceAfterTaxBeforePromotion,
      priceAfterPromotion,
      priceAfterTaxAfterPromotion: priceAfterPromotion,
      discountPercent,
      vatAmount,
      lineAmount,
      isPromotionGift: Boolean(item.isPromotionGift || item.isPromo || item.lineType === 'PROMO'),
      promotionCode: item.promotionCode || ''
    };
  };

  const items = Array.isArray(raw.items) ? raw.items.map(normalizeItem) : [];

  const promotions = Array.isArray(raw.promotions)
    ? raw.promotions.map((p) => ({
        promotionCode: String(p.promotionCode || p.code || '').trim(),
        description: String(p.description || p.name || '').trim(),
        qualifiedAmount: toNumber(p.qualifiedAmount),
        discountPercent: toNumber(p.discountPercent),
        discountBeforeTax: toNumber(p.discountBeforeTax),
        discountAfterTax: toNumber(p.discountAfterTax)
      }))
    : [];

  const offsets = Array.isArray(raw.offsets)
    ? raw.offsets.map((o) => ({
        programCode: String(o.programCode || o.code || '').trim(),
        description: String(o.description || o.name || '').trim(),
        displayMonth: o.displayMonth || o.month || '',
        month: o.month || o.displayMonth || '',
        offsetAmount: toNumber(o.offsetAmount)
      }))
    : [];

  const goodsAmountAfterPromotion = items.reduce((sum, item) => sum + item.lineAmount, 0);
  const grossAmountBeforePromotion = items.reduce(
    (sum, item) => sum + item.quantity * item.priceAfterTaxBeforePromotion,
    0
  );
  const totalPromotionAmount = raw.totalPromotionAmount !== undefined
    ? toNumber(raw.totalPromotionAmount)
    : promotions.reduce((sum, p) => sum + p.discountAfterTax, 0);
  const totalOffsetAmount = raw.totalOffsetAmount !== undefined
    ? toNumber(raw.totalOffsetAmount)
    : offsets.reduce((sum, o) => sum + o.offsetAmount, 0);
  const nppDiscountAmount = toNumber(raw.nppDiscountAmount);
  const payableAmount = raw.payableAmount !== undefined
    ? toNumber(raw.payableAmount)
    : goodsAmountAfterPromotion - totalOffsetAmount;
  const promotionRate = grossAmountBeforePromotion > 0
    ? Number((((totalPromotionAmount + nppDiscountAmount) / grossAmountBeforePromotion) * 100).toFixed(2))
    : 0;

  return {
    documentType: 'DELIVERY_PAYMENT_INVOICE',
    title: 'PHIẾU GIAO NHẬN VÀ THANH TOÁN',
    header: {
      invoiceCode: raw.invoiceCode || raw.header?.invoiceCode || '',
      orderCode: raw.orderCode || raw.header?.orderCode || '',
      orderDateTime: raw.orderDateTime || raw.header?.orderDateTime || '',
      invoiceType: raw.invoiceType || raw.header?.invoiceType || 'NVTT',
      paymentTerm: raw.paymentTerm || raw.header?.paymentTerm || 'Đáo hạn trong 7 ngày',
      truckNo: raw.truckNo || raw.header?.truckNo || '',
      taxCode: raw.taxCode || raw.header?.taxCode || ''
    },
    distributor: {
      code: raw.distributorCode || raw.distributor?.code || '',
      name: raw.distributorName || raw.distributor?.name || '',
      phone: raw.distributorPhone || raw.distributor?.phone || '',
      address: raw.distributorAddress || raw.distributor?.address || ''
    },
    customer: {
      customerCode: raw.customerCode || raw.customer?.customerCode || raw.customer?.code || '',
      customerName: raw.customerName || raw.customer?.customerName || raw.customer?.name || '',
      phone: raw.customerPhone || raw.customer?.phone || '',
      deliveryAddress: raw.deliveryAddress || raw.customer?.deliveryAddress || raw.customer?.address || ''
    },
    salesStaff: {
      staffCode: raw.salesStaffCode || raw.salesStaff?.staffCode || raw.salesStaff?.code || '',
      staffName: raw.salesStaffName || raw.salesStaff?.staffName || raw.salesStaff?.name || '',
      phone: raw.salesStaffPhone || raw.salesStaff?.phone || ''
    },
    items,
    promotions,
    offsets,
    summary: {
      totalQty: items.reduce((sum, item) => sum + item.quantity, 0),
      goodsAmountAfterPromotion,
      grossAmountBeforePromotion,
      totalPromotionAmount,
      promotionAmount: totalPromotionAmount,
      totalOffsetAmount,
      displayRewardOffset: totalOffsetAmount,
      nppDiscountAmount,
      payableAmount,
      promotionRate,
      amountInWords: raw.amountInWords || raw.summary?.amountInWords || ''
    }
  };
}

function buildPrintData(document = {}, options = {}) {
  const items = normalizeItems(document);
  const promotions = normalizePromotions(document);
  const displayRewards = normalizeDisplayRewards(document);
  const warehouseGroups = buildWarehouseGroups(items);

  const totalQty = toNumber(pick(document.totalQuantity, document.totalQty, document.summary?.totalQty, items.reduce((sum, item) => sum + item.qty, 0)));
  const grossAmountBeforePromotion = toNumber(pick(
    document.grossAmountBeforePromotion,
    document.summary?.grossAmountBeforePromotion,
    document.goodsAmount,
    document.subTotal,
    document.subtotal,
    items.reduce((sum, item) => sum + item.gsvAmount, 0)
  ));
  const goodsAmountAfterPromotion = toNumber(pick(
    document.goodsAmountAfterPromotion,
    document.summary?.goodsAmountAfterPromotion,
    document.totalAmount,
    document.grandTotal,
    items.reduce((sum, item) => sum + item.amount, 0)
  ));
  const promotionValue = toNumber(pick(document.promotionValue, document.totalPromotionValue, document.totalPromotionAmount, document.summary?.promotionAmount, promotions.reduce((sum, item) => sum + (item.afterTax || item.beforeTax || 0), 0)));
  const displayRewardTotal = toNumber(pick(document.displayRewardTotal, document.totalDisplayReward, document.rewardAmount, document.offsetAmount, document.summary?.displayRewardOffset, displayRewards.reduce((sum, item) => sum + item.offsetAmount, 0)));
  const nppDiscountAmount = toNumber(pick(document.nppDiscountAmount, document.summary?.nppDiscountAmount, 0));
  const discount = toNumber(pick(document.discount, document.discountAmount, document.totalDiscount, promotionValue));
  const tax = toNumber(pick(document.tax, document.vat, document.taxAmount, items.reduce((sum, item) => sum + item.tax, 0)));
  const totalAmount = goodsAmountAfterPromotion;
  const goodsAmount = grossAmountBeforePromotion;
  const paid = toNumber(pick(document.paidAmount, document.paid, document.collectedAmount, document.cashReceived));
  const payable = toNumber(pick(document.payableAmount, document.mustPay, document.summary?.payableAmount, totalAmount - displayRewardTotal));
  const debt = toNumber(pick(document.debtAmount, document.debt, Math.max(payable - paid, 0)));
  const promotionRate = toNumber(pick(document.promotionRate, document.summary?.promotionRate, goodsAmount ? ((promotionValue + nppDiscountAmount) / goodsAmount) * 100 : 0));
  const structuredInvoicePayload = buildDeliveryInvoicePayload({
    ...document,
    items,
    promotions,
    offsets: displayRewards,
    totalPromotionAmount: promotionValue,
    totalOffsetAmount: displayRewardTotal,
    nppDiscountAmount,
    payableAmount: payable,
    amountInWords: pick(document.amountInWords, document.summary?.amountInWords, document.totalAmountText) || numberToVietnameseWords(payable || totalAmount)
  });

  return {
    company: {
      code: pick(document.distributor?.code, options.companyCode, process.env.PRINT_COMPANY_CODE, '3293'),
      name: pick(document.distributor?.name, options.companyName, process.env.PRINT_COMPANY_NAME, 'Công Ty TNHH MTV Minh Khai'),
      address: pick(document.distributor?.address, options.companyAddress, process.env.PRINT_COMPANY_ADDRESS, 'Cầu Cánh Sẻ, Quang Bình, Kiến Xương, Thái Bình'),
      phone: pick(document.distributor?.phone, options.companyPhone, process.env.PRINT_COMPANY_PHONE, ''),
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
      type: pick(document.invoiceType, document.type, document.orderType, document.orderSourceName, 'NVTT'),
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
      goodsAmountAfterPromotion,
      grossAmountBeforePromotion,
      promotionAmount: promotionValue,
      displayRewardOffset: displayRewardTotal,
      nppDiscountAmount,
      promotionRate,
      discount,
      tax,
      paid,
      payable,
      debt,
      orderCount: toNumber(pick(document.orderCount, document.totalOrders, Array.isArray(document.children) ? document.children.length : 0)),
      promotionValue,
      displayRewardTotal,
      totalAmountText: pick(document.amountInWords, document.summary?.amountInWords, document.totalAmountText) || numberToVietnameseWords(payable || totalAmount)
    },
    meta: {
      printedAt: new Date().toLocaleString('vi-VN'),
      printedBy: options.printedBy || '',
      copyLabel: options.copyLabel || 'Liên 1'
    },
    erpInvoiceV46: structuredInvoicePayload,

    formatMoney
  };
}

module.exports = { buildPrintData, buildDeliveryInvoicePayload, formatMoney, formatDate, formatDateTime, numberToVietnameseWords };
