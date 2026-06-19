'use strict';

const { toNumber } = require('../../../utils/common.util');
const { PRINT_PROFILES, PRINT_DOCUMENT_TYPES, createPrintDocument, cleanText, uniqueText } = require('../PrintContract');
const { normalizeLine } = require('../PrintLineNormalizer');
const { mergeLines } = require('../PrintMergeService');
const { pickingZoneLabel, PICKING_ZONES } = require('../../../utils/pickingZone.util');
const ProductCatalogExportPolicy = require('../../catalog/ProductCatalogExportPolicy');


function compareMasterPickingLines(a = {}, b = {}) {
  const zoneOrder = { [PICKING_ZONES.HC]: 0, [PICKING_ZONES.PC]: 1, [PICKING_ZONES.UNASSIGNED]: 2 };
  const zoneCompare = (zoneOrder[a.pickingZone] ?? 99) - (zoneOrder[b.pickingZone] ?? 99);
  if (zoneCompare) return zoneCompare;

  const nameCompare = cleanText(a.productName).localeCompare(cleanText(b.productName), 'vi', {
    sensitivity: 'base',
    numeric: true
  });
  if (nameCompare) return nameCompare;

  const codeCompare = cleanText(a.productCode).localeCompare(cleanText(b.productCode), 'vi', { numeric: true });
  if (codeCompare) return codeCompare;

  return toNumber(a.catalogPrice) - toNumber(b.catalogPrice);
}

function payableAmount(child = {}) {
  const explicit = toNumber(child.payableAmount ?? child.mustPay ?? child.totalPayable ?? child.totalAmount ?? child.amount ?? child.grandTotal);
  if (explicit > 0) return explicit;
  return (Array.isArray(child.items) ? child.items : []).reduce((sum, item) => {
    const qty = toNumber(item.quantity ?? item.qty ?? 0);
    const price = toNumber(item.finalPrice ?? item.priceAfterPromotion ?? item.netPrice ?? item.salePrice ?? item.price ?? 0);
    return sum + toNumber(item.amount ?? item.lineAmount ?? qty * price);
  }, 0);
}

function buildMasterKpis(masterOrders = [], childrenByMaster = new Map(), productMap = new Map()) {
  const rows = masterOrders.map((master) => {
    const masterCode = cleanText(master.code || master.id);
    const children = childrenByMaster.get(masterCode) || [];
    const productSaleAmount = children.reduce((sum, child) => {
      return sum + (Array.isArray(child.items) ? child.items : []).reduce((lineSum, item) => {
        const productCode = cleanText(item.productCode || item.code || item.sku || item.productId);
        const line = normalizeLine(item, { parent: child, product: productMap.get(productCode) || {}, mode: 'sale' });
        return lineSum + (line.lineType === 'PROMO' ? 0 : line.quantity * line.catalogPrice);
      }, 0);
    }, 0);
    const payable = children.reduce((sum, child) => sum + payableAmount(child), 0);
    return {
      code: masterCode,
      note: cleanText(master.note || master.deliveryNote),
      productSaleAmount: Math.round(productSaleAmount),
      promotionAmount: Math.max(0, Math.round(productSaleAmount - payable)),
      payableAmount: Math.round(payable)
    };
  });

  const totals = rows.reduce((acc, row) => ({
    productSaleAmount: acc.productSaleAmount + toNumber(row.productSaleAmount),
    promotionAmount: acc.promotionAmount + toNumber(row.promotionAmount),
    payableAmount: acc.payableAmount + toNumber(row.payableAmount)
  }), { productSaleAmount: 0, promotionAmount: 0, payableAmount: 0 });

  return { rows, totals };
}

