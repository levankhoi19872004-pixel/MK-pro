'use strict';

const mongoose = require('mongoose');
const deliveryFinance = require('../utils/deliveryFinance.util');

const dateUtil = require('../utils/date.util');
const orderRepository = require('../repositories/orderRepository');
const masterOrderRepository = require('../repositories/masterOrderRepository');
const productRepository = require('../repositories/productRepository');
const customerRepository = require('../repositories/customerRepository');
const userRepository = require('../repositories/userRepository');
const staffRules = require('../rules/staffRules');
const { pickSalesStaffCode, pickSalesStaffName } = require('../domain/staff/staffIdentity');
const { makeId, normalizeText, toNumber } = require('../utils/common.util');
const queryGuard = require('../utils/queryGuard.util');
const tx = require('../utils/transaction.util');
const { normalizeOrderSourceValue, applyOrderSourceFields } = require('../utils/orderSource.util');
const InventoryPostingService = require('../domain/posting/InventoryPostingService');
const postingEngine = require('../engines/posting.engine');
const returnOrderService = require('./returnOrderService');
const promotionService = require('./promotionService');
const orderStatusUtil = require('../utils/orderStatus.util');
const { DIRECT_PRICE, PROMOTION, normalizePricingMode } = require('../constants/pricingModes');
const { debugLog } = require('../utils/debug.util');
const { normalizePickingZone, pickingZoneFrom, legacyPrintGroupCode, PICKING_ZONES } = require('../utils/pickingZone.util');




function shouldSkipPromotionCalculation(items = []) {
  // Test/offline safety: nếu Mongo chưa connect và từng dòng đã có giá rõ ràng,
  // không gọi promotionService vì service đó đọc trực tiếp Mongo models và sẽ bị buffering timeout.
  if (mongoose.connection && mongoose.connection.readyState !== 1) {
    return (items || []).every((item) => item.price !== undefined || item.salePrice !== undefined || item.unitPrice !== undefined);
  }
  return false;
}

function normalizeOrderDate(value) {
  return dateUtil.toDateOnly(value);
}

function normalizeVatInvoiceRequired(value, fallback = true) {
  if (value === false || String(value).trim().toLowerCase() === 'false') return false;
  if (value === true || String(value).trim().toLowerCase() === 'true') return true;
  return fallback !== false;
}


function extractStaffCodeParam(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const first = raw.split(/\s+-\s+|\|/)[0].trim();
  const match = first.match(/[A-Za-z0-9_.-]+/);
  return String(match ? match[0] : first).trim();
}

function buildOrderCode() {
  // V45 performance: không quét toàn bộ orders để sinh mã.
  // Mã tự sinh theo timestamp/random bằng makeId('SO') ở createOrder().
  return makeId('SO');
}




function normalizeSaleMode(value, fallback = DIRECT_PRICE) {
  return normalizePricingMode(value || fallback);
}

function getRawSaleMode(order = {}) {
  return order.saleMethod ?? order.saleMode ?? order.pricingMode ?? order.orderPricingMode ?? order.priceMode;
}

function hasExplicitSaleMode(order = {}) {
  const rawMode = getRawSaleMode(order);
  return rawMode !== undefined && rawMode !== null && String(rawMode).trim() !== '';
}

function isImportOrDmsSource(order = {}) {
  const sourceText = [order.source, order.orderSource, order.sourceType, order.importSource, order.orderSourceName]
    .filter(Boolean)
    .join(' ')
    .toUpperCase();
  return order.isImported === true || /(^|[^A-Z0-9])DMS([^A-Z0-9]|$)|DMS_IMPORT|EXCEL_DMS|IMPORT EXCEL DMS|IMPORT|EXCEL/.test(sourceText);
}

// ORDER_PROMOTION_PRICE_LOCK_START
function pickFirstPromotionRow(rows = []) {
  return (Array.isArray(rows) ? rows : []).find((row) => row && typeof row === 'object') || {};
}

function extractPromotionIdentity(rows = []) {
  const first = pickFirstPromotionRow(rows);
  return {
    promotionId: String(first.promotionId || first.id || first._id || first.programId || first.ruleId || '').trim(),
    promotionCode: String(first.promotionCode || first.code || first.programCode || first.ruleCode || '').trim(),
    promotionName: String(first.promotionName || first.name || first.programName || first.ruleName || first.description || '').trim()
  };
}
// ORDER_PROMOTION_PRICE_LOCK_END

function isDmsDirectPriceOrder(order = {}) {
  // Quy tắc mới:
  // - Có lựa chọn rõ ràng trên đơn thì tôn trọng lựa chọn đó (không khóa theo nguồn import/DMS).
  // - Không có lựa chọn thì import Excel/DMS mặc định bán thẳng.
  if (hasExplicitSaleMode(order)) return normalizeSaleMode(getRawSaleMode(order)) === DIRECT_PRICE;
  return isImportOrDmsSource(order);
}

function calculateItems(items = [], saleMode = DIRECT_PRICE, order = {}) {
  const normalizedSaleMode = normalizeSaleMode(saleMode);
  const lockDirectPrice = isDmsDirectPriceOrder({ ...order, saleMode: normalizedSaleMode });
  return (Array.isArray(items) ? items : [])
    .map((item) => {
      const lineMode = lockDirectPrice ? DIRECT_PRICE : normalizeSaleMode(item.saleMethod || item.saleMode || item.pricingMode, normalizedSaleMode);
      const quantity = toNumber(item.quantity ?? item.qty ?? item.totalQty);
      const price = toNumber(item.unitPrice ?? item.price ?? item.salePrice ?? item.finalPrice);
      const amount = toNumber(item.amount || (quantity * price));
      const grossPrice = toNumber(item.originalPrice || item.grossPrice || item.catalogSalePrice || price);
      const grossAmount = Math.round(quantity * grossPrice);
      const discountAmount = Math.max(0, toNumber(item.discountAmount || item.totalDiscountAmount || item.promotionAmount || (grossAmount - amount)));
      const discountPercent = grossPrice > 0 && quantity > 0 ? (discountAmount / grossAmount) * 100 : toNumber(item.discountPercent || 0);
      const promotionRows = Array.isArray(item.promotionRows) ? item.promotionRows : [];
      const promotionIdentity = extractPromotionIdentity(promotionRows);
      return {
        ...item,
        productId: String(item.productId || item.id || item.productCode || item.code || '').trim(),
        productCode: String(item.productCode || item.code || item.sku || item.productId || '').trim(),
        productName: String(item.productName || item.name || '').trim(),
        quantity,
        qty: quantity,
        // ORDER_PROMOTION_PRICE_LOCK_START
        originalPrice: grossPrice,
        grossPrice,
        catalogSalePrice: grossPrice,
        grossAmount,
        discountPercent,
        discountAmount,
        promotionAmount: discountAmount,
        totalDiscountAmount: discountAmount,
        finalPrice: price,
        unitPrice: price,
        price,
        salePrice: price,
        amount,
        netAmount: amount,
        saleMethod: lineMode,
        saleMode: lineMode,
        pricingMode: lineMode,
        priceLocked: lockDirectPrice || lineMode === PROMOTION,
        lockedPrice: lockDirectPrice || lineMode === PROMOTION,
        lockedPromotion: lineMode === PROMOTION,
        promotionRows,
        ...promotionIdentity
        // ORDER_PROMOTION_PRICE_LOCK_END
      };
    })
    .filter((item) => item.quantity > 0 || item.productCode || item.productName);
}

