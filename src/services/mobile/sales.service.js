'use strict';

const dateUtil = require('../../utils/date.util');
const { withMongoTransaction } = require('../../utils/transaction.util');
const { createMobileSalesRepository } = require('../../repositories/mobile/sales.repository');
const SalesOrder = require('../../models/SalesOrder');
const Customer = require('../../models/Customer');
const Product = require('../../models/Product');
const ReturnOrder = require('../../models/ReturnOrder');
const Payment = require('../../models/Payment');
const Cashbook = require('../../models/Cashbook');
const MobileLog = require('../../models/MobileLog');
const InventoryPostingService = require('../../domain/posting/InventoryPostingService');
const SalesOrderDeletionService = require('../../domain/lifecycle/SalesOrderDeletionService');
const inventoryStockService = require('../inventoryStock.service');
const { createStepTimer, getIdempotencyKey, readIdempotentResult, rememberIdempotentResult } = require('../../utils/mobilePerformance.util');
const promotionService = require('../promotionService');
const DebtReadService = require('../DebtReadService');
const { PROMOTION } = require('../../constants/pricingModes');
const orderStatusUtil = require('../../utils/orderStatus.util');
const { normalizeText, toNumber } = require('../../utils/common.util');


function inventoryRowOpenSaleQty(row = {}) {
  return inventoryStockService.quantityOf(row);
}

function canonicalProductCode(product = {}) {
  return String(product.code || product.productCode || product.sku || '').trim();
}


function uniqueClean(values = []) {
  return Array.from(new Set((Array.isArray(values) ? values : [values])
    .map((value) => String(value || '').trim())
    .filter(Boolean)));
}

function caseVariants(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return [];
  return uniqueClean([raw, raw.toUpperCase(), raw.toLowerCase()]);
}

function buildSalesOrderIdentityFilter(value) {
  const keys = uniqueClean([value]);
  if (!keys.length) return null;
  return {
    $or: [
      { id: { $in: keys } },
      { code: { $in: keys } },
      { orderCode: { $in: keys } },
      { salesOrderCode: { $in: keys } },
      { documentCode: { $in: keys } },
      { invoiceCode: { $in: keys } }
    ]
  };
}

// MOBILE_SALES_OWNER_FILTER_CANONICAL_START
function mobileUserSalesStaffCode(mobileUser = {}) {
  return String(
    mobileUser.salesStaffCode ||
    mobileUser.salesmanCode ||
    mobileUser.nvbhCode ||
    mobileUser.maNVBH ||
    mobileUser.staffCode ||
    mobileUser.code ||
    ''
  ).trim();
}

function mobileUserSalesStaffName(mobileUser = {}) {
  return String(
    mobileUser.salesStaffName ||
    mobileUser.salesmanName ||
    mobileUser.nvbhName ||
    mobileUser.maNVBHName ||
    mobileUser.fullName ||
    mobileUser.name ||
    ''
  ).trim();
}

function mobileSalesOwnerMongoFilter(mobileUser = {}) {
  const staffCode = mobileUserSalesStaffCode(mobileUser);
  const codeVariants = caseVariants(staffCode);
  if (codeVariants.length) {
    return {
      $or: [
        { salesStaffCode: { $in: codeVariants } },
        { salesPersonCode: { $in: codeVariants } },
        { salesmanCode: { $in: codeVariants } },
        { nvbhCode: { $in: codeVariants } },
        { maNVBH: { $in: codeVariants } },
        { 'salesStaff.code': { $in: codeVariants } }
      ]
    };
  }

  // Nếu tài khoản cũ chưa có mã NVBH thì chỉ cho fallback theo field tên NVBH canonical.
  // Không dùng generic staffCode/staffName để tránh app bán hàng nhìn thấy đơn của NVGH/NV khác.
  const staffName = mobileUserSalesStaffName(mobileUser);
  const nameVariants = caseVariants(staffName);
  if (!nameVariants.length) return null;
  return {
    $or: [
      { salesStaffName: { $in: nameVariants } },
      { salesPersonName: { $in: nameVariants } },
      { salesmanName: { $in: nameVariants } },
      { nvbhName: { $in: nameVariants } },
      { maNVBHName: { $in: nameVariants } },
      { 'salesStaff.name': { $in: nameVariants } },
      { 'salesStaff.fullName': { $in: nameVariants } }
    ]
  };
}
// MOBILE_SALES_OWNER_FILTER_CANONICAL_END

const INACTIVE_MOBILE_ORDER_STATUS_VALUES = ['cancelled', 'canceled', 'void', 'deleted', 'removed'];
const TRUTHY_MOBILE_DELETE_VALUES = [true, 'true', 1, '1', 'yes', 'YES', 'y', 'Y'];

function activeSalesOrderMongoFilter() {
  return {
    $and: [
      { status: { $nin: INACTIVE_MOBILE_ORDER_STATUS_VALUES } },
      { lifecycleStatus: { $nin: INACTIVE_MOBILE_ORDER_STATUS_VALUES } },
      { deliveryStatus: { $nin: INACTIVE_MOBILE_ORDER_STATUS_VALUES } },
      { deleted: { $nin: TRUTHY_MOBILE_DELETE_VALUES } },
      { isDeleted: { $nin: TRUTHY_MOBILE_DELETE_VALUES } },
      { deletedAt: { $in: [null, ''] } }
    ]
  };
}

