'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

function read(file) {
  return fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
}

function getFunctionBody(source, functionName) {
  const start = source.indexOf(`async function ${functionName}`);
  assert.ok(start >= 0, `${functionName} not found`);
  const next = source.indexOf('\nasync function ', start + 1);
  return next >= 0 ? source.slice(start, next) : source.slice(start);
}

test('importOrders preview skips zero-quantity rows instead of marking them invalid', () => {
  const service = read('src/services/excelImportService.js');
  const previewBranchStart = service.indexOf("} else if (type === 'importOrders') {");
  const previewBranchEnd = service.indexOf("} else if (type === 'salesOrders') {", previewBranchStart);
  assert.ok(previewBranchStart >= 0, 'importOrders preview branch not found');
  assert.ok(previewBranchEnd > previewBranchStart, 'salesOrders branch not found after importOrders preview branch');
  const previewBranch = service.slice(previewBranchStart, previewBranchEnd);

  assert.match(previewBranch, /const importRows = \[\]/);
  assert.match(previewBranch, /let skippedZeroQuantity = 0/);
  assert.match(previewBranch, /if \(quantity === 0\) \{[\s\S]*skippedZeroQuantity \+= 1;[\s\S]*continue;[\s\S]*\}/);
  assert.match(previewBranch, /if \(quantity < 0\) lineErrors\.push\('Số lượng nhập không được âm'\)/);
  assert.match(previewBranch, /lineCount:\s*lineDetails\.length/);
  assert.match(previewBranch, /sourceLineCount:\s*group\.length/);
  assert.match(previewBranch, /skippedZeroQuantity/);
  assert.match(previewBranch, /__importRows:\s*importRows/);
  assert.match(previewBranch, /Phiếu nhập không có dòng sản phẩm nào có số lượng lớn hơn 0/);
  assert.doesNotMatch(previewBranch, /Số lượng nhập phải lớn hơn 0/);
  assert.doesNotMatch(previewBranch, /quantity <= 0/);
});

test('importOrders commit skips zero-quantity rows without error and rejects only negative quantity', () => {
  const service = read('src/services/excelImportService.js');
  const body = getFunctionBody(service, 'importImportOrders');

  assert.match(body, /if \(quantity === 0\) \{[\s\S]*skipped \+= 1;[\s\S]*continue;[\s\S]*\}/);
  assert.match(body, /if \(!product \|\| quantity < 0\) \{/);
  assert.match(body, /Số lượng nhập không được âm/);
  assert.doesNotMatch(body, /Số lượng nhập phải lớn hơn 0/);
  assert.doesNotMatch(body, /Dòng nhập kho không hợp lệ/);
  assert.doesNotMatch(body, /quantity <= 0/);
});
