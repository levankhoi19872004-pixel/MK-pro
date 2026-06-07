'use strict';

const dateUtil = require('../../utils/date.util');
const { withMongoTransaction } = require('../../utils/transaction.util');
const { createMobileSalesRepository } = require('../../repositories/mobile/sales.repository');
const InventoryLegacy = require('../../models/InventoryLegacy');
const { createStepTimer, getIdempotencyKey, readIdempotentResult, rememberIdempotentResult } = require('../../utils/mobilePerformance.util');
const promotionService = require('../promotionService');
const { PROMOTION } = require('../../constants/pricingModes');


function inventoryRowOpenSaleQty(row = {}) {
  const onHand = Number(row.onHand ?? row.quantity ?? row.qty ?? row.stockQuantity ?? 0);
  const reserved = Number(row.reservedQty ?? row.reserved ?? 0);
  return row.availableQty !== undefined && row.availableQty !== null
    ? Number(row.availableQty || 0)
    : Math.max(0, onHand - reserved);
}

function canonicalProductCode(product = {}) {
  return String(product.code || product.productCode || product.sku || '').trim();
}

function buildProductStockKeys(product = {}) {
  return [product.code, product.productCode, product.sku, product.id, product._id, product._id ? String(product._id) : '']
    .map((value) => String(value || '').trim())
    .filter(Boolean);
}

function buildProductAliasMap(products = []) {
  const aliasToCanonical = new Map();
  const result = new Map();
  for (const product of products || []) {
    const canonical = canonicalProductCode(product) || String(product.id || product._id || '').trim();
    if (!canonical) continue;
    result.set(canonical, 0);
    for (const key of buildProductStockKeys(product)) {
      aliasToCanonical.set(key, canonical);
    }
  }
  return { aliasToCanonical, result };
}

function resolveInventoryRowCanonical(row = {}, aliasToCanonical = new Map()) {
  const matchedKey = [
    row.productCode,
    row.code,
    row.sku,
    row.product?.code,
    row.product?.productCode,
    row.product?.sku,
    row.productId,
    row.product?._id,
    row.product?._id ? String(row.product._id) : ''
  ]
    .map((value) => String(value || '').trim())
    .find((key) => key && aliasToCanonical.has(key));
  return aliasToCanonical.get(matchedKey) || '';
}

async function getInventoryQtyByProducts(products = []) {
  const { aliasToCanonical, result } = buildProductAliasMap(products);
  const uniqueKeys = Array.from(aliasToCanonical.keys());
  if (!uniqueKeys.length) return result;

  const inventoryRows = await InventoryLegacy.find({
    $or: [
      { productCode: { $in: uniqueKeys } },
      { productId: { $in: uniqueKeys } },
      { code: { $in: uniqueKeys } },
      { sku: { $in: uniqueKeys } }
    ]
  }).lean();

  for (const row of inventoryRows || []) {
    // Mỗi dòng inventories chỉ được cộng đúng 1 lần vào sản phẩm chuẩn.
    const canonical = resolveInventoryRowCanonical(row, aliasToCanonical);
    if (!canonical) continue;
    result.set(canonical, (result.get(canonical) || 0) + inventoryRowOpenSaleQty(row));
  }
  return result;
}

async function getInventoryQtyForProduct(product = {}) {
  const stockByProduct = await getInventoryQtyByProducts([product]);
  const canonical = canonicalProductCode(product) || String(product.id || product._id || '').trim();
  return Number(stockByProduct.get(canonical) || 0);
}

function fail(statusCode, message) {
  return { statusCode, body: { ok: false, success: false, message } };
}