async function applyPromotionPricing(items = [], saleMode = DIRECT_PRICE, order = {}) {
  const normalizedSaleMode = normalizeSaleMode(saleMode);
  if (isDmsDirectPriceOrder({ ...order, saleMode: normalizedSaleMode })) {
    return calculateItems(items, DIRECT_PRICE, { ...order, saleMode: DIRECT_PRICE });
  }
  const baseItems = calculateItems(items, PROMOTION, { ...order, saleMode: PROMOTION });
  if (!baseItems.length) return baseItems;
  if (shouldSkipPromotionCalculation(baseItems)) return baseItems;
  const promo = await promotionService.calculatePromotions(baseItems);
  const promoLines = new Map((promo.lines || []).map((line) => [String(line.productCode || '').trim(), line]));
  return baseItems.map((item) => {
    const line = promoLines.get(String(item.productCode || '').trim()) || {};
    const quantity = toNumber(item.quantity);
    const grossPrice = toNumber(line.catalogSalePrice || item.grossPrice || item.salePrice || item.price);
    const grossAmount = Math.round(quantity * grossPrice);
    const directDiscountAmount = toNumber(line.directDiscountAmount || 0);
    const groupDiscountAmount = toNumber(line.groupDiscountAmount || 0);
    const discountAmount = Math.min(grossAmount, directDiscountAmount + groupDiscountAmount);
    const finalAmount = Math.max(0, grossAmount - discountAmount);
    const finalPrice = quantity > 0 ? Math.round(finalAmount / quantity) : 0;
    const discountPercent = grossAmount > 0 ? (discountAmount / grossAmount) * 100 : 0;
    // ORDER_PROMOTION_PRICE_LOCK_START
    const promotionRows = Array.isArray(line.promotionRows) ? line.promotionRows : [];
    const promotionIdentity = extractPromotionIdentity(promotionRows);
    return {
      ...item,
      productName: item.productName || line.productName || '',
      originalPrice: grossPrice,
      grossPrice,
      catalogSalePrice: grossPrice,
      grossAmount,
      directDiscountPercent: toNumber(line.directDiscountPercent || 0),
      groupDiscountPercent: toNumber(line.groupDiscountPercent || 0),
      discountPercent,
      directDiscountAmount,
      groupDiscountAmount,
      discountAmount,
      promotionAmount: discountAmount,
      totalDiscountAmount: discountAmount,
      finalPrice,
      unitPrice: finalPrice,
      salePrice: finalPrice,
      price: finalPrice,
      amount: finalAmount,
      netAmount: finalAmount,
      saleMethod: PROMOTION,
      saleMode: PROMOTION,
      pricingMode: PROMOTION,
      priceLocked: true,
      lockedPrice: true,
      lockedPromotion: true,
      promotionCalculated: true,
      promotionRows,
      ...promotionIdentity
    };
    // ORDER_PROMOTION_PRICE_LOCK_END
  });
}

async function resolveCustomer(body = {}) {
  const customerId = String(body.customerId || body.customerCode || body.customerName || '').trim();
  if (!customerId) return null;
  return customerRepository.findByIdOrCode(customerId);
}

// ORDER_CREATE_SALES_STAFF_FROM_EXPLICIT_CODE_START
async function resolveStaff(body = {}) {
  // Đơn mới chỉ được nhận NVBH từ mã nghiệp vụ rõ nghĩa.
  // Không dùng staffId/staffCode/staffName vì các field đó dễ lẫn audit/legacy/NVGH.
  const salesStaffCode = String(body.salesStaffCode || body.salesmanCode || '').trim();
  if (!salesStaffCode) return null;

  return staffRules.resolveSalesStaffByCode(salesStaffCode);
}
// ORDER_CREATE_SALES_STAFF_FROM_EXPLICIT_CODE_END

// ===== SCOPED FIX: ORDER_DATA_LINEAGE_SALES_STAFF_SOURCE_START =====
// NVBH của đơn bán phải được chốt ở salesOrders ngay khi tạo đơn.
// Ưu tiên salesStaff* rõ nghĩa. staffCode/staffName là audit/legacy display, không dùng làm NVBH runtime.
function buildSalesStaffSnapshot(body = {}, customer = null, staff = null, current = null) {
  const hasCurrentSalesStaff = Boolean(current && (current.salesStaffCode || current.salesStaffName || current.salesmanCode || current.salesmanName));
  if (hasCurrentSalesStaff) {
    return {
      salesStaffId: current.salesStaffId || '',
      salesStaffCode: pickSalesStaffCode(current),
      salesStaffName: pickSalesStaffName(current)
    };
  }
  return {
    salesStaffId: staff?.id || '',
    salesStaffCode: staff?.code || pickSalesStaffCode(body),
    salesStaffName: staff?.name || pickSalesStaffName(body)
  };
}
// ===== SCOPED FIX: ORDER_DATA_LINEAGE_SALES_STAFF_SOURCE_END =====

async function hydrateItemNames(items, saleMode = DIRECT_PRICE) {
  const productKeys = [...new Set((Array.isArray(items) ? items : [])
    .flatMap((item) => [item.productCode, item.code, item.sku, item.productId, item.barcode])
    .map((value) => String(value || '').trim())
    .filter(Boolean))];
  const products = await productRepository.findByCodes(productKeys);
  const byCode = new Map();
  for (const product of products || []) {
    [product.code, product.sku, product.productCode, product.barcode, product.id]
      .map((value) => String(value || '').trim())
      .filter(Boolean)
      .forEach((key) => byCode.set(key, product));
  }
  return items.map((item) => {
    const product = byCode.get(String(item.productCode || item.code || item.sku || item.productId || item.barcode || '').trim());
    if (!product) return item;
    const lineMode = normalizeSaleMode(item.saleMethod || item.saleMode || item.pricingMode, saleMode);
    const price = lineMode === DIRECT_PRICE
      ? toNumber(item.price || item.salePrice || product.salePrice || 0)
      : toNumber(item.price || item.salePrice || product.salePrice || 0);
    const productCode = item.productCode || product.code || product.sku || product.productCode;
    const productName = item.productName || product.name;
    const conversionRateAtOrder = toNumber(item.conversionRateAtOrder || item.conversionRate || product.conversionRate || 1) || 1;
    const pickingZoneAtOrder = normalizePickingZone(
      pickingZoneFrom(item, product),
      PICKING_ZONES.HC
    );
    // Alias chỉ phục vụ tương thích mẫu in cũ; không phải kho tồn.
    const warehouseCodeAtOrder = legacyPrintGroupCode(pickingZoneAtOrder);
    const catalogSalePriceAtOrder = toNumber(
      item.catalogSalePriceAtOrder ||
      item.catalogSalePrice ||
      item.grossPrice ||
      product.salePrice ||
      price
    );

    const finalPriceAtOrder = toNumber(item.finalPrice || item.priceAfterPromotion || price);
    const quantityAtOrder = toNumber(item.quantity || item.qty || 0);
    const preTaxPriceAtOrder = toNumber(item.preTaxPriceAtOrder || item.listPriceBeforeVat || Math.round(catalogSalePriceAtOrder / 1.08));
    const lineAmountAtOrder = toNumber(item.lineAmountAtOrder || item.lineAmount || item.amount || Math.round(quantityAtOrder * finalPriceAtOrder));
    const vatAmountAtOrder = toNumber(item.vatAmountAtOrder || item.vatAmount || item.taxAmount || Math.round((finalPriceAtOrder - (finalPriceAtOrder / 1.08)) * quantityAtOrder));

    return {
      ...item,
      productId: item.productId || product.id || product.code,
      productCode,
      productName,
      price,
      salePrice: price,
      finalPrice: finalPriceAtOrder,
      catalogSalePriceAtOrder,
      preTaxPriceAtOrder,
      vatAmountAtOrder,
      lineAmountAtOrder,
      conversionRateAtOrder,
      pickingZoneAtOrder,
      warehouseCodeAtOrder,
      appliedPromotionRows: Array.isArray(item.appliedPromotionRows)
        ? item.appliedPromotionRows
        : Array.isArray(item.promotionRows)
          ? item.promotionRows
          : [],
      productSnapshot: {
        ...(item.productSnapshot || {}),
        code: productCode,
        productCode,
        name: productName,
        productName,
        salePrice: catalogSalePriceAtOrder,
        conversionRate: conversionRateAtOrder,
        unit: item.unit || product.unit || product.baseUnit || '',
        pickingZone: pickingZoneAtOrder,
        warehouseCode: warehouseCodeAtOrder,
        defaultWarehouse: warehouseCodeAtOrder
      },
      amount: lineAmountAtOrder,
      saleMethod: lineMode,
      saleMode: lineMode,
      pricingMode: lineMode,
      priceLocked: Boolean(item.priceLocked) || lineMode === PROMOTION || lineMode === DIRECT_PRICE
    };
  });
}



function stockPostedPatch(order = {}, actor = '') {
  const now = dateUtil.nowIso();
  return {
    ...order,
    stockPosted: true,
    stockPostedAt: order.stockPostedAt || now,
    stockPostedBy: order.stockPostedBy || actor || order.createdBy || order.userName || 'system'
  };
}

