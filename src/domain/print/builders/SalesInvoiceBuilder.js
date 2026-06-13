'use strict';

const { toNumber } = require('../../../utils/common.util');
const { PRINT_PROFILES, PRINT_DOCUMENT_TYPES, createPrintDocument, cleanText } = require('../PrintContract');
const { normalizeLine } = require('../PrintLineNormalizer');

function salesStaff(order = {}) {
  return {
    id: cleanText(order.salesStaffId || order.salesmanId),
    code: cleanText(order.salesStaffCode || order.salesPersonCode || order.salesmanCode || order.nvbhCode || order.maNVBH),
    name: cleanText(order.salesStaffName || order.salesPersonName || order.salesmanName || order.nvbhName || order.maNVBHName),
    phone: cleanText(order.salesStaffPhone || order.salesmanPhone)
  };
}

function customer(order = {}) {
  return {
    id: cleanText(order.customerId || order.customer?._id || order.customer?.id),
    code: cleanText(order.customerCode || order.customer?.code),
    name: cleanText(order.customerName || order.customer?.name),
    address: cleanText(order.customerAddress || order.address || order.customer?.address),
    phone: cleanText(order.customerPhone || order.phone || order.customer?.phone),
    taxCode: cleanText(order.customerTaxCode || order.customer?.taxCode || order.mst)
  };
}

function buildSalesInvoice(order = {}, context = {}) {
  const productMap = context.productMap || new Map();
  const lines = (Array.isArray(order.items) ? order.items : []).map((item) => {
    const productCode = cleanText(item.productCode || item.code || item.sku || item.productId);
    return normalizeLine(item, {
      parent: order,
      product: productMap.get(productCode) || {},
      mode: 'sale'
    });
  });

  const normalizedItems = lines.map((line) => ({
    ...line.raw,
    productCode: line.productCode,
    code: line.productCode,
    productName: line.productName,
    name: line.productName,
    unit: line.baseUnit,
    quantity: line.quantity,
    qty: line.quantity,
    conversionRate: line.conversionRate,
    packingQty: line.conversionRate,
    cartonQty: line.cartonQty,
    unitQty: line.looseQty,
    caseDisplay: line.cartonUnitDisplay,
    warehouseCode: line.warehouseCode,
    warehouseName: line.warehouseName,
    lineType: line.lineType,
    isPromo: line.lineType === 'PROMO',
    catalogSalePrice: line.catalogPrice,
    salePrice: line.catalogPrice,
    finalPrice: line.finalPrice,
    priceAfterPromotion: line.finalPrice,
    priceAfterDiscount: line.finalPrice,
    lineAmount: line.lineAmount,
    amount: line.lineAmount,
    promotionRows: line.promotionRows
  }));

  const totalQty = lines.reduce((sum, line) => sum + toNumber(line.quantity), 0);
  const totalAmount = lines.reduce((sum, line) => sum + toNumber(line.lineAmount), 0);

  const contract = createPrintDocument({
    profile: PRINT_PROFILES.SALES_INVOICE,
    type: PRINT_DOCUMENT_TYPES.SALES_ORDER,
    document: {
      id: order.id || order._id,
      code: order.code || order.orderCode || order.salesOrderCode || order.id,
      documentDate: order.orderDate || order.date || order.documentDate || order.createdAt,
      sourceCodes: [order.code || order.id],
      status: order.status,
      title: 'PHIẾU GIAO NHẬN VÀ THANH TOÁN',
      printMode: 'SALES_INVOICE_SINGLE',
      note: order.note || ''
    },
    parties: {
      customer: customer(order),
      salesStaff: salesStaff(order),
      deliveryStaff: {
        code: cleanText(order.deliveryStaffCode || order.deliveryCode),
        name: cleanText(order.deliveryStaffName || order.deliveryName)
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
      pricingPolicy: 'ORDER_SNAPSHOT_FIRST_PRODUCT_FALLBACK'
    }
  });

  return {
    ...order,
    items: normalizedItems,
    orderDate: contract.document.documentDate,
    date: contract.document.documentDate,
    salesStaffCode: contract.parties.salesStaff.code,
    salesStaffName: contract.parties.salesStaff.name,
    customerCode: contract.parties.customer.code,
    customerName: contract.parties.customer.name,
    customerAddress: contract.parties.customer.address,
    customerPhone: contract.parties.customer.phone,
    totalQuantity: totalQty,
    totalQty,
    totalAmount: toNumber(order.totalAmount || totalAmount),
    goodsAmount: toNumber(order.goodsAmount || totalAmount),
    printContract: contract,
    printProfile: contract.profile,
    printMode: contract.document.printMode,
    printPricingSource: contract.metadata.pricingPolicy,
    printPackSource: contract.metadata.pricingPolicy
  };
}

module.exports = {
  buildSalesInvoice
};
