'use strict';

const customerRepository = require('../repositories/customerRepository');
const searchService = require('./searchService');

function normalizeSearchText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

const { toNumber } = require('../utils/common.util');

function pickCustomerPayload(body = {}) {
  return {
    code: String(body.code || body.customerCode || '').trim(),
    name: String(body.name || body.customerName || '').trim(),
    phone: String(body.phone || body.customerPhone || '').trim(),
    address: String(body.address || body.customerAddress || '').trim(),
    area: String(body.area || '').trim(),
    route: String(body.route || '').trim(),
    staffCode: String(body.staffCode || '').trim(),
    staffName: String(body.staffName || '').trim(),
    openingDebt: toNumber(body.openingDebt),
    debtLimit: toNumber(body.debtLimit),
    isActive: body.isActive !== false
  };
}

function validateCustomer(payload) {
  if (!payload.code) return 'Thiếu mã khách hàng';
  if (!payload.name) return 'Thiếu tên khách hàng';
  if (payload.openingDebt < 0 || payload.debtLimit < 0) return 'Công nợ đầu kỳ / hạn mức nợ không được âm';
  return '';
}

function toClient(customer) {
  const raw = typeof customer?.toObject === 'function' ? customer.toObject() : (customer || {});
  const code = String(raw.code || raw.customerCode || raw.id || raw._id || '').trim();
  return {
    ...raw,
    code,
    customerCode: raw.customerCode || code,
    id: code,
    _id: raw._id ? String(raw._id) : undefined,
    createdAt: raw.createdAt ? new Date(raw.createdAt).toISOString() : raw.createdAt,
    updatedAt: raw.updatedAt ? new Date(raw.updatedAt).toISOString() : raw.updatedAt
  };
}

async function listCustomers(query) {
  const result = await customerRepository.findAll(query);
  if (result && Array.isArray(result.rows)) {
    return { customers: result.rows.map(toClient), meta: result.meta };
  }
  return { customers: (result || []).map(toClient), meta: null };
}

async function searchCustomers(query) {
  return searchService.searchCustomers(query);
}

async function createCustomer(body) {
  const payload = pickCustomerPayload(body);
  payload.searchText = normalizeSearchText([payload.code, payload.name, payload.phone, payload.address, payload.area, payload.route, payload.staffCode, payload.staffName].filter(Boolean).join(' '));
  const error = validateCustomer(payload);
  if (error) return { error, status: 400 };
  if (await customerRepository.findDuplicateCode(payload.code)) return { error: 'Mã khách hàng đã tồn tại trong MongoDB', status: 409 };
  const customer = await customerRepository.create(payload);
  return { customer: toClient(customer) };
}

async function updateCustomer(id, body) {
  const current = await customerRepository.findByIdOrCode(id);
  if (!current) return { error: 'Không tìm thấy khách hàng trong MongoDB', status: 404 };
  const payload = pickCustomerPayload(body);
  payload.searchText = normalizeSearchText([payload.code, payload.name, payload.phone, payload.address, payload.area, payload.route, payload.staffCode, payload.staffName].filter(Boolean).join(' '));
  const error = validateCustomer(payload);
  if (error) return { error, status: 400 };
  if (await customerRepository.findDuplicateCode(payload.code, current._id)) return { error: 'Mã khách hàng đã tồn tại trong MongoDB', status: 409 };
  payload.searchText = normalizeSearchText([payload.code, payload.name, payload.phone, payload.address, payload.area, payload.route, payload.staffCode, payload.staffName].filter(Boolean).join(' '));
  Object.assign(current, payload);
  await customerRepository.save(current);
  return { customer: toClient(current) };
}

async function setCustomerStatus(id, isActive) {
  const customer = await customerRepository.findByIdOrCode(id);
  if (!customer) return { error: 'Không tìm thấy khách hàng trong MongoDB', status: 404 };
  customer.isActive = isActive !== false;
  await customerRepository.save(customer);
  return { customer: toClient(customer) };
}

async function deleteCustomer(id) {
  const customer = await customerRepository.removeByIdOrCode(id);
  if (!customer) return { error: 'Không tìm thấy khách hàng trong MongoDB', status: 404 };
  return { customer: toClient(customer) };
}

async function bulkDeleteCustomers(ids) {
  const cleanIds = Array.isArray(ids) ? ids.map(String).map(v => v.trim()).filter(Boolean) : [];
  if (!cleanIds.length) return { error: 'Chưa chọn khách hàng để xóa', status: 400 };
  const result = await customerRepository.bulkDelete(cleanIds);
  return { deleted: result.deletedCount || 0 };
}

module.exports = {
  listCustomers,
  searchCustomers,
  createCustomer,
  updateCustomer,
  setCustomerStatus,
  deleteCustomer,
  bulkDeleteCustomers,
  toClient
};