function isSalesOrderStockPosted(order = {}) {
  const stockStatus = String(order.stockStatus || order.inventoryStatus || '').toLowerCase();
  return Boolean(order.stockPosted) || ['posted', 'confirmed', 'locked'].includes(stockStatus);
}

function isSalesOrderArPosted(order = {}) {
  const postedStatus = ['confirmed', 'locked', 'posted'];
  return Boolean(order.arPosted || order.accountingConfirmed)
    || postedStatus.includes(String(order.accountingStatus || '').toLowerCase())
    || postedStatus.includes(String(order.arStatus || '').toLowerCase());
}

async function applySalesOrderPosting(order, options = {}) {
  // Inventory được giữ/trừ ngay khi tạo đơn bán hoặc import DMS.
  // AR/Fund không post ở đây; công nợ chỉ phát sinh ở luồng xác nhận kế toán.
  await InventoryPostingService.postSaleOut(order, options);
}

async function reverseSalesOrderPosting(order, options = {}) {
  await InventoryPostingService.reverseMovement(order, {
    type: 'SALE',
    reverseType: 'SALE_REVERSAL',
    direction: 'OUT',
    refType: 'SALES_ORDER',
    refId: order.id || order._id || order.code,
    refCode: order.code || order.id,
    date: dateUtil.todayVN(),
    note: 'Đảo xuất kho đơn bán'
  }, options);
}

async function reverseSalesOrderArIfPosted(order, options = {}) {
  if (!isSalesOrderArPosted(order)) return;
  // Chuẩn nghiệp vụ: chỉ đảo AR khi đơn đã thật sự phát sinh AR.
  await postingEngine.reverseSalesOrderAR(order, options);
}



function toClient(order) {
  const normalizedOrderSource = normalizeOrderSourceValue(order);
  const lifecycle = orderStatusUtil.lifecyclePatch(order, { source: normalizedOrderSource });
  const merged = orderStatusUtil.normalizeMergeStatus({ ...order, ...lifecycle });
  const normalizedOrderDate = dateUtil.toDateOnly(order.orderDate || order.date || order.documentDate || order.importDate || order.displayDate || '');
  return {
    ...order,
    ...lifecycle,
    id: order.id || order.code,
    code: order.code || order.id,
    date: normalizedOrderDate,
    orderDate: normalizedOrderDate,
    documentDate: dateUtil.toDateOnly(order.documentDate || normalizedOrderDate),
    items: Array.isArray(order.items) ? order.items : [],
    totalAmount: toNumber(order.totalAmount),
    paidAmount: toNumber(order.paidAmount),
    debtAmount: toNumber(order.debtAmount),
    source: normalizedOrderSource,
    orderSource: normalizedOrderSource,
    orderSourceName: normalizedOrderSource === 'DMS' ? 'Từ DMS' : 'Từ NVBH',
    mergeStatus: merged,
    isMerged: merged === 'merged',
    vatInvoiceRequired: order.vatInvoiceRequired !== false,
    vatInvoiceDecisionSource: order.vatInvoiceDecisionSource || 'default',
    vatInvoiceNote: String(order.vatInvoiceNote || ''),
    vatInvoiceUpdatedAt: String(order.vatInvoiceUpdatedAt || ''),
    vatInvoiceUpdatedBy: String(order.vatInvoiceUpdatedBy || ''),
    salesStaffCode: order.salesStaffCode || order.salesPersonCode || order.salesmanCode || order.nvbhCode || order.maNVBH || '',
    salesStaffName: order.salesStaffName || order.salesPersonName || order.salesmanName || order.nvbhName || order.maNVBHName || '',
    visibleInHistory: orderStatusUtil.isOrderVisibleInHistory({ ...order, ...lifecycle })
  };
}

async function getOrder(id) {
  const order = await orderRepository.findByIdOrCode(id);
  if (!order) return { error: 'Không tìm thấy đơn bán', status: 404 };
  return { salesOrder: toClient(order) };
}

function isInactiveStatus(row = {}) {
  const status = String(row.status || '').toLowerCase();
  return ['cancelled', 'canceled', 'void', 'deleted', 'removed'].includes(status) || Boolean(row.deletedAt);
}

function isAccountingLockedOrder(order = {}) {
  const status = String(order.status || '').toLowerCase();
  const deliveryStatus = String(order.deliveryStatus || '').toLowerCase();
  const accountingStatus = String(order.accountingStatus || order.arStatus || '').toLowerCase();
  return Boolean(order.accountingConfirmed)
    || ['confirmed', 'locked', 'posted'].includes(accountingStatus)
    || ['delivered', 'success', 'completed', 'done'].includes(deliveryStatus)
    || ['delivered', 'completed', 'done'].includes(status);
}

function isMergedOrder(order = {}) {
  return Boolean(order.masterOrderId || order.masterOrderCode || order.masterOrderNo)
    || String(order.mergeStatus || '').toLowerCase() === 'merged';
}

function canHardDeleteSalesOrder(order = {}) {
  return !isMergedOrder(order) && !isAccountingLockedOrder(order);
}

const INACTIVE_ORDER_STATUS_VALUES = ['cancelled', 'canceled', 'void', 'deleted', 'removed'];
const TRUTHY_DELETE_VALUES = [true, 'true', 1, '1', 'yes', 'YES', 'y', 'Y'];

function applyActiveSalesOrderFilter(filter = {}) {
  // Delete lifecycle guard: không chỉ lọc theo status.
  // Một số đơn cũ đã có deletedAt/isDeleted=true nhưng status vẫn còn pending/delivered,
  // khiến API báo “đã xóa” nhưng /search vẫn trả về danh sách.
  filter.status = { $nin: INACTIVE_ORDER_STATUS_VALUES };
  filter.lifecycleStatus = { $nin: INACTIVE_ORDER_STATUS_VALUES };
  filter.deliveryStatus = { $nin: INACTIVE_ORDER_STATUS_VALUES };
  filter.deleted = { $nin: TRUTHY_DELETE_VALUES };
  filter.isDeleted = { $nin: TRUTHY_DELETE_VALUES };
  filter.deletedAt = { $in: [null, ''] };
  return filter;
}



function pushAnd(and, clause) {
  if (clause && Object.keys(clause).length) and.push(clause);
}

function rangeFilter(dateFrom, dateTo) {
  const range = {};
  if (dateFrom) range.$gte = dateFrom;
  if (dateTo) range.$lte = dateTo;
  return range;
}


const SALES_ORDER_SEARCH_STAFF_CODE_FIELDS = [
  'salesStaffCode',
  'salesPersonCode',
  'salesmanCode',
  'nvbhCode',
  'maNVBH',
  'salesStaff.code'
];

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeSalesOrderStaffCode(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const first = raw.split(/\s+-\s+|\|/)[0].trim();
  const match = first.match(/[A-Za-z0-9_.-]+/);
  return String(match ? match[0] : first).trim();
}

function getPathValue(obj = {}, path = '') {
  return String(path || '').split('.').reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), obj);
}

function buildExactCodeFieldClauses(field, code) {
  const normalized = normalizeSalesOrderStaffCode(code);
  if (!normalized) return [];
  const values = [normalized];
  const numeric = Number(normalized);
  if (Number.isFinite(numeric)) values.push(numeric);
  return [
    { [field]: { $in: values } },
    { [field]: { $regex: `^\\s*${escapeRegex(normalized)}\\s*$`, $options: 'i' } }
  ];
}

function buildStrictSalesStaffCodeClause(code, options = {}) {
  const normalized = normalizeSalesOrderStaffCode(code);
  if (!normalized) return null;

  // Fast path production: canonical field uses the compound Mongo index.
  if (!options.includeAliases) return { salesStaffCode: normalized };

  // Compatibility path: old DMS/import rows may still store NVBH in an alias.
  // All clauses are pushed into Mongo BEFORE skip/limit, so search is global
  // across the full date range instead of filtering only the first 50 rows.
  const clauses = SALES_ORDER_SEARCH_STAFF_CODE_FIELDS.flatMap((field) =>
    buildExactCodeFieldClauses(field, normalized)
  );
  return { $or: clauses };
}

function readSalesStaffCodeCandidates(order = {}) {
  return SALES_ORDER_SEARCH_STAFF_CODE_FIELDS
    .map((field) => getPathValue(order, field))
    .map(normalizeSalesOrderStaffCode)
    .filter(Boolean);
}

