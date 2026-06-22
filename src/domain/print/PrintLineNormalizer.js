'use strict';

const { calculateCartonUnit, toNumber } = require('../../utils/common.util');
const { cleanText, uniqueText } = require('./PrintContract');
const { normalizePickingZone, pickingZoneFrom, pickingZoneLabel, legacyPrintGroupCode, PICKING_ZONES } = require('../../utils/pickingZone.util');
const { getCurrentPickingZone } = require('../../utils/productHydration');

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== '');
}

function normalizeWarehouseCode(value) {
  return legacyPrintGroupCode(normalizePickingZone(value, PICKING_ZONES.HC));
}

function warehouseNameFromCode(code) {
  const zone = normalizePickingZone(code, PICKING_ZONES.UNASSIGNED);
  return pickingZoneLabel(zone);
}

function productCodeOf(item = {}, product = {}) {
  return cleanText(firstDefined(
    item.productCode,
    item.code,
    item.sku,
    item.maHang,
    item.productId,
    item.productSnapshot?.productCode,
    item.productSnapshot?.code,
    product.code,
    product.productCode,
    product.sku
  ));
}

function productNameOf(item = {}, product = {}) {
  return cleanText(firstDefined(
    item.productName,
    item.name,
    item.tenHang,
    item.description,
    item.productSnapshot?.productName,
    item.productSnapshot?.name,
    item.product?.productName,
    item.product?.name,
    product.name,
    product.productName
  ));
}

function quantityOf(item = {}, mode = 'sale') {
  if (mode === 'return') {
    return toNumber(firstDefined(item.returnQty, item.returnQuantity, item.quantity, item.qty, item.soLuongTra, 0));
  }
  return toNumber(firstDefined(item.quantity, item.qty, item.totalQuantity, item.totalQty, item.soLuong, item.baseQty, 0));
}

function conversionRateOf(item = {}, product = {}) {
  return toNumber(firstDefined(
    item.conversionRateAtOrder,
    item.packingQtyAtOrder,
    item.packSizeAtOrder,
    item.productSnapshot?.conversionRate,
    item.productSnapshot?.packingQty,
    item.conversionRate,
    item.packingQty,
    item.unitsPerCase,
    item.qtyPerCase,
    item.packSize,
    item.product?.conversionRate,
    product.conversionRate,
    1
  )) || 1;
}

function pickingZoneOf(item = {}, parent = {}, product = {}, options = {}) {
  if (options.currentProductPickingZone || options.pickingZonePolicy === 'CURRENT_PRODUCT') {
    return getCurrentPickingZone(item, product, PICKING_ZONES.HC);
  }
  return normalizePickingZone(
    pickingZoneFrom(item, item.productSnapshot, item.product, parent, product),
    PICKING_ZONES.HC
  );
}

function warehouseCodeOf(item = {}, parent = {}, product = {}, options = {}) {
  return legacyPrintGroupCode(pickingZoneOf(item, parent, product, options));
}

function catalogPriceOf(item = {}, product = {}) {
  return toNumber(firstDefined(
    item.catalogSalePriceAtOrder,
    item.salePriceAtOrder,
    item.productSnapshot?.salePrice,
    item.catalogSalePrice,
    item.grossPrice,
    item.priceAfterTaxBeforePromotion,
    item.priceAfterVatBeforeDiscount,
    item.product?.salePrice,
    item.salePrice,
    item.price,
    item.unitPrice,
    product.salePrice,
    product.price,
    0
  ));
}

function finalPriceOf(item = {}, product = {}) {
  const explicit = toNumber(firstDefined(
    item.finalPrice,
    item.priceAfterPromotion,
    item.priceAfterVatAfterDiscount,
    item.priceAfterDiscount,
    item.netPrice,
    item.orderPrice,
    item.manualPrice,
    0
  ));
  if (explicit > 0) return explicit;

  const catalogPrice = catalogPriceOf(item, product);
  const discountPercent = toNumber(firstDefined(item.discountPercent, item.promotionDiscountPercent, item.percent, item.rate, 0));
  if (discountPercent > 0) return Math.floor(catalogPrice * (1 - discountPercent / 100));
  return catalogPrice;
}

