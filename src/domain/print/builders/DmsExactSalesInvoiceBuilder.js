'use strict';

const { toNumber } = require('../../../utils/common.util');
const { PRINT_PROFILES, PRINT_DOCUMENT_TYPES, createPrintDocument, cleanText } = require('../PrintContract');
const { normalizeLine } = require('../PrintLineNormalizer');
const PrintPromotionPolicy = require('../PrintPromotionPolicy');
const ProductCatalogExportPolicy = require('../../catalog/ProductCatalogExportPolicy');
const { getCompanyProfile } = require('../../../config/company-profile.config');

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== '');
}

function firstPositive(...values) {
  for (const value of values) {
    const number = toNumber(value);
    if (number > 0) return number;
  }
  return 0;
}

function calculateVatFromAmount(amount = 0) {
  const total = toNumber(amount);
  if (total <= 0) return 0;
  return Math.max(0, Math.round(total - (total / 1.08)));
}


function moneyPromotionValue(row = {}) {
  return toNumber(firstDefined(
    row.discountAfterTax,
    row.afterTax,
    row.ckAfterTax,
    row.discountAmountAfterTax,
    row.amountAfterTax,
    row.promotionAfterTax,
    row.discountAmount,
    row.amount,
    0
  ));
}

function goodsPromotionValue(row = {}) {
  return toNumber(firstDefined(
    row.goodsPromotionAmount,
    row.promotionGoodsAmount,
    row.freeGoodsValue,
    row.giftValue,
    row.giftAmount,
    row.goodsAmount,
    0
  ));
}

function flattenPromotionRows(lines = [], sourceOrder = {}) {
  const rows = [];
  for (const line of lines) {
    for (const row of Array.isArray(line.promotionRows) ? line.promotionRows : []) rows.push(row);
  }
  for (const row of Array.isArray(sourceOrder.promotions) ? sourceOrder.promotions : []) rows.push(row);
  return rows;
}

function calculatePromotionSummary(lines = [], sourceOrder = {}) {
  const rows = flattenPromotionRows(lines, sourceOrder);
  const totalMoneyPromotionAmount = rows.reduce((sum, row) => sum + moneyPromotionValue(row), 0);
  const explicitGoodsPromotion = toNumber(firstDefined(
    sourceOrder.totalGoodsPromotionAmount,
    sourceOrder.goodsPromotionAmount,
    sourceOrder.promotionGoodsAmount,
    sourceOrder.summary?.totalGoodsPromotionAmount,
    sourceOrder.summary?.goodsPromotionAmount,
    0
  ));
  const rowGoodsPromotion = rows.reduce((sum, row) => sum + goodsPromotionValue(row), 0);
  const totalGoodsPromotionAmount = explicitGoodsPromotion > 0 ? explicitGoodsPromotion : rowGoodsPromotion;
  const explicitTotalPromotion = toNumber(firstDefined(
    sourceOrder.totalPromotionAmount,
    sourceOrder.promotionAmount,
    sourceOrder.promotionValue,
    sourceOrder.totalDiscountAmount,
    sourceOrder.discountAmount,
    sourceOrder.summary?.totalPromotionAmount,
    sourceOrder.summary?.promotionAmount,
    0
  ));
  const calculatedTotalPromotion = totalGoodsPromotionAmount + totalMoneyPromotionAmount;
  const totalPromotionAmount = calculatedTotalPromotion > 0 ? calculatedTotalPromotion : explicitTotalPromotion;
  return {
    totalMoneyPromotionAmount,
    totalGoodsPromotionAmount,
    totalPromotionAmount,
    promotionRows: rows
  };
}


function productCatalogPrice(product = {}) {
  return firstPositive(product.salePrice, product.giaBan, product.price);
}

function hasProductCatalogSnapshot(item = {}) {
  const source = cleanText(
    item.catalogSalePriceSource ||
    item.catalogPriceSource ||
    item.priceAfterTaxBeforePromotionSource
  ).toLowerCase();
  return source === 'product.saleprice' || source === 'product.sale_price';
}

function catalogPriceForLine(item = {}, order = {}, product = {}, normalizedLine = {}, finalPrice = 0) {
  const snapshotPrice = firstPositive(
    item.catalogSalePriceAtOrder,
    item.priceAfterTaxBeforePromotionAtOrder,
    item.priceAfterTaxBeforePromotion,
    item.listPriceAfterVat,
    item.productSnapshot?.salePrice
  );
  const currentProductPrice = productCatalogPrice(product);

  // Đơn DMS cũ từng lưu nhầm giá thực tế import vào catalogSalePriceAtOrder.
  // Nếu chưa có marker nguồn snapshot mới, ưu tiên product.salePrice để khôi phục cột 4.
  // Đơn import mới có marker product.salePrice sẽ giữ nguyên snapshot lịch sử.
  if (PrintPromotionPolicy.isImportedOrder(order)) {
    if (hasProductCatalogSnapshot(item) && snapshotPrice > 0) return snapshotPrice;
    if (currentProductPrice > 0) return currentProductPrice;
  }

  return firstPositive(
    snapshotPrice,
    normalizedLine.catalogPrice,
    currentProductPrice,
    finalPrice
  );
}

