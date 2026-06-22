'use strict';

const { lazyFunction } = require('./lazyDependency.util');

const dateUtil = require('../../utils/date.util');
const masterOrderRepository = require('../../repositories/masterOrderRepository');
const orderService = require('../orderService');
const { makeId, normalizeText, toNumber } = require('../../utils/common.util');
const Product = require('../../models/Product');
const { legacyPrintGroupCode, pickingZoneLabel, PICKING_ZONES } = require('../../utils/pickingZone.util');
const { getCurrentPickingZone } = require('../../utils/productHydration');

const isInactiveStatus = lazyFunction('./masterOrderQuery.impl', 'isInactiveStatus');

function cleanMasterPrintText(value) {
  return String(value ?? '').trim();
}

function getItemProductCodeForMasterPrint(item = {}) {
  return cleanMasterPrintText(item.productCode || item.code || item.sku || item.maHang || item.productId);
}

function getItemProductNameForMasterPrint(item = {}, product = {}) {
  return cleanMasterPrintText(item.productName || item.name || item.tenHang || product.name || product.productName);
}

function getItemUnitForMasterPrint(item = {}, product = {}) {
  return cleanMasterPrintText(item.unit || item.dvt || product.unit || product.baseUnit || 'Cái');
}

function getItemPriceForMasterPrint(item = {}, product = {}) {
  return toNumber(item.salePrice ?? item.price ?? item.unitPrice ?? item.priceAfterDiscount ?? product.salePrice ?? product.price ?? 0);
}

function getItemQuantityForMasterPrint(item = {}) {
  return toNumber(item.quantity ?? item.qty ?? item.totalQuantity ?? item.soLuong ?? item.baseQty ?? 0);
}

function getItemPackForMasterPrint(item = {}, product = {}) {
  return toNumber(item.packingQty ?? item.conversionRate ?? item.unitsPerCase ?? item.qtyPerCase ?? item.packSize ?? product.conversionRate ?? 1) || 1;
}

function getCatalogSalePriceForMasterKpi(item = {}, product = {}) {
  return toNumber(product.salePrice ?? product.price ?? item.catalogSalePrice ?? item.product?.salePrice ?? item.productSnapshot?.salePrice ?? item.salePrice ?? item.price ?? item.unitPrice ?? 0);
}

function getPayableAmountForMasterChild(child = {}) {
  const explicit = toNumber(child.payableAmount ?? child.mustPay ?? child.totalPayable ?? child.totalAmount ?? child.amount ?? child.grandTotal);
  if (explicit > 0) return explicit;
  const itemAmount = (Array.isArray(child.items) ? child.items : []).reduce((sum, item) => {
    const qty = getItemQuantityForMasterPrint(item);
    const price = toNumber(item.priceAfterPromotion ?? item.netPrice ?? item.finalPrice ?? item.amountPerUnit ?? item.salePrice ?? item.price ?? item.unitPrice ?? 0);
    const amount = toNumber(item.amount ?? item.lineAmount ?? item.totalAmount);
    return sum + (amount || qty * price);
  }, 0);
  return Math.max(0, itemAmount);
}

function normalizeWarehouseForMasterPrint(item = {}, product = {}) {
  const zone = getCurrentPickingZone(item, product, PICKING_ZONES.HC);
  return legacyPrintGroupCode(zone);
}

function getWarehouseNameForMasterPrint(code) {
  return pickingZoneLabel(code);
}

