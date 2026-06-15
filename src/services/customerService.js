'use strict';

const { normalizeSearchText } = require('../utils/search.util');

const customerRepository = require('../repositories/customerRepository');
const queryGuard = require('../utils/queryGuard.util');
const searchService = require('./searchService');

const { toNumber } = require('../utils/common.util');
const { extractCustomerTaxProfile } = require('../utils/customerTaxProfile.util');
const { extractCustomerBusinessProfile } = require('../utils/customerBusinessProfile.util');

function pickCustomerPayload(body = {}, options = {}) {
  const taxProfile = extractCustomerTaxProfile(body);
  const businessProfile = extractCustomerBusinessProfile(body);
  const payload = {
    code: String(body.code || body.customerCode || '').trim(),
    name: String(body.name || body.customerName || '').trim(),
    phone: String(body.phone || body.customerPhone || '').trim(),
    address: String(body.address || body.customerAddress || '').trim(),
    area: String(body.area || '').trim(),
    route: String(body.route || '').trim(),
    // CUSTOMER_STAFF_LEGACY_ONLY_START
    legacyStaffCode: String(body.legacyStaffCode || body.staffCode || '').trim(),
    legacyStaffName: String(body.legacyStaffName || body.staffName || '').trim(),

    // Giữ field cũ để tương thích dữ liệu/màn hình cũ.
    // Không dùng để gán NVBH cho đơn mới.
    staffCode: String(body.legacyStaffCode || body.staffCode || '').trim(),
    staffName: String(body.legacyStaffName || body.staffName || '').trim(),
    // CUSTOMER_STAFF_LEGACY_ONLY_END
    openingDebt: toNumber(body.openingDebt),
    debtLimit: toNumber(body.debtLimit),
    isActive: body.isActive !== false
  };

  // Với request cập nhật từ client cũ, không tự xóa tên hộ kinh doanh/thông tin thuế nếu client chưa gửi field mới.
  if (!options.partialBusinessFields || businessProfile.hasBusinessName) payload.businessName = businessProfile.businessName;
  if (!options.partialTaxFields || taxProfile.hasTaxCode) payload.taxCode = taxProfile.taxCode;
  if (!options.partialTaxFields || taxProfile.hasTaxInvoiceAddress) payload.taxInvoiceAddress = taxProfile.taxInvoiceAddress;
  return payload;
}

function validateCustomer(payload) {
  if (!payload.code) return 'Thiếu mã khách hàng';
  if (!payload.name) return 'Thiếu tên khách hàng';
  if (String(payload.businessName || '').length > 250) return 'Tên hộ kinh doanh không được vượt quá 250 ký tự';
  if (payload.openingDebt < 0 || payload.debtLimit < 0) return 'Công nợ đầu kỳ / hạn mức nợ không được âm';
  return '';
}


function toClient(customer) {
  const raw = typeof customer?.toObject === 'function' ? customer.toObject() : (customer || {});
  const code = String(raw.code || raw.customerCode || raw.id || raw._id || '').trim();
  const taxProfile = extractCustomerTaxProfile(raw);
  const businessProfile = extractCustomerBusinessProfile(raw);
  return {
    ...raw,
    code,
    customerCode: raw.customerCode || code,
    businessName: businessProfile.businessName,
    taxCode: taxProfile.taxCode,
    taxInvoiceAddress: taxProfile.taxInvoiceAddress,
    id: code,
    _id: raw._id ? String(raw._id) : undefined,
    createdAt: raw.createdAt ? new Date(raw.createdAt).toISOString() : raw.createdAt,
    updatedAt: raw.updatedAt ? new Date(raw.updatedAt).toISOString() : raw.updatedAt
  };
}

async function listCustomers(query = {}) {
  const guardedQuery = { ...(query || {}), page: query?.page || 1, limit: queryGuard.clampLimit(query?.limit) };
  const q = String(guardedQuery.q || guardedQuery.search || '').trim();
  const allowUnfiltered = String(guardedQuery.allowAll || '') === '1';
  if (!allowUnfiltered && q.length < 2 && !guardedQuery.code && !guardedQuery.customerCode) {
    return { customers: [], meta: { page: 1, limit: guardedQuery.limit, total: 0, message: 'Nhập ít nhất 2 ký tự để tải khách hàng' } };
  }
  const result = await customerRepository.findAll(guardedQuery);
  if (result && Array.isArray(result.rows)) {
    return { customers: result.rows.map(toClient), meta: result.meta };
  }
  return { customers: (result || []).map(toClient), meta: null };
}

async function searchCustomers(query = {}) {
  const checked = queryGuard.ensureSearchKeyword(query, 2);
  if (!checked.ok) return [];
  return searchService.searchCustomers({ ...(query || {}), limit: queryGuard.clampLimit(query?.limit, 20, 50) });
}

async function createCustomer(body) {
  const payload = pickCustomerPayload(body);
  const error = validateCustomer(payload);
  if (error) return { error, status: 400 };
  payload.searchText = normalizeSearchText([
    payload.code,
    payload.name,
    payload.businessName,
    payload.phone,
    payload.address,
    payload.taxCode,
    payload.taxInvoiceAddress,
    payload.area,
    payload.route
  ].filter(Boolean).join(' '));
  if (await customerRepository.findDuplicateCode(payload.code)) return { error: 'Mã khách hàng đã tồn tại trong MongoDB', status: 409 };
  const customer = await customerRepository.create(payload);
  return { customer: toClient(customer) };
}

async function updateCustomer(id, body) {
  const current = await customerRepository.findByIdOrCode(id);
  if (!current) return { error: 'Không tìm thấy khách hàng trong MongoDB', status: 404 };
  const payload = pickCustomerPayload(body, { partialTaxFields: true, partialBusinessFields: true });
  const error = validateCustomer(payload);
  if (error) return { error, status: 400 };
  if (await customerRepository.findDuplicateCode(payload.code, current._id)) return { error: 'Mã khách hàng đã tồn tại trong MongoDB', status: 409 };
  const currentTaxProfile = extractCustomerTaxProfile(current);
  const currentBusinessProfile = extractCustomerBusinessProfile(current);
  payload.searchText = normalizeSearchText([
    payload.code,
    payload.name,
    payload.businessName ?? currentBusinessProfile.businessName,
    payload.phone,
    payload.address,
    payload.taxCode ?? currentTaxProfile.taxCode,
    payload.taxInvoiceAddress ?? currentTaxProfile.taxInvoiceAddress,
    payload.area,
    payload.route
  ].filter(Boolean).join(' '));
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

async function deleteCustomer(id, options = {}) {
  const customer = await customerRepository.deactivateByIdOrCode(id, {
    actorCode: options.actor?.staffCode || options.actor?.code || options.actor?.username || '',
    reason: options.reason || 'Ngừng hoạt động qua API DELETE'
  });
  if (!customer) return { error: 'Không tìm thấy khách hàng trong MongoDB', status: 404 };
  return { customer: toClient(customer), deactivated: true };
}

async function bulkDeleteCustomers(ids, options = {}) {
  const cleanIds = Array.isArray(ids) ? ids.map(String).map(v => v.trim()).filter(Boolean) : [];
  if (!cleanIds.length) return { error: 'Chưa chọn khách hàng để ngừng hoạt động', status: 400 };
  const result = await customerRepository.bulkDeactivate(cleanIds, {
    actorCode: options.actor?.staffCode || options.actor?.code || options.actor?.username || '',
    reason: options.reason || 'Ngừng hoạt động hàng loạt'
  });
  const deactivated = result.modifiedCount || 0;
  return { deactivated, deleted: deactivated };
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
