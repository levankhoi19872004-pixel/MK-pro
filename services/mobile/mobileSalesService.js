'use strict';

const { readKhoData, saveKhoData } = require('../../config/db');
const { AppError } = require('../../utils/http');
const { num, money, todayISO, dateOnly, norm, safeId } = require('../../utils/format');
const { decreaseStockForOrder, increaseStockForOrder } = require('../inventoryService');

function userCode(user) { return String(user.maNhanVien || user.code || user.username || '').trim(); }
function orderDate(o) { return dateOnly(o.isoDate || o.date || o.createdAt); }
function orderDebt(o) { return Math.max(0, num(o.total) - num(o.paid) - num(o.cashPaid) - num(o.bankPaid) - num(o.collectedAmount)); }
function customerCode(c) { return c.code || c.ma || c.customerCode || ''; }

function belongsToSales(o, user) {
  const code = norm(userCode(user));
  if (!code) return true;
  return norm(o.staffCode || o.staffMa || o.salesCode || o.createdBy) === code;
}

function buildOrder(user, body) {
  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length) throw new AppError('Đơn không có sản phẩm', 400, 'EMPTY_ORDER');

  const normalizedItems = items.map(it => {
    const sku = String(it.sku || it.code || it.productCode || it.maHang || '').trim();
    const qty = num(it.qty ?? it.quantity ?? it.soLuong);
    const sale = money(it.sale ?? it.price ?? it.giaBan);
    const disc = num(it.disc ?? it.discount ?? it.chietKhau);
    return {
      sku,
      code: sku,
      name: it.name || it.productName || it.tenHang || sku,
      pack: num(it.pack ?? it.quyCach, 1) || 1,
      qty,
      quantity: qty,
      sale,
      price: sale,
      cost: money(it.cost ?? it.giaVon),
      disc,
      discount: disc
    };
  }).filter(it => it.sku && it.qty > 0);

  if (!normalizedItems.length) throw new AppError('Đơn không có dòng hợp lệ', 400, 'INVALID_ORDER_LINES');

  const total = money(body.total) || money(normalizedItems.reduce((a, it) => a + it.qty * it.sale * (1 - it.disc / 100), 0));

  return {
    id: String(body.id || body.orderId || safeId('APP')).trim(),
    source: 'NVBH',
    fromApp: true,
    status: body.status || 'confirmed',
    date: body.date || todayISO(),
    isoDate: body.isoDate || new Date().toISOString(),
    createdAt: body.createdAt || new Date().toISOString(),
    staffCode: body.staffCode || body.salesCode || userCode(user),
    staffName: body.staffName || user.tenNhanVien || user.name || userCode(user),
    customerCode: body.customerCode || body.cCode || body.customerId || '',
    customer: body.customer || body.customerName || '',
    customerName: body.customerName || body.customer || '',
    note: body.note || 'Đơn từ app bán hàng',
    items: normalizedItems,
    total,
    cost: money(normalizedItems.reduce((a, it) => a + it.qty * it.cost, 0)),
    cashPaid: money(body.cashPaid),
    bankPaid: money(body.bankPaid),
    paid: money(body.paid),
    debt: Math.max(0, total - money(body.cashPaid) - money(body.bankPaid) - money(body.paid)),
    mobilePayloadVersion: 2
  };
}

module.exports = {
  async getDashboard(user) {
    const data = await readKhoData();
    const orders = (data.orders || []).filter(o => orderDate(o) === todayISO() && belongsToSales(o, user));
    return {
      user,
      tongDonHomNay: orders.length,
      doanhSoHomNay: orders.reduce((a, o) => a + num(o.total), 0),
      congNo: orders.reduce((a, o) => a + orderDebt(o), 0)
    };
  },

  async getProducts() {
    const data = await readKhoData();
    return data.products || [];
  },

  async getCustomers(user) {
    const data = await readKhoData();
    const code = norm(userCode(user));
    return (data.customers || []).filter(c => !code || !c.staffCode || norm(c.staffCode) === code || norm(c.salesCode) === code || norm(c.maNhanVien) === code);
  },

  async createOrder(user, body) {
    const data = await readKhoData();
    data.orders = Array.isArray(data.orders) ? data.orders : [];

    const order = buildOrder(user, body || {});
    const existingIndex = data.orders.findIndex(o => String(o.id) === String(order.id));
    if (existingIndex >= 0) {
      const existing = data.orders[existingIndex];

      // Nếu payload giống hệt đơn cũ: trả về luôn, không trừ tồn lần 2.
      const oldItems = JSON.stringify((existing.items || []).map(x => ({ sku: x.sku || x.code, qty: Number(x.qty || x.quantity || 0), price: Number(x.price || x.sale || 0) })));
      const newItems = JSON.stringify((order.items || []).map(x => ({ sku: x.sku || x.code, qty: Number(x.qty || x.quantity || 0), price: Number(x.price || x.sale || 0) })));
      if (oldItems === newItems && Number(existing.total || 0) === Number(order.total || 0)) {
        return { ...existing, created: false, duplicateSafe: true };
      }

      // Sửa đơn đã chấm: hoàn tồn cũ trước, rồi kiểm tra/trừ tồn theo đơn mới.
      increaseStockForOrder(data, existing);
      order.updatedAt = new Date().toISOString();
      decreaseStockForOrder(data, order);
      data.orders[existingIndex] = { ...existing, ...order };
      await saveKhoData(data);
      return { ...data.orders[existingIndex], created: false, updated: true };
    }

    decreaseStockForOrder(data, order);
    data.orders.push(order);
    await saveKhoData(data);
    return { ...order, created: true };
  },

  async deleteOrder(user, id) {
    const data = await readKhoData();
    data.orders = Array.isArray(data.orders) ? data.orders : [];
    const idx = data.orders.findIndex(o => String(o.id) === String(id));
    if (idx < 0) throw new AppError('Không tìm thấy đơn cần xóa', 404, 'ORDER_NOT_FOUND');
    const existing = data.orders[idx];
    if (!belongsToSales(existing, user) && String(user.role || '').toLowerCase() !== 'admin') {
      throw new AppError('Không có quyền xóa đơn này', 403, 'FORBIDDEN');
    }
    increaseStockForOrder(data, existing);
    const removed = data.orders.splice(idx, 1)[0];
    await saveKhoData(data);
    return { id: removed.id, deleted: true };
  },

  async getTodayOrders(user) {
    const data = await readKhoData();
    return (data.orders || []).filter(o => orderDate(o) === todayISO() && belongsToSales(o, user));
  },

  async getDebts(user) {
    const data = await readKhoData();
    return (data.orders || [])
      .filter(o => belongsToSales(o, user))
      .filter(o => orderDebt(o) > 0)
      .map(o => ({ orderId: o.id, date: orderDate(o), customerCode: o.customerCode || o.cCode || '', customer: o.customer || o.customerName, total: num(o.total), debt: orderDebt(o) }));
  }
};
