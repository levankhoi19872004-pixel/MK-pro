const { createSalesOrder, buildSalesOrderItem, cleanCode, cleanText, toNumber } = require('../models/salesOrderModel');
const { getProductByCode } = require('./productService');
const { getStock } = require('./inventoryService');
const { postSalesOrder, reverseSalesOrder } = require('./postingService');
const { postSalesOrderReceivable, reverseSalesOrderReceivable } = require('./receivableService');

function ensureShape(data) {
  if (!data.documents) data.documents = [];
  if (!data.postings) data.postings = [];
  if (!data.products) data.products = [];
  return data;
}

function isSalesOrder(document) {
  return document && document.type === 'SALES_ORDER';
}

function listSalesOrders(data, query = {}) {
  ensureShape(data);

  const keyword = cleanText(query.keyword || query.q).toLowerCase();
  const status = cleanText(query.status).toUpperCase();
  const customerCode = cleanCode(query.customerCode);
  const staffCode = cleanCode(query.staffCode);

  return data.documents
    .filter(isSalesOrder)
    .filter(order => !status || cleanCode(order.status) === status)
    .filter(order => !customerCode || cleanCode(order.customerCode) === customerCode)
    .filter(order => !staffCode || cleanCode(order.staffCode) === staffCode)
    .filter(order => {
      if (!keyword) return true;
      return [
        order.documentNo,
        order.customerCode,
        order.customerName,
        order.customerPhone,
        order.staffCode,
        order.staffName,
        order.note
      ].some(value => String(value || '').toLowerCase().includes(keyword));
    })
    .sort((a, b) => new Date(b.orderDate || b.createdAt) - new Date(a.orderDate || a.createdAt));
}

function getSalesOrder(data, idOrDocumentNo) {
  ensureShape(data);
  const key = cleanCode(idOrDocumentNo);
  return data.documents.find(document => {
    return isSalesOrder(document) && (cleanCode(document.id) === key || cleanCode(document.documentNo) === key);
  }) || null;
}

function validateSalesOrderItems(data, inputItems = [], orderWarehouse = {}) {
  ensureShape(data);

  if (!Array.isArray(inputItems) || inputItems.length === 0) {
    throw new Error('Đơn bán hàng phải có ít nhất 1 dòng sản phẩm');
  }

  const errors = [];
  const warnings = [];
  const validItems = [];

  inputItems.forEach((rawItem, index) => {
    const productCode = cleanCode(rawItem.productCode || rawItem.code || rawItem.maHang || rawItem.maSanPham);
    const product = getProductByCode(data, productCode);
    const item = buildSalesOrderItem(rawItem, index + 1, product, orderWarehouse);

    if (!item.productCode) errors.push(`Dòng ${index + 1}: thiếu mã sản phẩm`);
    if (!product) errors.push(`Dòng ${index + 1}: sản phẩm ${item.productCode || '(trống)'} chưa có trong danh mục`);
    if (product && product.isActive === false) errors.push(`Dòng ${index + 1}: sản phẩm ${item.productCode} đã ngừng sử dụng`);
    if (!item.productName) errors.push(`Dòng ${index + 1}: thiếu tên sản phẩm`);
    if (Number(item.quantity) <= 0) errors.push(`Dòng ${index + 1}: số lượng bán phải lớn hơn 0`);
    if (Number(item.price) < 0) errors.push(`Dòng ${index + 1}: đơn giá không được âm`);
    if (!item.warehouseCode) errors.push(`Dòng ${index + 1}: thiếu kho xuất`);

    if (product) {
      item.productName = item.productName || product.name;
      item.unit = item.unit || product.unit;
      item.warehouseCode = item.warehouseCode || product.warehouseCode;
      item.warehouseName = item.warehouseName || product.warehouseName;
      if (!rawItem.price && !rawItem.unitPrice && !rawItem.salePrice && !rawItem.giaBan && !rawItem.donGia) {
        item.price = toNumber(product.salePrice, 0);
      }
    }

    item.amount = Number(item.quantity || 0) * Number(item.price || 0);

    const stock = item.productCode && item.warehouseCode ? getStock(data, item.productCode, item.warehouseCode) : 0;
    item.availableStock = stock;
    if (product && Number(item.quantity || 0) > stock) {
      errors.push(`Dòng ${index + 1}: ${item.productCode} tồn ${stock}, không đủ xuất ${item.quantity}`);
    }
    if (product && stock <= 0) {
      warnings.push(`Dòng ${index + 1}: ${item.productCode} đang hết tồn tại kho ${item.warehouseCode}`);
    }

    validItems.push(item);
  });

  const grossAmount = validItems.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const lineDiscountAmount = validItems.reduce((sum, item) => sum + Number(item.discountAmount || 0), 0);

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    items: validItems,
    totalLines: validItems.length,
    totalQuantity: validItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
    grossAmount,
    lineDiscountAmount,
    totalAmount: grossAmount - lineDiscountAmount
  };
}