function buildMasterPicking(masterOrders = [], children = [], context = {}) {
  const productMap = context.productMap || new Map();
  const childMasterMap = context.childMasterMap || new Map();
  const childrenByMaster = new Map();
  const rawLines = [];

  for (const child of children) {
    const childId = cleanText(child.id || child.code || child.orderCode || child.salesOrderCode);
    const masterCode = cleanText(childMasterMap.get(childId) || child.sourceMasterCode || child.masterOrderCode || child.masterOrderId);
    if (!childrenByMaster.has(masterCode)) childrenByMaster.set(masterCode, []);
    childrenByMaster.get(masterCode).push(child);

    for (const item of Array.isArray(child.items) ? child.items : []) {
      const productCode = cleanText(item.productCode || item.code || item.sku || item.productId);
      const product = productMap.get(productCode) || {};
      rawLines.push({
        ...normalizeLine(item, { parent: child, product, mode: 'sale' }),
        catalogPackingQty: ProductCatalogExportPolicy.packingQty(product),
        catalogSalePrice: ProductCatalogExportPolicy.salePrice(product)
      });
    }
  }

  const mergedLines = mergeLines(rawLines, { priceField: 'catalogPrice' }).sort(compareMasterPickingLines);
  const normalizedItems = mergedLines.map((line) => ({
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
    pickingZone: line.pickingZone,
    warehouseCode: line.warehouseCode,
    warehouseName: pickingZoneLabel(line.pickingZone),
    catalogSalePrice: line.catalogSalePrice,
    salePrice: line.catalogPrice,
    price: line.catalogPrice,
    finalPrice: line.finalPrice,
    amount: Math.round(line.quantity * (line.lineType === 'PROMO' ? 0 : line.catalogPrice)),
    lineAmount: line.lineAmount,
    lineType: line.lineType,
    isPromo: line.lineType === 'PROMO',
    sourceOrderCodes: line.sourceOrderCodes,
    promotionRows: line.promotionRows
  }));

  const first = masterOrders[0] || {};
  const masterCodes = uniqueText(masterOrders.map((row) => row.code || row.id));
  const deliveryCodes = uniqueText(masterOrders.map((row) => row.deliveryStaffCode || row.deliveryCode));
  const deliveryNames = uniqueText(masterOrders.map((row) => row.deliveryStaffName || row.deliveryName));
  const routeNames = uniqueText(masterOrders.map((row) => row.routeName || row.route));
  const totalQty = mergedLines.reduce((sum, line) => sum + toNumber(line.quantity), 0);
  const totalAmount = mergedLines.reduce((sum, line) => sum + (line.lineType === 'PROMO' ? 0 : toNumber(line.quantity) * toNumber(line.catalogPrice)), 0);
  const kpis = buildMasterKpis(masterOrders, childrenByMaster, productMap);
  const isAggregate = masterOrders.length > 1;
  const documentCode = masterCodes.length <= 3 ? masterCodes.join(', ') : `${masterCodes.slice(0, 3).join(', ')} +${masterCodes.length - 3}`;

  const contract = createPrintDocument({
    profile: PRINT_PROFILES.WAREHOUSE_PICKING,
    type: PRINT_DOCUMENT_TYPES.MASTER_ORDER,
    document: {
      id: isAggregate ? `PRINT_MASTER_${Date.now()}` : first.id || first._id,
      code: documentCode || cleanText(first.code || first.id),
      documentDate: cleanText(context.date || first.deliveryDate || first.date || first.documentDate || first.createdAt),
      sourceCodes: masterCodes,
      status: isAggregate ? 'aggregate' : first.status,
      title: isAggregate ? 'PHIẾU BỐC HÀNG ĐƠN TỔNG GỘP' : 'PHIẾU BỐC HÀNG ĐƠN TỔNG',
      printMode: isAggregate ? 'MASTER_AGGREGATE_SELECTED' : 'MASTER_PICKING_BY_WAREHOUSE',
      note: cleanText(first.note || first.deliveryNote)
    },
    parties: {
      deliveryStaff: {
        code: deliveryCodes.join(', '),
        name: deliveryNames.join(', '),
        route: routeNames.join(', ')
      }
    },
    lines: mergedLines,
    totals: {
      totalQty,
      totalAmount,
      orderCount: children.length,
      selectedMasterOrderCount: masterOrders.length
    },
    metadata: {
      mergeKey: 'pickingZone+lineType+productCode+catalogPrice',
      itemSort: 'PRODUCT_NAME_ASC',
      pickingZonePolicy: 'HC_PC_PRINT_ONLY_INVENTORY_MAIN',
      pricingPolicy: 'ORDER_SNAPSHOT_FIRST_PRODUCT_FALLBACK'
    }
  });

  return {
    id: contract.document.id,
    code: contract.document.code,
    date: contract.document.documentDate,
    deliveryDate: contract.document.documentDate,
    deliveryStaffCode: contract.parties.deliveryStaff.code,
    deliveryStaffName: contract.parties.deliveryStaff.name,
    routeName: contract.parties.deliveryStaff.route,
    note: contract.document.note,
    masterOrderCodes: masterCodes,
    selectedMasterOrderCount: masterOrders.length,
    children,
    orderCount: children.length,
    totalOrders: children.length,
    totalQuantity: totalQty,
    totalQty,
    totalAmount,
    goodsAmount: totalAmount,
    masterKpis: kpis.rows,
    masterKpiTotals: kpis.totals,
    items: normalizedItems,
    itemSort: 'PRODUCT_NAME_ASC',
    printMode: contract.document.printMode,
    printProfile: contract.profile,
    printContract: contract
  };
}

module.exports = {
  buildMasterPicking,
  compareMasterPickingLines
};