async function buildAggregateMasterPrintDocument(body = {}) {
  const inputIds = body.masterOrderIds || body.ids || body.masterOrders || [];
  const ids = (Array.isArray(inputIds) ? inputIds : String(inputIds || '').split(','))
    .map((value) => cleanMasterPrintText(value))
    .filter(Boolean);
  if (!ids.length) return { error: 'Chưa chọn đơn tổng để in', status: 400 };

  const masterOrders = [];
  const missingIds = [];
  for (const id of ids) {
    const master = await masterOrderRepository.findByIdOrCode(id);
    if (master) masterOrders.push(master);
    else missingIds.push(id);
  }
  if (!masterOrders.length) return { error: 'Không tìm thấy đơn tổng đã chọn', status: 404 };

  const masterCodes = masterOrders.map((order) => cleanMasterPrintText(order.code || order.id)).filter(Boolean);
  const allChildren = [];
  for (const master of masterOrders) {
    const children = await orderService.getMasterChildren(master);
    for (const child of children) {
      if (isInactiveStatus(child)) continue;
      allChildren.push({ ...child, sourceMasterCode: master.code || master.id || '' });
    }
  }

  const productCodes = Array.from(new Set(allChildren.flatMap((child) => (Array.isArray(child.items) ? child.items : [])
    .map(getItemProductCodeForMasterPrint)
    .filter(Boolean))));
  const products = productCodes.length ? await Product.find({
    $or: [
      { code: { $in: productCodes } },
      { productCode: { $in: productCodes } },
      { sku: { $in: productCodes } },
      { barcode: { $in: productCodes } }
    ]
  }).lean() : [];
  const productMap = new Map(products.flatMap((product) => [
    product.code,
    product.productCode,
    product.sku,
    product.barcode
  ].map(cleanMasterPrintText).filter(Boolean).map((key) => [key, product])));
  const childrenByMasterCode = new Map();
  for (const child of allChildren) {
    const key = cleanMasterPrintText(child.sourceMasterCode || '');
    if (!childrenByMasterCode.has(key)) childrenByMasterCode.set(key, []);
    childrenByMasterCode.get(key).push(child);
  }

  const masterKpis = masterOrders.map((master) => {
    const code = cleanMasterPrintText(master.code || master.id);
    const children = childrenByMasterCode.get(code) || [];
    const productSaleAmount = children.reduce((childSum, child) => childSum + (Array.isArray(child.items) ? child.items : []).reduce((itemSum, item) => {
      const productCode = getItemProductCodeForMasterPrint(item);
      const product = productMap.get(productCode) || {};
      return itemSum + getItemQuantityForMasterPrint(item) * getCatalogSalePriceForMasterKpi(item, product);
    }, 0), 0);
    const payableAmount = children.reduce((sum, child) => sum + getPayableAmountForMasterChild(child), 0);
    return {
      code,
      note: cleanMasterPrintText(master.note || master.deliveryNote || ''),
      productSaleAmount: Math.round(productSaleAmount),
      promotionAmount: Math.max(0, Math.round(productSaleAmount - payableAmount)),
      payableAmount: Math.round(payableAmount)
    };
  });
  const masterKpiTotals = masterKpis.reduce((totals, row) => ({
    productSaleAmount: totals.productSaleAmount + toNumber(row.productSaleAmount),
    promotionAmount: totals.promotionAmount + toNumber(row.promotionAmount),
    payableAmount: totals.payableAmount + toNumber(row.payableAmount)
  }), { productSaleAmount: 0, promotionAmount: 0, payableAmount: 0 });

  const grouped = new Map();

  for (const child of allChildren) {
    const childCode = cleanMasterPrintText(child.code || child.orderCode || child.id);
    for (const item of (Array.isArray(child.items) ? child.items : [])) {
      const productCode = getItemProductCodeForMasterPrint(item);
      if (!productCode) continue;
      const product = productMap.get(productCode) || {};
      const productName = getItemProductNameForMasterPrint(item, product);
      const unit = getItemUnitForMasterPrint(item, product);
      const price = getItemPriceForMasterPrint(item, product);
      const quantity = getItemQuantityForMasterPrint(item);
      const pack = getItemPackForMasterPrint(item, product);
      const pickingZone = getCurrentPickingZone(item, product, PICKING_ZONES.HC);
      const key = [pickingZone, productCode, productName, unit, price].map(cleanMasterPrintText).join('|');
      const row = grouped.get(key) || {
        code: productCode,
        productCode,
        name: productName,
        productName,
        unit,
        price,
        salePrice: price,
        quantity: 0,
        qty: 0,
        amount: 0,
        conversionRate: pack,
        packingQty: pack,
        pickingZone,
        warehouseCode: normalizeWarehouseForMasterPrint(item, product),
        warehouseName: getWarehouseNameForMasterPrint(normalizeWarehouseForMasterPrint(item, product)),
        sourceOrderCodes: [],
        sourceMasterCodes: []
      };
      row.quantity += quantity;
      row.qty += quantity;
      row.amount += quantity * price;
      if (childCode && !row.sourceOrderCodes.includes(childCode)) row.sourceOrderCodes.push(childCode);
      if (child.sourceMasterCode && !row.sourceMasterCodes.includes(child.sourceMasterCode)) row.sourceMasterCodes.push(child.sourceMasterCode);
      grouped.set(key, row);
    }
  }

  const items = Array.from(grouped.values()).sort((a, b) => {
    const zoneOrder = { HC: 0, PC: 1, UNASSIGNED: 2 };
    const zoneCompare = (zoneOrder[a.pickingZone] ?? 99) - (zoneOrder[b.pickingZone] ?? 99);
    if (zoneCompare) return zoneCompare;
    const nameCompare = String(a.name || '').localeCompare(String(b.name || ''), 'vi', { sensitivity: 'base', numeric: true });
    if (nameCompare) return nameCompare;
    return String(a.code || '').localeCompare(String(b.code || ''), 'vi', { numeric: true });
  });
  const totalQty = items.reduce((sum, item) => sum + toNumber(item.qty), 0);
  const totalAmount = items.reduce((sum, item) => sum + toNumber(item.amount), 0);
  const firstMaster = masterOrders[0] || {};

  return {
    document: {
      id: `PRINT_AGG_${Date.now()}`,
      code: masterCodes.length <= 3 ? masterCodes.join(', ') : `${masterCodes.slice(0, 3).join(', ')} +${masterCodes.length - 3}`,
      date: dateUtil.toDateOnly(body.date || firstMaster.deliveryDate || firstMaster.date || dateUtil.todayVN()),
      deliveryDate: dateUtil.toDateOnly(body.date || firstMaster.deliveryDate || firstMaster.date || dateUtil.todayVN()),
      routeName: masterOrders.map((order) => cleanMasterPrintText(order.routeName)).filter(Boolean).filter((v, i, arr) => arr.indexOf(v) === i).join(', '),
      deliveryStaffCode: masterOrders.map((order) => cleanMasterPrintText(order.deliveryStaffCode)).filter(Boolean).filter((v, i, arr) => arr.indexOf(v) === i).join(', '),
      deliveryStaffName: masterOrders.map((order) => cleanMasterPrintText(order.deliveryStaffName)).filter(Boolean).filter((v, i, arr) => arr.indexOf(v) === i).join(', '),
      note: missingIds.length ? `Không tìm thấy: ${missingIds.join(', ')}` : '',
      masterOrderCodes: masterCodes,
      selectedMasterOrderCount: masterOrders.length,
      children: allChildren,
      orderCount: allChildren.length,
      totalOrders: allChildren.length,
      totalQuantity: totalQty,
      totalQty,
      totalAmount,
      goodsAmount: totalAmount,
      masterKpis,
      masterKpiTotals,
      items,
      printMode: 'MASTER_AGGREGATE_SELECTED'
    }
  };
}

module.exports = {
  cleanMasterPrintText,
  getItemProductCodeForMasterPrint,
  getItemProductNameForMasterPrint,
  getItemUnitForMasterPrint,
  getItemPriceForMasterPrint,
  getItemQuantityForMasterPrint,
  getItemPackForMasterPrint,
  getCatalogSalePriceForMasterKpi,
  getPayableAmountForMasterChild,
  normalizeWarehouseForMasterPrint,
  getWarehouseNameForMasterPrint,
  buildAggregateMasterPrintDocument
};