function previewSalesOrder(data, input = {}) {
  const warehouseCode = cleanCode(input.warehouseCode || 'KHO_CHINH');
  const warehouseName = cleanText(input.warehouseName || 'Kho chính');
  return validateSalesOrderItems(data, input.items || [], { warehouseCode, warehouseName });
}

function createSalesOrderDraft(data, input = {}) {
  ensureShape(data);

  const warehouseCode = cleanCode(input.warehouseCode || 'KHO_CHINH');
  const warehouseName = cleanText(input.warehouseName || 'Kho chính');
  const preview = validateSalesOrderItems(data, input.items || [], { warehouseCode, warehouseName });

  if (!preview.ok) {
    const error = new Error('Đơn bán hàng chưa hợp lệ');
    error.details = preview.errors;
    throw error;
  }

  const order = createSalesOrder({
    ...input,
    warehouseCode,
    warehouseName,
    items: preview.items,
    status: 'DRAFT'
  }, data.documents);

  order.grossAmount = preview.grossAmount;
  order.discountAmount = preview.lineDiscountAmount + toNumber(input.discountAmount, 0);
  order.totalAmount = order.grossAmount - order.discountAmount;
  order.debtAmount = order.totalAmount - toNumber(order.paidAmount, 0);

  data.documents.push(order);
  return order;
}

function confirmSalesOrder(data, idOrDocumentNo) {
  ensureShape(data);

  const order = getSalesOrder(data, idOrDocumentNo);
  if (!order) throw new Error('Không tìm thấy đơn bán hàng');
  if (order.status === 'POSTED') throw new Error('Đơn bán hàng đã xác nhận rồi');
  if (order.status === 'CANCELLED') throw new Error('Đơn bán hàng đã bị hủy');

  const preview = validateSalesOrderItems(data, order.items || [], {
    warehouseCode: order.warehouseCode,
    warehouseName: order.warehouseName
  });

  if (!preview.ok) {
    const error = new Error('Đơn bán hàng chưa hợp lệ nên không thể xác nhận xuất kho');
    error.details = preview.errors;
    throw error;
  }

  order.items = preview.items;
  order.totalLines = preview.totalLines;
  order.totalQuantity = preview.totalQuantity;
  order.grossAmount = preview.grossAmount;
  order.discountAmount = preview.lineDiscountAmount + toNumber(order.extraDiscountAmount, 0);
  order.totalAmount = order.grossAmount - order.discountAmount;
  order.debtAmount = order.totalAmount - toNumber(order.paidAmount, 0);
  order.status = 'POSTED';
  order.postedAt = new Date().toISOString();
  order.updatedAt = new Date().toISOString();

  const postings = postSalesOrder(data, order);
  const receivablePostings = postSalesOrderReceivable(data, order);

  return {
    order,
    postings,
    receivablePostings
  };
}

function cancelSalesOrder(data, idOrDocumentNo, reason = '') {
  ensureShape(data);

  const order = getSalesOrder(data, idOrDocumentNo);
  if (!order) throw new Error('Không tìm thấy đơn bán hàng');
  if (order.status === 'CANCELLED') throw new Error('Đơn bán hàng đã hủy rồi');

  if (order.status === 'POSTED') {
    reverseSalesOrder(data, order, reason);
    reverseSalesOrderReceivable(data, order, reason);
  }

  order.status = 'CANCELLED';
  order.cancelledAt = new Date().toISOString();
  order.cancelReason = cleanText(reason);
  order.updatedAt = new Date().toISOString();

  return order;
}

module.exports = {
  listSalesOrders,
  getSalesOrder,
  previewSalesOrder,
  createSalesOrderDraft,
  confirmSalesOrder,
  cancelSalesOrder,
  validateSalesOrderItems
};
