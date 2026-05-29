'use strict';

const { withMongoTransaction } = require('../../utils/transaction.util');
const { createMobileSalesRepository } = require('../../repositories/mobile/sales.repository');
const Inventory = require('../../models/Inventory');


async function getSnapshotQtyForProduct(product = {}) {
  const keys = [product.code, product.sku, product.productCode, product.id, product._id]
    .map((value) => String(value || '').trim())
    .filter(Boolean);
  if (!keys.length) return 0;
  const rows = await Inventory.find({
    $or: [
      { productCode: { $in: keys } },
      { productId: { $in: keys } }
    ]
  }).lean();
  return rows.reduce((sum, row) => sum + Number(row.availableQty ?? row.onHand ?? row.quantity ?? row.qty ?? 0), 0);
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

  function isOwnedByMobileUser(order, mobileUser) {
    return normalizeText(order.staffCode || order.salesStaffCode) === normalizeText(mobileUser.code)
      || normalizeText(order.staffName || order.salesStaffName) === normalizeText(mobileUser.name);
  }

  async function createSalesOrder({ body = {}, mobileUser }) {
    let createdOrder = null;

    const result = await withMongoTransaction(async () => {
      const data = await repo.getPrimaryDataSnapshot();
      const customerPayload = body.customer || {};
      const customer = repo.findCustomer(data, customerPayload.id || customerPayload.code || body.customerId || body.customerCode);
      const rawItems = Array.isArray(body.items) ? body.items : [];
      const paidAmount = toNumber(body.paidAmount);
      const date = new Date().toISOString().slice(0, 10);

      if (!customer) return fail(400, 'Không tìm thấy khách hàng');
      if (!rawItems.length) return fail(400, 'Đơn mobile chưa có sản phẩm');

      const items = [];
      for (const rawItem of rawItems) {
        const product = repo.findProduct(data, rawItem.productCode || rawItem.code || rawItem.productId);
        if (!product) return fail(400, `Không tìm thấy sản phẩm: ${rawItem.productCode || rawItem.code || ''}`);
        const quantity = toNumber(rawItem.quantity || rawItem.qty);
        const salePrice = toNumber(rawItem.salePrice || rawItem.price || product.salePrice);
        if (quantity <= 0) return fail(400, `Số lượng phải lớn hơn 0: ${product.code}`);
        const availableQty = await getSnapshotQtyForProduct(product);
        if (availableQty < quantity) {
          return fail(400, `Không đủ tồn mở bán: ${product.code}. Tồn ${formatCaseLooseQty(availableQty, product.conversionRate || 1)}, cần ${formatCaseLooseQty(quantity, product.conversionRate || 1)}`);
        }
        items.push({
          productId: product.id,
          productCode: product.code,
          productName: product.name,
          ...buildProductLineMeta(product),
          quantity,
          salePrice,
          amount: quantity * salePrice
        });
      }

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
        isChildOrder: true,
        masterOrderId: '',
        mergeStatus: 'unmerged',
        note: String(body.note || 'Tạo từ mobile app').trim(),
        items,
        totalQuantity,
        totalAmount,
        paidAmount,
        debtAmount: totalAmount - paidAmount,
        status: 'posted',
        deliveryStatus: 'pending',
        createdAt: new Date().toISOString()
      };

      repo.addSalesOrder(data, salesOrder);
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
      createdOrder = salesOrder;
      return { statusCode: 201, body: { ok: true, source: 'mobile-sales-route', message: 'Đã gửi đơn mobile về hệ thống tổng', salesOrder } };
    });

    return result || { statusCode: 201, body: { ok: true, salesOrder: createdOrder } };
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
    return withMongoTransaction(async () => {
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
      writeMobileLog(data, mobileUser, 'mobile_edit_sales_order', {
        refType: 'salesOrder',
        refId: salesOrder.id,
        refCode: salesOrder.code,
        note: `Sửa đơn ${salesOrder.code} từ mobile khi chưa gộp đơn tổng`
      });
      await repo.saveOperationalData(data);
      return { body: { ok: true, source: 'mobile-sales-route', message: `Đã sửa đơn ${salesOrder.code}`, salesOrder } };
    });
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
    const date = String(query.date || new Date().toISOString().slice(0, 10)).slice(0, 10);
    const onlyMine = String(query.mine || '1') !== '0';
    const q = normalizeText(query.q);

    let items = (data.salesOrders || [])
      .filter((order) => !['void', 'cancelled', 'canceled', 'deleted'].includes(String(order.status || '').toLowerCase()))
      .filter((order) => !date || String(order.date || order.orderDate || '').slice(0, 10) === date)
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