function costPriceOf(item = {}, product = {}) {
  return toNumber(firstDefined(
    item.costPriceAtOrder,
    item.importPrice,
    item.costPrice,
    item.purchasePrice,
    item.unitCost,
    item.price,
    product.costPrice,
    0
  ));
}

function lineTypeOf(item = {}, mode = 'sale') {
  if (mode === 'return') return 'RETURN';
  if (mode === 'import') return 'IMPORT';
  const raw = cleanText(firstDefined(item.lineType, item.type, item.kind, item.itemType, item.isPromo ? 'PROMO' : 'SALE')).toUpperCase();
  return ['PROMO', 'PROMOTION', 'KM'].includes(raw) || item.isPromo === true ? 'PROMO' : 'SALE';
}

function sourceOrderCodesOf(item = {}, parent = {}) {
  return uniqueText([
    ...(Array.isArray(item.sourceOrderCodes) ? item.sourceOrderCodes : []),
    item.sourceOrderCode,
    parent.code,
    parent.orderCode,
    parent.salesOrderCode,
    parent.id
  ]);
}

function normalizeLine(item = {}, context = {}) {
  const product = context.product || {};
  const parent = context.parent || {};
  const mode = context.mode || 'sale';
  const quantity = quantityOf(item, mode);
  const conversionRate = conversionRateOf(item, product);
  const carton = calculateCartonUnit(quantity, conversionRate);
  const pickingZone = pickingZoneOf(item, parent, product, context);
  const warehouseCode = legacyPrintGroupCode(pickingZone);
  const lineType = lineTypeOf(item, mode);
  const catalogPrice = catalogPriceOf(item, product);
  const finalPrice = lineType === 'PROMO' ? 0 : finalPriceOf(item, product);
  const costPrice = costPriceOf(item, product);
  const unitPrice = mode === 'import' ? costPrice : catalogPrice;
  const calculatedLineAmount = mode === 'import'
    ? Math.round(quantity * costPrice)
    : lineType === 'PROMO'
      ? 0
      : Math.round(quantity * (mode === 'return' ? finalPriceOf(item, product) : finalPrice));
  const lineAmount = toNumber(firstDefined(item.lineAmountAtOrder, item.lineAmount, item.amount, calculatedLineAmount));
  const priceBeforeTaxBeforePromotion = toNumber(firstDefined(
    item.preTaxPriceAtOrder,
    item.priceBeforeTaxBeforePromotion,
    item.listPriceBeforeVat,
    item.priceBeforeTax,
    catalogPrice > 0 ? Math.round(catalogPrice / 1.08) : 0
  ));
  const vatAmount = lineType === 'PROMO' ? 0 : toNumber(firstDefined(
    item.vatAmountAtOrder,
    item.vatAmount,
    item.taxAmount,
    item.tax,
    finalPrice > 0 ? Math.round((finalPrice - (finalPrice / 1.08)) * quantity) : 0
  ));

  return {
    lineType,
    pickingZone,
    warehouseCode,
    warehouseName: pickingZoneLabel(pickingZone),
    productCode: productCodeOf(item, product),
    productName: productNameOf(item, product),
    baseUnit: cleanText(firstDefined(item.baseUnitAtOrder, item.unit, item.dvt, item.uom, item.productSnapshot?.unit, product.unit, product.baseUnit, 'Cái')),
    quantity,
    conversionRate,
    cartonQty: carton.cartons,
    looseQty: carton.units,
    cartonUnitDisplay: carton.display,
    catalogPrice,
    finalPrice: mode === 'import' ? costPrice : finalPrice,
    costPrice,
    unitPrice,
    priceBeforeTaxBeforePromotion,
    vatAmount,
    lineAmount,
    sourceOrderCodes: sourceOrderCodesOf(item, parent),
    promotionRows: Array.isArray(item.appliedPromotionRows)
      ? item.appliedPromotionRows
      : Array.isArray(item.promotionRows)
        ? item.promotionRows
        : Array.isArray(item.appliedPromotions)
          ? item.appliedPromotions
          : [],
    raw: item
  };
}

module.exports = {
  normalizeLine,
  normalizeWarehouseCode,
  warehouseNameFromCode,
  productCodeOf,
  productNameOf,
  quantityOf,
  conversionRateOf,
  pickingZoneOf,
  warehouseCodeOf,
  catalogPriceOf,
  finalPriceOf,
  costPriceOf,
  lineTypeOf
};
