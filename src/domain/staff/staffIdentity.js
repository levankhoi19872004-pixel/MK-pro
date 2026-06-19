'use strict';

// STAFF_IDENTITY_CONTRACT_START

const SALES_STAFF_CODE_FIELDS = Object.freeze([
  'salesStaffCode',
  'salesmanCode',
  'employeeCode',
  'maNhanVien'
]);

const SALES_STAFF_NAME_FIELDS = Object.freeze([
  'salesStaffName',
  'salesmanName',
  'employeeName',
  'fullName',
  'name'
]);

const DELIVERY_STAFF_CODE_FIELDS = Object.freeze([
  'deliveryStaffCode',
  'shipperCode',
  'employeeCode',
  'maNhanVien'
]);

const DELIVERY_STAFF_NAME_FIELDS = Object.freeze([
  'deliveryStaffName',
  'shipperName',
  'employeeName',
  'fullName',
  'name'
]);

// USER_ACCOUNT_STAFF_CODE_FIELDS_START
// Màn Tài khoản hiện lưu mã nhân viên ở users.code/users.staffCode.
// Đây là mã nghiệp vụ hợp lệ để đối chiếu tài khoản khi import,
// khác với username/id/_id là định danh đăng nhập/kỹ thuật không được dùng để match NVBH/NVGH.
const USER_ACCOUNT_SALES_STAFF_CODE_FIELDS = Object.freeze([
  ...SALES_STAFF_CODE_FIELDS,
  'code',
  'staffCode'
]);

const USER_ACCOUNT_DELIVERY_STAFF_CODE_FIELDS = Object.freeze([
  ...DELIVERY_STAFF_CODE_FIELDS,
  'code',
  'staffCode'
]);
// USER_ACCOUNT_STAFF_CODE_FIELDS_END

const FORBIDDEN_STAFF_IDENTITY_FIELDS = Object.freeze([
  'staffCode',
  'staffName',
  'username',
  '_id',
  'id'
]);

function cleanStaffText(value = '') {
  return String(value || '').trim();
}

// STAFF_IDENTITY_NULL_SAFE_START
function pickFirst(source = {}, fields = []) {
  const safeSource = source && typeof source === 'object' ? source : {};
  const safeFields = Array.isArray(fields) ? fields : [];

  for (const field of safeFields) {
    const value = cleanStaffText(safeSource[field]);
    if (value) return value;
  }

  return '';
}
// STAFF_IDENTITY_NULL_SAFE_END

function pickSalesStaffCode(source = {}) {
  return pickFirst(source, SALES_STAFF_CODE_FIELDS);
}

function pickSalesStaffName(source = {}) {
  return pickFirst(source, SALES_STAFF_NAME_FIELDS);
}

function pickDeliveryStaffCode(source = {}) {
  return pickFirst(source, DELIVERY_STAFF_CODE_FIELDS);
}

function pickDeliveryStaffName(source = {}) {
  return pickFirst(source, DELIVERY_STAFF_NAME_FIELDS);
}

function pickUserAccountSalesStaffCode(source = {}) {
  return pickFirst(source, USER_ACCOUNT_SALES_STAFF_CODE_FIELDS);
}

function pickUserAccountDeliveryStaffCode(source = {}) {
  return pickFirst(source, USER_ACCOUNT_DELIVERY_STAFF_CODE_FIELDS);
}

function buildSalesStaffSnapshot(source = {}) {
  const code = pickSalesStaffCode(source);
  const name = pickSalesStaffName(source);

  return {
    salesStaffCode: code,
    salesStaffName: name,
    salesmanCode: code,
    salesmanName: name
  };
}

function buildDeliveryStaffSnapshot(source = {}) {
  const code = pickDeliveryStaffCode(source);
  const name = pickDeliveryStaffName(source);

  return {
    deliveryStaffCode: code,
    deliveryStaffName: name,
    shipperCode: code,
    shipperName: name
  };
}

module.exports = {
  SALES_STAFF_CODE_FIELDS,
  SALES_STAFF_NAME_FIELDS,
  DELIVERY_STAFF_CODE_FIELDS,
  DELIVERY_STAFF_NAME_FIELDS,
  USER_ACCOUNT_SALES_STAFF_CODE_FIELDS,
  USER_ACCOUNT_DELIVERY_STAFF_CODE_FIELDS,
  FORBIDDEN_STAFF_IDENTITY_FIELDS,
  pickSalesStaffCode,
  pickSalesStaffName,
  pickDeliveryStaffCode,
  pickDeliveryStaffName,
  pickUserAccountSalesStaffCode,
  pickUserAccountDeliveryStaffCode,
  buildSalesStaffSnapshot,
  buildDeliveryStaffSnapshot
};

// STAFF_IDENTITY_CONTRACT_END
