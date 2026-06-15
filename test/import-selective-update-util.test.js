'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeImportMode,
  getProvidedField,
  parseImportBoolean,
  omitUnchanged,
  buildChanges
} = require('../src/services/import/selectiveUpdate.util');

test('chỉ bật update cho products/customers/users', () => {
  assert.equal(normalizeImportMode('update', 'products'), 'update');
  assert.equal(normalizeImportMode('update', 'customers'), 'update');
  assert.equal(normalizeImportMode('update', 'users'), 'update');
  assert.equal(normalizeImportMode('update', 'salesOrders'), 'create');
  assert.equal(normalizeImportMode('', 'products'), 'create');
});

test('ô trống hoặc cột thiếu không được coi là giá trị cập nhật', () => {
  assert.deepEqual(getProvidedField({}, ['Tên sản phẩm']), {
    present: false,
    hasValue: false,
    value: undefined,
    key: ''
  });
  const blank = getProvidedField({ 'Tên sản phẩm': '   ' }, ['Tên sản phẩm']);
  assert.equal(blank.present, true);
  assert.equal(blank.hasValue, false);

  const provided = getProvidedField({ 'Tên sản phẩm': 'OMO mới' }, ['name', 'Tên sản phẩm']);
  assert.equal(provided.hasValue, true);
  assert.equal(provided.value, 'OMO mới');
});

test('giá trị 0 vẫn là dữ liệu cập nhật hợp lệ', () => {
  const field = getProvidedField({ 'Giá bán': 0 }, ['Giá bán']);
  assert.equal(field.present, true);
  assert.equal(field.hasValue, true);
  assert.equal(field.value, 0);
});

test('parse trạng thái hoạt động hỗ trợ tiếng Việt và boolean', () => {
  assert.equal(parseImportBoolean('Hoạt động'), true);
  assert.equal(parseImportBoolean('Không hoạt động'), false);
  assert.equal(parseImportBoolean('Khóa'), false);
  assert.equal(parseImportBoolean(1), true);
  assert.equal(parseImportBoolean(0), false);
});

test('chỉ giữ field khác dữ liệu cũ và tạo danh sách thay đổi', () => {
  const current = { name: 'Tên cũ', phone: '0901', area: 'A' };
  const patch = omitUnchanged(current, { name: 'Tên cũ', phone: '0902', area: 'A' });
  assert.deepEqual(patch, { phone: '0902' });
  assert.deepEqual(buildChanges(current, patch, { phone: 'Số điện thoại' }), [
    { field: 'phone', label: 'Số điện thoại', oldValue: '0901', newValue: '0902' }
  ]);
});
