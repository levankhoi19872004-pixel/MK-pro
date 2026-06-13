'use strict';

const { toNumber } = require('../../../utils/common.util');
const { PRINT_PROFILES, PRINT_DOCUMENT_TYPES, createPrintDocument, cleanText } = require('../PrintContract');
const { normalizeLine } = require('../PrintLineNormalizer');

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== '');
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
  const catalogPrice = toNumber(line.catalogPrice);
  const finalPrice = toNumber(line.finalPrice);
  const priceBeforeTax = toNumber(firstDefined(
    item.preTaxPriceAtOrder,
    item.priceBeforeTaxBeforePromotion,
    item.listPriceBeforeVat,
    item.priceBeforeTax,
    item.priceBeforeVat,
    catalogPrice > 0 ? Math.round(catalogPrice / 1.08) : 0
  ));
  const vatAmount = toNumber(firstDefined(
    item.vatAmountAtOrder,
    item.vatAmount,
    item.taxAmount,
    item.tax,
    finalPrice > 0 ? Math.round((finalPrice - (finalPrice / 1.08)) * quantity) : 0
  ));
  const lineAmount = toNumber(firstDefined(
    item.lineAmountAtOrder,
    item.lineAmount,
    item.amount,
    Math.round(quantity * finalPrice)
  ));

  return {
    ...line,
    priceBeforeTaxBeforePromotion: priceBeforeTax,
    priceAfterTaxBeforePromotion: catalogPrice,
    priceAfterTaxAfterPromotion: finalPrice,
    vatAmount,
    lineAmount
  };
}

function buildDmsExactSalesInvoice(order = {}, context = {}) {
  const productMap = context.productMap || new Map();
  const lines = (Array.isArray(order.items) ? order.items : []).map((item) => {
    const productCode = cleanText(item.productCode || item.code || item.sku || item.productId);
    return exactLine(item, order, productMap.get(productCode) || {});
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
    promotionRows: line.promotionRows,
    appliedPromotionRows: line.promotionRows
  }));

  const totalQty = lines.reduce((sum, line) => sum + toNumber(line.quantity), 0);
  const totalAmount = lines.reduce((sum, line) => sum + toNumber(line.lineAmount), 0);
  const invoiceCode = cleanText(order.invoiceCode || order.invoiceNo || order.soHoaDon || order.externalInvoiceCode || order.externalOrderCode || order.code || order.id);
  const orderCode = cleanText(order.customerOrderCode || order.soDonHang || order.orderCode || order.salesOrderCode || order.code || order.id);
  const documentDate = cleanText(order.orderDateTime || order.orderDate || order.date || order.documentDate || order.createdAt);
  const distributorInfo = distributor(order, context);

  const contract = createPrintDocument({
    profile: PRINT_PROFILES.SALES_INVOICE_DMS_EXACT_V1,
    type: PRINT_DOCUMENT_TYPES.SALES_ORDER,
    document: {
      id: order.id || order._id,
      code: order.code || order.orderCode || order.salesOrderCode || order.id,
      invoiceCode,
      customerOrderCode: orderCode,
      documentDate,
      sourceCodes: [order.code || order.id],
      copies: ['Liên 1', 'Liên 2'],
      status: order.status,
      title: 'PHIẾU GIAO NHẬN VÀ THANH TOÁN',
      printMode: 'SALES_INVOICE_DMS_EXACT_V1',
      note: order.note || ''
    },
    parties: {
      customer: customer(order),
      distributor: distributorInfo,
      salesStaff: salesStaff(order),
      deliveryStaff: {
        code: cleanText(order.deliveryStaffCode || order.deliveryCode),
        name: cleanText(order.deliveryStaffName || order.deliveryName),
        phone: cleanText(order.deliveryStaffPhone || order.deliveryPhone)
      }
    },
    lines,
    totals: {
      totalQty,
      totalAmount,
      paidAmount: toNumber(order.paidAmount || order.paid),
      debtAmount: toNumber(order.debtAmount || order.debt)
    },
    metadata: {
      source: cleanText(order.source || order.orderSource),
      pricingPolicy: 'ORDER_SNAPSHOT_ONLY_WITH_LEGACY_FALLBACK',
      exactReference: 'Invoice-36',
      pageSize: 'LETTER'
    }
  });

  return {
    ...order,
    invoiceCode,
    invoiceNo: invoiceCode,
    customerOrderCode: orderCode,
    orderDateTime: documentDate,
    distributor: distributorInfo,
    items: normalizedItems,
    orderDate: order.orderDate || contract.document.documentDate,
    date: order.orderDate || contract.document.documentDate,
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
    totalAmount: toNumber(order.totalAmount || totalAmount),
    goodsAmount: toNumber(order.goodsAmount || order.grossAmountBeforePromotion || totalAmount),
    promotions: Array.isArray(order.promotions) ? order.promotions : [],
    offsets: Array.isArray(order.offsets) ? order.offsets : (Array.isArray(order.displayRewards) ? order.displayRewards : []),
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
