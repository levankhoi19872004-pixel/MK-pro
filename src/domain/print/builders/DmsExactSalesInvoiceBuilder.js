'use strict';

const { toNumber } = require('../../../utils/common.util');
const { PRINT_PROFILES, PRINT_DOCUMENT_TYPES, createPrintDocument, cleanText } = require('../PrintContract');
const { normalizeLine } = require('../PrintLineNormalizer');
const PrintPromotionPolicy = require('../PrintPromotionPolicy');

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
  return {
    code: cleanText(order.distributorCode || order.distributor?.code || context.companyCode || process.env.PRINT_COMPANY_CODE || '3293'),
    name: cleanText(order.distributorName || order.distributor?.name || context.companyName || process.env.PRINT_COMPANY_NAME || 'Công Ty TNHH MTV Minh Khai'),
    address: cleanText(order.distributorAddress || order.distributor?.address || context.companyAddress || process.env.PRINT_COMPANY_ADDRESS || 'Cầu Cánh Sẻ, Quang Bình, Kiến Xương, Thái Bình'),
    phone: cleanText(order.distributorPhone || order.distributor?.phone || context.companyPhone || process.env.PRINT_COMPANY_PHONE || '')
  };
}

function exactLine(item = {}, order = {}, product = {}) {
  const line = normalizeLine(item, { parent: order, product, mode: 'sale' });
  const quantity = toNumber(line.quantity);
  const finalPrice = firstPositive(
    item.finalPriceAtOrder,
    item.finalPrice,
    item.priceAfterTaxAfterPromotion,
    item.priceAfterPromotion,
    item.priceAfterDiscount,
    line.finalPrice,
    item.salePrice,
    item.price
  );
  const catalogPrice = firstPositive(
    item.catalogSalePriceAtOrder,
    item.priceAfterTaxBeforePromotionAtOrder,
    item.priceAfterTaxBeforePromotion,
    item.listPriceAfterVat,
    line.catalogPrice,
    finalPrice
  );
  const lineAmount = firstPositive(
    item.lineAmountAtOrder,
    item.lineAmount,
    item.amount,
    quantity > 0 && finalPrice > 0 ? Math.round(quantity * finalPrice) : 0
  );
  const priceBeforeTax = firstPositive(
    item.preTaxPriceAtOrder,
    item.priceBeforeTaxBeforePromotion,
    item.listPriceBeforeVat,
    item.priceBeforeTax,
    item.priceBeforeVat,
    catalogPrice > 0 ? Math.round(catalogPrice / 1.08) : 0,
    finalPrice > 0 ? Math.round(finalPrice / 1.08) : 0
  );

  // Một số đơn DMS cũ đã lưu snapshot Thuế/giá trước thuế bằng 0.
  // Giá trị 0 không được chặn fallback tính toán cho dòng hàng bán có tiền.
  const explicitVat = firstPositive(
    item.vatAmountAtOrder,
    item.vatAmount,
    item.taxAmount,
    item.tax
  );
  const vatAmount = line.lineType === 'PROMO'
    ? 0
    : (explicitVat || calculateVatFromAmount(lineAmount) || (
      finalPrice > 0 ? Math.round((finalPrice - (finalPrice / 1.08)) * quantity) : 0
    ));

  return {
    ...line,
    catalogPrice,
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
    cartonQty: line.cartonQty,
    unitQty: line.looseQty,
    caseDisplay: line.cartonUnitDisplay,
    quantityCsSu: line.cartonUnitDisplay,
    warehouseCode: line.warehouseCode,
    warehouseName: line.warehouseName,
    lineType: line.lineType,
    isPromo: line.lineType === 'PROMO',
    catalogSalePrice: line.catalogPrice,
    catalogSalePriceAtOrder: line.catalogPrice,
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
    totalAmount: toNumber(sourceOrder.totalAmount || totalAmount),
    goodsAmount: suppressPromotions
      ? toNumber(sourceOrder.totalAmount || totalAmount)
      : toNumber(sourceOrder.goodsAmount || sourceOrder.grossAmountBeforePromotion || totalAmount),
    promotions: suppressPromotions ? [] : (Array.isArray(sourceOrder.promotions) ? sourceOrder.promotions : []),
    offsets: Array.isArray(sourceOrder.offsets) ? sourceOrder.offsets : (Array.isArray(sourceOrder.displayRewards) ? sourceOrder.displayRewards : []),
    totalPromotionAmount: suppressPromotions ? 0 : toNumber(sourceOrder.totalPromotionAmount),
    promotionAmount: suppressPromotions ? 0 : toNumber(sourceOrder.promotionAmount),
    promotionValue: suppressPromotions ? 0 : toNumber(sourceOrder.promotionValue),
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
  buildSalesInvoice: buildDmsExactSalesInvoice
};