function orderMatchesStrictSalesStaffCode(order = {}, code = '') {
  const expected = normalizeSalesOrderStaffCode(code);
  if (!expected) return true;
  return readSalesStaffCodeCandidates(order).some((candidate) => candidate === expected);
}

function toVisibleSalesStaffCode(order = {}) {
  return order.salesStaffCode || order.salesPersonCode || order.salesmanCode || order.nvbhCode || order.maNVBH || getPathValue(order, 'salesStaff.code') || '';
}

function toVisibleSalesStaffName(order = {}) {
  return order.salesStaffName || order.salesPersonName || order.salesmanName || order.nvbhName || order.maNVBHName || getPathValue(order, 'salesStaff.name') || getPathValue(order, 'salesStaff.fullName') || '';
}

function buildOrderSearchFilter(query = {}) {
  const guardedQuery = queryGuard.normalizeQueryDateRange(query, { defaultToday: true });
  const q = String(guardedQuery.q || guardedQuery.keyword || guardedQuery.search || '').trim();
  const dateFrom = dateUtil.toDateOnly(guardedQuery.dateFrom || guardedQuery.fromDate || guardedQuery.from);
  const dateTo = dateUtil.toDateOnly(guardedQuery.dateTo || guardedQuery.toDate || guardedQuery.to);
  const dateType = String(guardedQuery.dateType || guardedQuery.filterDateType || 'orderDate').trim();
  const includeCancelled = String(guardedQuery.includeCancelled || '0') === '1' || String(guardedQuery.status || '').toLowerCase() === 'cancelled';
  const filter = {};
  const and = [];

  if (dateFrom || dateTo) {
    const range = rangeFilter(dateFrom, dateTo);
    if (dateType === 'deliveryDate') {
      filter.deliveryDate = range;
    } else if (dateType === 'all') {
      pushAnd(and, { $or: [
        { orderDate: range },
        { date: range },
        { createdDate: range },
        { deliveryDate: range },
        { createdAt: range }
      ] });
    } else if (dateType === 'date') {
      filter.date = range;
    } else {
      filter.orderDate = range;
    }
  }

  if (!includeCancelled) applyActiveSalesOrderFilter(filter);

  const exactCustomerCode = String(guardedQuery.customerCode || guardedQuery.maKhachHang || guardedQuery.maKH || '').trim();
  if (exactCustomerCode) filter.customerCode = exactCustomerCode;

  const exactMasterOrderCode = String(guardedQuery.masterOrderCode || guardedQuery.masterCode || '').trim();
  if (exactMasterOrderCode) filter.masterOrderCode = exactMasterOrderCode;

  const strictSalesStaffCode = normalizeSalesOrderStaffCode(
    guardedQuery.salesStaffCode ||
    guardedQuery.salesmanCode ||
    guardedQuery.nvbhCode ||
    guardedQuery.maNVBH
  );

  if (strictSalesStaffCode) {
    // Mã NVBH là điều kiện AND bắt buộc. Alias chỉ được bật có chủ đích để đọc
    // đơn lịch sử; không OR với tên, username, id hoặc _id.
    const includeStaffAliases = ['1', 'true', 'yes'].includes(
      String(guardedQuery.includeStaffAliases || '').trim().toLowerCase()
    );
    pushAnd(and, buildStrictSalesStaffCodeClause(strictSalesStaffCode, {
      includeAliases: includeStaffAliases
    }));
  } else {
    const staffTextFilter = String(
      guardedQuery.salesStaffText || guardedQuery.salesStaffName || guardedQuery.salesmanName || ''
    ).trim();
    if (staffTextFilter) {
      const staffRx = queryGuard.buildRegex(staffTextFilter);
      pushAnd(and, { $or: [
        { salesStaffCode: staffRx },
        { salesStaffName: staffRx },
        { salesPersonCode: staffRx },
        { salesPersonName: staffRx },
        { salesmanCode: staffRx },
        { salesmanName: staffRx },
        { nvbhCode: staffRx },
        { nvbhName: staffRx },
        { maNVBH: staffRx },
        { maNVBHName: staffRx },
        { 'salesStaff.code': staffRx },
        { 'salesStaff.name': staffRx },
        { 'salesStaff.fullName': staffRx }
      ] });
    }
  }

  const deliveryStaffCodeFilter = normalizeSalesOrderStaffCode(guardedQuery.deliveryStaffCode || guardedQuery.nvghCode || guardedQuery.deliveryCode);
  if (deliveryStaffCodeFilter) {
    pushAnd(and, { $or: [
      { deliveryStaffCode: deliveryStaffCodeFilter },
      { deliveryCode: deliveryStaffCodeFilter },
      { 'deliveryStaff.code': deliveryStaffCodeFilter }
    ] });
  }

  const exactSource = String(guardedQuery.source || guardedQuery.orderSource || '').trim();
  const sourceKey = orderStatusUtil.normalizeOrderSource(exactSource);
  if (sourceKey && sourceKey !== 'manual') {
    const sourceVariants = Array.from(new Set([
      sourceKey,
      sourceKey.toUpperCase(),
      sourceKey.toLowerCase(),
      exactSource,
      exactSource.toUpperCase(),
      exactSource.toLowerCase()
    ].filter(Boolean)));
    pushAnd(and, {
      $or: [
        { source: { $in: sourceVariants } },
        { orderSource: { $in: sourceVariants } }
      ]
    });
  }

  const deliveryStatusFilter = String(guardedQuery.deliveryStatus || '').trim();
  if (deliveryStatusFilter) filter.deliveryStatus = deliveryStatusFilter;

  const accountingStatusFilter = String(guardedQuery.accountingStatus || '').trim();
  if (accountingStatusFilter) filter.accountingStatus = accountingStatusFilter;

  const rawStatus = String(guardedQuery.status || guardedQuery.lifecycleStatus || '').trim();
  if (rawStatus && rawStatus !== 'cancelled') filter.status = rawStatus;

  if (q) {
    const rx = queryGuard.buildRegex(q);
    const isLikelyOrderCode = /^[A-Z0-9_-]{5,}$/i.test(q);
    const qOr = isLikelyOrderCode
      ? [
          { code: q },
          { id: q },
          { orderCode: q },
          { salesOrderCode: q },
          { invoiceCode: q },
          { documentCode: q },
          { customerCode: rx },
          { customerName: rx },
          { customerId: rx },
          { note: rx },
          { remark: rx },
          { description: rx }
        ]
      : [
          { customerCode: rx },
          { customerName: rx },
          { customerId: rx },
          { customerPhone: rx },
          { masterOrderCode: rx },
          { note: rx },
          { remark: rx },
          { description: rx }
        ];
    pushAnd(and, { $or: qOr });
  }

  if (and.length) filter.$and = and;
  return { filter, guardedQuery, strictSalesStaffCode };
}

