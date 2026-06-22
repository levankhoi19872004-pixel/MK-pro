'use strict';

const { toNumber } = require('../../../utils/common.util');
const { PRINT_PROFILES, PRINT_DOCUMENT_TYPES, createPrintDocument, cleanText, uniqueText } = require('../PrintContract');
const { normalizeLine } = require('../PrintLineNormalizer');
const { mergeLines } = require('../PrintMergeService');
const ProductCatalogExportPolicy = require('../../catalog/ProductCatalogExportPolicy');
const { sortProductsByPickingZoneThenNameAsc } = require('../../../utils/productSort');

function buildImportPicking(importOrders = [], context = {}) {
  const productMap = context.productMap || new Map();
  const rawLines = [];

  for (const order of importOrders) {
    for (const item of Array.isArray(order.items) ? order.items : []) {
      const productCode = cleanText(item.productCode || item.code || item.sku || item.productId);
      const product = productMap.get(productCode) || {};
      rawLines.push({
        ...normalizeLine(item, { parent: order, product, mode: 'import' }),
        catalogPackingQty: ProductCatalogExportPolicy.packingQty(product),
        catalogSalePrice: ProductCatalogExportPolicy.salePrice(product)
      });
    }
  }

  // Áp dụng cùng chuẩn sort cho đơn tổng nhập kho: gộp trước, sort ABC sau.
  const mergedLines = sortProductsByPickingZoneThenNameAsc(mergeLines(rawLines, { priceField: 'costPrice' }));
  const sourceCodes = uniqueText(importOrders.map((row) => row.code || row.id));
  const first = importOrders[0] || {};
  const totalQty = mergedLines.reduce((sum, line) => sum + toNumber(line.quantity), 0);
  const totalAmount = mergedLines.reduce((sum, line) => sum + toNumber(line.lineAmount), 0);
  const isAggregate = importOrders.length > 1;
  const code = sourceCodes.length <= 3 ? sourceCodes.join(', ') : `${sourceCodes.slice(0, 3).join(', ')} +${sourceCodes.length - 3}`;

  const contract = createPrintDocument({
    profile: PRINT_PROFILES.WAREHOUSE_PICKING,
    type: PRINT_DOCUMENT_TYPES.IMPORT_ORDER_AGGREGATE,
    document: {
      id: isAggregate ? `PRINT_IMPORT_${Date.now()}` : first.id || first._id,
      code: code || cleanText(first.code || first.id),
      documentDate: cleanText(context.date || first.importDate || first.documentDate || first.date || first.createdAt),
      sourceCodes,
      status: isAggregate ? 'aggregate' : first.status,
      title: isAggregate ? 'ĐƠN TỔNG NHẬP KHO' : 'PHIẾU NHẬP KHO',
      printMode: isAggregate ? 'IMPORT_AGGREGATE_SELECTED' : 'IMPORT_PICKING_BY_WAREHOUSE',
      note: cleanText(first.note)
    },
    parties: {
      supplier: {
        code: cleanText(first.supplierCode || first.vendorCode),
        name: cleanText(first.supplierName || first.supplier || first.vendorName)
      }
    },
    lines: mergedLines,
    totals: { totalQty, totalAmount, orderCount: importOrders.length },
    metadata: {
      mergeKey: 'warehouseCode+lineType+productCode+costPrice',
      itemSort: 'PRODUCT_NAME_ASC',
      pricingPolicy: 'IMPORT_LINE_COST_FIRST_PRODUCT_FALLBACK'
    }
  });

  return {
    id: contract.document.id,
    code: contract.document.code,
    date: contract.document.documentDate,
    importDate: contract.document.documentDate,
    supplierCode: contract.parties.supplier.code,
    supplierName: contract.parties.supplier.name,
    supplier: contract.parties.supplier.name,
    note: contract.document.note,
    sourceCodes,
    selectedImportOrderCount: importOrders.length,
    orderCount: importOrders.length,
    totalQuantity: totalQty,
    totalQty,
    totalAmount,
    goodsAmount: totalAmount,
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
      costPrice: line.costPrice,
      salePrice: line.costPrice,
      price: line.costPrice,
      amount: line.lineAmount,
      lineAmount: line.lineAmount,
      lineType: 'IMPORT',
      sourceOrderCodes: line.sourceOrderCodes
    })),
    itemSort: 'PRODUCT_NAME_ASC',
    printMode: contract.document.printMode,
    printProfile: contract.profile,
    printContract: contract
  };
}

module.exports = {
  buildImportPicking
};
