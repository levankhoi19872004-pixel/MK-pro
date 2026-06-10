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


function normalizeMergeCode(value) {
  return String(value || '')
    .trim()
    .toUpperCase();
}

function normalizePack(pack) {
  return String(pack || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

function normalizeUnit(unit) {
  return String(unit || '')
    .trim()
    .toUpperCase();
}

function normalizeMergePrice(price) {
  return Math.round(toNumber(price));
}

function comparePrintItems(a, b) {
  const codeCompare = normalizeMergeCode(a.code).localeCompare(normalizeMergeCode(b.code), 'vi', { numeric: true });
  if (codeCompare !== 0) return codeCompare;
  const priceCompare = normalizeMergePrice(a.price) - normalizeMergePrice(b.price);
  if (priceCompare !== 0) return priceCompare;
  return String(a.name || '').localeCompare(String(b.name || ''), 'vi');
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


function normalizePromotionText(value) {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.map(normalizePromotionText).filter(Boolean).join('; ');
  if (typeof value === 'object') {
    return pick(value.description, value.name, value.title, value.content, value.note, value.ruleName, value.programName, value.promotionName, value.dienGiai, value.noiDung);
  }
  return String(value || '').trim();
}

function collectItemPromotionSources(item = {}) {
  const sources = [];
  const arrayFields = [
    item.promotions,
    item.promotionRows,
    item.promotionDetails,
    item.appliedPromotions,
    item.appliedPromotionRows,
    item.discountRows,
    item.discounts,
    item.productPromotions,
    item.productSnapshot?.promotions,
    item.productSnapshot?.promotionRows,
    item.product?.promotions,
    item.product?.promotionRows
  ];
  for (const value of arrayFields) {
    if (Array.isArray(value)) sources.push(...value);
  }

  const singleFields = [
    item.promotion,
    item.promotionInfo,
    item.promotionDetail,
    item.appliedPromotion,
    item.discountInfo,
    item.productSnapshot?.promotion,
    item.product?.promotion
  ];
  for (const value of singleFields) {
    if (value) sources.push(value);
  }

  const inlineDescription = pick(
    item.promotionDescription,
    item.promotionName,
    item.promotionText,
    item.promotionContent,
    item.promotionNote,
    item.promoDescription,
    item.promoName,
    item.dienGiaiKhuyenMai,
    item.noiDungKhuyenMai,
    item.productSnapshot?.promotionDescription,
    item.productSnapshot?.promotionName,
    item.productSnapshot?.promotionText,
    item.product?.promotionDescription,
    item.product?.promotionName,
    item.product?.promotionText
  );
  const inlineCode = pick(
    item.promotionCode,
    item.promoCode,
    item.ctkmCode,
    item.maCTKM,
    item.productSnapshot?.promotionCode,
    item.product?.promotionCode
  );

  if (inlineDescription || inlineCode) {
    sources.push({
      code: inlineCode,
      promotionCode: inlineCode,
      description: inlineDescription,
      name: inlineDescription,
      discountPercent: item.discountPercent,
      percent: item.discountPercent,
      discountBeforeTax: item.discountBeforeTax,
      beforeTax: item.discountBeforeTax,
      discountAfterTax: item.discountAfterTax || item.discount || item.discountAmount,
      afterTax: item.discountAfterTax || item.discount || item.discountAmount
    });
  }

  return sources;
}

function normalizeItemPromotionRows(item = {}, normalizedLine = {}) {
  const sources = collectItemPromotionSources(item);
  const lineProductCode = pick(normalizedLine.productCode, normalizedLine.code, item.productCode, item.code, item.sku, item.maHang);
  const lineProductName = pick(normalizedLine.productName, normalizedLine.name, item.productName, item.name, item.tenHang);
  const lineType = normalizedLine.isPromo ? 'KM' : 'Bán';
  const qty = toNumber(pick(normalizedLine.qty, normalizedLine.quantity, item.qty, item.quantity, item.totalQty));
  const lineAmount = toNumber(pick(normalizedLine.gsvAmount, normalizedLine.lineAmount, normalizedLine.amount, item.gsvAmount, item.amount));
  // Giá trị hàng hóa mua trong bảng khuyến mại phải là giá trước thuế:
  // (giá bán sau thuế của sản phẩm / 1.08) x số lượng trên đơn.
  const qualifiedAmountBeforeTax = Math.round(lineAmount / 1.08);
  const discountPercent = toNumber(pick(normalizedLine.discountPercent, item.discountPercent, item.percent, item.rate));
  const discountAfterTax = toNumber(pick(item.discountAfterTax, item.afterTax, item.discountAmount, item.discount, normalizedLine.discount, 0));
  const discountBeforeTax = toNumber(pick(item.discountBeforeTax, item.beforeTax, discountAfterTax ? Math.round(discountAfterTax / 1.08) : 0));

  if (!sources.length && (discountPercent > 0 || discountAfterTax > 0 || normalizedLine.isPromo)) {
    sources.push({
      code: pick(item.promotionCode, item.promoCode, item.ctkmCode, item.maCTKM),
      description: normalizedLine.isPromo
        ? `Hàng khuyến mại theo dòng ${lineProductCode} - ${lineProductName}`
        : `Chiết khấu/khuyến mại theo dòng ${lineProductCode} - ${lineProductName}`,
      discountPercent,
      discountBeforeTax,
      discountAfterTax
    });
  }

  const rows = sources.map((source) => {
    const code = pick(source.promotionCode, source.code, source.ctkmCode, source.maCTKM, source.programCode);
    const rawDescription = normalizePromotionText(source);
    const description = rawDescription || (normalizedLine.isPromo
      ? `Hàng khuyến mại theo dòng ${lineProductCode} - ${lineProductName}`
      : `Khuyến mại theo dòng ${lineProductCode} - ${lineProductName}`);

    return {
      productCode: lineProductCode,
      productName: lineProductName,
      lineType,
      quantity: qty,
      promotionCode: code,
      code,
      description,
      name: description,
      qualifiedAmount: qualifiedAmountBeforeTax,
      basisAmount: qualifiedAmountBeforeTax,
      discountPercent: toNumber(pick(source.discountPercent, source.percent, source.tyLe, source.rate, discountPercent)),
      percent: toNumber(pick(source.discountPercent, source.percent, source.tyLe, source.rate, discountPercent)),
      discountBeforeTax: toNumber(pick(source.discountBeforeTax, source.beforeTax, source.amountBeforeTax, source.tienCKTruocThue, discountBeforeTax)),
      beforeTax: toNumber(pick(source.discountBeforeTax, source.beforeTax, source.amountBeforeTax, source.tienCKTruocThue, discountBeforeTax)),
      discountAfterTax: toNumber(pick(source.discountAfterTax, source.afterTax, source.amountAfterTax, source.tienCKSauThue, source.discountAmount, discountAfterTax)),
      afterTax: toNumber(pick(source.discountAfterTax, source.afterTax, source.amountAfterTax, source.tienCKSauThue, source.discountAmount, discountAfterTax))
    };
  });

  const seen = new Set();
  return rows.filter((row) => {
    const key = [row.productCode, row.lineType, row.promotionCode, row.description, row.discountAfterTax, row.discountPercent].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return row.description || row.promotionCode || row.discountAfterTax || row.discountPercent;
  });
}

function buildPromotionsFromInvoiceItems(items = []) {
  const rows = [];
  for (const item of items) {
    const itemRows = Array.isArray(item.promotionRows) ? item.promotionRows : [];
    for (const row of itemRows) {
      rows.push({
        productCode: item.productCode || row.productCode,
        productName: item.productName || row.productName,
        lineType: item.isPromotionGift || item.isPromo ? 'KM' : (row.lineType || 'Bán'),
        quantity: item.quantity || row.quantity,
        promotionCode: row.promotionCode || row.code || item.promotionCode || '',
        code: row.promotionCode || row.code || item.promotionCode || '',
        description: row.description || row.name || '',
        qualifiedAmount: toNumber(row.qualifiedAmount || row.basisAmount),
        basisAmount: toNumber(row.qualifiedAmount || row.basisAmount),
        discountPercent: toNumber(row.discountPercent || row.percent),
        percent: toNumber(row.discountPercent || row.percent),
        discountBeforeTax: toNumber(row.discountBeforeTax || row.beforeTax),
        beforeTax: toNumber(row.discountBeforeTax || row.beforeTax),
        discountAfterTax: toNumber(row.discountAfterTax || row.afterTax),
        afterTax: toNumber(row.discountAfterTax || row.afterTax)
      });
    }
  }
  return mergePromotionRows(rows);
}

function mergePromotionRows(rows = []) {
  const map = new Map();
  for (const row of rows) {
    const key = [row.productCode || '', row.lineType || '', row.promotionCode || row.code || '', row.description || row.name || '', row.discountPercent || 0].join('|');
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { ...row });
    } else {
      existing.qualifiedAmount = toNumber(existing.qualifiedAmount) + toNumber(row.qualifiedAmount);
      existing.basisAmount = existing.qualifiedAmount;
      existing.discountBeforeTax = toNumber(existing.discountBeforeTax) + toNumber(row.discountBeforeTax);
      existing.beforeTax = existing.discountBeforeTax;
      existing.discountAfterTax = toNumber(existing.discountAfterTax) + toNumber(row.discountAfterTax);
      existing.afterTax = existing.discountAfterTax;
      existing.quantity = toNumber(existing.quantity) + toNumber(row.quantity);
    }
  }
  return Array.from(map.values());
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
  const promotionRows = normalizeItemPromotionRows(item, {
    code: pick(item.code, item.productCode, item.sku, item.maHang),
    productCode: pick(item.productCode, item.code, item.sku, item.maHang),
    name: pick(item.name, item.productName, item.tenHang, item.productSnapshot?.name, item.product?.name),
    productName: pick(item.productName, item.name, item.tenHang, item.productSnapshot?.name, item.product?.name),
    qty,
    quantity: qty,
    gsvAmount: Math.round(qty * priceAfterTaxBeforePromotion),
    amount,
    discount,
    discountPercent,
    isPromo
  });

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
    sourceOrderCodes: Array.isArray(item.sourceOrderCodes) ? item.sourceOrderCodes : [],
    promotionCode: pick(item.promotionCode, item.promoCode, item.ctkmCode, item.maCTKM, promotionRows[0]?.promotionCode),
    promotionDescription: pick(item.promotionDescription, item.promotionName, item.promotionText, promotionRows[0]?.description),
    promotionRows
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
  const itemMaps = new Map();

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
      itemMaps.set(code, new Map());
    }

    const group = map.get(code);
    const groupItemMap = itemMaps.get(code);
    const lineType = item.isPromo || item.lineType === 'PROMO' ? 'PROMO' : 'SALE';
    const normalizedCode = normalizeMergeCode(pick(item.code, item.productCode));
    const normalizedPack = normalizePack(item.pack);
    const normalizedUnit = normalizeUnit(item.unit);
    const normalizedPrice = lineType === 'PROMO' ? 0 : normalizeMergePrice(item.price);

    // Debug khi cần kiểm tra dữ liệu nguồn bị tách dòng: bật PRINT_DEBUG_MERGE=1.
    // Không bật mặc định để tránh spam log production.
    if (process.env.PRINT_DEBUG_MERGE === '1') {
      console.log('[printDataBuilder.buildWarehouseGroups] source item', {
        code: item.code,
        name: item.name,
        unit: item.unit,
        pack: item.pack,
        price: item.price,
        normalizedCode,
        normalizedUnit,
        normalizedPack,
        normalizedPrice
      });
    }

    // Đơn tổng phải gộp theo kho + loại dòng + mã sản phẩm + giá bán.
    // Không dùng tên hàng/ĐVT/quy cách trong khóa vì các trường này dễ lệch chữ hoa, khoảng trắng, snapshot.
    const mergeKey = [
      code,
      lineType,
      normalizedCode,
      normalizedPrice
    ].join('|');

    let merged = groupItemMap.get(mergeKey);
    if (!merged) {
      merged = {
        ...item,
        code: normalizedCode || item.code,
        productCode: normalizedCode || item.productCode || item.code,
        unit: item.unit || normalizedUnit,
        pack: toNumber(item.pack) || toNumber(normalizedPack) || 1,
        price: normalizedPrice,
        salePrice: normalizedPrice,
        __mergeKey: mergeKey,
        qty: 0,
        amount: 0,
        sourceOrderCodes: []
      };
      groupItemMap.set(mergeKey, merged);
      group.items.push(merged);
      if (lineType === 'PROMO') group.promoItems.push(merged);
      else group.saleItems.push(merged);
    }

    merged.qty += toNumber(item.qty);
    merged.quantity = merged.qty;
    merged.amount += toNumber(item.amount);
    merged.lineAmount = merged.amount;

    const caseInfo = normalizeQuantityByPack(merged.qty, merged.pack);
    merged.caseQty = caseInfo.cases;
    merged.cartonQty = caseInfo.cases;
    merged.unitQty = caseInfo.units;
    merged.caseDisplay = caseInfo.display;

    if (item.sourceOrderCode && !merged.sourceOrderCodes.includes(item.sourceOrderCode)) merged.sourceOrderCodes.push(item.sourceOrderCode);
    for (const sourceCode of item.sourceOrderCodes || []) {
      if (sourceCode && !merged.sourceOrderCodes.includes(sourceCode)) merged.sourceOrderCodes.push(sourceCode);
    }

    group.totalQty += toNumber(item.qty);
    if (lineType === 'PROMO') group.promoQty += toNumber(item.qty);
    else group.saleQty += toNumber(item.qty);
    group.totalAmount += toNumber(item.amount);
  }

  for (const group of map.values()) {
    group.saleItems.sort(comparePrintItems);
    group.promoItems.sort(comparePrintItems);
    group.items = [...group.saleItems, ...group.promoItems];
    group.items.forEach((item, index) => {
      item.stt = index + 1;
      delete item.__mergeKey;
    });
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

function normalizeInvoiceItem(item, index) {
  const csSu = parseCsSu(item.csSu || item.quantityCsSu || item.caseDisplay);
  const quantity = toNumber(pick(item.quantity, item.qty, item.totalQty, item.csSuUnitQty, item.unitQty));
  const priceAfterTaxBeforePromotion = toNumber(pick(
    item.priceAfterTaxBeforePromotion,
    item.priceAfterVatBeforeDiscount,
    item.listPriceAfterVat,
    item.salePrice,
    item.price,
    item.unitPrice
  ));
  const priceBeforeTaxBeforePromotion = toNumber(pick(
    item.priceBeforeTaxBeforePromotion,
    item.priceBeforeTax,
    item.priceBeforeVat,
    item.listPriceBeforeVat,
    Math.round(priceAfterTaxBeforePromotion / 1.08)
  ));
  const discountPercent = toNumber(item.discountPercent);
  const priceAfterTaxAfterPromotion = toNumber(pick(
    item.priceAfterTaxAfterPromotion,
    item.priceAfterPromotion,
    item.priceAfterVatAfterDiscount,
    item.priceAfterDiscount,
    discountPercent > 0
      ? Math.round(priceAfterTaxBeforePromotion * (1 - discountPercent / 100))
      : priceAfterTaxBeforePromotion
  ));
  const vatAmount = toNumber(pick(
    item.vatAmount,
    item.tax,
    item.taxAmount,
    Math.round((priceAfterTaxAfterPromotion - priceAfterTaxAfterPromotion / 1.08) * quantity)
  ));
  const lineAmount = toNumber(pick(
    item.lineAmount,
    item.amount,
    Math.round(quantity * priceAfterTaxAfterPromotion)
  ));

  return {
    lineNo: item.lineNo || item.stt || index + 1,
    productCode: String(pick(item.productCode, item.code, item.sku, item.maHang)).trim(),
    productName: String(pick(item.productName, item.name, item.tenHang)).trim(),
    quantityCsSu: item.csSu || item.quantityCsSu || item.caseDisplay || `${csSu.cartonQty}/${csSu.csSuUnitQty}`,
    cartonQty: toNumber(pick(item.cartonQty, item.caseQty, csSu.cartonQty)),
    unitQtyFromCsSu: toNumber(pick(item.unitQtyFromCsSu, item.unitQty, csSu.csSuUnitQty)),
    unitQty: toNumber(pick(item.unitQty, csSu.csSuUnitQty)),
    csSuUnitQty: toNumber(pick(item.csSuUnitQty, item.unitQty, csSu.csSuUnitQty)),
    quantity,
    priceBeforeTaxBeforePromotion,
    priceBeforeTax: priceBeforeTaxBeforePromotion,
    priceAfterTaxBeforePromotion,
    priceAfterTaxAfterPromotion,
    priceAfterPromotion: priceAfterTaxAfterPromotion,
    discountPercent,
    vatAmount,
    lineAmount,
    isPromotionGift: Boolean(item.isPromotionGift || item.isPromo || item.lineType === 'PROMO'),
    promotionCode: item.promotionCode || '',
    promotionRows: Array.isArray(item.promotionRows)
      ? item.promotionRows
      : normalizeItemPromotionRows(item, {
          productCode: String(pick(item.productCode, item.code, item.sku, item.maHang)).trim(),
          productName: String(pick(item.productName, item.name, item.tenHang)).trim(),
          quantity,
          qty: quantity,
          gsvAmount: quantity * priceAfterTaxBeforePromotion,
          lineAmount,
          discountPercent,
          isPromo: Boolean(item.isPromotionGift || item.isPromo || item.lineType === 'PROMO')
        })
  };
}

function normalizeInvoicePromotion(row = {}) {
  return {
    productCode: String(row.productCode || row.maHang || '').trim(),
    productName: String(row.productName || row.tenHang || '').trim(),
    lineType: row.lineType || row.type || '',
    quantity: toNumber(row.quantity || row.qty),
    promotionCode: String(row.promotionCode || row.code || '').trim(),
    code: String(row.promotionCode || row.code || '').trim(),
    description: String(row.description || row.name || '').trim(),
    qualifiedAmount: toNumber(row.qualifiedAmount || row.basisAmount),
    basisAmount: toNumber(row.qualifiedAmount || row.basisAmount),
    discountPercent: toNumber(row.discountPercent || row.percent),
    percent: toNumber(row.discountPercent || row.percent),
    discountBeforeTax: toNumber(row.discountBeforeTax || row.beforeTax),
    beforeTax: toNumber(row.discountBeforeTax || row.beforeTax),
    discountAfterTax: toNumber(row.discountAfterTax || row.afterTax),
    afterTax: toNumber(row.discountAfterTax || row.afterTax)
  };
}

function normalizeInvoiceOffset(row = {}) {
  return {
    programCode: String(row.programCode || row.code || '').trim(),
    description: String(row.description || row.name || '').trim(),
    displayMonth: row.displayMonth || row.month || '',
    month: row.month || row.displayMonth || '',
    goodsAmount: toNumber(row.goodsAmount),
    quantityText: row.quantityText || row.quantity || '',
    offsetAmount: toNumber(row.offsetAmount)
  };
}

function calculateDeliveryInvoiceSummary(payload = {}) {
  const items = Array.isArray(payload.items) ? payload.items : [];
  const promotions = Array.isArray(payload.promotions) ? payload.promotions : [];
  const offsets = Array.isArray(payload.offsets) ? payload.offsets : [];

  const totalQty = items.reduce((sum, item) => sum + toNumber(item.quantity), 0);
  const goodsAmountAfterPromotion = items.reduce((sum, item) => sum + toNumber(item.lineAmount), 0);
  const grossAmountBeforePromotion = items.reduce(
    (sum, item) => sum + toNumber(item.quantity) * toNumber(item.priceAfterTaxBeforePromotion),
    0
  );
  const totalVatAmount = items.reduce((sum, item) => sum + toNumber(item.vatAmount), 0);
  const totalPromotionAmount = payload.totalPromotionAmount !== undefined
    ? toNumber(payload.totalPromotionAmount)
    : promotions.reduce((sum, item) => sum + toNumber(item.discountAfterTax), 0);
  const totalOffsetAmount = payload.totalOffsetAmount !== undefined
    ? toNumber(payload.totalOffsetAmount)
    : offsets.reduce((sum, item) => sum + toNumber(item.offsetAmount), 0);
  const nppDiscountAmount = toNumber(payload.nppDiscountAmount || payload.summary?.nppDiscountAmount);
  const payableAmount = payload.payableAmount !== undefined
    ? toNumber(payload.payableAmount)
    : goodsAmountAfterPromotion - totalOffsetAmount - nppDiscountAmount;
  const promotionRate = grossAmountBeforePromotion > 0
    ? Number((((totalPromotionAmount + nppDiscountAmount) / grossAmountBeforePromotion) * 100).toFixed(2))
    : 0;

  return {
    totalQty,
    totalVatAmount,
    goodsAmountAfterPromotion,
    grossAmountBeforePromotion,
    totalPromotionAmount,
    promotionAmount: totalPromotionAmount,
    totalOffsetAmount,
    displayRewardOffset: totalOffsetAmount,
    nppDiscountAmount,
    payableAmount,
    promotionRate
  };
}

function paginateDeliveryInvoice(payload = {}) {
  const items = Array.isArray(payload.items) ? payload.items : [];
  const promotions = Array.isArray(payload.promotions) ? payload.promotions : [];
  const offsets = Array.isArray(payload.offsets) ? payload.offsets : [];
  const detailRows = promotions.length + offsets.length;

  // Theo mẫu Invoice-36: trang hàng hóa tối đa khoảng 24 dòng.
  // Nếu còn chi tiết khuyến mãi/cấn trừ dài thì tách thêm trang diễn giải riêng.
  const itemPageSize = 24;
  const itemPageCount = Math.max(1, Math.ceil(items.length / itemPageSize));
  const detailNeedsOwnPage = detailRows > 4 || items.length > 18 || offsets.length > 0;
  const detailPageCount = detailRows > 0 && detailNeedsOwnPage ? 1 : 0;
  const pagesPerCopy = itemPageCount + detailPageCount;

  return {
    pagesPerCopy,
    copies: ['Liên 1', 'Liên 2'],
    showPromotionHeaderOnFirstPage: detailPageCount > 0,
    itemPageSize,
    itemPageCount,
    detailRows,
    firstPageItems: items.slice(0, itemPageSize),
    detailPagePromotions: promotions,
    detailPageOffsets: offsets
  };
}

function validateAgainstDmsSample(payload = {}) {
  const errors = [];
  const required = [
    ['header.invoiceCode', payload.header?.invoiceCode],
    ['header.orderCode', payload.header?.orderCode],
    ['customer.customerCode', payload.customer?.customerCode],
    ['customer.customerName', payload.customer?.customerName],
    ['salesStaff.staffCode', payload.salesStaff?.staffCode],
    ['items', Array.isArray(payload.items) && payload.items.length]
  ];
  for (const [field, value] of required) {
    if (!value) errors.push(`Thiếu ${field}`);
  }
  const recalculated = calculateDeliveryInvoiceSummary(payload);
  const summary = payload.summary || {};
  const checks = [
    ['totalQty', summary.totalQty, recalculated.totalQty],
    ['goodsAmountAfterPromotion', summary.goodsAmountAfterPromotion, recalculated.goodsAmountAfterPromotion],
    ['grossAmountBeforePromotion', summary.grossAmountBeforePromotion, recalculated.grossAmountBeforePromotion],
    ['payableAmount', summary.payableAmount, recalculated.payableAmount]
  ];
  for (const [field, actual, expected] of checks) {
    if (Math.abs(toNumber(actual) - toNumber(expected)) > 1) {
      errors.push(`${field} lệch: ${actual} != ${expected}`);
    }
  }
  return { ok: errors.length === 0, errors };
}

function buildDeliveryInvoicePayload(raw = {}) {
  const items = Array.isArray(raw.items) ? raw.items.map(normalizeInvoiceItem) : [];
  const explicitPromotions = Array.isArray(raw.promotions) ? raw.promotions.map(normalizeInvoicePromotion) : [];
  const itemPromotions = buildPromotionsFromInvoiceItems(items);
  // Quy tắc in đơn con: phần diễn giải khuyến mãi ưu tiên sinh từ từng dòng sản phẩm bán/KM.
  // Nếu đơn cũ chưa lưu khuyến mãi ở dòng hàng thì mới dùng danh sách promotions tổng hợp.
  const promotions = itemPromotions.length ? itemPromotions : explicitPromotions;
  const offsets = Array.isArray(raw.offsets) ? raw.offsets.map(normalizeInvoiceOffset) : [];

  const payload = {
    documentType: 'DELIVERY_PAYMENT_INVOICE',
    title: 'PHIẾU GIAO NHẬN VÀ THANH TOÁN',
    header: {
      invoiceCode: raw.invoiceCode || raw.header?.invoiceCode || '',
      orderCode: raw.orderCode || raw.header?.orderCode || '',
      orderDateTime: raw.orderDateTime || raw.header?.orderDateTime || '',
      invoiceType: raw.invoiceType || raw.header?.invoiceType || 'Từ NVTT',
      paymentTerm: raw.paymentTerm || raw.header?.paymentTerm || 'đáo hạn trong 7 ngày',
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
      amountInWords: raw.amountInWords || raw.summary?.amountInWords || '',
      nppDiscountAmount: toNumber(raw.nppDiscountAmount || raw.summary?.nppDiscountAmount)
    }
  };
  payload.summary = {
    ...payload.summary,
    ...calculateDeliveryInvoiceSummary({
      ...payload,
      totalPromotionAmount: raw.totalPromotionAmount,
      totalOffsetAmount: raw.totalOffsetAmount,
      nppDiscountAmount: raw.nppDiscountAmount,
      payableAmount: raw.payableAmount
    })
  };
  payload.pagination = paginateDeliveryInvoice(payload);
  payload.validation = validateAgainstDmsSample(payload);
  return payload;
}

function buildPrintData(document = {}, options = {}) {
  const items = normalizeItems(document);
  const promotions = normalizePromotions(document);
  const displayRewards = normalizeDisplayRewards(document);
  const warehouseGroups = buildWarehouseGroups(items);

  const totalQty = toNumber(pick(document.totalQuantity, document.totalQty, document.summary?.totalQty, items.reduce((sum, item) => sum + item.qty, 0)));
  // PRINT_PROMOTION_TOTALS_START
  const grossAmountBeforePromotion = toNumber(pick(
    document.grossAmountBeforePromotion,
    document.totalGrossAmount,
    document.grossAmount,
    document.summary?.grossAmountBeforePromotion,
    document.goodsAmount,
    document.subTotal,
    document.subtotal,
    items.reduce((sum, item) => sum + item.gsvAmount, 0)
  ));
  const goodsAmountAfterPromotion = toNumber(pick(
    document.goodsAmountAfterPromotion,
    document.netAmount,
    document.summary?.goodsAmountAfterPromotion,
    document.totalAmount,
    document.grandTotal,
    items.reduce((sum, item) => sum + item.amount, 0)
  ));
  const promotionValue = toNumber(pick(document.promotionValue, document.totalPromotionValue, document.totalPromotionAmount, document.totalDiscountAmount, document.promotionAmount, document.discountAmount, document.summary?.promotionAmount, promotions.reduce((sum, item) => sum + (item.afterTax || item.beforeTax || 0), 0)));
  // PRINT_PROMOTION_TOTALS_END
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
    invoiceCode: pick(document.invoiceCode, document.invoiceNo, document.soHoaDon, document.documentCode, document.code),
    orderCode: pick(document.customerOrderCode, document.soDonHang, document.orderCode, document.documentCode, document.code),
    orderDateTime: formatDateTime(pick(document.orderDateTime, document.date, document.createdAt)),
    invoiceType: pick(document.invoiceType, document.invoiceTypeName, document.orderSourceName, 'Từ NVTT'),
    paymentTerm: pick(document.terms, document.paymentTerms, document.paymentTerm, 'đáo hạn trong 7 ngày'),
    truckNo: pick(document.vehicleNo, document.truckNo, document.soXeTai),
    taxCode: pick(document.customerTaxCode, document.customer?.taxCode, document.mst),
    distributor: {
      code: pick(document.distributor?.code, options.companyCode, process.env.PRINT_COMPANY_CODE, '3293'),
      name: pick(document.distributor?.name, options.companyName, process.env.PRINT_COMPANY_NAME, 'Công Ty TNHH MTV Minh Khai'),
      address: pick(document.distributor?.address, options.companyAddress, process.env.PRINT_COMPANY_ADDRESS, 'Cầu Cánh Sẻ, Quang Bình, Kiến Xương, Thái Bình'),
      phone: pick(document.distributor?.phone, options.companyPhone, process.env.PRINT_COMPANY_PHONE, '')
    },
    customer: {
      customerCode: pick(document.customerCode, document.customer?.code, document.customerId),
      customerName: pick(document.customerName, document.customer?.name, document.supplier, document.supplierName),
      deliveryAddress: pick(document.customerAddress, document.customer?.address, document.address),
      phone: pick(document.customerPhone, document.customer?.phone, document.phone),
      taxCode: pick(document.customerTaxCode, document.customer?.taxCode, document.mst)
    },
    salesStaff: {
      staffCode: pick(document.staffCode, document.salesStaffCode, document.salesCode, document.salesStaffId),
      staffName: pick(document.staffName, document.salesStaffName, document.salesName, document.createdBy),
      phone: pick(document.staffPhone, document.salesStaffPhone, document.salesPhone)
    },
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
    masterKpis: Array.isArray(document.masterKpis) ? document.masterKpis : [],
    masterKpiTotals: document.masterKpiTotals || {},
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

module.exports = {
  buildPrintData,
  buildDeliveryInvoicePayload,
  calculateDeliveryInvoiceSummary,
  paginateDeliveryInvoice,
  validateAgainstDmsSample,
  formatMoney,
  formatDate,
  formatDateTime,
  numberToVietnameseWords
};