function toListClient(order = {}) {
  const normalizedOrderSource = normalizeOrderSourceValue(order);
  const mergeStatus = orderStatusUtil.normalizeMergeStatus(order);
  return {
    id: order.id || order.code,
    code: order.code || order.orderCode || order.salesOrderCode || order.id,
    orderCode: order.orderCode || order.code || order.id,
    salesOrderCode: order.salesOrderCode || order.code || order.id,
    date: dateUtil.toDateOnly(order.orderDate || order.date || order.documentDate || order.importDate || order.displayDate || ''),
    orderDate: dateUtil.toDateOnly(order.orderDate || order.date || order.documentDate || order.importDate || order.displayDate || ''),
    documentDate: dateUtil.toDateOnly(order.documentDate || order.orderDate || order.date || ''),
    deliveryDate: dateUtil.toDateOnly(order.deliveryDate || ''),
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    deleted: Boolean(order.deleted),
    isDeleted: Boolean(order.isDeleted),
    deletedAt: order.deletedAt || '',
    deleteMode: order.deleteMode || '',
    deleteReason: order.deleteReason || '',
    customerId: order.customerId || '',
    customerCode: order.customerCode || '',
    customerName: order.customerName || '',
    customerPhone: order.customerPhone || '',
    staffCode: toVisibleSalesStaffCode(order),
    staffName: toVisibleSalesStaffName(order),
    salesStaffCode: toVisibleSalesStaffCode(order),
    salesStaffName: toVisibleSalesStaffName(order),
    deliveryStaffCode: order.deliveryStaffCode || '',
    deliveryStaffName: order.deliveryStaffName || '',
    masterOrderId: order.masterOrderId || '',
    masterOrderCode: order.masterOrderCode || '',
    status: order.status || order.lifecycleStatus || 'pending',
    lifecycleStatus: order.lifecycleStatus || order.status || 'pending',
    deliveryStatus: order.deliveryStatus || '',
    mergeStatus,
    isMerged: mergeStatus === 'merged',
    accountingStatus: order.accountingStatus || '',
    accountingConfirmed: Boolean(order.accountingConfirmed),
    vatInvoiceRequired: order.vatInvoiceRequired !== false,
    vatInvoiceDecisionSource: order.vatInvoiceDecisionSource || 'default',
    vatInvoiceNote: String(order.vatInvoiceNote || ''),
    vatInvoiceUpdatedAt: String(order.vatInvoiceUpdatedAt || ''),
    vatInvoiceUpdatedBy: String(order.vatInvoiceUpdatedBy || ''),
    source: normalizedOrderSource,
    orderSource: normalizedOrderSource,
    orderSourceName: normalizedOrderSource === 'DMS' ? 'Từ DMS' : 'Từ NVBH',
    totalAmount: toNumber(order.totalAmount ?? order.amount ?? order.total),
    paidAmount: toNumber(order.paidAmount),
    debtAmount: toNumber(order.debtAmount),
    visibleInHistory: orderStatusUtil.isOrderVisibleInHistory(order)
  };
}


const ORDER_LIST_PROJECTION = {
  _id: 0,
  id: 1,
  code: 1,
  documentCode: 1,
  invoiceCode: 1,
  orderCode: 1,
  salesOrderCode: 1,
  date: 1,
  orderDate: 1,
  deliveryDate: 1,
  createdAt: 1,
  updatedAt: 1,
  deleted: 1,
  isDeleted: 1,
  deletedAt: 1,
  deleteMode: 1,
  deleteReason: 1,
  customerId: 1,
  customerCode: 1,
  customerName: 1,
  customerPhone: 1,
  staffCode: 1,
  staffName: 1,
  salesStaffCode: 1,
  salesStaffName: 1,
  salesPersonCode: 1,
  salesPersonName: 1,
  salesmanCode: 1,
  salesmanName: 1,
  nvbhCode: 1,
  nvbhName: 1,
  maNVBH: 1,
  maNVBHName: 1,
  'salesStaff.code': 1,
  'salesStaff.name': 1,
  'salesStaff.fullName': 1,
  deliveryStaffCode: 1,
  deliveryStaffName: 1,
  masterOrderId: 1,
  masterOrderCode: 1,
  status: 1,
  lifecycleStatus: 1,
  deliveryStatus: 1,
  mergeStatus: 1,
  accountingStatus: 1,
  accountingConfirmed: 1,
  vatInvoiceRequired: 1,
  vatInvoiceDecisionSource: 1,
  vatInvoiceNote: 1,
  vatInvoiceUpdatedAt: 1,
  vatInvoiceUpdatedBy: 1,
  source: 1,
  orderSource: 1,
  totalAmount: 1,
  paidAmount: 1,
  debtAmount: 1,
  amount: 1,
  total: 1
};

async function searchOrders(query = {}) {
  const startedAt = Date.now();
  const { filter, guardedQuery, strictSalesStaffCode } = buildOrderSearchFilter(query);
  const page = queryGuard.getPagination(guardedQuery, { defaultLimit: 50, maxLimit: 100 });
  const includeCancelled = String(guardedQuery.includeCancelled || '0') === '1' || String(guardedQuery.status || '').toLowerCase() === 'cancelled';
  const sort = guardedQuery.dateType === 'deliveryDate'
    ? { deliveryDate: -1, createdAt: -1, code: -1 }
    : { orderDate: -1, date: -1, createdAt: -1, code: -1 };

  // salesStaffCode đã nằm trong Mongo filter nên không scan/lọc lại bằng JavaScript.

  const queryStartedAt = Date.now();
  const rowsPromise = orderRepository.findAll(filter, {
    projection: ORDER_LIST_PROJECTION,
    sort,
    skip: page.skip,
    limit: page.limit
  }).then((orders) => ({
    orders,
    queryMs: Date.now() - queryStartedAt
  }));

  const countStartedAt = Date.now();
  const totalPromise = orderRepository.count(filter).then((total) => ({
    total,
    countMs: Date.now() - countStartedAt
  }));

  const [{ orders, queryMs }, { total, countMs }] = await Promise.all([rowsPromise, totalPromise]);

  const mapStartedAt = Date.now();
  const rows = orders.map(toListClient);
  const mapMs = Date.now() - mapStartedAt;
  const ms = Date.now() - startedAt;

  debugLog('DEBUG_ORDER_FLOW', '[SALES_ORDER_SEARCH_REBUILT]', {
    ms,
    queryMs,
    countMs,
    mapMs,
    page: page.page,
    limit: page.limit,
    total,
    returned: rows.length,
    filter
  });

  return {
    rows,
    salesOrders: rows,
    orders: rows,
    total,
    page: page.page,
    limit: page.limit,
    returned: rows.length,
    hasMore: page.skip + rows.length < total,
    ms,
    queryMs,
    countMs,
    mapMs
  };
}


function ensureAnd(filter = {}) {
  if (!Array.isArray(filter.$and)) filter.$and = [];
  return filter.$and;
}

function normalizedSourceClause(sourceKey = '', rawSource = '') {
  if (!sourceKey || sourceKey === 'manual') return null;
  const exact = [...new Set([
    sourceKey,
    rawSource,
    sourceKey.toUpperCase(),
    sourceKey.toLowerCase(),
    String(rawSource || '').toUpperCase(),
    String(rawSource || '').toLowerCase()
  ].filter(Boolean))];
  const patterns = {
    dms: /dms/i,
    s3: /s3/i,
    sales_app: /(mobile|app|nvbh|sales)/i
  };
  const clauses = [{ source: { $in: exact } }, { orderSource: { $in: exact } }];
  if (patterns[sourceKey]) clauses.push({ source: patterns[sourceKey] }, { orderSource: patterns[sourceKey] });
  return { $or: clauses };
}

function normalizedOrderStatusClause(value = '') {
  const status = String(value || '').trim().toLowerCase();
  if (!status) return null;
  if (status === 'cancelled') {
    return { $or: [
      { status: { $in: INACTIVE_ORDER_STATUS_VALUES } },
      { lifecycleStatus: { $in: INACTIVE_ORDER_STATUS_VALUES } },
      { deliveryStatus: { $in: INACTIVE_ORDER_STATUS_VALUES } },
      { deleted: { $in: TRUTHY_DELETE_VALUES } },
      { isDeleted: { $in: TRUTHY_DELETE_VALUES } },
      { deletedAt: { $nin: [null, ''] } }
    ] };
  }
  if (status === 'delivered') {
    const values = ['delivered', 'success', 'completed', 'done'];
    return { $or: [
      { status: { $in: values } },
      { lifecycleStatus: { $in: values } },
      { deliveryStatus: { $in: values } }
    ] };
  }
  if (status === 'assigned') {
    return { $or: [
      { status: { $in: ['assigned', 'assigned_delivery', 'waiting'] } },
      { lifecycleStatus: { $in: ['assigned', 'assigned_delivery', 'waiting'] } },
      { mergeStatus: { $in: ['merged', 'mastered', 'grouped'] } },
      { masterOrderId: { $nin: [null, ''] } },
      { masterOrderCode: { $nin: [null, ''] } }
    ] };
  }
  return { $or: [{ status }, { lifecycleStatus: status }] };
}

function normalizedMergeStatusClause(value = '') {
  const status = String(value || '').trim().toLowerCase();
  if (!status) return null;
  if (status === 'merged') {
    return { $or: [
      { mergeStatus: { $in: ['merged', 'mastered', 'grouped'] } },
      { masterOrderId: { $nin: [null, ''] } },
      { masterOrderCode: { $nin: [null, ''] } }
    ] };
  }
  if (status === 'unmerged') {
    return { $and: [
      { mergeStatus: { $nin: ['merged', 'mastered', 'grouped'] } },
      { masterOrderId: { $in: [null, ''] } },
      { masterOrderCode: { $in: [null, ''] } }
    ] };
  }
  return { mergeStatus: status };
}