function customerLookupKeysFromOrderBody(body = {}) {
  const customerPayload = body.customer || {};
  return uniqueClean([
    customerPayload.id,
    customerPayload._id,
    customerPayload.customerId,
    customerPayload.code,
    customerPayload.customerCode,
    body.customerId,
    body.customerCode
  ]);
}

async function findCustomerForOrderBody(body = {}) {
  const keys = uniqueClean(customerLookupKeysFromOrderBody(body).flatMap(caseVariants));
  if (!keys.length) return null;
  return Customer.findOne({
    isActive: { $ne: false },
    $or: [
      { id: { $in: keys } },
      { code: { $in: keys } },
      { customerCode: { $in: keys } },
      { phone: { $in: keys } }
    ]
  })
    .select('id code customerCode name customerName phone address area route isActive')
    .lean();
}

function productLookupKey(item = {}) {
  return String(item.productCode || item.code || item.sku || item.productId || '').trim();
}

function indexProductsByAlias(products = []) {
  const map = new Map();
  for (const product of products || []) {
    for (const key of uniqueClean([product.id, product._id, product.code, product.productCode, product.sku, product.barcode])) {
      map.set(key, product);
      map.set(key.toUpperCase(), product);
      map.set(key.toLowerCase(), product);
    }
  }
  return map;
}

async function findProductsForOrderItems(items = []) {
  const keys = uniqueClean((items || []).map(productLookupKey).flatMap(caseVariants));
  if (!keys.length) return [];
  return Product.find({
    isActive: { $ne: false },
    $or: [
      { id: { $in: keys } },
      { code: { $in: keys } },
      { productCode: { $in: keys } },
      { sku: { $in: keys } },
      { barcode: { $in: keys } }
    ]
  })
    .select('id code productCode sku barcode name productName unit baseUnit conversionRate packing brand category groupName productGroup salePrice price isActive')
    .lean();
}

function returnOrderIdentityFilterForSalesOrder(order = {}) {
  const ids = uniqueClean([order.id, order._id, order.salesOrderId, order.orderId]);
  const codes = uniqueClean([order.code, order.orderCode, order.salesOrderCode]);
  const or = [];
  if (ids.length) or.push({ salesOrderId: { $in: ids } }, { orderId: { $in: ids } }, { sourceOrderId: { $in: ids } }, { deliveryOrderId: { $in: ids } });
  if (codes.length) or.push({ salesOrderCode: { $in: codes } }, { orderCode: { $in: codes } }, { sourceOrderCode: { $in: codes } }, { deliveryOrderCode: { $in: codes } });
  if (!or.length) return null;
  return {
    status: { $nin: ['cancelled', 'canceled', 'void', 'deleted'] },
    $or: or
  };
}

function returnOrderHasValue(row = {}) {
  const itemHasReturn = (Array.isArray(row.items) ? row.items : []).some((item) => toNumber(item.returnQty ?? item.qtyReturn ?? item.returnQuantity ?? item.quantity ?? item.qty) > 0);
  return itemHasReturn || toNumber(row.totalReturnAmount ?? row.totalAmount ?? row.amount ?? row.debtReduction) > 0;
}

function returnOrderIsLocked(row = {}) {
  const status = String(row.status || row.returnStatus || '').toLowerCase();
  const mergeStatus = String(row.returnMergeStatus || '').toLowerCase();
  const warehouseStatus = String(row.warehouseReceiveStatus || '').toLowerCase();
  return Boolean(row.masterReturnOrderId || row.masterReturnOrderCode)
    || mergeStatus === 'merged'
    || ['received', 'posted', 'completed'].includes(status)
    || ['received', 'posted', 'completed'].includes(warehouseStatus);
}



async function getInventoryQtyByProducts(products = []) {
  const codes = (products || []).map(canonicalProductCode).filter(Boolean);
  const stockMap = await inventoryStockService.getAvailableStocks(codes);
  const result = new Map();
  for (const product of products || []) {
    const code = canonicalProductCode(product);
    if (!code) continue;
    result.set(code, Number(stockMap[inventoryStockService.normalizeProductCode(code)] || stockMap[code] || 0));
  }
  return result;
}

async function getInventoryQtyForProduct(product = {}) {
  const stock = await inventoryStockService.getAvailableStock(canonicalProductCode(product));
  return Number(stock.availableQty || 0);
}

function fail(statusCode, message) {
  return { statusCode, body: { ok: false, success: false, message } };
}

// MOBILE_PROMOTION_PRICE_LOCK_START
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
// MOBILE_PROMOTION_PRICE_LOCK_END