function salesStaff(order = {}) {
  return {
    id: cleanText(order.salesStaffId || order.salesmanId),
    code: cleanText(order.salesStaffCode || order.salesPersonCode || order.salesmanCode || order.nvbhCode || order.maNVBH),
    name: cleanText(order.salesStaffName || order.salesPersonName || order.salesmanName || order.nvbhName || order.maNVBHName),
    phone: cleanText(order.salesStaffPhone || order.salesmanPhone || order.staffPhone)
  };
}

function customer(order = {}) {
  return {
    id: cleanText(order.customerId || order.customer?._id || order.customer?.id),
    code: cleanText(order.customerCode || order.customer?.code),
    name: cleanText(order.customerName || order.customer?.name),
    address: cleanText(order.customerAddress || order.deliveryAddress || order.address || order.customer?.address),
    phone: cleanText(order.customerPhone || order.phone || order.customer?.phone),
    taxCode: cleanText(order.customerTaxCode || order.customer?.taxCode || order.mst)
  };
}

function distributor(order = {}, context = {}) {
  const companyProfile = getCompanyProfile();
  return {
    code: cleanText(order.distributorCode || order.distributor?.code || context.companyCode || companyProfile.code),
    name: cleanText(order.distributorName || order.distributor?.name || context.companyName || companyProfile.name),
    address: cleanText(order.distributorAddress || order.distributor?.address || context.companyAddress || companyProfile.address),
    phone: cleanText(order.distributorPhone || order.distributor?.phone || context.companyPhone || companyProfile.phone)
  };
}

function exactLine(item = {}, order = {}, product = {}) {
  const line = normalizeLine(item, { parent: order, product, mode: 'sale' });
  const catalogExcel = ProductCatalogExportPolicy.metadata(product);
  const quantity = toNumber(line.quantity);
  const isPromotionLine = line.lineType === 'PROMO';
  const finalPrice = isPromotionLine ? 0 : firstPositive(
    item.finalPriceAtOrder,
    item.finalPrice,
    item.priceAfterTaxAfterPromotion,
    item.priceAfterPromotion,
    item.priceAfterDiscount,
    line.finalPrice,
    item.salePrice,
    item.price
  );
  const catalogPrice = isPromotionLine ? 0 : catalogPriceForLine(item, order, product, line, finalPrice);
  const lineAmount = isPromotionLine ? 0 : firstPositive(
    item.lineAmountAtOrder,
    item.lineAmount,
    item.amount,
    quantity > 0 && finalPrice > 0 ? Math.round(quantity * finalPrice) : 0
  );
  // Cột 3 của mẫu đơn con được suy ra trực tiếp từ cột 4.
  // Dòng khuyến mại/hàng tặng import phải giữ snapshot giá bằng 0, không fallback giá danh mục.
  const priceBeforeTax = isPromotionLine ? 0 : (catalogPrice > 0
    ? Math.round(catalogPrice / 1.08)
    : firstPositive(
      item.preTaxPriceAtOrder,
      item.priceBeforeTaxBeforePromotion,
      item.listPriceBeforeVat,
      item.priceBeforeTax,
      item.priceBeforeVat,
      finalPrice > 0 ? Math.round(finalPrice / 1.08) : 0
    ));

  // Một số đơn DMS cũ đã lưu snapshot Thuế/giá trước thuế bằng 0.
  // Giá trị 0 không được chặn fallback tính toán cho dòng hàng bán có tiền.
  const explicitVat = firstPositive(
    item.vatAmountAtOrder,
    item.vatAmount,
    item.taxAmount,
    item.tax
  );
  const vatAmount = isPromotionLine
    ? 0
    : (explicitVat || calculateVatFromAmount(lineAmount) || (
      finalPrice > 0 ? Math.round((finalPrice - (finalPrice / 1.08)) * quantity) : 0
    ));

  return {
    ...line,
    catalogPrice,
    catalogPackingQty: catalogExcel.packingQty,
    currentCatalogSalePrice: isPromotionLine ? 0 : catalogExcel.salePrice,
    finalPrice,
    priceBeforeTaxBeforePromotion: priceBeforeTax,
    priceAfterTaxBeforePromotion: catalogPrice,
    priceAfterTaxAfterPromotion: finalPrice,
    vatAmount,
    lineAmount
  };
}