function normalizedDeliveryStatusClause(value = '') {
  const status = String(value || '').trim().toLowerCase();
  if (!status) return null;
  if (status === 'delivered') return { deliveryStatus: { $in: ['delivered', 'success', 'completed', 'done'] } };
  if (status === 'failed') return { deliveryStatus: { $in: ['failed', 'fail', 'not_delivered', 'undelivered'] } };
  if (status === 'cancelled') return { deliveryStatus: { $in: INACTIVE_ORDER_STATUS_VALUES } };
  if (status === 'pending') {
    return { deliveryStatus: { $nin: [...INACTIVE_ORDER_STATUS_VALUES, 'delivered', 'success', 'completed', 'done', 'failed', 'fail', 'not_delivered', 'undelivered'] } };
  }
  return { deliveryStatus: status };
}

function normalizedAccountingStatusClause(value = '') {
  const status = String(value || '').trim().toLowerCase();
  if (!status) return null;
  if (status === 'confirmed') {
    return { $or: [
      { accountingConfirmed: true },
      { accountingStatus: { $in: ['confirmed', 'locked', 'posted'] } },
      { arStatus: { $in: ['confirmed', 'locked', 'posted'] } }
    ] };
  }
  if (status === 'pending') {
    return { $and: [
      { accountingConfirmed: { $ne: true } },
      { accountingStatus: { $nin: ['confirmed', 'locked', 'posted'] } },
      { arStatus: { $nin: ['confirmed', 'locked', 'posted'] } }
    ] };
  }
  return { accountingStatus: status };
}

async function listOrders(query = {}) {
  const guardedQuery = queryGuard.normalizeQueryDateRange(query, { defaultToday: true });
  const internalMaxLimit = Math.max(Number(guardedQuery.__internalMaxLimit || 0), 0);
  const page = queryGuard.getPagination(
    guardedQuery,
    internalMaxLimit
      ? { maxLimit: internalMaxLimit, defaultLimit: Math.min(internalMaxLimit, 500) }
      : {}
  );
  const q = String(guardedQuery.q || guardedQuery.keyword || guardedQuery.search || '').trim();
  const dateFrom = dateUtil.toDateOnly(guardedQuery.dateFrom || guardedQuery.fromDate || guardedQuery.from);
  const dateTo = dateUtil.toDateOnly(guardedQuery.dateTo || guardedQuery.toDate || guardedQuery.to);
  const dateType = String(guardedQuery.dateType || guardedQuery.filterDateType || 'orderDate').trim();
  const includeCancelled = String(guardedQuery.includeCancelled || '0') === '1'
    || String(guardedQuery.status || '').toLowerCase() === 'cancelled';
  const rawSource = String(guardedQuery.source || guardedQuery.orderSource || '').trim();
  const sourceKey = orderStatusUtil.normalizeOrderSource(rawSource);

  const filter = {};
  if (dateFrom || dateTo) {
    const range = {};
    if (dateFrom) range.$gte = dateFrom;
    if (dateTo) range.$lte = dateTo;
    const orderDateFields = [{ orderDate: range }, { date: range }, { createdDate: range }];
    const deliveryDateFields = [{ deliveryDate: range }];
    if (dateType === 'deliveryDate') filter.$or = deliveryDateFields;
    else if (dateType === 'all') filter.$or = [...orderDateFields, ...deliveryDateFields, { createdAt: range }];
    else filter.$or = orderDateFields;
  }
  if (!includeCancelled) applyActiveSalesOrderFilter(filter);

  if (q) {
    const rx = queryGuard.buildRegex(q);
    ensureAnd(filter).push({ $or: [
      { code: rx }, { id: rx }, { orderCode: rx }, { salesOrderCode: rx },
      { customerCode: rx }, { customerName: rx }, { customerPhone: rx },
      { salesStaffCode: rx }, { salesStaffName: rx },
      { deliveryStaffCode: rx }, { deliveryStaffName: rx },
      { masterOrderCode: rx }, { masterOrderId: rx }
    ] });
  }

  const staffCodeFilter = extractStaffCodeParam(
    guardedQuery.salesStaffCode || guardedQuery.salesmanCode || guardedQuery.nvbhCode || guardedQuery.maNVBH
  );
  const staffTextFilter = String(
    guardedQuery.salesStaffText || guardedQuery.salesStaffName || guardedQuery.salesmanName || ''
  ).trim();
  if (staffCodeFilter) {
    filter.salesStaffCode = staffCodeFilter;
  } else if (staffTextFilter) {
    const staffRx = queryGuard.buildRegex(staffTextFilter);
    ensureAnd(filter).push({ $or: [{ salesStaffCode: staffRx }, { salesStaffName: staffRx }] });
  }

  const deliveryStaffCodeFilter = extractStaffCodeParam(
    guardedQuery.deliveryStaffCode || guardedQuery.nvghCode || guardedQuery.deliveryCode
  );
  if (deliveryStaffCodeFilter) filter.deliveryStaffCode = deliveryStaffCodeFilter;

  const clauses = [
    normalizedSourceClause(sourceKey, rawSource),
    normalizedOrderStatusClause(guardedQuery.status || guardedQuery.lifecycleStatus),
    normalizedMergeStatusClause(guardedQuery.mergeStatus),
    normalizedDeliveryStatusClause(guardedQuery.deliveryStatus),
    normalizedAccountingStatusClause(guardedQuery.accountingStatus)
  ].filter(Boolean);
  if (clauses.length) ensureAnd(filter).push(...clauses);

  const orders = await orderRepository.findAll(filter, {
    projection: ORDER_LIST_PROJECTION,
    sort: { createdAt: -1, code: -1 },
    skip: page.skip,
    limit: page.limit
  });
  return orders.map(toClient);
}

