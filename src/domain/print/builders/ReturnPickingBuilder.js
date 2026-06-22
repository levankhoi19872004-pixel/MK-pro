'use strict';

const { toNumber } = require('../../../utils/common.util');
const { PRINT_PROFILES, PRINT_DOCUMENT_TYPES, createPrintDocument, cleanText, uniqueText } = require('../PrintContract');
const { normalizeLine } = require('../PrintLineNormalizer');
const { mergeLines } = require('../PrintMergeService');
const ProductCatalogExportPolicy = require('../../catalog/ProductCatalogExportPolicy');
const { sortProductsByPickingZoneThenNameAsc } = require('../../../utils/productSort');

function buildReturnKpis(children = [], productMap = new Map()) {
  const rows = children.map((child) => {
    const saleAmount = (Array.isArray(child.items) ? child.items : []).reduce((sum, item) => {
      const productCode = cleanText(item.productCode || item.code || item.sku || item.productId);
      const line = normalizeLine(item, { parent: child, product: productMap.get(productCode) || {}, mode: 'return' });
      return sum + line.quantity * line.finalPrice;
    }, 0);
    const payableAmount = toNumber(child.debtReduction ?? child.totalAmount ?? child.amount ?? saleAmount);
    return {
      code: cleanText(child.code || child.id),
      note: cleanText(child.note || child.customerName),
      productSaleAmount: Math.round(saleAmount),
      promotionAmount: Math.max(0, Math.round(saleAmount - payableAmount)),
      payableAmount: Math.round(payableAmount)
    };
  });

  const totals = rows.reduce((acc, row) => ({
    productSaleAmount: acc.productSaleAmount + toNumber(row.productSaleAmount),
    promotionAmount: acc.promotionAmount + toNumber(row.promotionAmount),
    payableAmount: acc.payableAmount + toNumber(row.payableAmount)
  }), { productSaleAmount: 0, promotionAmount: 0, payableAmount: 0 });

  return { rows, totals };
}

function buildReturnPicking(masterReturnOrder = {}, children = [], context = {}) {
  const productMap = context.productMap || new Map();
  const rawLines = [];

  for (const child of children) {
    for (const item of Array.isArray(child.items) ? child.items : []) {
      const productCode = cleanText(item.productCode || item.code || item.sku || item.productId);
      const product = productMap.get(productCode) || {};
      rawLines.push({
        ...normalizeLine(item, { parent: child, product, mode: 'return' }),
        catalogPackingQty: ProductCatalogExportPolicy.packingQty(product),
        catalogSalePrice: ProductCatalogExportPolicy.salePrice(product)
      });
    }
  }

  // Gộp dòng trả hàng trước, sau đó sort ABC theo tên SP trong từng nhóm HC/PC.
  const mergedLines = sortProductsByPickingZoneThenNameAsc(mergeLines(rawLines, { priceField: 'finalPrice' }));
  const totalQty = mergedLines.reduce((sum, line) => sum + toNumber(line.quantity), 0);
  const totalAmount = mergedLines.reduce((sum, line) => sum + toNumber(line.quantity) * toNumber(line.finalPrice), 0);
  const kpis = buildReturnKpis(children, productMap);
  const sourceCodes = uniqueText(children.map((row) => row.code || row.id));

  const contract = createPrintDocument({
    profile: PRINT_PROFILES.WAREHOUSE_PICKING,
    type: PRINT_DOCUMENT_TYPES.MASTER_RETURN_ORDER,
    document: {
      id: masterReturnOrder.id || masterReturnOrder._id,
      code: masterReturnOrder.code || masterReturnOrder.id,
      documentDate: cleanText(masterReturnOrder.returnDate || masterReturnOrder.deliveryDate || masterReturnOrder.date || masterReturnOrder.documentDate || masterReturnOrder.createdAt),
      sourceCodes,
      status: masterReturnOrder.status,
      title: 'ĐƠN TỔNG TRẢ HÀNG',
      printMode: 'MASTER_RETURN_BY_WAREHOUSE',
      note: cleanText(masterReturnOrder.note)
    },
    parties: {
      deliveryStaff: {
        code: cleanText(masterReturnOrder.deliveryStaffCode || masterReturnOrder.deliveryCode),
        name: cleanText(masterReturnOrder.deliveryStaffName || masterReturnOrder.deliveryName),
        route: cleanText(masterReturnOrder.routeName || masterReturnOrder.route)
      }
    },
    lines: mergedLines,
    totals: { totalQty, totalAmount, orderCount: children.length },
    metadata: {
      mergeKey: 'warehouseCode+lineType+productCode+finalPrice',
      itemSort: 'PRODUCT_NAME_ASC',
      pricingPolicy: 'ORIGINAL_SALES_LINE_SNAPSHOT_FIRST_PRODUCT_FALLBACK'
    }
  });

  return {
    id: contract.document.id,
    code: contract.document.code,
    date: contract.document.documentDate,
    returnDate: contract.document.documentDate,
    deliveryDate: contract.document.documentDate,
    deliveryStaffCode: contract.parties.deliveryStaff.code,
    deliveryStaffName: contract.parties.deliveryStaff.name,
    routeName: contract.parties.deliveryStaff.route,
    note: contract.document.note,
    children,
    returnOrderIds: sourceCodes,
    orderCount: children.length,
    totalOrders: children.length,
    totalQuantity: totalQty,
    totalQty,
    totalAmount,
    goodsAmount: totalAmount,
    masterKpis: kpis.rows,
    masterKpiTotals: kpis.totals,
    items: mergedLines.map((line) => ({
      code: line.productCode,
      productCode: line.productCode,
      name: line.productName,
      productName: line.productName,
      unit: line.baseUnit,
      quantity: line.quantity,
      qty: line.quantity,
      conversionRate: line.conversionRate,
      packingQty: line.conversionRate,
      catalogPackingQty: line.catalogPackingQty,
      warehouseCode: line.warehouseCode,
      warehouseName: line.warehouseName,
      catalogSalePrice: line.catalogSalePrice,
      salePrice: line.finalPrice,
      price: line.finalPrice,
      finalPrice: line.finalPrice,
      amount: Math.round(line.quantity * line.finalPrice),
      lineAmount: Math.round(line.quantity * line.finalPrice),
      lineType: 'RETURN',
      sourceOrderCodes: line.sourceOrderCodes
    })),
    itemSort: 'PRODUCT_NAME_ASC',
    printMode: contract.document.printMode,
    printProfile: contract.profile,
    printContract: contract
  };
}

module.exports = {
  buildReturnPicking
};