function buildDmsExactSalesInvoice(order = {}, context = {}) {
  const suppressPromotions = PrintPromotionPolicy.shouldSuppressPromotionDetails(order);
  const sourceOrder = suppressPromotions ? PrintPromotionPolicy.suppressPromotionDetails(order) : order;
  const productMap = context.productMap || new Map();
  const lines = (Array.isArray(sourceOrder.items) ? sourceOrder.items : []).map((item) => {
    const productCode = cleanText(item.productCode || item.code || item.sku || item.productId);
    return exactLine(item, sourceOrder, productMap.get(productCode) || {});
  });

  const normalizedItems = lines.map((line, index) => ({
    ...line.raw,
    lineNo: index + 1,
    stt: index + 1,
    productCode: line.productCode,
    code: line.productCode,
    productName: line.productName,
    name: line.productName,
    unit: line.baseUnit,
    quantity: line.quantity,
    qty: line.quantity,
    conversionRate: line.conversionRate,
    conversionRateAtOrder: line.conversionRate,
    packingQty: line.conversionRate,
    catalogPackingQty: line.catalogPackingQty,
    cartonQty: line.cartonQty,
    unitQty: line.looseQty,
    caseDisplay: line.cartonUnitDisplay,
    quantityCsSu: line.cartonUnitDisplay,
    warehouseCode: line.warehouseCode,
    warehouseName: line.warehouseName,
    lineType: line.lineType,
    isPromo: line.lineType === 'PROMO',
    catalogSalePrice: line.catalogPrice,
    currentCatalogSalePrice: line.currentCatalogSalePrice,
    catalogSalePriceAtOrder: line.catalogPrice,
    catalogSalePriceSource: line.raw?.catalogSalePriceSource || line.raw?.catalogPriceSource || '',
    priceAfterTaxBeforePromotionSource: line.raw?.priceAfterTaxBeforePromotionSource || '',
    salePrice: line.catalogPrice,
    finalPrice: line.finalPrice,
    priceAfterPromotion: line.finalPrice,
    priceAfterDiscount: line.finalPrice,
    preTaxPriceAtOrder: line.priceBeforeTaxBeforePromotion,
    priceBeforeTaxBeforePromotion: line.priceBeforeTaxBeforePromotion,
    priceAfterTaxBeforePromotion: line.priceAfterTaxBeforePromotion,
    priceAfterTaxAfterPromotion: line.priceAfterTaxAfterPromotion,
    vatAmountAtOrder: line.vatAmount,
    vatAmount: line.vatAmount,
    lineAmountAtOrder: line.lineAmount,
    lineAmount: line.lineAmount,
    amount: line.lineAmount,
    promotionRows: suppressPromotions ? [] : line.promotionRows,
    appliedPromotionRows: suppressPromotions ? [] : line.promotionRows,
    promotionCode: suppressPromotions ? '' : (line.raw?.promotionCode || ''),
    promotionDescription: suppressPromotions ? '' : (line.raw?.promotionDescription || ''),
    discountPercent: suppressPromotions ? 0 : toNumber(line.raw?.discountPercent)
  }));

  const totalQty = lines.reduce((sum, line) => sum + toNumber(line.quantity), 0);
  const totalAmount = lines.reduce((sum, line) => sum + toNumber(line.lineAmount), 0);
  const grossAmountBeforePromotion = lines.reduce(
    (sum, line) => sum + (toNumber(line.quantity) * toNumber(line.priceAfterTaxBeforePromotion)),
    0
  );
  const promotionSummary = suppressPromotions
    ? { totalMoneyPromotionAmount: 0, totalGoodsPromotionAmount: 0, totalPromotionAmount: 0, promotionRows: [] }
    : calculatePromotionSummary(lines, sourceOrder);
  const nppDiscountAmount = toNumber(firstDefined(
    sourceOrder.nppDiscountAmount,
    sourceOrder.summary?.nppDiscountAmount,
    0
  ));
  const promotionRate = grossAmountBeforePromotion > 0
    ? Number((((promotionSummary.totalPromotionAmount + nppDiscountAmount) / grossAmountBeforePromotion) * 100).toFixed(2))
    : 0;
  const invoiceCode = cleanText(sourceOrder.invoiceCode || sourceOrder.invoiceNo || sourceOrder.soHoaDon || sourceOrder.externalInvoiceCode || sourceOrder.externalOrderCode || sourceOrder.code || sourceOrder.id);
  const orderCode = cleanText(sourceOrder.customerOrderCode || sourceOrder.soDonHang || sourceOrder.orderCode || sourceOrder.salesOrderCode || sourceOrder.code || sourceOrder.id);
  const documentDate = cleanText(sourceOrder.orderDateTime || sourceOrder.orderDate || sourceOrder.date || sourceOrder.documentDate || sourceOrder.createdAt);
  const distributorInfo = distributor(sourceOrder, context);

  const contract = createPrintDocument({
    profile: PRINT_PROFILES.SALES_INVOICE_DMS_EXACT_V1,
    type: PRINT_DOCUMENT_TYPES.SALES_ORDER,
    document: {
      id: sourceOrder.id || sourceOrder._id,
      code: sourceOrder.code || sourceOrder.orderCode || sourceOrder.salesOrderCode || sourceOrder.id,
      invoiceCode,
      customerOrderCode: orderCode,
      documentDate,
      sourceCodes: [sourceOrder.code || sourceOrder.id],
      copies: ['Liên 1', 'Liên 2'],
      status: sourceOrder.status,
      title: 'PHIẾU GIAO NHẬN VÀ THANH TOÁN',
      printMode: 'SALES_INVOICE_DMS_EXACT_V1',
      note: sourceOrder.note || ''
    },
    parties: {
      customer: customer(sourceOrder),
      distributor: distributorInfo,
      salesStaff: salesStaff(sourceOrder),
      deliveryStaff: {
        code: cleanText(sourceOrder.deliveryStaffCode || sourceOrder.deliveryCode),
        name: cleanText(sourceOrder.deliveryStaffName || sourceOrder.deliveryName),
        phone: cleanText(sourceOrder.deliveryStaffPhone || sourceOrder.deliveryPhone)
      }
    },
    lines,
    totals: {
      totalQty,
      totalAmount,
      paidAmount: toNumber(sourceOrder.paidAmount || sourceOrder.paid),
      debtAmount: toNumber(sourceOrder.debtAmount || sourceOrder.debt)
    },
    metadata: {
      source: cleanText(sourceOrder.source || sourceOrder.orderSource),
      pricingPolicy: 'ORDER_SNAPSHOT_ONLY_WITH_LEGACY_FALLBACK',
      exactReference: 'Invoice-36',
      pageSize: 'LETTER'
    }
  });

  return {
    ...sourceOrder,
    invoiceCode,
    invoiceNo: invoiceCode,
    customerOrderCode: orderCode,
    orderDateTime: documentDate,
    distributor: distributorInfo,
    items: normalizedItems,
    orderDate: sourceOrder.orderDate || contract.document.documentDate,
    date: sourceOrder.orderDate || contract.document.documentDate,
    salesStaffCode: contract.parties.salesStaff.code,
    salesStaffName: contract.parties.salesStaff.name,
    salesStaffPhone: contract.parties.salesStaff.phone,
    customerCode: contract.parties.customer.code,
    customerName: contract.parties.customer.name,
    customerAddress: contract.parties.customer.address,
    customerPhone: contract.parties.customer.phone,
    customerTaxCode: contract.parties.customer.taxCode,
    totalQuantity: totalQty,
    totalQty,
    totalAmount,
    goodsAmount: grossAmountBeforePromotion,
    grossAmountBeforePromotion,
    goodsAmountAfterPromotion: totalAmount,
    promotions: suppressPromotions ? [] : (Array.isArray(sourceOrder.promotions) ? sourceOrder.promotions : []),
    offsets: Array.isArray(sourceOrder.offsets) ? sourceOrder.offsets : (Array.isArray(sourceOrder.displayRewards) ? sourceOrder.displayRewards : []),
    totalPromotionAmount: promotionSummary.totalPromotionAmount,
    promotionAmount: promotionSummary.totalMoneyPromotionAmount,
    promotionValue: promotionSummary.totalPromotionAmount,
    totalMoneyPromotionAmount: promotionSummary.totalMoneyPromotionAmount,
    totalGoodsPromotionAmount: promotionSummary.totalGoodsPromotionAmount,
    nppDiscountAmount,
    promotionRate,
    printPromotionSuppressed: suppressPromotions,
    printContract: contract,
    printProfile: contract.profile,
    printMode: contract.document.printMode,
    printPricingSource: contract.metadata.pricingPolicy,
    printPackSource: contract.metadata.pricingPolicy
  };
}

module.exports = {
  buildDmsExactSalesInvoice,
  buildSalesInvoice: buildDmsExactSalesInvoice,
  catalogPriceForLine,
  hasProductCatalogSnapshot
};