async function createOrder(body = {}, actor = {}) {
  const startedAt = Date.now();
  const customer = await resolveCustomer(body);
  const staff = await resolveStaff(body);
  const saleMode = hasExplicitSaleMode(body)
    ? normalizeSaleMode(getRawSaleMode(body))
    : (isImportOrDmsSource(body) ? DIRECT_PRICE : PROMOTION);
  const items = await hydrateItemNames(await applyPromotionPricing(body.items, saleMode, body), saleMode);
  if (!items.length) return { error: 'Đơn bán chưa có sản phẩm', status: 400 };
  const totalAmount = toNumber(body.totalAmount || items.reduce((sum, item) => sum + toNumber(item.amount), 0));
  const paidAmount = toNumber(body.paidAmount || body.paid || 0);
  const generatedOrderCode = String(body.code || body.orderCode || body.salesOrderCode || body.documentCode || buildOrderCode()).trim();
  const generatedOrderId = String(body.id || generatedOrderCode).trim();
  const normalizedOrderDate = dateUtil.toDateOnly(body.orderDate || body.date || dateUtil.todayVN());
  const normalizedDeliveryDate = dateUtil.toDateOnly(body.deliveryDate || normalizedOrderDate);
  const salesStaffSnapshot = buildSalesStaffSnapshot(body, customer, staff);
  const vatActorRole = String(actor.role || '').trim().toLowerCase();
  const canSetVatManually = ['admin', 'accountant'].includes(vatActorRole);
  const vatInvoiceRequired = canSetVatManually
    ? normalizeVatInvoiceRequired(body.vatInvoiceRequired, true)
    : true;
  const vatDecisionSource = vatInvoiceRequired ? 'default' : 'manual';
  const vatActor = String(actor.username || actor.name || actor.fullName || actor.code || body.updatedBy || body.userName || '').trim();
  const order = {
    ...body,
    id: generatedOrderId,
    code: generatedOrderCode,
    orderCode: String(body.orderCode || generatedOrderCode).trim(),
    salesOrderCode: String(body.salesOrderCode || generatedOrderCode).trim(),
    date: normalizedOrderDate,
    orderDate: normalizedOrderDate,
    documentDate: normalizedOrderDate,
    deliveryDate: normalizedDeliveryDate,
    customerId: customer?.id || body.customerId || body.customerCode || '',
    customerCode: customer?.code || body.customerCode || '',
    customerName: customer?.name || body.customerName || '',
    customerPhone: customer?.phone || body.customerPhone || '',
    customerAddress: customer?.address || body.customerAddress || '',
    // ===== SCOPED FIX: ORDER_DATA_LINEAGE_CREATE_ORDER_NVBH_START =====
    // staff* giữ để tương thích dữ liệu cũ; nguồn nghiệp vụ NVBH là salesStaff*.
    staffId: salesStaffSnapshot.salesStaffId,
    staffCode: salesStaffSnapshot.salesStaffCode,
    staffName: salesStaffSnapshot.salesStaffName,
    salesStaffId: salesStaffSnapshot.salesStaffId,
    salesStaffCode: salesStaffSnapshot.salesStaffCode,
    salesStaffName: salesStaffSnapshot.salesStaffName,
    salesmanCode: body.salesmanCode || salesStaffSnapshot.salesStaffCode,
    salesmanName: body.salesmanName || salesStaffSnapshot.salesStaffName,
    // ===== SCOPED FIX: ORDER_DATA_LINEAGE_CREATE_ORDER_NVBH_END =====
    saleMethod: saleMode,
    saleMode,
    pricingMode: saleMode,
    orderPricingMode: saleMode,
    isPromotionSale: saleMode === PROMOTION,
    priceLocked: saleMode === DIRECT_PRICE,
    promotionCalculated: saleMode === PROMOTION,
    items,
    totalAmount,
    paidAmount,
    debtAmount: toNumber(body.debtAmount ?? Math.max(0, totalAmount - paidAmount)),
    isChildOrder: body.isChildOrder !== false,
    masterOrderId: body.masterOrderId || '',
    masterOrderCode: body.masterOrderCode || '',
    mergeStatus: body.mergeStatus || 'unmerged',
    deliveryStatus: body.deliveryStatus || 'pending',
    status: body.status || 'pending',
    lifecycleStatus: body.lifecycleStatus || body.status || 'pending',
    accountingStatus: body.accountingStatus || 'pending',
    vatInvoiceRequired,
    vatInvoiceDecisionSource: vatDecisionSource,
    vatInvoiceNote: vatInvoiceRequired ? '' : String(body.vatInvoiceNote || body.noteVat || '').trim(),
    vatInvoiceUpdatedAt: vatDecisionSource === 'manual' ? dateUtil.nowIso() : '',
    vatInvoiceUpdatedBy: vatDecisionSource === 'manual' ? (vatActor || 'system') : '',
    arStatus: body.arStatus || 'pending',
    arBalance: 0,
    createdAt: body.createdAt || dateUtil.nowIso(),
    updatedAt: dateUtil.nowIso()
  };
  Object.assign(order, orderStatusUtil.lifecyclePatch(order, { source: body.source || body.orderSource || 'sales_app' }));
  Object.assign(order, applyOrderSourceFields(order));
  const stockPostedOrder = stockPostedPatch(order, body.createdBy || body.userName || body.staffName || 'create_order');
  await tx.withMongoTransaction(async (session) => {
    // V45: tạo/gửi đơn bán trừ tồn ngay để chống oversell giữa nhiều NVBH.
    // ReturnOrder chỉ sinh khi NVGH nhập returnQty > 0.
    await orderRepository.upsert({
      ...stockPostedOrder,
      hasReturn: Boolean(stockPostedOrder.hasReturn),
      returnOrderId: stockPostedOrder.returnOrderId || '',
      returnOrderCode: stockPostedOrder.returnOrderCode || '',
      returnAmount: toNumber(stockPostedOrder.returnAmount || 0)
    }, { session });
    await applySalesOrderPosting(stockPostedOrder, { session });
  });
  debugLog('DEBUG_ORDER_FLOW', '[CREATE_ORDER_DONE]', { ms: Date.now() - startedAt, code: stockPostedOrder.code, itemCount: items.length, stockPosted: true });
  return { salesOrder: toClient(stockPostedOrder) };
}

async function updateOrder(id, body = {}) {
  const current = await orderRepository.findByIdOrCode(id);
  if (!current) return { error: 'Không tìm thấy đơn bán', status: 404 };
  if (current.masterOrderId || current.mergeStatus === 'merged') return { error: 'Đơn đã gộp, không nên sửa trực tiếp đơn con', status: 400 };
  const bodyHasExplicitSaleMode = hasExplicitSaleMode(body);
  const keepOriginalPrice = !bodyHasExplicitSaleMode && (isDmsDirectPriceOrder(current) || isDmsDirectPriceOrder(body));
  const saleMode = bodyHasExplicitSaleMode
    ? normalizeSaleMode(getRawSaleMode(body))
    : (keepOriginalPrice ? DIRECT_PRICE : normalizeSaleMode(current.saleMethod || current.saleMode || current.pricingMode || current.orderPricingMode || PROMOTION));
  const items = body.items
    ? await hydrateItemNames(await applyPromotionPricing(body.items, saleMode, { ...current, ...body, saleMode }), saleMode)
    : current.items;
  const totalAmount = toNumber(body.totalAmount ?? (items || []).reduce((sum, item) => sum + toNumber(item.amount), 0));
  const paidAmount = toNumber(body.paidAmount ?? current.paidAmount ?? 0);
  const normalizedDate = dateUtil.toDateOnly(body.orderDate || body.date || current.orderDate || current.date || dateUtil.todayVN());
  const normalizedDeliveryDate = dateUtil.toDateOnly(body.deliveryDate || current.deliveryDate || normalizedDate);
  const salesStaffSnapshot = buildSalesStaffSnapshot(body, null, null, current);
  const updated = applyOrderSourceFields({
    ...current,
    ...body,
    date: normalizedDate,
    orderDate: normalizedDate,
    documentDate: normalizedDate,
    deliveryDate: normalizedDeliveryDate,
    saleMethod: saleMode,
    saleMode,
    pricingMode: saleMode,
    orderPricingMode: saleMode,
    isPromotionSale: saleMode === PROMOTION,
    priceLocked: keepOriginalPrice || saleMode === DIRECT_PRICE,
    promotionCalculated: !keepOriginalPrice && saleMode === PROMOTION,
    items,
    totalAmount,
    paidAmount,
    debtAmount: toNumber(body.debtAmount ?? Math.max(0, totalAmount - paidAmount)),
    // VAT setting is changed only through updateVatInvoiceSetting(); generic edit must not trigger VAT mutation.
    vatInvoiceRequired: current.vatInvoiceRequired !== false,
    vatInvoiceDecisionSource: current.vatInvoiceDecisionSource || 'default',
    vatInvoiceNote: String(current.vatInvoiceNote || ''),
    vatInvoiceUpdatedAt: String(current.vatInvoiceUpdatedAt || ''),
    vatInvoiceUpdatedBy: String(current.vatInvoiceUpdatedBy || ''),
    // ===== SCOPED FIX: ORDER_DATA_LINEAGE_LOCK_NVBH_ON_UPDATE_START =====
    // Không cho updateOrder/master/delivery/accounting ghi đè NVBH đã chốt trên salesOrders.
    salesStaffId: salesStaffSnapshot.salesStaffId,
    salesStaffCode: salesStaffSnapshot.salesStaffCode,
    salesStaffName: salesStaffSnapshot.salesStaffName,
    salesmanCode: current.salesmanCode || salesStaffSnapshot.salesStaffCode,
    salesmanName: current.salesmanName || salesStaffSnapshot.salesStaffName,
    staffId: salesStaffSnapshot.salesStaffId,
    staffCode: salesStaffSnapshot.salesStaffCode,
    staffName: salesStaffSnapshot.salesStaffName,
    // ===== SCOPED FIX: ORDER_DATA_LINEAGE_LOCK_NVBH_ON_UPDATE_END =====
    ...orderStatusUtil.lifecyclePatch({ ...current, ...body, items, totalAmount, paidAmount }, current),
    updatedAt: dateUtil.nowIso()
  });
  let orderResultForClient = updated;
  await tx.withMongoTransaction(async (session) => {
    const currentWasPosted = isSalesOrderStockPosted(current);
    const shouldPostAfterUpdate = body.postImmediately === true || currentWasPosted;

    if (currentWasPosted) {
      await reverseSalesOrderPosting(current, { session });
    }

    const orderToSave = shouldPostAfterUpdate
      ? stockPostedPatch(updated, body.updatedBy || body.userName || 'update_order')
      : updated;
    orderResultForClient = orderToSave;
    await orderRepository.upsert(orderToSave, { session });
    await returnOrderService.syncReturnDraftWithSalesOrder(orderToSave, { session });

    if (shouldPostAfterUpdate) {
      await applySalesOrderPosting(orderToSave, { session });
    }
  });
  return { salesOrder: toClient(orderResultForClient) };
}

