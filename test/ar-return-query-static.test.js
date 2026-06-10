'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const sourcePath = path.join(__dirname, '..', 'src', 'services', 'master-order', 'masterOrderLegacy.service.js');
const source = fs.readFileSync(sourcePath, 'utf8');

test('AR-RETURN returnOrders lookup does not corrupt Mongo $or conditions', () => {
  assert.equal(source.includes('or.push(\n    or.push('), false, 'Không được lồng or.push(or.push(...)) vì sẽ đẩy number vào $or');
  assert.ok(source.includes('const safeOr = or.filter'), 'Cần guard safeOr trước khi query returnOrders');
  assert.ok(source.includes('{ $or: safeOr }'), 'Query returnOrders phải dùng safeOr đã lọc object điều kiện');
});