function createMobileSalesService(ctx) {
  const repo = createMobileSalesRepository(ctx);
  const {
    normalizeText,
    toNumber,
    formatCaseLooseQty,
    buildProductLineMeta,
    reduceStock,
    makeId,
    buildSalesCode,
    buildCashCode,
    updateSalesOrderWithRepost,
    writeMobileLog
  } = ctx;


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
    const status = totalReturnAmount > 0 ? 'has_return' : 'draft';
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
      returnMergeStatus: existing?.returnMergeStatus || 'unmerged',
      warehouseReceiveStatus: status === 'has_return' ? 'waiting_receive' : 'draft',
      source: existing?.source || 'sales_order_draft',
      createdFrom: existing?.createdFrom || 'sales_order',
      accountingStatus: status === 'has_return' ? 'pending' : 'draft',
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

  function isOwnedByMobileUser(order, mobileUser) {
    return normalizeText(order.staffCode || order.salesStaffCode) === normalizeText(mobileUser.code)
      || normalizeText(order.staffName || order.salesStaffName) === normalizeText(mobileUser.name);
  }

  async function createSalesOrder({ body = {}, mobileUser }) {
    const idemKey = getIdempotencyKey(body, ['sales-create', mobileUser && (mobileUser.id || mobileUser.code), body.customerCode || (body.customer && body.customer.code), Array.isArray(body.items) ? body.items.length : 0]);
    const cachedResult = readIdempotentResult(idemKey);
    if (cachedResult) return cachedResult;
    const perf = createStepTimer('sales.createOrder');
    let createdOrder = null;

    const result = await withMongoTransaction(async () => {
      perf('start');
      const data = await repo.getPrimaryDataSnapshot();
      perf('load_snapshot');
      const customerPayload = body.customer || {};
      const customer = repo.findCustomer(data, customerPayload.id || customerPayload.code || body.customerId || body.customerCode);
      const rawItems = Array.isArray(body.items) ? body.items : [];
      const paidAmount = toNumber(body.paidAmount);
      const date = dateUtil.todayVN();

      if (!customer) return fail(400, 'Không tìm thấy khách hàng');
      if (!rawItems.length) return fail(400, 'Đơn mobile chưa có sản phẩm');

      const preparedRows = [];
      const productByCode = new Map();
      for (const rawItem of rawItems) {
        const product = repo.findProduct(data, rawItem.productCode || rawItem.code || rawItem.productId);
        if (!product) return fail(400, `Không tìm thấy sản phẩm: ${rawItem.productCode || rawItem.code || ''}`);
        const quantity = toNumber(rawItem.quantity || rawItem.qty);
        const salePrice = toNumber(rawItem.salePrice || rawItem.price || product.salePrice);
        if (quantity <= 0) return fail(400, `Số lượng phải lớn hơn 0: ${product.code}`);
        preparedRows.push({ rawItem, product, quantity, salePrice });
        productByCode.set(String(product.code || product.productCode || product.id || '').trim(), product);
      }
      perf('prepare_items');
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
          productId: product.id,
          productCode: product.code,
          productName: product.name,
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
        return {
          ...item,
          grossPrice,
          grossAmount,
          directDiscountPercent: toNumber(line.directDiscountPercent || 0),
          groupDiscountPercent: toNumber(line.groupDiscountPercent || 0),
          discountPercent: grossAmount > 0 ? (discountAmount / grossAmount) * 100 : 0,
          directDiscountAmount,
          groupDiscountAmount,
          discountAmount,
          totalDiscountAmount: discountAmount,
          finalPrice,
          salePrice: finalPrice,
          price: finalPrice,
          amount,
          saleMethod: PROMOTION,
          saleMode: PROMOTION,
          pricingMode: PROMOTION,
          priceLocked: true,
          promotionCalculated: true,
          promotionRows: Array.isArray(line.promotionRows) ? line.promotionRows : []
        };
      });

      const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
      const totalAmount = items.reduce((sum, item) => sum + item.amount, 0);
      if (paidAmount > totalAmount) return fail(400, 'Tiền thu không được lớn hơn tổng đơn');

      const salesOrder = {
        id: makeId('SO'),
        code: buildSalesCode(data),
        date,
        customerId: customer.id,
        customerCode: customer.code,
        customerName: customer.name,
        customerPhone: customer.phone,
        customerAddress: customer.address,
        staffCode: mobileUser.code || '',
        staffName: mobileUser.name || '',
        source: 'mobile_sales_app',
        orderSource: 'NVBH',
        orderSourceName: 'Từ NVBH',
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
        totalAmount,
        paidAmount,
        debtAmount: totalAmount - paidAmount,
        status: 'pending',
        lifecycleStatus: 'pending',
        orderDate: date,
        deliveryStatus: 'pending',
        accountingStatus: 'pending',
        createdAt: new Date().toISOString()
      };

      repo.addSalesOrder(data, salesOrder);
      syncReturnDraftInSnapshot(data, salesOrder);
      items.forEach((item) => reduceStock(data, item));
      repo.addPayment(data, {
        id: makeId('PM'),
        date,
        type: 'sale_debt',
        refType: 'salesOrder',
        refId: salesOrder.id,
        refCode: salesOrder.code,
        customerId: customer.id,
        customerCode: customer.code,
        customerName: customer.name,
        debit: totalAmount,
        credit: paidAmount,
        note: `Phát sinh từ đơn mobile ${salesOrder.code}`,
        createdAt: new Date().toISOString()
      });

      if (paidAmount > 0) {
        repo.addCashbookEntry(data, {
          id: makeId('CB'),
          code: buildCashCode(data, 'in'),
          date,
          type: 'in',
          source: 'mobile_sales_payment',
          refType: 'salesOrder',
          refId: salesOrder.id,
          refCode: salesOrder.code,
          customerId: customer.id,
          customerCode: customer.code,
          customerName: customer.name,
          staffName: mobileUser.name || '',
          amount: paidAmount,
          note: `Thu tiền từ đơn mobile ${salesOrder.code}`,
          createdAt: new Date().toISOString()
        });
      }

      writeMobileLog(data, mobileUser, 'mobile_create_sales_order', {
        refType: 'salesOrder',
        refId: salesOrder.id,
        refCode: salesOrder.code,
        note: `Tạo đơn ${salesOrder.code} từ mobile`
      });
      await repo.saveOperationalData(data);
      perf('save_operational_data');
      createdOrder = salesOrder;
      return { statusCode: 201, body: { ok: true, source: 'mobile-sales-route', message: 'Đã gửi đơn mobile về hệ thống tổng', salesOrder } };
    });

    const finalResult = result || { statusCode: 201, body: { ok: true, salesOrder: createdOrder } };
    perf('done');
    return rememberIdempotentResult(idemKey, finalResult);
  }

  async function getSalesOrder({ params = {}, mobileUser }) {
    if (typeof repo.refreshOrderDocumentCacheFromMongo === 'function') await repo.refreshOrderDocumentCacheFromMongo();
    const data = await repo.getPrimaryDataSnapshot();
    const order = repo.findSalesOrder(data, params.id);
    if (!order) return fail(404, 'Không tìm thấy đơn bán');
    if (!isOwnedByMobileUser(order, mobileUser)) return fail(403, 'Bạn chỉ được xem đơn của mình');
    return { body: { ok: true, source: 'mobile-sales-route', order: { ...order, canEdit: !order.masterOrderId && (order.mergeStatus || 'unmerged') !== 'merged' } } };
  }

  async function updateSalesOrder({ params = {}, body = {}, mobileUser }) {
    const idemKey = getIdempotencyKey(body, ['sales-update', mobileUser && (mobileUser.id || mobileUser.code), params.id]);
    const cachedResult = readIdempotentResult(idemKey);
    if (cachedResult) return cachedResult;
    const perf = createStepTimer('sales.updateOrder');
    const result = await withMongoTransaction(async () => {
      perf('start');
      if (typeof repo.refreshOrderDocumentCacheFromMongo === 'function') await repo.refreshOrderDocumentCacheFromMongo();
      const data = await repo.getPrimaryDataSnapshot();
      const order = repo.findSalesOrder(data, params.id);
      if (!order) return fail(404, 'Không tìm thấy đơn bán');
      if (!isOwnedByMobileUser(order, mobileUser)) return fail(403, 'Bạn chỉ được sửa đơn của mình');
      if (order.masterOrderId || (order.mergeStatus || 'unmerged') === 'merged') {
        return fail(403, 'Đơn đã gộp đơn tổng, app bán hàng không được sửa. Vui lòng báo kế toán/admin sửa trong lịch sử bán hàng.');
      }

      const customerPayload = body.customer || {};
      const patchBody = {
        ...body,
        customerId: customerPayload.id || customerPayload.code || body.customerId || body.customerCode || order.customerId,
        customerCode: customerPayload.code || body.customerCode || order.customerCode,
        salesStaffCode: mobileUser.code || order.salesStaffCode || order.staffCode || '',
        salesStaffName: mobileUser.name || order.salesStaffName || order.staffName || ''
      };
      const salesOrder = updateSalesOrderWithRepost(data, order, patchBody);
      syncReturnDraftInSnapshot(data, salesOrder);
      writeMobileLog(data, mobileUser, 'mobile_edit_sales_order', {
        refType: 'salesOrder',
        refId: salesOrder.id,
        refCode: salesOrder.code,
        note: `Sửa đơn ${salesOrder.code} từ mobile khi chưa gộp đơn tổng`
      });
      await repo.saveOperationalData(data);
      perf('save_operational_data');
      return { body: { ok: true, source: 'mobile-sales-route', message: `Đã sửa đơn ${salesOrder.code}`, salesOrder } };
    });
    perf('done');
    return rememberIdempotentResult(idemKey, result);
  }

  async function deleteSalesOrder({ params = {}, mobileUser }) {
    return withMongoTransaction(async () => {
      if (typeof repo.refreshOrderDocumentCacheFromMongo === 'function') await repo.refreshOrderDocumentCacheFromMongo();
      const data = await repo.getPrimaryDataSnapshot();
      const order = repo.findSalesOrder(data, params.id);
      if (!order) return fail(404, 'Không tìm thấy đơn bán');
      if (!isOwnedByMobileUser(order, mobileUser)) return fail(403, 'Bạn chỉ được xóa đơn của mình');
      if (order.masterOrderId || order.masterOrderCode || order.masterOrderNo || (order.mergeStatus || 'unmerged') === 'merged') {
        return fail(403, 'Đơn đã gộp đơn tổng, app bán hàng không được xóa');
      }

      const cancelDraft = cancelReturnDraftInSnapshot(data, order);
      if (cancelDraft && cancelDraft.error) return fail(400, cancelDraft.error);

      order.status = 'void';
      order.deliveryStatus = 'void';
      order.deletedAt = new Date().toISOString();
      order.deleteReason = 'Xóa từ app bán hàng mobile trước khi gộp đơn tổng';
      order.updatedAt = new Date().toISOString();
      writeMobileLog(data, mobileUser, 'mobile_delete_sales_order', {
        refType: 'salesOrder',
        refId: order.id,
        refCode: order.code,
        note: `Xóa đơn ${order.code} từ mobile khi chưa gộp đơn tổng`
      });
      await repo.saveOperationalData(data);
      return { body: { ok: true, source: 'mobile-sales-route', message: `Đã xóa đơn ${order.code || ''}`, salesOrder: order } };
    });
  }

  async function listSalesOrders({ query = {}, mobileUser }) {
    if (typeof repo.refreshOrderDocumentCacheFromMongo === 'function') await repo.refreshOrderDocumentCacheFromMongo();
    const data = await repo.getPrimaryDataSnapshot();
    const date = dateUtil.toDateOnly(query.date || dateUtil.todayVN());
    const onlyMine = String(query.mine || '1') !== '0';
    const q = normalizeText(query.q);

    let items = (data.salesOrders || [])
      .filter((order) => !['void', 'cancelled', 'canceled', 'deleted'].includes(String(order.status || '').toLowerCase()))
      .filter((order) => !date || dateUtil.toDateOnly(order.date || order.orderDate) === date)
      .filter((order) => !onlyMine || isOwnedByMobileUser(order, mobileUser));

    if (q) {
      items = items.filter((order) => [order.code, order.customerCode, order.customerName, order.customerPhone, order.customerAddress].some((value) => normalizeText(value).includes(q)));
    }

    items = items
      .slice()
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, 100)
      .map((order) => ({
        id: order.id,
        code: order.code,
        date: order.date,
        customerName: order.customerName,
        totalAmount: toNumber(order.totalAmount),
        paidAmount: toNumber(order.paidAmount),
        debtAmount: toNumber(order.debtAmount),
        status: order.status,
        deliveryStatus: order.deliveryStatus || 'pending',
        masterOrderId: order.masterOrderId || '',
        masterOrderCode: order.masterOrderCode || '',
        mergeStatus: order.mergeStatus || 'unmerged',
        canEdit: !order.masterOrderId && !order.masterOrderCode && !order.masterOrderNo && (order.mergeStatus || 'unmerged') !== 'merged',
        customerId: order.customerId,
        customerCode: order.customerCode,
        customerPhone: order.customerPhone,
        customerAddress: order.customerAddress,
        items: order.items || [],
        note: order.note || '',
        createdAt: order.createdAt
      }));

    return { body: { ok: true, source: 'mobile-sales-route', date, items } };
  }

  return { createSalesOrder, getSalesOrder, updateSalesOrder, deleteSalesOrder, listSalesOrders };
}

module.exports = { createMobileSalesService };