async function updateVatInvoiceSetting(id, body = {}, actor = {}) {
  const current = await orderRepository.findByIdOrCode(id);
  if (!current) return { error: 'Không tìm thấy đơn bán', status: 404 };
  if (typeof body.vatInvoiceRequired !== 'boolean') {
    return { error: 'Thiết lập hóa đơn VAT không hợp lệ', status: 400 };
  }

  const now = dateUtil.nowIso();
  const patch = {
    vatInvoiceRequired: body.vatInvoiceRequired,
    vatInvoiceDecisionSource: 'manual',
    vatInvoiceNote: String(body.note || body.vatInvoiceNote || '').trim(),
    vatInvoiceUpdatedAt: now,
    vatInvoiceUpdatedBy: String(actor.username || actor.name || actor.fullName || actor.code || 'system').trim(),
    updatedAt: now
  };

  const updated = await orderRepository.patchByIdentity(current.id || current.code || id, patch);
  return { salesOrder: toClient(updated || { ...current, ...patch }) };
}

async function cancelOrder(id, body = {}) {
  const current = await orderRepository.findByIdOrCode(id);
  if (!current) return { error: 'Không tìm thấy đơn bán', status: 404 };
  const returnDraftCancel = await returnOrderService.cancelReturnDraftForSalesOrder(current, { dryRun: true });
  if (returnDraftCancel && returnDraftCancel.error) return returnDraftCancel;

  const now = dateUtil.nowIso();
  const currentWasPosted = isSalesOrderStockPosted(current);
  const cancelPatch = {
    status: 'cancelled',
    deliveryStatus: 'cancelled',
    cancelReason: String(body.reason || body.cancelReason || '').trim(),
    cancelledAt: now,
    updatedAt: now,
    ...(currentWasPosted ? { stockPosted: false, stockReversedAt: now } : {})
  };

  let cancelled = { ...current, ...cancelPatch };
  await tx.withMongoTransaction(async (session) => {
    if (currentWasPosted) {
      await reverseSalesOrderPosting(current, { session });
    }
    await reverseSalesOrderArIfPosted(current, { session });
    await returnOrderService.cancelReturnDraftForSalesOrder(current, { session });
    const patched = await orderRepository.patchByIdentity(current.id || current.code || id, cancelPatch, { session });
    if (patched) cancelled = patched;
  });
  if (cancelled.masterOrderId || cancelled.masterOrderCode) {
    await syncMasterOrderSummary(cancelled.masterOrderId || cancelled.masterOrderCode);
  }
  return { salesOrder: toClient(cancelled) };
}


async function deleteOrder(id, body = {}) {
  const current = await orderRepository.findByIdOrCode(id);
  if (!current) return { error: 'Không tìm thấy đơn bán', status: 404 };
  const returnDraftDelete = await returnOrderService.cancelReturnDraftForSalesOrder(current, { dryRun: true });
  if (returnDraftDelete && returnDraftDelete.error) return returnDraftDelete;
  const currentWasPosted = isSalesOrderStockPosted(current);

  if (false && canHardDeleteSalesOrder(current)) {
    await tx.withMongoTransaction(async (session) => {
      await returnOrderService.cancelReturnDraftForSalesOrder(current, { session });
      if (currentWasPosted) {
        await reverseSalesOrderPosting(current, { session });
      }
      await reverseSalesOrderArIfPosted(current, { session });
      await orderRepository.remove(current.id || current.code || id, { session });
    });
    return {
      hardDeleted: true,
      salesOrder: toClient({
        ...current,
        status: 'deleted',
        deliveryStatus: 'deleted',
        deletedAt: dateUtil.nowIso(),
        deleteReason: String(body.reason || body.deleteReason || '').trim()
      })
    };
  }

  // Đơn đã gộp/giao/xác nhận kế toán không xóa vật lý; chỉ void để giữ audit.
  const removed = {
    ...current,
    status: 'void',
    deliveryStatus: 'void',
    deleted: true,
    isDeleted: true,
    deletedAt: dateUtil.nowIso(),
    deleteReason: String(body.reason || body.deleteReason || '').trim(),
    updatedAt: dateUtil.nowIso()
  };
  await tx.withMongoTransaction(async (session) => {
    await orderRepository.upsert(removed, { session });
    await returnOrderService.cancelReturnDraftForSalesOrder(current, { session });
    if (currentWasPosted) {
      await reverseSalesOrderPosting(current, { session });
    }
    await reverseSalesOrderArIfPosted(current, { session });
  });
  if (removed.masterOrderId || removed.masterOrderCode) {
    await syncMasterOrderSummary(removed.masterOrderId || removed.masterOrderCode);
  }
  return { hardDeleted: false, salesOrder: toClient(removed) };
}

function compactOrderKeys(order = {}) {
  return [order.id, order.code, order.orderNo, order.orderCode, order._id]
    .map((value) => String(value || '').trim())
    .filter(Boolean);
}

function isInactiveOrder(order = {}) {
  const status = String(order.status || '').toLowerCase();
  return ['cancelled', 'canceled', 'void', 'deleted', 'removed'].includes(status) || Boolean(order.deletedAt);
}

function masterChildIdSet(masterOrder = {}) {
  return new Set((Array.isArray(masterOrder.childOrderIds) ? masterOrder.childOrderIds : [])
    .map((item) => String(item?.id || item?.code || item?._id || item || '').trim())
    .filter(Boolean));
}

async function getMasterChildren(masterOrder = {}) {
  // NGUỒN CHUẨN DUY NHẤT: masterOrder.childOrderIds.
  // Không dùng masterOrder.children, không dùng tổng cache, không dùng customer summary,
  // không tự lấy theo masterOrderId vì các liên kết cũ có thể còn sót sau khi xóa/hủy đơn.
  const ids = masterChildIdSet(masterOrder);
  if (!ids.size) return [];

  const orders = await orderRepository.findManyByIdentity(Array.from(ids));
  const byKey = new Map();
  for (const order of orders) {
    if (isInactiveOrder(order)) continue;
    const matched = compactOrderKeys(order).some((key) => ids.has(key));
    if (!matched) continue;
    const key = String(order.id || order.code || order._id || '').trim();
    if (key) byKey.set(key, order);
  }

  return Array.from(byKey.values());
}

function summarizeOrders(children = []) {
  const active = children.filter((order) => !isInactiveOrder(order));
  const totalOrders = active.length;
  const totalQuantity = active.reduce((sum, order) => {
    const items = Array.isArray(order.items) ? order.items : [];
    return sum + items.reduce((itemSum, item) => itemSum + toNumber(item.quantity ?? item.qty ?? item.totalQuantity ?? 0), 0);
  }, 0);
  const totalAmount = active.reduce((sum, order) => sum + toNumber(order.totalAmount), 0);
  const paidAmount = active.reduce((sum, order) => sum + toNumber(order.paidAmount), 0);
  const debtAmount = active.reduce((sum, order) => sum + deliveryFinance.calculateDeliveryDebt(order), 0);
  return {
    orderCount: totalOrders,
    totalOrders,
    totalQuantity,
    totalAmount,
    paidAmount,
    debtAmount,
    totalDebt: debtAmount
  };
}

async function syncMasterOrderSummary(masterIdOrCode, options = {}) {
  const master = await masterOrderRepository.findByIdOrCode(masterIdOrCode);
  if (!master) return null;
  const children = await getMasterChildren(master);
  const childOrderIds = children.map((order) => order.id || order.code).filter(Boolean);
  const updated = {
    ...master,
    childOrderIds,
    children: [],
    ...summarizeOrders(children),
    updatedAt: dateUtil.nowIso()
  };
  await masterOrderRepository.upsert(updated, options);
  return updated;
}

module.exports = {
  listOrders,
  searchOrders,
  getOrder,
  createOrder,
  updateOrder,
  updateVatInvoiceSetting,
  cancelOrder,
  deleteOrder,
  getMasterChildren,
  summarizeOrders,
  syncMasterOrderSummary,
  applySalesOrderPosting,
  reverseSalesOrderPosting,
  toClient
};