function createMobileSalesService(ctx) {
  const repo = createMobileSalesRepository(ctx);
  const {
    normalizeText,
    toNumber,
    formatCaseLooseQty,
    buildProductLineMeta,
    makeId,
    buildSalesCode,
    buildCashCode,
    updateSalesOrderWithRepost,
    writeMobileLog
  } = ctx;


  // MOBILE_SALES_STAFF_CANONICAL_MATCH_START
  function getMobileSalesStaffCode(mobileUser = {}) {
    return mobileUserSalesStaffCode(mobileUser);
  }

  function getMobileSalesStaffName(mobileUser = {}) {
    return mobileUserSalesStaffName(mobileUser);
  }
  // MOBILE_SALES_STAFF_CANONICAL_MATCH_END

  // MOBILE_SALES_CUSTOMER_LOOKUP_CANONICAL_START
  function cleanLookupValue(value) {
    return String(value || '').trim();
  }

  function customerLookupKeysFromBody(body = {}) {
    const customerPayload = body.customer || {};
    return [
      customerPayload.id,
      customerPayload._id,
      customerPayload.customerId,
      customerPayload.code,
      customerPayload.customerCode,
      body.customerId,
      body.customerCode
    ]
      .map(cleanLookupValue)
      .filter(Boolean)
      .filter((value, index, arr) => arr.indexOf(value) === index);
  }

  function findCustomerFromOrderPayload(data = {}, body = {}) {
    const keys = customerLookupKeysFromBody(body);
    for (const key of keys) {
      const customer = repo.findCustomer(data, key);
      if (customer) return customer;
    }
    return null;
  }
  // MOBILE_SALES_CUSTOMER_LOOKUP_CANONICAL_END

  function returnDraftLineKey(item = {}) {
    return [String(item.productCode || item.code || item.productId || '').trim(), String(item.unit || item.baseUnit || '').trim(), String(toNumber(item.salePrice ?? item.price ?? item.unitPrice ?? 0))].join('|');
  }

  function buildReturnDraftForMobileOrder(order = {}, existing = null) {
    const existingMap = new Map((Array.isArray(existing?.items) ? existing.items : []).map((item) => [String(item.lineKey || returnDraftLineKey(item)), item]));
    const items = (Array.isArray(order.items) ? order.items : []).map((item) => {
      const price = toNumber(item.salePrice ?? item.price ?? item.unitPrice ?? 0);
      const soldQty = toNumber(item.quantity ?? item.qty ?? 0);
      const key = returnDraftLineKey({ ...item, salePrice: price });
      const old = existingMap.get(key) || {};
      const returnQty = toNumber(old.returnQty ?? old.qtyReturn ?? old.quantity ?? 0);
      return {
        ...old,
        productId: item.productId || item.productCode || '',
        productCode: item.productCode || item.code || item.productId || '',
        productName: item.productName || item.name || '',
        unit: item.unit || item.baseUnit || '',
        soldQty,
        price,
        salePrice: price,
        soldAmount: Math.round(soldQty * price),
        returnQty,
        qtyReturn: returnQty,
        returnQuantity: returnQty,
        quantity: returnQty,
        qty: returnQty,
        returnAmount: Math.round(returnQty * price),
        amount: Math.round(returnQty * price),
        lineKey: key
      };
    });
    const totalSoldAmount = items.reduce((sum, item) => sum + toNumber(item.soldAmount), 0);
    const totalReturnAmount = items.reduce((sum, item) => sum + toNumber(item.returnAmount), 0);
    const status = totalReturnAmount > 0 ? 'waiting_receive' : 'draft';
    return {
      ...(existing || {}),
      id: existing?.id || `RO-${String(order.code || order.id || makeId('RO')).replace(/^RO[-_]?/i, '').replace(/[^a-zA-Z0-9_-]/g, '')}`,
      code: existing?.code || `RO-${String(order.code || order.id || makeId('RO')).replace(/^RO[-_]?/i, '').replace(/[^a-zA-Z0-9_-]/g, '')}`,
      date: order.deliveryDate || order.date || dateUtil.todayVN(),
      documentDate: order.date || dateUtil.todayVN(),
      salesOrderId: order.id || '',
      salesOrderCode: order.code || '',
      orderId: order.id || '',
      orderCode: order.code || '',
      customerId: order.customerId || '',
      customerCode: order.customerCode || '',
      customerName: order.customerName || '',
      salesStaffCode: order.salesStaffCode || order.staffCode || '',
      salesStaffName: order.salesStaffName || order.staffName || '',
      staffCode: order.salesStaffCode || order.staffCode || '',
      staffName: order.salesStaffName || order.staffName || '',
      masterOrderId: order.masterOrderId || '',
      masterOrderCode: order.masterOrderCode || '',
      deliveryStaffId: order.deliveryStaffId || '',
      deliveryStaffCode: order.deliveryStaffCode || '',
      deliveryStaffName: order.deliveryStaffName || '',
      deliveryDate: order.deliveryDate || order.date || dateUtil.todayVN(),
      items,
      totalSoldAmount,
      totalReturnAmount,
      totalQuantity: items.reduce((sum, item) => sum + toNumber(item.returnQty), 0),
      totalAmount: totalReturnAmount,
      amount: totalReturnAmount,
      debtReduction: totalReturnAmount,
      status,
      returnStatus: status,
      returnState: status,
      returnMergeStatus: existing?.returnMergeStatus || 'unmerged',
      warehouseReceiveStatus: status === 'waiting_receive' ? 'waiting_receive' : 'draft',
      source: existing?.source || 'sales_order_draft',
      createdFrom: existing?.createdFrom || 'sales_order',
      accountingStatus: status === 'waiting_receive' ? 'pending' : 'draft',
      accountingConfirmed: Boolean(existing?.accountingConfirmed),
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  function syncReturnDraftInSnapshot(data = {}, order = {}) {
    data.returnOrders = Array.isArray(data.returnOrders) ? data.returnOrders : [];
    const idx = data.returnOrders.findIndex((row) => String(row.salesOrderId || row.orderId || '').trim() === String(order.id || '').trim() || String(row.salesOrderCode || row.orderCode || '').trim() === String(order.code || '').trim());
    const existing = idx >= 0 ? data.returnOrders[idx] : null;
    if (existing && ['posted', 'received', 'warehouse_received', 'completed'].includes(String(existing.status || '').toLowerCase())) return existing;
    const draft = buildReturnDraftForMobileOrder(order, existing);
    if (idx >= 0) data.returnOrders[idx] = draft;
    else data.returnOrders.push(draft);
    return draft;
  }

  function cancelReturnDraftInSnapshot(data = {}, order = {}) {
    const rows = Array.isArray(data.returnOrders) ? data.returnOrders : [];
    const row = rows.find((item) => String(item.salesOrderId || item.orderId || '').trim() === String(order.id || '').trim() || String(item.salesOrderCode || item.orderCode || '').trim() === String(order.code || '').trim());
    if (!row) return null;
    const hasReturn = (Array.isArray(row.items) ? row.items : []).some((item) => toNumber(item.returnQty ?? item.qtyReturn ?? item.quantity) > 0) || toNumber(row.totalReturnAmount ?? row.totalAmount ?? row.amount) > 0;
    if (hasReturn) return { error: 'Đơn chờ trả hàng đã có số lượng trả, không được xóa đơn bán trước khi xử lý phiếu trả' };
    row.status = 'cancelled';
    row.returnStatus = 'cancelled';
    row.cancelledAt = new Date().toISOString();
    row.updatedAt = new Date().toISOString();
    return row;
  }

  // MOBILE_SALES_OWNERSHIP_NO_GENERIC_STAFF_START
  function isOwnedByMobileUser(order, mobileUser) {
    const userSalesCode = normalizeText(getMobileSalesStaffCode(mobileUser));
    if (!userSalesCode) return false;

    return [
      order.salesStaffCode,
      order.salesPersonCode,
      order.salesmanCode,
      order.nvbhCode,
      order.maNVBH,
      order.salesStaff && order.salesStaff.code
    ].some((value) => normalizeText(value) === userSalesCode);
  }
  // MOBILE_SALES_OWNERSHIP_NO_GENERIC_STAFF_END

  async function createSalesOrder({ body = {}, mobileUser }) {
    const customerKeysForIdem = customerLookupKeysFromOrderBody(body);
    const idemKey = getIdempotencyKey(body, ['sales-create', mobileUser && (mobileUser.id || mobileUser.code), body.customerCode || customerKeysForIdem[0] || '', Array.isArray(body.items) ? body.items.length : 0]);
    const cachedResult = readIdempotentResult(idemKey);
    if (cachedResult) return cachedResult;
    const perf = createStepTimer('sales.createOrder');
    let createdOrder = null;

    let result;
    try {
      result = await withMongoTransaction(async (session) => {
        perf('start');
        const customer = await findCustomerForOrderBody(body);
        const rawItems = Array.isArray(body.items) ? body.items : [];
        const paidAmount = toNumber(body.paidAmount);
        const date = dateUtil.todayVN();

        if (!customer) return fail(400, 'Không tìm thấy khách hàng');
        if (!rawItems.length) return fail(400, 'Đơn mobile chưa có sản phẩm');
        perf('load_customer_direct');

        const products = await findProductsForOrderItems(rawItems);
        const productAliasMap = indexProductsByAlias(products);
        const preparedRows = [];
        const productByCode = new Map();

        for (const rawItem of rawItems) {
          const lookupKey = productLookupKey(rawItem);
          const product = productAliasMap.get(lookupKey) || productAliasMap.get(String(lookupKey).toUpperCase()) || productAliasMap.get(String(lookupKey).toLowerCase());
          if (!product) return fail(400, `Không tìm thấy sản phẩm: ${rawItem.productCode || rawItem.code || ''}`);
          const quantity = toNumber(rawItem.quantity || rawItem.qty);
          const salePrice = toNumber(rawItem.salePrice || rawItem.price || product.salePrice || product.price);
          if (quantity <= 0) return fail(400, `Số lượng phải lớn hơn 0: ${product.code}`);
          preparedRows.push({ rawItem, product, quantity, salePrice });
          productByCode.set(String(product.code || product.productCode || product.id || '').trim(), product);
        }
        perf('prepare_items_direct', { products: productByCode.size });

        const stockByProduct = await getInventoryQtyByProducts(Array.from(productByCode.values()));
        perf('batch_stock_check', { products: productByCode.size });

        const baseItems = [];
        for (const row of preparedRows) {
          const { product, quantity, salePrice } = row;
          const stockKey = String(product.code || product.productCode || product.id || '').trim();
          const availableQty = stockByProduct.get(stockKey) || 0;
          if (availableQty < quantity) {
            return fail(400, `Không đủ tồn mở bán: ${product.code}. Tồn ${formatCaseLooseQty(availableQty, product.conversionRate || 1)}, cần ${formatCaseLooseQty(quantity, product.conversionRate || 1)}`);
          }
          baseItems.push({
            productId: product.id || String(product._id || product.code || ''),
            productCode: product.code || product.productCode || product.sku || '',
            productName: product.name || product.productName || '',
            ...buildProductLineMeta(product),
            quantity,
            grossPrice: salePrice,
            catalogSalePrice: salePrice,
            salePrice,
            price: salePrice,
            amount: quantity * salePrice
          });
        }

        const promotionResult = await promotionService.calculatePromotions(baseItems);
        const promotionByCode = new Map((promotionResult.lines || []).map((line) => [String(line.productCode || '').trim(), line]));
        const items = baseItems.map((item) => {
          const line = promotionByCode.get(String(item.productCode || '').trim()) || {};
          const grossPrice = toNumber(line.catalogSalePrice || item.grossPrice || item.salePrice);
          const grossAmount = Math.round(item.quantity * grossPrice);
          const directDiscountAmount = toNumber(line.directDiscountAmount || 0);
          const groupDiscountAmount = toNumber(line.groupDiscountAmount || 0);
          const discountAmount = Math.min(grossAmount, directDiscountAmount + groupDiscountAmount);
          const amount = Math.max(0, grossAmount - discountAmount);
          const finalPrice = item.quantity > 0 ? Math.round(amount / item.quantity) : 0;
          const promotionRows = Array.isArray(line.promotionRows) ? line.promotionRows : [];
          const promotionIdentity = extractPromotionIdentity(promotionRows);
          return {
            ...item,
            originalPrice: grossPrice,
            grossPrice,
            catalogSalePrice: grossPrice,
            grossAmount,
            directDiscountPercent: toNumber(line.directDiscountPercent || 0),
            groupDiscountPercent: toNumber(line.groupDiscountPercent || 0),
            discountPercent: grossAmount > 0 ? (discountAmount / grossAmount) * 100 : 0,
            directDiscountAmount,
            groupDiscountAmount,
            discountAmount,
            promotionAmount: discountAmount,
            totalDiscountAmount: discountAmount,
            finalPrice,
            unitPrice: finalPrice,
            salePrice: finalPrice,
            price: finalPrice,
            preTaxPriceAtOrder: Math.round(grossPrice / 1.08),
            vatAmountAtOrder: Math.round((finalPrice - (finalPrice / 1.08)) * item.quantity),
            lineAmountAtOrder: amount,
            amount,
            netAmount: amount,
            saleMethod: PROMOTION,
            saleMode: PROMOTION,
            pricingMode: PROMOTION,
            priceLocked: true,
            lockedPrice: true,
            lockedPromotion: true,
            promotionCalculated: true,
            promotionRows,
            appliedPromotionRows: promotionRows,
            productSnapshot: {
              ...(item.productSnapshot || {}),
              salePrice: grossPrice,
              conversionRate: item.conversionRateAtOrder || item.conversionRate || 1,
              warehouseCode: item.warehouseCodeAtOrder || item.warehouseCode || 'KHO_HC',
              defaultWarehouse: item.warehouseCodeAtOrder || item.warehouseCode || 'KHO_HC'
            },
            ...promotionIdentity
          };
        });

        const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
        const totalGrossAmount = items.reduce((sum, item) => sum + toNumber(item.grossAmount), 0);
        const totalDiscountAmount = items.reduce((sum, item) => sum + toNumber(item.discountAmount), 0);
        const totalAmount = items.reduce((sum, item) => sum + item.amount, 0);
        const promotionCodes = Array.from(new Set(items.map((item) => item.promotionCode).filter(Boolean)));
        if (paidAmount > totalAmount) return fail(400, 'Tiền thu không được lớn hơn tổng đơn');

        const orderId = makeId('SO');
        const salesOrder = {
          id: orderId,
          code: String(body.code || body.orderCode || orderId).trim(),
          date,
          customerId: customer.id || String(customer._id || customer.code || ''),
          customerCode: customer.code || customer.customerCode || '',
          customerName: customer.name || customer.customerName || '',
          customerPhone: customer.phone || '',
          customerAddress: customer.address || '',
          salesStaffCode: getMobileSalesStaffCode(mobileUser),
          salesStaffName: getMobileSalesStaffName(mobileUser),
          salesmanCode: getMobileSalesStaffCode(mobileUser),
          salesmanName: getMobileSalesStaffName(mobileUser),
          staffCode: '',
          staffName: '',
          source: 'mobile_sales_app',
          orderSource: 'NVBH',
          orderSourceName: 'Từ NVBH',
          vatInvoiceRequired: true,
          vatInvoiceDecisionSource: 'default',
          vatInvoiceNote: '',
          vatInvoiceUpdatedAt: '',
          vatInvoiceUpdatedBy: '',
          saleMethod: PROMOTION,
          saleMode: PROMOTION,
          pricingMode: PROMOTION,
          orderPricingMode: PROMOTION,
          isPromotionSale: true,
          promotionCalculated: true,
          isChildOrder: true,
          masterOrderId: '',
          mergeStatus: 'unmerged',
          note: String(body.note || 'Tạo từ mobile app').trim(),
          items,
          totalQuantity,
          grossAmount: totalGrossAmount,
          totalGrossAmount,
          grossAmountBeforePromotion: totalGrossAmount,
          discountAmount: totalDiscountAmount,
          totalDiscountAmount,
          promotionAmount: totalDiscountAmount,
          totalPromotionAmount: totalDiscountAmount,
          netAmount: totalAmount,
          goodsAmountAfterPromotion: totalAmount,
          promotionCodes,
          priceLocked: true,
          lockedPrice: true,
          lockedPromotion: true,
          totalAmount,
          paidAmount,
          debtAmount: totalAmount - paidAmount,
          status: 'pending',
          lifecycleStatus: 'pending',
          orderDate: date,
          deliveryStatus: 'pending',
          accountingStatus: 'pending',
          stockPosted: true,
          stockPostedAt: new Date().toISOString(),
          stockPostedBy: mobileUser.code || mobileUser.name || 'mobile_sales',
          createdAt: new Date().toISOString()
        };

        const created = await SalesOrder.create([salesOrder], { session });
        const savedOrder = created[0];
        const savedOrderObject = savedOrder && typeof savedOrder.toObject === 'function' ? savedOrder.toObject() : savedOrder;
        perf('create_sales_order_direct');

        await InventoryPostingService.postSaleOut(savedOrderObject, { session });
        perf('post_inventory_sale_out');

        await Payment.create([{
          id: makeId('PM'),
          date,
          type: 'sale_debt',
          refType: 'salesOrder',
          refId: salesOrder.id,
          refCode: salesOrder.code,
          customerId: salesOrder.customerId,
          customerCode: salesOrder.customerCode,
          customerName: salesOrder.customerName,
          debit: totalAmount,
          credit: paidAmount,
          note: `Phát sinh từ đơn mobile ${salesOrder.code}`,
          createdAt: new Date().toISOString()
        }], { session });

        if (paidAmount > 0) {
          await Cashbook.create([{
            id: makeId('CB'),
            code: makeId('CB'),
            date,
            type: 'in',
            source: 'mobile_sales_payment',
            refType: 'salesOrder',
            refId: salesOrder.id,
            refCode: salesOrder.code,
            customerId: salesOrder.customerId,
            customerCode: salesOrder.customerCode,
            customerName: salesOrder.customerName,
            staffName: mobileUser.name || '',
            amount: paidAmount,
            note: `Thu tiền từ đơn mobile ${salesOrder.code}`,
            createdAt: new Date().toISOString()
          }], { session });
        }

        await MobileLog.create([{
          id: makeId('ML'),
          action: 'mobile_create_sales_order',
          actorCode: mobileUser.code || mobileUser.staffCode || '',
          actorName: mobileUser.fullName || mobileUser.name || '',
          refType: 'salesOrder',
          refId: salesOrder.id,
          refCode: salesOrder.code,
          note: `Tạo đơn ${salesOrder.code} từ mobile`,
          createdAt: new Date().toISOString()
        }], { session });
        perf('save_operational_documents_direct');

        createdOrder = savedOrderObject;
        return { statusCode: 201, body: { ok: true, source: 'mobile-sales-route-direct', message: 'Đã gửi đơn mobile về hệ thống tổng', salesOrder: savedOrderObject } };
      });
    } catch (err) {
      if (err && err.code === 'INSUFFICIENT_STOCK') {
        const stockFail = fail(400, err.message || 'Không đủ tồn kho');
        return rememberIdempotentResult(idemKey, stockFail);
      }
      throw err;
    }

    const finalResult = result || { statusCode: 201, body: { ok: true, salesOrder: createdOrder } };
    perf('done');
    return rememberIdempotentResult(idemKey, finalResult);
  }

  
  async function getSalesOrder({ params = {}, mobileUser }) {
    const identity = buildSalesOrderIdentityFilter(params.id);
    const owner = mobileSalesOwnerMongoFilter(mobileUser);
    if (!identity || !owner) return fail(404, 'Không tìm thấy đơn bán');
    const order = await SalesOrder.findOne({ $and: [identity, owner] }).lean();
    if (!order) return fail(404, 'Không tìm thấy đơn bán');
    return { body: { ok: true, source: 'mobile-sales-route-direct', order: { ...order, canEdit: !order.masterOrderId && (order.mergeStatus || 'unmerged') !== 'merged' } } };
  }

  
  async function updateSalesOrder({ params = {}, body = {}, mobileUser }) {
    const idemKey = getIdempotencyKey(body, ['sales-update', mobileUser && (mobileUser.id || mobileUser.code), params.id]);
    const cachedResult = readIdempotentResult(idemKey);
    if (cachedResult) return cachedResult;
    const perf = createStepTimer('sales.updateOrder');
    perf('start');

    const identity = buildSalesOrderIdentityFilter(params.id);
    const owner = mobileSalesOwnerMongoFilter(mobileUser);
    if (!identity || !owner) return rememberIdempotentResult(idemKey, fail(404, 'Không tìm thấy đơn bán'));

    const order = await SalesOrder.findOne({ $and: [identity, owner, activeSalesOrderMongoFilter()] }).lean();
    if (!order) return rememberIdempotentResult(idemKey, fail(404, 'Không tìm thấy đơn bán'));

    if (order.masterOrderId || order.masterOrderCode || order.masterOrderNo || String(order.mergeStatus || 'unmerged').toLowerCase() === 'merged') {
      return rememberIdempotentResult(idemKey, fail(403, 'Đơn đã gộp đơn tổng, app bán hàng không được sửa'));
    }

    if (order.stockPosted) {
      return rememberIdempotentResult(idemKey, fail(409, 'Đơn đã post tồn, không được sửa trực tiếp. Cần hủy/đảo tồn rồi tạo lại hoặc dùng flow chỉnh sửa có reverse/repost.'));
    }

    const customerPayload = body.customer || {};
    const rawItems = Array.isArray(body.items) ? body.items : null;
    const now = new Date().toISOString();
    const patch = {
      customerId: customerPayload.id || customerPayload.customerId || body.customerId || order.customerId,
      customerCode: customerPayload.code || customerPayload.customerCode || body.customerCode || order.customerCode,
      customerName: customerPayload.name || customerPayload.customerName || body.customerName || order.customerName,
      note: String(body.note ?? order.note ?? '').trim(),
      salesStaffCode: getMobileSalesStaffCode(mobileUser),
      salesStaffName: getMobileSalesStaffName(mobileUser),
      salesmanCode: getMobileSalesStaffCode(mobileUser),
      salesmanName: getMobileSalesStaffName(mobileUser),
      vatInvoiceRequired: order.vatInvoiceRequired !== false,
      vatInvoiceDecisionSource: order.vatInvoiceDecisionSource || 'default',
      vatInvoiceNote: String(order.vatInvoiceNote || ''),
      vatInvoiceUpdatedAt: String(order.vatInvoiceUpdatedAt || ''),
      vatInvoiceUpdatedBy: String(order.vatInvoiceUpdatedBy || ''),
      updatedAt: now
    };

    if (rawItems) {
      const items = rawItems.map((item = {}) => {
        const quantity = toNumber(item.quantity ?? item.qty ?? 0);
        const salePrice = toNumber(item.salePrice ?? item.unitPrice ?? item.finalPrice ?? item.price ?? 0);
        const grossPrice = toNumber(item.grossPrice ?? item.originalPrice ?? item.catalogSalePrice ?? salePrice);
        const grossAmount = Math.round(toNumber(item.grossAmount ?? quantity * grossPrice));
        const discountAmount = toNumber(item.discountAmount ?? item.promotionAmount ?? item.totalDiscountAmount ?? Math.max(0, grossAmount - toNumber(item.amount ?? quantity * salePrice)));
        const amount = Math.max(0, Math.round(toNumber(item.amount ?? quantity * salePrice)));
        return {
          ...item,
          quantity,
          qty: quantity,
          grossPrice,
          grossAmount,
          discountAmount,
          promotionAmount: toNumber(item.promotionAmount ?? discountAmount),
          totalDiscountAmount: toNumber(item.totalDiscountAmount ?? discountAmount),
          salePrice,
          unitPrice: toNumber(item.unitPrice ?? salePrice),
          finalPrice: toNumber(item.finalPrice ?? item.unitPrice ?? salePrice),
          price: toNumber(item.price ?? salePrice),
          amount,
          netAmount: toNumber(item.netAmount ?? amount)
        };
      });

      const invalidItem = items.find((item) => toNumber(item.quantity) <= 0);
      if (invalidItem) {
        return rememberIdempotentResult(idemKey, fail(400, `Số lượng phải lớn hơn 0: ${invalidItem.productCode || invalidItem.code || invalidItem.productName || ''}`));
      }

      const totalQuantity = items.reduce((sum, item) => sum + toNumber(item.quantity), 0);
      const totalGrossAmount = items.reduce((sum, item) => sum + toNumber(item.grossAmount ?? toNumber(item.quantity) * toNumber(item.grossPrice)), 0);
      const totalDiscountAmount = items.reduce((sum, item) => sum + toNumber(item.discountAmount ?? item.promotionAmount ?? item.totalDiscountAmount), 0);
      const totalAmount = items.reduce((sum, item) => sum + toNumber(item.amount), 0);
      const paidAmount = toNumber(body.paidAmount ?? order.paidAmount ?? 0);
      if (paidAmount > totalAmount) return rememberIdempotentResult(idemKey, fail(400, 'Tiền thu không được lớn hơn tổng đơn'));

      Object.assign(patch, {
        items,
        totalQuantity,
        grossAmount: totalGrossAmount,
        totalGrossAmount,
        grossAmountBeforePromotion: totalGrossAmount,
        discountAmount: totalDiscountAmount,
        totalDiscountAmount,
        promotionAmount: totalDiscountAmount,
        totalPromotionAmount: totalDiscountAmount,
        netAmount: totalAmount,
        goodsAmountAfterPromotion: totalAmount,
        totalAmount,
        paidAmount,
        debtAmount: totalAmount - paidAmount,
        promotionCodes: Array.from(new Set(items.map((item) => item.promotionCode).filter(Boolean)))
      });
    }

    const updateFilter = {
      $and: [
        identity,
        owner,
        activeSalesOrderMongoFilter(),
        { stockPosted: { $ne: true } },
        { $or: [{ masterOrderId: { $exists: false } }, { masterOrderId: null }, { masterOrderId: '' }] },
        { $or: [{ masterOrderCode: { $exists: false } }, { masterOrderCode: null }, { masterOrderCode: '' }] },
        { $or: [{ masterOrderNo: { $exists: false } }, { masterOrderNo: null }, { masterOrderNo: '' }] },
        { mergeStatus: { $ne: 'merged' } }
      ]
    };

    const updated = await withMongoTransaction(async (session) => {
      const salesOrder = await SalesOrder.findOneAndUpdate(
        updateFilter,
        { $set: patch },
        { new: true, lean: true, session }
      );
      if (!salesOrder) return null;

      await MobileLog.create([{
        id: makeId('ML'),
        action: 'mobile_edit_sales_order',
        actorCode: mobileUser.code || mobileUser.staffCode || '',
        actorName: mobileUser.fullName || mobileUser.name || '',
        refType: 'salesOrder',
        refId: salesOrder.id,
        refCode: salesOrder.code,
        note: `Sửa đơn ${salesOrder.code} từ mobile`,
        createdAt: now
      }], { session });

      return salesOrder;
    });

    if (!updated) {
      return rememberIdempotentResult(idemKey, fail(409, 'Đơn đã thay đổi trạng thái, không thể sửa trực tiếp từ app bán hàng'));
    }

    const result = {
      body: {
        ok: true,
        source: 'mobile-sales-route-direct',
        message: `Đã sửa đơn ${updated.code}`,
        salesOrder: updated
      }
    };
    perf('save_sales_order_direct');
    perf('done');
    return rememberIdempotentResult(idemKey, result);
  }

  async function deleteSalesOrder({ params = {}, mobileUser }) {
    const owner = mobileSalesOwnerMongoFilter(mobileUser);
    if (!owner) return fail(403, 'Không xác định được nhân viên bán hàng');

    const result = await SalesOrderDeletionService.deleteSalesOrder(params.id, {
      source: 'mobile-sales-app',
      actorCode: mobileUser.code || mobileUser.staffCode || '',
      actorName: mobileUser.fullName || mobileUser.name || '',
      ownerFilter: owner
    });

    if (result.error) {
      return fail(result.status || 400, result.error);
    }

    return {
      body: {
        ok: true,
        source: 'mobile-sales-delete-service',
        message: result.message || `Đã xóa đơn ${result.salesOrder?.code || ''}`,
        mode: result.mode,
        hardDeleted: true,
        salesOrder: result.salesOrder,
        order: result.salesOrder
      }
    };
  }
  
  async function listSalesOrders({ query = {}, mobileUser }) {
    const date = dateUtil.toDateOnly(query.date || dateUtil.todayVN());
    const onlyMine = String(query.mine || '1') !== '0';
    const q = String(query.q || '').trim();

    const and = [activeSalesOrderMongoFilter()];
    if (date) and.push({ $or: [{ date }, { orderDate: date }] });
    if (onlyMine) {
      const owner = mobileSalesOwnerMongoFilter(mobileUser);
      if (!owner) return { body: { ok: true, source: 'mobile-sales-route-direct', date, items: [] } };
      and.push(owner);
    }
    if (q) {
      const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      and.push({ $or: [
        { code: rx },
        { orderCode: rx },
        { salesOrderCode: rx },
        { customerCode: rx },
        { customerName: rx },
        { customerPhone: rx },
        { customerAddress: rx }
      ] });
    }

    const rows = await SalesOrder.find(and.length === 1 ? and[0] : { $and: and })
      .select('id code date orderDate customerId customerCode customerName customerPhone customerAddress salesStaffCode salesStaffName salesPersonCode salesPersonName salesmanCode salesmanName nvbhCode nvbhName maNVBH maNVBHName totalAmount paidAmount debtAmount status lifecycleStatus deliveryStatus deleted isDeleted deletedAt deleteMode deleteReason masterOrderId masterOrderCode masterOrderNo mergeStatus items note createdAt')
      .sort({ createdAt: -1, date: -1 })
      .limit(100)
      .lean();

    const items = rows.map((order) => ({
      id: order.id,
      code: order.code,
      date: order.date || order.orderDate,
      customerName: order.customerName,
      totalAmount: toNumber(order.totalAmount),
      paidAmount: toNumber(order.paidAmount),
      debtAmount: toNumber(order.debtAmount),
      status: order.status,
      lifecycleStatus: order.lifecycleStatus || order.status || '',
      deliveryStatus: order.deliveryStatus || 'pending',
      deleted: Boolean(order.deleted),
      isDeleted: Boolean(order.isDeleted),
      deletedAt: order.deletedAt || '',
      deleteMode: order.deleteMode || '',
      deleteReason: order.deleteReason || '',
      masterOrderId: order.masterOrderId || '',
      masterOrderCode: order.masterOrderCode || '',
      mergeStatus: order.mergeStatus || 'unmerged',
      canEdit: !order.masterOrderId && !order.masterOrderCode && !order.masterOrderNo && (order.mergeStatus || 'unmerged') !== 'merged',
      customerId: order.customerId,
      customerCode: order.customerCode,
      customerPhone: order.customerPhone,
      customerAddress: order.customerAddress,
      salesStaffCode: order.salesStaffCode || order.salesPersonCode || order.salesmanCode || order.nvbhCode || order.maNVBH || '',
      salesStaffName: order.salesStaffName || order.salesPersonName || order.salesmanName || order.nvbhName || order.maNVBHName || '',
      salesPersonCode: order.salesPersonCode || '',
      salesPersonName: order.salesPersonName || '',
      salesmanCode: order.salesmanCode || '',
      salesmanName: order.salesmanName || '',
      nvbhCode: order.nvbhCode || '',
      nvbhName: order.nvbhName || '',
      maNVBH: order.maNVBH || '',
      maNVBHName: order.maNVBHName || '',
      items: order.items || [],
      note: order.note || '',
      createdAt: order.createdAt
    })).filter((order) => orderStatusUtil.isOrderVisibleInHistory(order));

    return { body: { ok: true, source: 'mobile-sales-route-direct', date, items } };
  }

  
  async function listDebts({ query = {}, mobileUser } = {}) {
    const scopedQuery = {
      ...query,
      collectorType: 'sales',
      limit: query.limit || 100,
      includePaid: query.includePaid || '0',
      includePendingCollections: query.includePendingCollections ?? '1'
    };

    if (String(mobileUser?.role || '') === 'sales') {
      const staffCode = getMobileSalesStaffCode(mobileUser);
      const staffName = getMobileSalesStaffName(mobileUser);
      scopedQuery.salesman = staffCode || staffName;
    }

    const result = await DebtReadService.getCustomerDebts(scopedQuery);

    return {
      body: result
    };
  }



  return {
    createSalesOrder,
    getSalesOrder,
    updateSalesOrder,
    deleteSalesOrder,
    listSalesOrders,
    listDebts
  };
}

module.exports = { createMobileSalesService };
